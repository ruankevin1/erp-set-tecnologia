import { IpcMain } from 'electron'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { triggerSync, pushToSupabase, getPendentes } from '../sync-service'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants'

function getSettingValue(db: Database.Database, key: string): string | null {
  try {
    return (db.prepare('SELECT valor FROM configuracoes_sistema WHERE chave = ?').get(key) as any)?.valor ?? null
  } catch { return null }
}

function buildAssinaturaResult(status: string, validaAte: string | null | undefined, ativo = 1) {
  let diasRestantes: number | null = null
  let expirado = false
  if (validaAte) {
    const diffMs = new Date(validaAte).getTime() - Date.now()
    diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    expirado = diffMs <= 0
  }
  // Bloqueia se: master desativou (ativo=0), status explícito, ou trial expirado
  const bloqueado = ativo === 0 || status === 'bloqueado' || (status === 'trial' && expirado)
  return { status, valida_ate: validaAte ?? null, dias_restantes: diasRestantes, expirado, bloqueado }
}

export function registerSyncHandlers(ipcMain: IpcMain, db: Database.Database): void {
  ipcMain.handle('sync:status', () => ({ pendentes: getPendentes(db) }))

  ipcMain.handle('assinatura:check', async (_event, { estabelecimentoId }: { estabelecimentoId: string }) => {
    const key = getSettingValue(db, 'supabase_key')

    const cached = () => {
      const status = getSettingValue(db, 'assinatura_status') ?? 'ativo'
      const validaAte = getSettingValue(db, 'assinatura_valida_ate') || null
      const ativo = parseInt(getSettingValue(db, 'assinatura_ativo') ?? '1')
      return buildAssinaturaResult(status, validaAte, ativo)
    }

    if (!key) return cached()

    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/estabelecimentos?id=eq.${estabelecimentoId}&select=status_assinatura,assinatura_valida_ate,ativo`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${key}` } }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rows = await res.json() as any[]
      if (!rows?.length) throw new Error('Não encontrado')

      const { status_assinatura, assinatura_valida_ate, ativo } = rows[0]
      const s = db.prepare('INSERT OR REPLACE INTO configuracoes_sistema (chave, valor) VALUES (?, ?)')
      s.run('assinatura_status', status_assinatura ?? 'ativo')
      s.run('assinatura_valida_ate', assinatura_valida_ate ?? '')
      s.run('assinatura_ativo', String(ativo ?? 1))
      s.run('assinatura_check_em', new Date().toISOString())

      return buildAssinaturaResult(status_assinatura ?? 'ativo', assinatura_valida_ate, ativo ?? 1)
    } catch (err: any) {
      console.warn('[assinatura:check] usando cache:', err.message)
      return cached()
    }
  })

  ipcMain.handle('sync:trigger', () => {
    triggerSync()
    return { ok: true }
  })

  ipcMain.handle('sync:push-data', async () => {
    const key = getSettingValue(db, 'supabase_key')
    if (!key) return { success: false, pushed: {}, errors: ['Chave de acesso não configurada'] }
    const result = await pushToSupabase(db, SUPABASE_URL, key, SUPABASE_ANON_KEY)
    return { success: result.errors.length === 0, pushed: result.pushed, errors: result.errors }
  })

  ipcMain.handle('sync:reset-all', () => {
    db.transaction(() => {
      // Operadores: nunca reseta master=1 (admin local; não é sincronizável)
      db.exec(`UPDATE operadores SET sincronizado = 0 WHERE master = 0`)
      // Estabelecimentos: só reseta a linha do UUID atual
      const estabId = getSettingValue(db, 'estabelecimento_id')
      if (estabId) db.prepare(`UPDATE estabelecimentos SET sincronizado = 0 WHERE id = ?`).run(estabId)
      const others = ['responsaveis', 'criancas', 'visitas', 'visita_faixas_aplicadas', 'fechamentos_caixa', 'logs_auditoria']
      for (const t of others) db.exec(`UPDATE ${t} SET sincronizado = 0`)
    })()
    return { success: true }
  })

  ipcMain.handle('sync:pull-all', async (_event, { estabelecimentoId }: { estabelecimentoId: string }) => {
    const key = getSettingValue(db, 'supabase_key')
    if (!key) return { success: false, error: 'Chave de acesso não configurada' }

    async function fetchAll(table: string, filter: string): Promise<any[]> {
      const all: any[] = []
      const PAGE = 1000
      let from = 0
      while (true) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Range-Unit': 'items',
            Range: `${from}-${from + PAGE - 1}`,
            Prefer: 'count=none',
          },
        })
        if (!res.ok) throw new Error(`[${table}] HTTP ${res.status}: ${await res.text()}`)
        const rows = await res.json()
        all.push(...rows)
        if (rows.length < PAGE) break
        from += PAGE
      }
      return all
    }

    try {
      const f = `estabelecimento_id=eq.${estabelecimentoId}`

      const [estabelecimentos, configuracoes, operadores, responsaveis, criancas, visitas, fechamentos] =
        await Promise.all([
          fetchAll('estabelecimentos', `id=eq.${estabelecimentoId}`),
          fetchAll('configuracoes_preco', f),
          fetchAll('operadores', f),
          fetchAll('responsaveis', `${f}&deletado_em=is.null`),
          fetchAll('criancas', `${f}&deletado_em=is.null`),
          fetchAll('visitas', f),
          fetchAll('fechamentos_caixa', f),
        ])

      // busca faixas em chunks para não estourar URL
      let faixas: any[] = []
      const visitaIds = visitas.map((v) => v.id)
      const CHUNK = 100
      for (let i = 0; i < visitaIds.length; i += CHUNK) {
        const ids = visitaIds.slice(i, i + CHUNK).join(',')
        const rows = await fetchAll('visita_faixas_aplicadas', `visita_id=in.(${ids})`)
        faixas.push(...rows)
      }

      const defaultHash = bcrypt.hashSync('trocar123', 10)

      db.pragma('foreign_keys = OFF')
      try {
        db.transaction(() => {
          const stmtEstab = db.prepare(`INSERT OR REPLACE INTO estabelecimentos
            (id, nome, cnpj, endereco, telefone, ativo, configuracoes, sincronizado, criado_em, atualizado_em, primeira_ativacao_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
          for (const r of estabelecimentos) {
            stmtEstab.run(r.id, r.nome, r.cnpj ?? null, r.endereco ?? null, r.telefone ?? null, r.ativo ?? 1, r.configuracoes ?? null, r.criado_em, r.atualizado_em, r.primeira_ativacao_em ?? null)
            if (r.configuracoes) {
              try {
                const settings = JSON.parse(r.configuracoes)
                const stmtSetting = db.prepare('INSERT OR REPLACE INTO configuracoes_sistema (chave, valor) VALUES (?, ?)')
                for (const [chave, valor] of Object.entries(settings)) {
                  if (typeof valor === 'string') stmtSetting.run(chave, valor)
                }
              } catch { /* ignora JSON inválido */ }
            }
          }

          const stmtOper = db.prepare(`INSERT OR IGNORE INTO operadores
            (id, estabelecimento_id, nome, login, senha_hash, nivel_acesso, master, ativo, sincronizado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`)
          for (const r of operadores.filter(r => !r.master))
            stmtOper.run(r.id, r.estabelecimento_id, r.nome, r.login, defaultHash, r.nivel_acesso ?? 'operador', 0, r.ativo ?? 1)
          if (operadores.length > 0) {
            const ids = operadores.map((r) => `'${r.id}'`).join(',')
            db.exec(`UPDATE operadores SET sincronizado = 1 WHERE id IN (${ids})`)
          }

          const stmtConf = db.prepare(`INSERT OR REPLACE INTO configuracoes_preco
            (id, estabelecimento_id, nome, idade_min, idade_max, valor_base, minutos_base,
             faixas_intermediarias, franquia_minutos, valor_bloco, minutos_por_bloco, ativo, sincronizado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
          for (const r of configuracoes)
            stmtConf.run(r.id, r.estabelecimento_id, r.nome, r.idade_min ?? null, r.idade_max ?? null,
              r.valor_base, r.minutos_base, r.faixas_intermediarias ?? '[]',
              r.franquia_minutos, r.valor_bloco, r.minutos_por_bloco, r.ativo ?? 1)

          const stmtResp = db.prepare(`INSERT OR REPLACE INTO responsaveis
            (id, estabelecimento_id, nome, cpf, telefone, email, observacoes, sincronizado, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
          for (const r of responsaveis)
            stmtResp.run(r.id, r.estabelecimento_id, r.nome, r.cpf ?? null, r.telefone ?? null,
              r.email ?? null, r.observacoes ?? null, r.criado_em, r.atualizado_em)

          const stmtCrianca = db.prepare(`INSERT OR REPLACE INTO criancas
            (id, estabelecimento_id, responsavel_id, nome, data_nascimento, observacoes, cpf, sincronizado, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
          for (const r of criancas)
            stmtCrianca.run(r.id, r.estabelecimento_id, r.responsavel_id ?? null, r.nome,
              r.data_nascimento ?? null, r.observacoes ?? null, r.cpf ?? null, r.criado_em, r.atualizado_em)

          const stmtVisita = db.prepare(`INSERT OR REPLACE INTO visitas
            (id, estabelecimento_id, crianca_id, responsavel_id, operador_id, entrada_em, saida_em,
             valor_total, status, observacoes, sincronizado, ticket_numero, forma_pagamento,
             valor_original, desconto_tipo, desconto_valor, motivo_desconto)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`)
          for (const r of visitas)
            stmtVisita.run(r.id, r.estabelecimento_id, r.crianca_id, r.responsavel_id ?? null,
              r.operador_id ?? null, r.entrada_em, r.saida_em ?? null, r.valor_total ?? null,
              r.status, r.observacoes ?? null, r.ticket_numero ?? null, r.forma_pagamento ?? null,
              r.valor_original ?? null, r.desconto_tipo ?? null, r.desconto_valor ?? null, r.motivo_desconto ?? null)

          const stmtFaixa = db.prepare(`INSERT OR REPLACE INTO visita_faixas_aplicadas
            (id, visita_id, configuracao_preco_id, minutos, valor, sincronizado)
            VALUES (?, ?, ?, ?, ?, 1)`)
          for (const r of faixas)
            stmtFaixa.run(r.id, r.visita_id, r.configuracao_preco_id, r.minutos, r.valor)

          const stmtFech = db.prepare(`INSERT OR REPLACE INTO fechamentos_caixa
            (id, estabelecimento_id, operador_id, abertura_em, fechamento_em, total_entradas,
             total_valor, status, observacoes, sincronizado, suprimento_inicial, operador_nome)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
          for (const r of fechamentos)
            stmtFech.run(r.id, r.estabelecimento_id, r.operador_id ?? null, r.abertura_em,
              r.fechamento_em ?? null, r.total_entradas ?? 0, r.total_valor ?? 0,
              r.status, r.observacoes ?? null, r.suprimento_inicial ?? 0, r.operador_nome ?? null)
        })()
      } finally {
        db.pragma('foreign_keys = ON')
      }

      return {
        success: true,
        restored: {
          operadores: operadores.length,
          responsaveis: responsaveis.length,
          criancas: criancas.length,
          visitas: visitas.length,
          faixas: faixas.length,
          fechamentos: fechamentos.length,
          configuracoes: estabelecimentos[0]?.configuracoes ? Object.keys(JSON.parse(estabelecimentos[0].configuracoes)).length : 0,
        },
      }
    } catch (err: any) {
      console.error('[sync:pull-all]', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('sync:fetch-config', async (_event, { supabaseKey, estabelecimentoId }: {
    supabaseKey?: string
    estabelecimentoId: string
  }) => {
    const key = supabaseKey || getSettingValue(db, 'supabase_key')
    if (!key) return { success: false, error: 'Chave de acesso não configurada' }
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/configuracoes_preco?estabelecimento_id=eq.${estabelecimentoId}&ativo=eq.1`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json'
          }
        }
      )
      if (!res.ok) {
        const body = await res.text()
        console.error(`[sync:fetch-config] HTTP ${res.status}:`, body)
        throw new Error(`Supabase error: ${res.status}: ${body}`)
      }
      const configs = await res.json()

      // Busca dados do estabelecimento pré-criado pelo master no Supabase
      const estabRes = await fetch(
        `${SUPABASE_URL}/rest/v1/estabelecimentos?id=eq.${estabelecimentoId}&select=id,nome,cnpj,telefone,endereco,ativo,criado_em,atualizado_em,primeira_ativacao_em`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${key}` } }
      )
      if (estabRes.ok) {
        const estabs = await estabRes.json() as any[]
        if (estabs.length > 0) {
          const e = estabs[0]
          // UPDATE preserva configuracoes (snapshot de settings); INSERT OR IGNORE apenas se row não existe ainda
          const upd = db.prepare(`
            UPDATE estabelecimentos SET
              nome=?, cnpj=?, telefone=?, endereco=?, ativo=?, sincronizado=1,
              criado_em=?, atualizado_em=?, primeira_ativacao_em=?
            WHERE id=?
          `).run(e.nome, e.cnpj ?? null, e.telefone ?? null, e.endereco ?? null,
                 e.ativo ?? 1, e.criado_em, e.atualizado_em, e.primeira_ativacao_em ?? null, e.id)
          if ((upd as any).changes === 0) {
            db.prepare(`
              INSERT OR IGNORE INTO estabelecimentos
                (id, nome, cnpj, telefone, endereco, ativo, sincronizado, criado_em, atualizado_em, primeira_ativacao_em)
              VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            `).run(e.id, e.nome, e.cnpj ?? null, e.telefone ?? null, e.endereco ?? null,
                   e.ativo ?? 1, e.criado_em, e.atualizado_em, e.primeira_ativacao_em ?? null)
          }
          // CNPJ é controlado pelo master — salva em configuracoes_sistema para exibição read-only na UI
          if (e.cnpj) {
            db.prepare("INSERT OR REPLACE INTO configuracoes_sistema (chave, valor) VALUES ('estabelecimento_cnpj', ?)").run(e.cnpj)
          }
        }
      } else {
        // Fallback: garante linha local mesmo sem dados do Supabase
        db.prepare(`INSERT OR IGNORE INTO estabelecimentos (id, nome, ativo, sincronizado) VALUES (?, 'PlayKids', 1, 1)`).run(estabelecimentoId)
      }

      db.prepare(`INSERT OR REPLACE INTO configuracoes_sistema (chave, valor) VALUES ('estabelecimento_id', ?)`).run(estabelecimentoId)

      // Remove linhas de outros estabelecimentos que possam ter ficado no SQLite (ex: UUID padrão do boot)
      db.prepare(`DELETE FROM estabelecimentos WHERE id != ?`).run(estabelecimentoId)
      // Corrige o estabelecimento_id do admin master local (criado antes do JWT ser conhecido)
      // Nunca deleta — cliente novo não tem operadores no Supabase e precisa do admin para logar
      db.prepare(`UPDATE operadores SET estabelecimento_id = ?, sincronizado = 1 WHERE master = 1`).run(estabelecimentoId)

      const insert = db.prepare(`
        INSERT OR REPLACE INTO configuracoes_preco
          (id, estabelecimento_id, nome, idade_min, idade_max,
           valor_base, minutos_base, faixas_intermediarias,
           franquia_minutos, valor_bloco, minutos_por_bloco,
           ativo, sincronizado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `)
      db.transaction((items: any[]) => {
        db.prepare('UPDATE configuracoes_preco SET ativo = 0 WHERE estabelecimento_id = ?').run(estabelecimentoId)
        items.forEach((c) =>
          insert.run(
            c.id, c.estabelecimento_id, c.nome, c.idade_min ?? null, c.idade_max ?? null,
            c.valor_base ?? 25, c.minutos_base ?? 30,
            c.faixas_intermediarias ?? '[]',
            c.franquia_minutos ?? 60, c.valor_bloco ?? 5, c.minutos_por_bloco ?? 15,
            c.ativo ? 1 : 0
          )
        )
      })(configs)

      return { success: true, count: configs.length }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
