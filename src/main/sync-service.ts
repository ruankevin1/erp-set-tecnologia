import { BrowserWindow } from 'electron'
import Database from 'better-sqlite3'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants'

const TABLES = [
  'estabelecimentos',
  'configuracoes_preco',
  'operadores',
  'responsaveis',
  'criancas',
  'visitas',
  'visita_faixas_aplicadas',
  'fechamentos_caixa',
  'logs_auditoria'
] as const

const SOFT_DELETE_TABLES = new Set(['responsaveis', 'criancas'])

let _db: Database.Database | null = null
let _window: BrowserWindow | null = null
let _isSyncing = false
let _pendingTrigger = false
let _intervalId: ReturnType<typeof setInterval> | null = null

export function initSyncService(db: Database.Database): void {
  _db = db
}

export function setSyncWindow(win: BrowserWindow): void {
  _window = win
}

export function startAutoSync(): void {
  setTimeout(() => triggerSync(), 4000)
  _intervalId = setInterval(() => triggerSync(), 30000)
}

export function stopAutoSync(): void {
  if (_intervalId) {
    clearInterval(_intervalId)
    _intervalId = null
  }
}

export function triggerSync(): void {
  if (_isSyncing) {
    _pendingTrigger = true
    return
  }
  runSync()
}

async function runSync(): Promise<void> {
  if (!_db) return
  const key = getSetting('supabase_key')
  if (!key) return

  _isSyncing = true
  broadcast({ isSyncing: true })

  try {
    await pushToSupabase(_db, SUPABASE_URL, key, SUPABASE_ANON_KEY)
  } catch (err) {
    console.error('[sync-service]', err)
  }

  _isSyncing = false
  broadcast({ isSyncing: false, pendentes: getPendentes(_db) })

  if (_pendingTrigger) {
    _pendingTrigger = false
    setTimeout(() => runSync(), 500)
  }
}

function broadcast(data: object): void {
  if (_window && !_window.isDestroyed()) {
    _window.webContents.send('sync:status-update', data)
  }
}

function getSetting(key: string): string | null {
  try {
    return (_db!.prepare('SELECT valor FROM configuracoes_sistema WHERE chave = ?').get(key) as any)?.valor ?? null
  } catch {
    return null
  }
}

function getAllSettings(db: Database.Database): Record<string, string> {
  try {
    const rows = db.prepare(
      "SELECT chave, valor FROM configuracoes_sistema WHERE chave != 'supabase_key'"
    ).all() as { chave: string; valor: string }[]
    return Object.fromEntries(rows.map(r => [r.chave, r.valor]))
  } catch { return {} }
}

export function getPendentes(db: Database.Database): {
  estabelecimentos: number
  configuracoes_preco: number
  responsaveis: number
  criancas: number
  visitas: number
  visita_faixas_aplicadas: number
  fechamentos_caixa: number
  logs: number
} {
  const count = (t: string): number => {
    try {
      return (db.prepare(`SELECT COUNT(*) as n FROM ${t} WHERE sincronizado = 0`).get() as any).n
    } catch { return 0 }
  }
  return {
    estabelecimentos: count('estabelecimentos'),
    configuracoes_preco: count('configuracoes_preco'),
    operadores: (() => { try { return (db.prepare(`SELECT COUNT(*) as n FROM operadores WHERE sincronizado = 0 AND master = 0`).get() as any).n } catch { return 0 } })(),
    responsaveis: count('responsaveis'),
    criancas: count('criancas'),
    visitas: count('visitas'),
    visita_faixas_aplicadas: count('visita_faixas_aplicadas'),
    fechamentos_caixa: count('fechamentos_caixa'),
    logs: count('logs_auditoria'),
  }
}

