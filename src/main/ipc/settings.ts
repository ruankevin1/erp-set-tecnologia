import { IpcMain } from 'electron'
import Database from 'better-sqlite3'

export function registerSettingsHandlers(ipcMain: IpcMain, db: Database.Database): void {
  ipcMain.handle('settings:get', (_event, chave: string) => {
    const row = db.prepare('SELECT valor FROM configuracoes_sistema WHERE chave = ?').get(chave) as any
    return row?.valor ?? null
  })

  ipcMain.handle('settings:set', (_event, chave: string, valor: string) => {
    db.prepare('INSERT OR REPLACE INTO configuracoes_sistema (chave, valor) VALUES (?, ?)').run(chave, valor)
    return { success: true }
  })

  ipcMain.handle('settings:get-all', () => {
    const rows = db.prepare('SELECT chave, valor FROM configuracoes_sistema').all() as { chave: string; valor: string }[]
    const result: Record<string, string> = {}
    for (const r of rows) result[r.chave] = r.valor
    return result
  })
}
