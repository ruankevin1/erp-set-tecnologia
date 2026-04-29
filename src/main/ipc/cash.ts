import { IpcMain } from 'electron'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { triggerSync } from '../sync-service'

export function registerCashHandlers(ipcMain: IpcMain, db: Database.Database): void {
  ipcMain.handle('cash:current', (_event, estabelecimentoId: string) => {
    return db.prepare(`
      SELECT * FROM fechamentos_caixa
      WHERE estabelecimento_id = ? AND status = 'aberto'
      ORDER BY abertura_em DESC LIMIT 1
    `).get(estabelecimentoId)
  })

  ipcMain.handle('cash:open', (_event, data: {
    estabelecimentoId: string
    operadorId?: string
    operador_nome?: string
    suprimento_inicial?: number
  }) => {
    const id = randomUUID()
    const agora = new Date().toISOString()
    db.prepare(`
      INSERT INTO fechamentos_caixa
        (id, estabelecimento_id, operador_id, operador_nome, suprimento_inicial, abertura_em, status)
      VALUES (?, ?, ?, ?, ?, ?, 'aberto')
    `).run(id, data.estabelecimentoId, data.operadorId ?? null, data.operador_nome ?? null, data.suprimento_inicial ?? 0, agora)
    triggerSync()
    return { id }
  })

  ipcMain.handle('cash:stats', (_event, caixaId: string) => {
    const caixa = db.prepare('SELECT * FROM fechamentos_caixa WHERE id = ?').get(caixaId) as any
    if (!caixa) return null

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_entradas,
        COALESCE(SUM(valor_total), 0) as total_valor,
        COALESCE(SUM(COALESCE(valor_original, valor_total)), 0) as total_bruto,
        COALESCE(SUM(CASE WHEN desconto_valor > 0 THEN COALESCE(valor_original, valor_total) - valor_total ELSE 0 END), 0) as total_descontos,
        COALESCE(AVG((julianday(saida_em) - julianday(entrada_em)) * 24 * 60), 0) as media_minutos
      FROM visitas
      WHERE status = 'finalizada'
        AND estabelecimento_id = ?
        AND saida_em >= ?
    `).get(caixa.estabelecimento_id, caixa.abertura_em) as any

    const formas = db.prepare(`
      SELECT
        COALESCE(forma_pagamento, '') as forma,
        COALESCE(SUM(valor_total), 0) as total
      FROM visitas
      WHERE status = 'finalizada'
        AND estabelecimento_id = ?
        AND saida_em >= ?
      GROUP BY forma_pagamento
    `).all(caixa.estabelecimento_id, caixa.abertura_em) as any[]

    const descontosPorMotivo = db.prepare(`
      SELECT
        COALESCE(motivo_desconto, 'Outros') as motivo,
        COALESCE(SUM(COALESCE(valor_original, valor_total) - valor_total), 0) as total
      FROM visitas
      WHERE status = 'finalizada'
        AND estabelecimento_id = ?
        AND saida_em >= ?
        AND desconto_valor > 0
      GROUP BY motivo_desconto
    `).all(caixa.estabelecimento_id, caixa.abertura_em) as any[]

    return {
      total_entradas: stats.total_entradas,
      total_valor: stats.total_valor,
      total_bruto: stats.total_bruto,
      total_descontos: stats.total_descontos,
      media_minutos: Math.round(stats.media_minutos),
      por_forma: formas,
      descontos_por_motivo: descontosPorMotivo,
      suprimento_inicial: caixa.suprimento_inicial ?? 0,
      abertura_em: caixa.abertura_em,
      operador_nome: caixa.operador_nome ?? '',
    }
  })

  ipcMain.handle('cash:close', (_event, data: { caixaId: string; observacoes?: string }) => {
    const caixa = db.prepare('SELECT * FROM fechamentos_caixa WHERE id = ?').get(data.caixaId) as any
    if (!caixa) return { success: false, error: 'Caixa não encontrado' }

    const activeVisits = db.prepare(`
      SELECT COUNT(*) as count FROM visitas
      WHERE estabelecimento_id = ? AND status = 'ativa'
    `).get(caixa.estabelecimento_id) as any

    if (activeVisits.count > 0) {
      return { success: false, activeVisits: activeVisits.count }
    }

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_entradas,
        COALESCE(SUM(valor_total), 0) as total_valor,
        COALESCE(SUM(COALESCE(valor_original, valor_total)), 0) as total_bruto,
        COALESCE(SUM(CASE WHEN desconto_valor > 0 THEN COALESCE(valor_original, valor_total) - valor_total ELSE 0 END), 0) as total_descontos,
        COALESCE(AVG((julianday(saida_em) - julianday(entrada_em)) * 24 * 60), 0) as media_minutos
      FROM visitas
      WHERE status = 'finalizada'
        AND estabelecimento_id = ?
        AND saida_em >= ?
    `).get(caixa.estabelecimento_id, caixa.abertura_em) as any

    const formas = db.prepare(`
      SELECT
        COALESCE(forma_pagamento, '') as forma,
        COALESCE(SUM(valor_total), 0) as total
      FROM visitas
      WHERE status = 'finalizada'
        AND estabelecimento_id = ?
        AND saida_em >= ?
      GROUP BY forma_pagamento
    `).all(caixa.estabelecimento_id, caixa.abertura_em) as any[]

    const descontosPorMotivo = db.prepare(`
      SELECT
        COALESCE(motivo_desconto, 'Outros') as motivo,
        COALESCE(SUM(COALESCE(valor_original, valor_total) - valor_total), 0) as total
      FROM visitas
      WHERE status = 'finalizada'
        AND estabelecimento_id = ?
        AND saida_em >= ?
        AND desconto_valor > 0
      GROUP BY motivo_desconto
    `).all(caixa.estabelecimento_id, caixa.abertura_em) as any[]

    const fechamentoEm = new Date().toISOString()
    db.prepare(`
      UPDATE fechamentos_caixa
      SET status = 'fechado', fechamento_em = ?,
          total_entradas = ?, total_valor = ?, observacoes = ?, sincronizado = 0
      WHERE id = ?
    `).run(fechamentoEm, stats.total_entradas, stats.total_valor, data.observacoes ?? null, data.caixaId)

    const updated = db.prepare('SELECT fechamento_em FROM fechamentos_caixa WHERE id = ?').get(data.caixaId) as any

    triggerSync()
    return {
      success: true,
      total_entradas: stats.total_entradas,
      total_valor: stats.total_valor,
      total_bruto: stats.total_bruto,
      total_descontos: stats.total_descontos,
      media_minutos: Math.round(stats.media_minutos),
      por_forma: formas,
      descontos_por_motivo: descontosPorMotivo,
      suprimento_inicial: caixa.suprimento_inicial ?? 0,
      abertura_em: caixa.abertura_em,
      fechamento_em: updated.fechamento_em,
      operador_nome: caixa.operador_nome ?? '',
    }
  })

  ipcMain.handle('cash:history', (_event, { estabelecimentoId, limit = 50, dataInicio, dataFim }: {
    estabelecimentoId: string; limit?: number; dataInicio?: string; dataFim?: string
  }) => {
    if (dataInicio && dataFim) {
      return db.prepare(`
        SELECT * FROM fechamentos_caixa
        WHERE estabelecimento_id = ?
          AND date(abertura_em) >= ?
          AND date(abertura_em) <= ?
        ORDER BY abertura_em DESC LIMIT ?
      `).all(estabelecimentoId, dataInicio, dataFim, limit)
    }
    return db.prepare(`
      SELECT * FROM fechamentos_caixa
      WHERE estabelecimento_id = ?
      ORDER BY abertura_em DESC LIMIT ?
    `).all(estabelecimentoId, limit)
  })
}
