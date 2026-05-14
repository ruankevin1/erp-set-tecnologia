import { IpcMain } from 'electron'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { triggerSync } from '../sync-service'

interface FaixaIntermediaria {
  ate_minutos: number
  valor: number
}

interface ConfiguracaoPreco {
  id: string
  valor_base: number
  minutos_base: number
  faixas_intermediarias: string
  franquia_minutos: number
  valor_bloco: number
  minutos_por_bloco: number
  idade_min: number | null
  idade_max: number | null
}

function calcularValor(minutos: number, config: ConfiguracaoPreco): number {
  if (minutos <= config.minutos_base) return config.valor_base

  const faixas: FaixaIntermediaria[] = JSON.parse(config.faixas_intermediarias || '[]')
  faixas.sort((a, b) => a.ate_minutos - b.ate_minutos)

  for (const faixa of faixas) {
    if (minutos <= faixa.ate_minutos) return faixa.valor
  }

  const valorAntesDosBlocos = faixas.length > 0
    ? faixas[faixas.length - 1].valor
    : config.valor_base

  const extra = minutos - config.franquia_minutos
  if (extra <= 0) return valorAntesDosBlocos
  const blocos = Math.ceil(extra / config.minutos_por_bloco)
  return valorAntesDosBlocos + blocos * config.valor_bloco
}