export async function pushToSupabase(
  db: Database.Database,
  supabaseUrl: string,
  supabaseKey: string,
  supabaseAnonKey?: string
): Promise<{ pushed: Record<string, number>; errors: string[] }> {
  const pushed: Record<string, number> = {}
  const errors: string[] = []
  const apiKey = supabaseAnonKey || supabaseKey

  for (const table of TABLES) {
    const pushedKey = table === 'logs_auditoria' ? 'logs' : table
    pushed[pushedKey] = 0
    try {
      if (table === 'estabelecimentos') {
        const settings = getAllSettings(db)
        const json = JSON.stringify(settings)
        const current = (_db!.prepare('SELECT configuracoes FROM estabelecimentos LIMIT 1').get() as any)?.configuracoes
        if (current !== json) {
          db.prepare('UPDATE estabelecimentos SET configuracoes = ?, sincronizado = 0').run(json)
        }
      }

      // Soft-delete tables: push deletado_em via PATCH to preserve FK references
      if (SOFT_DELETE_TABLES.has(table)) {
        const deleted = db.prepare(
          `SELECT id, deletado_em FROM ${table} WHERE deletado_em IS NOT NULL AND sincronizado = 0`
        ).all() as { id: string; deletado_em: string }[]
        for (const { id, deletado_em } of deleted) {
          const patchRes = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
              apikey: apiKey,
              Authorization: `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal'
            },
            body: JSON.stringify({ deletado_em })
          })
          if (patchRes.ok || patchRes.status === 404) {
            db.prepare(`UPDATE ${table} SET sincronizado = 1 WHERE id = ?`).run(id)
            pushed[pushedKey] = (pushed[pushedKey] ?? 0) + 1
          } else {
            const body = await patchRes.text()
            console.error(`[sync] PATCH ${table} HTTP ${patchRes.status}:`, body)
          }
        }
      }

      const activeQuery = SOFT_DELETE_TABLES.has(table)
        ? `SELECT * FROM ${table} WHERE sincronizado = 0 AND deletado_em IS NULL`
        : `SELECT * FROM ${table} WHERE sincronizado = 0`
      const rows = db.prepare(activeQuery).all() as any[]
      if (rows.length === 0) continue

      // Strip internal fields before sending to Supabase
      const clean = rows.map(({ sincronizado: _s, senha_hash: _h, deletado_em: _d, configuracao_preco_snapshot: _cp, ...rest }) => rest)
      console.log(`[sync] ${table}: ${rows.length} registro(s)`)

      const headers = {
        apikey: apiKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      }

      const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(clean)
      })

      if (!res.ok) {
        const body = await res.text()
        console.error(`[sync] ${table} HTTP ${res.status}:`, body)

        // FK (409) ou RLS (401/403): tenta individualmente para não prender registros válidos
        if (res.status === 409 || res.status === 401 || res.status === 403) {
          const updateStmt = db.prepare(`UPDATE ${table} SET sincronizado = 1 WHERE id = ?`)
          let ok = 0
          for (let i = 0; i < clean.length; i++) {
            const singleRes = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
              method: 'POST',
              headers,
              body: JSON.stringify([clean[i]])
            })
            if (singleRes.ok) {
              updateStmt.run(rows[i].id)
              ok++
            } else {
              const singleBody = await singleRes.text()
              console.warn(`[sync] ${table} id=${rows[i].id} HTTP ${singleRes.status}: ${singleBody}`)
            }
          }
          pushed[pushedKey] = (pushed[pushedKey] ?? 0) + ok
          if (ok < clean.length) {
            errors.push(`[${table}] ${clean.length - ok} registro(s) pendentes (dependência não sincronizada)`)
          }
          continue
        }

        throw new Error(`[${table}] HTTP ${res.status}: ${body}`)
      }

      const updateStmt = db.prepare(`UPDATE ${table} SET sincronizado = 1 WHERE id = ?`)
      db.transaction((ids: string[]) => {
        for (const id of ids) updateStmt.run(id)
      })(rows.map((r) => r.id))

      pushed[pushedKey] = (pushed[pushedKey] ?? 0) + rows.length
    } catch (err: any) {
      console.error(`[sync] ERRO ${err.message}`)
      errors.push(err.message)
    }
  }

  return { pushed, errors }
}
