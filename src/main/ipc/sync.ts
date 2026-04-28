import { IpcMain } from 'electron'
import Database from 'better-sqlite3'
import { triggerSync, pushToSupabase, getPendentes } from '../sync-service'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants'

function getSettingValue(db: Database.Database, key: string): string | null {
  try {
    return (db.prepare('SELECT valor FROM configuracoes_sistema WHERE chave = ?').get(key) as any)?.valor ?? null
  } catch { return null }
}

export function registerSyncHandlers(ipcMain: IpcMain, db: Database.Database): void {
  ipcMain.handle('sync:status', () => ({ pendentes: getPendentes(db) }))

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
    const tables = ['estabelecimentos', 'responsaveis', 'criancas', 'visitas', 'visita_faixas_aplicadas', 'fechamentos_caixa', 'logs_auditoria']
    db.transaction(() => {
      for (const t of tables) db.exec(`UPDATE ${t} SET sincronizado = 0`)
    })()
    return { success: true }
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
