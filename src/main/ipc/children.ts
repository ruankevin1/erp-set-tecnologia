import { IpcMain } from 'electron'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { triggerSync } from '../sync-service'

function norm(q: string): string {
  return q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function registerChildrenHandlers(ipcMain: IpcMain, db: Database.Database): void {
  ipcMain.handle('children:list', (_event, estabelecimentoId: string) => {
    return db.prepare(`
      SELECT c.*, r.nome as responsavel_nome, r.telefone as responsavel_telefone
      FROM criancas c
      LEFT JOIN responsaveis r ON c.responsavel_id = r.id
      WHERE c.estabelecimento_id = ?
      ORDER BY c.nome
    `).all(estabelecimentoId)
  })

  ipcMain.handle('children:search', (_event, { estabelecimentoId, query }: { estabelecimentoId: string; query: string }) => {
    return db.prepare(`
      SELECT c.*, r.nome as responsavel_nome, r.telefone as responsavel_telefone,
        MAX(CASE WHEN v.status = 'finalizada' THEN v.entrada_em END) as ultima_visita
      FROM criancas c
      LEFT JOIN responsaveis r ON c.responsavel_id = r.id
      LEFT JOIN visitas v ON c.id = v.crianca_id
      WHERE c.estabelecimento_id = ?
        AND (normalize_text(c.nome) LIKE ? OR normalize_text(r.nome) LIKE ? OR r.telefone LIKE ?)
      GROUP BY c.id
      ORDER BY c.nome
      LIMIT 20
    `).all(estabelecimentoId, `%${norm(query)}%`, `%${norm(query)}%`, `%${query}%`)
  })

  ipcMain.handle('children:list-with-stats', (_event, { estabelecimentoId, query }: { estabelecimentoId: string; query?: string }) => {
    const rawQ = query && query.trim().length >= 1 ? `%${query.trim()}%` : null
    const normQ = query && query.trim().length >= 1 ? `%${norm(query.trim())}%` : null
    const base = `
      SELECT c.id, c.nome, c.data_nascimento, c.cpf, c.observacoes, c.responsavel_id,
        r.nome as responsavel_nome, r.cpf as responsavel_cpf,
        r.telefone as responsavel_telefone, r.email as responsavel_email,
        COUNT(CASE WHEN v.status = 'finalizada' THEN 1 END) as total_visitas,
        MAX(CASE WHEN v.status = 'finalizada' THEN v.entrada_em END) as ultima_visita,
        COALESCE(SUM(CASE WHEN v.status = 'finalizada' THEN v.valor_total ELSE 0 END), 0) as total_gasto,
        CASE WHEN EXISTS(
          SELECT 1 FROM visitas va WHERE va.crianca_id = c.id AND va.status = 'ativa'
        ) THEN 1 ELSE 0 END as visita_ativa
      FROM criancas c
      LEFT JOIN responsaveis r ON c.responsavel_id = r.id
      LEFT JOIN visitas v ON c.id = v.crianca_id
      WHERE c.estabelecimento_id = ?
    `
    if (normQ) {
      return db.prepare(`${base} AND (normalize_text(c.nome) LIKE ? OR normalize_text(r.nome) LIKE ? OR r.telefone LIKE ? OR r.cpf LIKE ? OR c.cpf LIKE ?) GROUP BY c.id ORDER BY c.nome`)
        .all(estabelecimentoId, normQ, normQ, rawQ, rawQ, rawQ)
    }
    return db.prepare(`${base} GROUP BY c.id ORDER BY c.nome`).all(estabelecimentoId)
  })

  ipcMain.handle('children:create', (_event, data: {
    estabelecimentoId: string
    nome: string
    dataNascimento?: string
    cpf?: string
    responsavelId?: string
    observacoes?: string
  }) => {
    const id = randomUUID()
    db.prepare(`
      INSERT INTO criancas (id, estabelecimento_id, nome, data_nascimento, cpf, responsavel_id, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.estabelecimentoId, data.nome, data.dataNascimento ?? null, data.cpf ?? null, data.responsavelId ?? null, data.observacoes ?? null)
    triggerSync()
    return { id }
  })

  ipcMain.handle('children:get', (_event, id: string) => {
    return db.prepare(`
      SELECT c.*, r.nome as responsavel_nome, r.cpf as responsavel_cpf,
        r.telefone as responsavel_telefone, r.email as responsavel_email
      FROM criancas c
      LEFT JOIN responsaveis r ON c.responsavel_id = r.id
      WHERE c.id = ?
    `).get(id)
  })

  ipcMain.handle('children:get-details', (_event, id: string) => {
    const crianca = db.prepare(`
      SELECT c.*, r.nome as responsavel_nome, r.cpf as responsavel_cpf,
        r.telefone as responsavel_telefone, r.email as responsavel_email
      FROM criancas c
      LEFT JOIN responsaveis r ON c.responsavel_id = r.id
      WHERE c.id = ?
    `).get(id)

    const visitas = db.prepare(`
      SELECT v.*,
        CAST(ROUND((julianday(COALESCE(v.saida_em, datetime('now'))) - julianday(v.entrada_em)) * 24 * 60) AS INTEGER) as minutos
      FROM visitas v
      WHERE v.crianca_id = ?
      ORDER BY v.entrada_em DESC
      LIMIT 100
    `).all(id)

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_visitas,
        COALESCE(SUM(valor_total), 0) as total_gasto,
        COALESCE(AVG(
          CAST(ROUND((julianday(saida_em) - julianday(entrada_em)) * 24 * 60) AS INTEGER)
        ), 0) as media_minutos
      FROM visitas
      WHERE crianca_id = ? AND status = 'finalizada'
    `).get(id)

    return { crianca, visitas, stats }
  })

  ipcMain.handle('children:update', (_event, data: {
    id: string
    nome: string
    dataNascimento?: string
    cpf?: string
    observacoes?: string
    responsavelId?: string
  }) => {
    db.prepare(`
      UPDATE criancas SET nome = ?, data_nascimento = ?, cpf = ?, observacoes = ?,
        responsavel_id = ?, atualizado_em = datetime('now'), sincronizado = 0
      WHERE id = ?
    `).run(data.nome, data.dataNascimento ?? null, data.cpf ?? null, data.observacoes ?? null, data.responsavelId ?? null, data.id)
    triggerSync()
    return { success: true }
  })

  ipcMain.handle('children:delete', (_event, id: string) => {
    const activeVisit = db.prepare(`
      SELECT id FROM visitas WHERE crianca_id = ? AND status = 'ativa' LIMIT 1
    `).get(id)
    if (activeVisit) throw new Error('Criança possui visita ativa')

    const child = db.prepare(`SELECT responsavel_id FROM criancas WHERE id = ?`).get(id) as any

    // FK off para manter histórico de visitas intacto
    db.pragma('foreign_keys = OFF')
    try {
      db.prepare(`DELETE FROM criancas WHERE id = ?`).run(id)

      if (child?.responsavel_id) {
        const outrasFilhos = db.prepare(
          `SELECT COUNT(*) as count FROM criancas WHERE responsavel_id = ?`
        ).get(child.responsavel_id) as any
        if (outrasFilhos.count === 0) {
          db.prepare(`DELETE FROM responsaveis WHERE id = ?`).run(child.responsavel_id)
        }
      }
    } finally {
      db.pragma('foreign_keys = ON')
    }
    triggerSync()
    return { success: true }
  })

  ipcMain.handle('guardians:delete', (_event, id: string) => {
    db.pragma('foreign_keys = OFF')
    try {
      db.prepare(`DELETE FROM criancas WHERE responsavel_id = ?`).run(id)
      db.prepare(`DELETE FROM responsaveis WHERE id = ?`).run(id)
    } finally {
      db.pragma('foreign_keys = ON')
    }
    triggerSync()
    return { success: true }
  })

  // Responsáveis
  ipcMain.handle('guardians:list', (_event, estabelecimentoId: string) => {
    return db.prepare(`
      SELECT * FROM responsaveis WHERE estabelecimento_id = ? ORDER BY nome
    `).all(estabelecimentoId)
  })

  ipcMain.handle('guardians:create', (_event, data: {
    estabelecimentoId: string
    nome: string
    cpf?: string
    telefone?: string
    email?: string
  }) => {
    const id = randomUUID()
    db.prepare(`
      INSERT INTO responsaveis (id, estabelecimento_id, nome, cpf, telefone, email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.estabelecimentoId, data.nome, data.cpf ?? null, data.telefone ?? null, data.email ?? null)
    triggerSync()
    return { id }
  })

  ipcMain.handle('guardians:update', (_event, data: {
    id: string
    nome: string
    cpf?: string
    telefone?: string
    email?: string
  }) => {
    db.prepare(`
      UPDATE responsaveis SET nome = ?, cpf = ?, telefone = ?, email = ?,
        atualizado_em = datetime('now'), sincronizado = 0
      WHERE id = ?
    `).run(data.nome, data.cpf ?? null, data.telefone ?? null, data.email ?? null, data.id)
    triggerSync()
    return { success: true }
  })

  ipcMain.handle('guardians:find-by-cpf', (_event, { estabelecimentoId, cpf }: { estabelecimentoId: string; cpf: string }) => {
    return db.prepare(`
      SELECT id, nome, telefone FROM responsaveis WHERE estabelecimento_id = ? AND cpf = ? LIMIT 1
    `).get(estabelecimentoId, cpf)
  })

  ipcMain.handle('guardians:search', (_event, { estabelecimentoId, query }: { estabelecimentoId: string; query: string }) => {
    return db.prepare(`
      SELECT r.id, r.nome, r.cpf, r.telefone, r.email,
        COUNT(c.id) as total_criancas
      FROM responsaveis r
      LEFT JOIN criancas c ON c.responsavel_id = r.id
      WHERE r.estabelecimento_id = ? AND (normalize_text(r.nome) LIKE ? OR r.cpf LIKE ? OR r.telefone LIKE ?)
      GROUP BY r.id
      ORDER BY r.nome
      LIMIT 10
    `).all(estabelecimentoId, `%${norm(query)}%`, `%${query}%`, `%${query}%`)
  })

  ipcMain.handle('guardians:get-children', (_event, guardianId: string) => {
    return db.prepare(`
      SELECT c.id, c.nome, c.data_nascimento, c.cpf, c.observacoes, c.responsavel_id,
        MAX(CASE WHEN v.status = 'finalizada' THEN v.entrada_em END) as ultima_visita,
        COUNT(CASE WHEN v.status = 'finalizada' THEN 1 END) as total_visitas,
        COALESCE(SUM(CASE WHEN v.status = 'finalizada' THEN v.valor_total ELSE 0 END), 0) as total_gasto,
        CASE WHEN EXISTS(
          SELECT 1 FROM visitas va WHERE va.crianca_id = c.id AND va.status = 'ativa'
        ) THEN 1 ELSE 0 END as visita_ativa
      FROM criancas c
      LEFT JOIN visitas v ON v.crianca_id = c.id
      WHERE c.responsavel_id = ?
      GROUP BY c.id
      ORDER BY c.nome
    `).all(guardianId)
  })

  ipcMain.handle('guardians:list-with-stats', (_event, { estabelecimentoId, query }: { estabelecimentoId: string; query?: string }) => {
    const base = `
      SELECT r.id, r.nome, r.cpf, r.telefone, r.email,
        COUNT(DISTINCT c.id) as total_criancas,
        COUNT(CASE WHEN v.status = 'finalizada' THEN 1 END) as total_visitas,
        COALESCE(SUM(CASE WHEN v.status = 'finalizada' THEN v.valor_total ELSE 0 END), 0) as total_gasto,
        MAX(CASE WHEN v.status = 'finalizada' THEN v.entrada_em END) as ultima_visita
      FROM responsaveis r
      LEFT JOIN criancas c ON c.responsavel_id = r.id
      LEFT JOIN visitas v ON v.crianca_id = c.id
      WHERE r.estabelecimento_id = ?
    `
    const q = query && query.trim().length >= 1 ? `%${query.trim()}%` : null
    if (q) {
      return db.prepare(`${base} AND (r.nome LIKE ? OR r.cpf LIKE ? OR r.telefone LIKE ?) GROUP BY r.id ORDER BY r.nome`)
        .all(estabelecimentoId, q, q, q)
    }
    return db.prepare(`${base} GROUP BY r.id ORDER BY r.nome`).all(estabelecimentoId)
  })
}