function selecionarConfig(db: Database.Database, estabelecimentoId: string, criancaId: string): ConfiguracaoPreco | undefined {
  const configs = db.prepare(
    'SELECT * FROM configuracoes_preco WHERE estabelecimento_id = ? AND ativo = 1 ORDER BY idade_min'
  ).all(estabelecimentoId) as ConfiguracaoPreco[]
  if (configs.length === 0) return undefined
  if (configs.length === 1) return configs[0]
  const crianca = db.prepare('SELECT data_nascimento FROM criancas WHERE id = ?').get(criancaId) as any
  if (!crianca?.data_nascimento) return configs[0]
  const now = new Date()
  const nascimento = new Date(crianca.data_nascimento)
  const idadeAnos = Math.floor((now.getTime() - nascimento.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
  return configs.find(c =>
    (c.idade_min == null || idadeAnos >= c.idade_min) &&
    (c.idade_max == null || idadeAnos <= c.idade_max)
  ) ?? configs[0]
}

export function registerVisitsHandlers(ipcMain: IpcMain, db: Database.Database): void {
  ipcMain.handle('visits:active', (_event, estabelecimentoId: string) => {
    const rows = db.prepare(`
      SELECT v.*,
             c.nome as crianca_nome, c.data_nascimento, c.observacoes as crianca_observacoes,
             r.nome as responsavel_nome, r.telefone as responsavel_telefone, r.telefone2 as responsavel_telefone2
      FROM visitas v
      JOIN criancas c ON v.crianca_id = c.id
      LEFT JOIN responsaveis r ON v.responsavel_id = r.id
      WHERE v.estabelecimento_id = ? AND v.status = 'ativa'
      ORDER BY v.entrada_em DESC
    `).all(estabelecimentoId) as any[]
    return rows.map(r => ({
      ...r,
      pausas: JSON.parse(r.pausas || '[]')
    }))
  })

  ipcMain.handle('visits:create', (_event, data: {
    estabelecimentoId: string
    criancaId: string
    responsavelId?: string
    operadorId?: string
  }) => {
    const id = randomUUID()
    const entradaEm = new Date().toISOString()
    const hoje = entradaEm.slice(0, 10)

    const count = (db.prepare(`
      SELECT COUNT(*) as cnt FROM visitas
      WHERE estabelecimento_id = ? AND date(entrada_em) = ?
    `).get(data.estabelecimentoId, hoje) as any).cnt

    const ticketNumero = (count as number) + 1

    const createWithSnapshot = db.transaction(() => {
      db.prepare(`
        INSERT INTO visitas (id, estabelecimento_id, crianca_id, responsavel_id, operador_id, entrada_em, ticket_numero, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ativa')
      `).run(id, data.estabelecimentoId, data.criancaId, data.responsavelId ?? null, data.operadorId ?? null, entradaEm, ticketNumero)

      const selectedConfig = selecionarConfig(db, data.estabelecimentoId, data.criancaId)
      if (selectedConfig) {
        db.prepare('UPDATE visitas SET configuracao_preco_snapshot = ? WHERE id = ?')
          .run(JSON.stringify(selectedConfig), id)
      }
    })

    createWithSnapshot()
    triggerSync()

    return { id, entrada_em: entradaEm, ticket_numero: ticketNumero }
  })

  ipcMain.handle('visits:create-batch', (_event, data: {
    estabelecimentoId: string
    criancaIds: string[]
    responsavelId?: string
  }) => {
    const entradaEm = new Date().toISOString()
    const hoje = entradaEm.slice(0, 10)

    let baseCount = (db.prepare(`
      SELECT COUNT(*) as cnt FROM visitas
      WHERE estabelecimento_id = ? AND date(entrada_em) = ?
    `).get(data.estabelecimentoId, hoje) as any).cnt as number

    const resultados: { id: string; entrada_em: string; ticket_numero: number; crianca_id: string }[] = []

    const batchCreate = db.transaction(() => {
      for (const criancaId of data.criancaIds) {
        const id = randomUUID()
        baseCount++
        const ticketNumero = baseCount

        db.prepare(`
          INSERT INTO visitas (id, estabelecimento_id, crianca_id, responsavel_id, entrada_em, ticket_numero, status)
          VALUES (?, ?, ?, ?, ?, ?, 'ativa')
        `).run(id, data.estabelecimentoId, criancaId, data.responsavelId ?? null, entradaEm, ticketNumero)

        const selectedConfig = selecionarConfig(db, data.estabelecimentoId, criancaId)
        if (selectedConfig) {
          db.prepare('UPDATE visitas SET configuracao_preco_snapshot = ? WHERE id = ?')
            .run(JSON.stringify(selectedConfig), id)
        }

        resultados.push({ id, entrada_em: entradaEm, ticket_numero: ticketNumero, crianca_id: criancaId })
      }
    })

    batchCreate()
    triggerSync()
    return resultados
  })

  ipcMain.handle('visits:checkout', (_event, data: {
    visitaId: string
    estabelecimentoId: string
    formaPagamento?: string
    desconto?: { tipo: 'percentual' | 'fixo'; valor: number; motivo: string }
  }) => {
    const saidaEm = new Date().toISOString()

    const visita = db.prepare(`SELECT * FROM visitas WHERE id = ?`).get(data.visitaId) as any
    if (!visita) throw new Error('Visita não encontrada')

    const entrada = new Date(visita.entrada_em)
    const saida = new Date(saidaEm)

    const pausas: { inicio: string; fim: string | null }[] = JSON.parse(visita.pausas || '[]')
    const pausadoMs = pausas.reduce((acc, p) => {
      const pInicio = new Date(p.inicio).getTime()
      const pFim = p.fim ? new Date(p.fim).getTime() : saida.getTime()
      return acc + (pFim - pInicio)
    }, 0)
    const minutosTotais = Math.max(0, Math.ceil((saida.getTime() - entrada.getTime() - pausadoMs) / 60000))

    let configuracaoAplicada: ConfiguracaoPreco | undefined
    if (visita.configuracao_preco_snapshot) {
      try { configuracaoAplicada = JSON.parse(visita.configuracao_preco_snapshot) as ConfiguracaoPreco } catch { /* fall through */ }
    }
    if (!configuracaoAplicada) {
      configuracaoAplicada = selecionarConfig(db, data.estabelecimentoId, visita.crianca_id)
    }

    const valorOriginal = configuracaoAplicada ? calcularValor(minutosTotais, configuracaoAplicada) : 0
    let valorFinal = valorOriginal
    const desc = data.desconto && data.desconto.valor > 0 ? data.desconto : undefined
    if (desc) {
      if (desc.tipo === 'percentual') {
        valorFinal = valorOriginal * (1 - desc.valor / 100)
      } else {
        valorFinal = Math.max(0, valorOriginal - desc.valor)
      }
      valorFinal = Math.round(valorFinal * 100) / 100
    }

    const updateVisita = db.transaction(() => {
      db.prepare(`
        UPDATE visitas SET saida_em = ?, valor_total = ?, valor_original = ?, desconto_tipo = ?, desconto_valor = ?, motivo_desconto = ?, forma_pagamento = ?, status = 'finalizada', sincronizado = 0 WHERE id = ?
      `).run(saidaEm, valorFinal, valorOriginal, desc?.tipo ?? null, desc?.valor ?? null, desc?.motivo ?? null, data.formaPagamento ?? null, data.visitaId)

      if (configuracaoAplicada) {
        db.prepare(`
          INSERT INTO visita_faixas_aplicadas (id, visita_id, configuracao_preco_id, minutos, valor)
          VALUES (?, ?, ?, ?, ?)
        `).run(randomUUID(), data.visitaId, configuracaoAplicada.id, minutosTotais, valorFinal)
      }
    })

    updateVisita()
    triggerSync()

    return {
      visita_id: data.visitaId,
      entrada_em: visita.entrada_em,
      saida_em: saidaEm,
      minutos: minutosTotais,
      valor_total: valorFinal,
      valor_original: valorOriginal,
      desconto_tipo: desc?.tipo,
      desconto_valor: desc?.valor,
      motivo_desconto: desc?.motivo,
      ticket_numero: visita.ticket_numero ?? undefined,
      forma_pagamento: data.formaPagamento,
      configuracao: configuracaoAplicada
    }
  })

  ipcMain.handle('visits:checkout-group', (_event, data: {
    visitaIds: string[]
    estabelecimentoId: string
    formaPagamento?: string
    desconto?: { tipo: 'percentual' | 'fixo'; valor: number; motivo: string }
  }) => {
    const saidaEm = new Date().toISOString()
    const desc = data.desconto && data.desconto.valor > 0 ? data.desconto : undefined

    // Primeira passagem: calcular valores brutos para distribuir desconto fixo proporcionalmente
    const dadosBrutos: { visitaId: string; visita: any; minutos: number; valorBruto: number; config?: ConfiguracaoPreco }[] = []
    for (const visitaId of data.visitaIds) {
      const visita = db.prepare('SELECT * FROM visitas WHERE id = ?').get(visitaId) as any
      if (!visita) continue
      const entrada = new Date(visita.entrada_em)
      const saida = new Date(saidaEm)
      const pausas: { inicio: string; fim: string | null }[] = JSON.parse(visita.pausas || '[]')
      const pausadoMs = pausas.reduce((acc, p) => {
        const pInicio = new Date(p.inicio).getTime()
        const pFim = p.fim ? new Date(p.fim).getTime() : saida.getTime()
        return acc + (pFim - pInicio)
      }, 0)
      const minutos = Math.max(0, Math.ceil((saida.getTime() - entrada.getTime() - pausadoMs) / 60000))
      let config: ConfiguracaoPreco | undefined
      if (visita.configuracao_preco_snapshot) {
        try { config = JSON.parse(visita.configuracao_preco_snapshot) } catch { /* fall through */ }
      }
      if (!config) config = selecionarConfig(db, data.estabelecimentoId, visita.crianca_id)
      const valorBruto = config ? calcularValor(minutos, config) : 0
      dadosBrutos.push({ visitaId, visita, minutos, valorBruto, config })
    }

    const totalBruto = dadosBrutos.reduce((s, d) => s + d.valorBruto, 0)
    const resultados: any[] = []

    const checkoutGroup = db.transaction(() => {
      for (let i = 0; i < dadosBrutos.length; i++) {
        const { visitaId, visita, minutos, valorBruto, config } = dadosBrutos[i]

        // Aplica desconto proporcional: percentual igual pra todos, fixo proporcional ao valor
        let valorFinal = valorBruto
        if (desc) {
          if (desc.tipo === 'percentual') {
            valorFinal = valorBruto * (1 - desc.valor / 100)
          } else {
            // Desconto fixo: distribui proporcionalmente; último absorve arredondamento
            const proporcao = totalBruto > 0 ? valorBruto / totalBruto : 1 / dadosBrutos.length
            const descontoItem = i < dadosBrutos.length - 1
              ? Math.round(desc.valor * proporcao * 100) / 100
              : desc.valor - resultados.reduce((s, r) => s + ((r.valor_original ?? r.valor_total) - r.valor_total), 0)
            valorFinal = Math.max(0, valorBruto - descontoItem)
          }
          valorFinal = Math.round(valorFinal * 100) / 100
        }

        db.prepare(`
          UPDATE visitas SET saida_em = ?, valor_total = ?, valor_original = ?, desconto_tipo = ?, desconto_valor = ?, motivo_desconto = ?, forma_pagamento = ?, status = 'finalizada', sincronizado = 0 WHERE id = ?
        `).run(saidaEm, valorFinal, valorBruto, desc?.tipo ?? null, desc?.valor ?? null, desc?.motivo ?? null, data.formaPagamento ?? null, visitaId)

        if (config) {
          db.prepare(`
            INSERT INTO visita_faixas_aplicadas (id, visita_id, configuracao_preco_id, minutos, valor)
            VALUES (?, ?, ?, ?, ?)
          `).run(randomUUID(), visitaId, config.id, minutos, valorFinal)
        }

        resultados.push({
          visita_id: visitaId,
          crianca_id: visita.crianca_id,
          entrada_em: visita.entrada_em,
          saida_em: saidaEm,
          minutos,
          valor_total: valorFinal,
          valor_original: valorBruto,
          ticket_numero: visita.ticket_numero ?? undefined,
          forma_pagamento: data.formaPagamento
        })
      }
    })

    checkoutGroup()
    triggerSync()

    const valorTotalGrupo = resultados.reduce((s, r) => s + r.valor_total, 0)
    const valorOriginalGrupo = resultados.reduce((s, r) => s + (r.valor_original ?? r.valor_total), 0)
    return {
      resultados,
      valor_total_grupo: valorTotalGrupo,
      valor_original_grupo: valorOriginalGrupo,
      desconto: desc,
      forma_pagamento: data.formaPagamento
    }
  })

  ipcMain.handle('visits:preview-price', (_event, visitaId: string) => {
    const agora = new Date()
    const visita = db.prepare(`SELECT * FROM visitas WHERE id = ?`).get(visitaId) as any
    if (!visita) throw new Error('Visita não encontrada')

    const entrada = new Date(visita.entrada_em)
    const pausasPreview: { inicio: string; fim: string | null }[] = JSON.parse(visita.pausas || '[]')
    const pausadoMsPreview = pausasPreview.reduce((acc, p) => {
      const pInicio = new Date(p.inicio).getTime()
      const pFim = p.fim ? new Date(p.fim).getTime() : agora.getTime()
      return acc + (pFim - pInicio)
    }, 0)
    const minutosTotais = Math.max(0, Math.ceil((agora.getTime() - entrada.getTime() - pausadoMsPreview) / 60000))

    let configuracaoAplicada: ConfiguracaoPreco | undefined
    if (visita.configuracao_preco_snapshot) {
      try {
        configuracaoAplicada = JSON.parse(visita.configuracao_preco_snapshot) as ConfiguracaoPreco
      } catch { /* fall through */ }
    }

    if (!configuracaoAplicada) {
      const configuracoes = db.prepare(`
        SELECT * FROM configuracoes_preco
        WHERE estabelecimento_id = ? AND ativo = 1
        ORDER BY idade_min
      `).all(visita.estabelecimento_id) as ConfiguracaoPreco[]
      configuracaoAplicada = configuracoes[0]
    }

    const valor = configuracaoAplicada ? calcularValor(minutosTotais, configuracaoAplicada) : 0
    return { minutos: minutosTotais, valor_estimado: valor }
  })

  ipcMain.handle('visits:pause', (_event, visitaId: string) => {
    const visita = db.prepare('SELECT pausas FROM visitas WHERE id = ?').get(visitaId) as any
    if (!visita) throw new Error('Visita não encontrada')
    const pausas: { inicio: string; fim: string | null }[] = JSON.parse(visita.pausas || '[]')
    if (pausas.some(p => p.fim === null)) throw new Error('Visita já está pausada')
    pausas.push({ inicio: new Date().toISOString(), fim: null })
    db.prepare('UPDATE visitas SET pausas = ? WHERE id = ?').run(JSON.stringify(pausas), visitaId)
    return { success: true }
  })

  ipcMain.handle('visits:resume', (_event, visitaId: string) => {
    const visita = db.prepare('SELECT pausas FROM visitas WHERE id = ?').get(visitaId) as any
    if (!visita) throw new Error('Visita não encontrada')
    const pausas: { inicio: string; fim: string | null }[] = JSON.parse(visita.pausas || '[]')
    const idx = pausas.findIndex(p => p.fim === null)
    if (idx === -1) throw new Error('Visita não está pausada')
    pausas[idx].fim = new Date().toISOString()
    db.prepare('UPDATE visitas SET pausas = ? WHERE id = ?').run(JSON.stringify(pausas), visitaId)
    return { success: true }
  })

  ipcMain.handle('visits:pricing', (_event, estabelecimentoId: string) => {
    return db.prepare(`
      SELECT * FROM configuracoes_preco
      WHERE estabelecimento_id = ? AND ativo = 1
      ORDER BY idade_min
    `).all(estabelecimentoId)
  })

  ipcMain.handle('visits:history', (_event, { estabelecimentoId, limit = 50, offset = 0, dataInicio, dataFim }: {
    estabelecimentoId: string
    limit?: number
    offset?: number
    dataInicio?: string
    dataFim?: string
  }) => {
    const conditions = ["v.estabelecimento_id = ?", "v.status = 'finalizada'"]
    const params: unknown[] = [estabelecimentoId]
    if (dataInicio) { conditions.push('date(v.entrada_em) >= ?'); params.push(dataInicio) }
    if (dataFim)    { conditions.push('date(v.entrada_em) <= ?'); params.push(dataFim) }
    params.push(limit, offset)
    return db.prepare(`
      SELECT v.*,
             c.nome as crianca_nome,
             r.nome as responsavel_nome
      FROM visitas v
      JOIN criancas c ON v.crianca_id = c.id
      LEFT JOIN responsaveis r ON v.responsavel_id = r.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY v.saida_em DESC
      LIMIT ? OFFSET ?
    `).all(...params)
  })

  ipcMain.handle('visits:stats', (_event, { estabelecimentoId, data }: { estabelecimentoId: string; data: string }) => {
    return db.prepare(`
      SELECT
        COUNT(*) as total_visitas,
        SUM(valor_total) as total_valor,
        AVG(
          CAST((julianday(saida_em) - julianday(entrada_em)) * 24 * 60 AS INTEGER)
        ) as media_minutos
      FROM visitas
      WHERE estabelecimento_id = ?
        AND status = 'finalizada'
        AND date(entrada_em) = ?
    `).get(estabelecimentoId, data)
  })

  // Pricing CRUD handlers

  ipcMain.handle('pricing:get', (_event, estabelecimentoId: string) => {
    return db.prepare(
      'SELECT * FROM configuracoes_preco WHERE estabelecimento_id = ? AND ativo = 1 ORDER BY id LIMIT 1'
    ).get(estabelecimentoId) ?? null
  })

  ipcMain.handle('pricing:save', (_event, data: {
    estabelecimentoId: string
    nome: string
    valor_base: number
    minutos_base: number
    faixas_intermediarias: string
    franquia_minutos: number
    valor_bloco: number
    minutos_por_bloco: number
    aplicarAtivas: boolean
  }) => {
    const { aplicarAtivas, estabelecimentoId, ...fields } = data

    // Ensure establishment record exists (required for FK constraint)
    db.prepare('INSERT OR IGNORE INTO estabelecimentos (id, nome) VALUES (?, ?)').run(estabelecimentoId, 'PlayKids')

    const existing = db.prepare(
      'SELECT id FROM configuracoes_preco WHERE estabelecimento_id = ? AND ativo = 1 ORDER BY criado_em DESC LIMIT 1'
    ).get(estabelecimentoId) as any

    const configId = existing?.id ?? randomUUID()

    const saveConfig = db.transaction(() => {
      // Deactivate all other active configs — ensures only one active at a time
      db.prepare(
        'UPDATE configuracoes_preco SET ativo = 0, sincronizado = 0 WHERE estabelecimento_id = ? AND id != ?'
      ).run(estabelecimentoId, configId)

      if (existing) {
        db.prepare(`
          UPDATE configuracoes_preco SET
            nome = ?, valor_base = ?, minutos_base = ?,
            faixas_intermediarias = ?, franquia_minutos = ?,
            valor_bloco = ?, minutos_por_bloco = ?,
            sincronizado = 0
          WHERE id = ?
        `).run(
          fields.nome, fields.valor_base, fields.minutos_base,
          fields.faixas_intermediarias, fields.franquia_minutos,
          fields.valor_bloco, fields.minutos_por_bloco,
          existing.id
        )
      } else {
        db.prepare(`
          INSERT INTO configuracoes_preco
            (id, estabelecimento_id, nome, valor_base, minutos_base, faixas_intermediarias, franquia_minutos, valor_bloco, minutos_por_bloco, ativo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          configId, estabelecimentoId, fields.nome,
          fields.valor_base, fields.minutos_base, fields.faixas_intermediarias,
          fields.franquia_minutos, fields.valor_bloco, fields.minutos_por_bloco
        )
      }

      if (aplicarAtivas) {
        // Update snapshots of all active visits so they use the new pricing immediately
        const fullConfig = { id: configId, estabelecimento_id: estabelecimentoId, ...fields }
        db.prepare(`
          UPDATE visitas SET configuracao_preco_snapshot = ?
          WHERE estabelecimento_id = ? AND status = 'ativa'
        `).run(JSON.stringify(fullConfig), estabelecimentoId)
      }
    })

    saveConfig()
    return { success: true }
  })

  ipcMain.handle('pricing:active-count', (_event, estabelecimentoId: string) => {
    const r = db.prepare(
      "SELECT COUNT(*) as c FROM visitas WHERE estabelecimento_id = ? AND status = 'ativa'"
    ).get(estabelecimentoId) as any
    return r?.c ?? 0
  })

  ipcMain.handle('visits:ranking', (_event, { estabelecimentoId, dataInicio, dataFim }: {
    estabelecimentoId: string
    dataInicio?: string
    dataFim?: string
  }) => {
    const conditions = ["v.estabelecimento_id = ?", "v.status = 'finalizada'"]
    const params: unknown[] = [estabelecimentoId]
    if (dataInicio) { conditions.push('date(v.entrada_em) >= ?'); params.push(dataInicio) }
    if (dataFim)    { conditions.push('date(v.entrada_em) <= ?'); params.push(dataFim) }
    const where = conditions.join(' AND ')

    const porVisitas = db.prepare(`
      SELECT c.id, c.nome as crianca_nome, r.nome as responsavel_nome,
             COUNT(*) as total_visitas,
             MAX(v.saida_em) as ultima_visita
      FROM visitas v
      JOIN criancas c ON v.crianca_id = c.id
      LEFT JOIN responsaveis r ON v.responsavel_id = r.id
      WHERE ${where}
      GROUP BY c.id
      ORDER BY total_visitas DESC
      LIMIT 10
    `).all(...params)

    const porGasto = db.prepare(`
      SELECT c.id, c.nome as crianca_nome, r.nome as responsavel_nome,
             COALESCE(SUM(v.valor_total), 0) as total_gasto,
             COUNT(*) as total_visitas,
             COALESCE(AVG(v.valor_total), 0) as ticket_medio,
             MAX(v.saida_em) as ultima_visita
      FROM visitas v
      JOIN criancas c ON v.crianca_id = c.id
      LEFT JOIN responsaveis r ON v.responsavel_id = r.id
      WHERE ${where}
      GROUP BY c.id
      ORDER BY total_gasto DESC
      LIMIT 10
    `).all(...params)

    return { por_visitas: porVisitas, por_gasto: porGasto }
  })
}
