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

    // 2. Atualiza a linha de estabelecimentos (apenas campos editáveis pelo cliente)
    // ativo, criado_em, primeira_ativacao_em são controlados pelo master — nunca alterar localmente
    // WHERE garante que só a linha deste estabelecimento seja atualizada (nunca linhas de outros UUIDs)
    const estabId = (db.prepare('SELECT valor FROM configuracoes_sistema WHERE chave = ?').get('estabelecimento_id') as any)?.valor
    const agora = new Date().toISOString()
    if (estabId) {
      // Snapshot das configurações atuais para o campo configuracoes (lido pelo master no Supabase)
      const configRows = db.prepare(
        "SELECT chave, valor FROM configuracoes_sistema WHERE chave != 'supabase_key' AND chave NOT LIKE 'assinatura_%' ORDER BY chave"
      ).all() as { chave: string; valor: string }[]
      const configuracoes = JSON.stringify(Object.fromEntries(configRows.map(r => [r.chave, r.valor])))
      db.prepare(`
        UPDATE estabelecimentos SET
          nome          = ?,
          cnpj          = ?,
          endereco      = ?,
          telefone      = ?,
          configuracoes = ?,
          atualizado_em = ?,
          sincronizado  = 0
        WHERE id = ?
      `).run(nome, cnpj || null, endereco || null, telefone1 || null, configuracoes, agora, estabId)
    }

    // 3. Se primeira_ativacao_em ainda não foi setada e cliente preencheu dados,
    //    notifica o Set ERP via endpoint dedicado (ele escreve a coluna com segurança)
    const estab = db.prepare('SELECT primeira_ativacao_em FROM estabelecimentos LIMIT 1').get() as any
    if (!estab?.primeira_ativacao_em && (cnpj || endereco || telefone1)) {
      const supabaseKey = (db.prepare('SELECT valor FROM configuracoes_sistema WHERE chave = ?').get('supabase_key') as any)?.valor
      if (supabaseKey) {
        fetch('https://erp.settecnologia.app.br/api/playkids/cliente/ativar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ cnpj, telefone: telefone1, endereco })
        }).then(async r => {
          if (r.ok) {
            const data = await r.json() as any
            if (data.primeira_ativacao_em) {
              db.prepare('UPDATE estabelecimentos SET primeira_ativacao_em = ? WHERE 1=1').run(data.primeira_ativacao_em)
              console.log('[estabelecimento:save] primeira_ativacao_em:', data.primeira_ativacao_em)
            }
          }
        }).catch(err => console.warn('[estabelecimento:save] endpoint ativar:', err.message))
      }
    }

    // 4. Sincroniza imediatamente
    triggerSync()

    return { success: true }
  })
}
