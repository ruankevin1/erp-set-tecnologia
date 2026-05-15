import { IpcMain } from 'electron'
import Database from 'better-sqlite3'
import { triggerSync } from '../sync-service'

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

  ipcMain.handle('estabelecimento:save', (_event, data: {
    nome: string
    cnpj?: string
    endereco?: string
    telefone1?: string
    telefone2?: string
    unidade?: string
  }) => {
    const nome = data.nome?.trim() || 'PlayKids'
    const cnpj = data.cnpj?.trim() ?? ''
    const endereco = data.endereco?.trim() ?? ''
    const telefone1 = data.telefone1?.trim() ?? ''
    const telefone2 = data.telefone2?.trim() ?? ''
    const unidade = data.unidade?.trim() ?? ''

    // 1. Persiste em configuracoes_sistema (fonte de verdade para settings da UI)
    const s = db.prepare('INSERT OR REPLACE INTO configuracoes_sistema (chave, valor) VALUES (?, ?)')
    const saveSettings = db.transaction(() => {
      s.run('estabelecimento_nome', nome)
      s.run('estabelecimento_cnpj', cnpj)
      s.run('estabelecimento_endereco', endereco)
      s.run('estabelecimento_telefone1', telefone1)
      s.run('estabelecimento_telefone2', telefone2)
      s.run('ticket_unidade', unidade)
    })
    saveSettings()

    // 2. Atualiza a linha de estabelecimentos — inclui primeira_ativacao_em se ainda nula
    const agora = new Date().toISOString()
    db.prepare(`
      UPDATE estabelecimentos SET
        nome               = ?,
        cnpj               = ?,
        endereco           = ?,
        telefone           = ?,
        atualizado_em      = ?,
        primeira_ativacao_em = COALESCE(primeira_ativacao_em, ?),
        sincronizado       = 0
    `).run(nome, cnpj || null, endereco || null, telefone1 || null, agora, agora)

    // 3. Sincroniza imediatamente
    triggerSync()

    return { success: true }
  })
}
