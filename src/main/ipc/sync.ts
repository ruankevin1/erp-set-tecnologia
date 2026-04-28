import { IpcMain } from 'electron'
import Database from 'better-sqlite3'
import { triggerSync, pushToSupabase, getPendentes } from '../sync-service'

export function registerSyncHandlers(ipcMain: IpcMain, db: Database.Database): void {
  ipcMain.handle('sync:status', () => ({ pendentes: getPendentes(db) }))

  ipcMain.handle('sync:trigger', () => {
    triggerSync()
    return { ok: true }
  })

  ipcMain.handle('sync:push-data', async (_event, { supabaseUrl, supabaseKey, supabaseAnonKey }: {
    supabaseUrl: string
    supabaseKey: string
    supabaseAnonKey?: string
  }) => {
    const result = await pushToSupabase(db, supabaseUrl, supabaseKey, supabaseAnonKey)
    return { success: result.errors.length === 0, pushed: result.pushed, errors: result.errors }
  })

  ipcMain.handle('sync:reset-all', () => {
    const tables = ['estabelecimentos', 'responsaveis', 'criancas', 'visitas', 'visita_faixas_aplicadas', 'fechamentos_caixa', 'logs_auditoria']
    db.transaction(() => {
      for (const t of tables) db.exec(`UPDATE ${t} SET sincronizado = 0`)
    })()
    return { success: true }
  })

  ipcMain.handle('sync:fetch-config', async (_event, { supabaseUrl, supabaseKey, estabelecimentoId, supabaseAnonKey }: {
    supabaseUrl: string
    supabaseKey: string
    estabelecimentoId: string
    supabaseAnonKey?: string
  }) => {
    const apiKey = supabaseAnonKey || supabaseKey
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/configuracoes_preco?estabelecimento_id=eq.${estabelecimentoId}&ativo=eq.1`,
        {
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${supabaseKey}`,
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
