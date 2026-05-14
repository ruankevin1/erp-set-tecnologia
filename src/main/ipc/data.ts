import { IpcMain } from 'electron'
import Database from 'better-sqlite3'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants'

function getSettingValue(db: Database.Database, key: string): string | null {
  try {
    return (db.prepare('SELECT valor FROM configuracoes_sistema WHERE chave = ?').get(key) as any)?.valor ?? null
  } catch { return null }
}

export function registerDataHandlers(ipcMain: IpcMain, db: Database.Database): void {
  /**
   * data:cleanup
   * nivel 1 = dados operacionais (visitas, caixa, logs)
   * nivel 2 = nivel 1 + cadastros (criancas, responsaveis)
   * nivel 3 = nivel 2 + configuracoes de preco
   * Nunca toca em operadores, estabelecimentos ou configuracoes_sistema
   */
  ipcMain.handle('data:cleanup', async (_event, { nivel, estabelecimentoId }: { nivel: 1 | 2 | 3; estabelecimentoId: string }) => {
    const supabaseKey = getSettingValue(db, 'supabase_key')
    if (!supabaseKey) return { success: false, error: 'Chave de acesso ao Supabase não configurada.' }

    try {
      // ── 1. Limpa SQLite local ────────────────────────────────────────────
      db.pragma('foreign_keys = OFF')
      try {
        db.transaction(() => {
          // visita_faixas_aplicadas deve ir antes de visitas (FK)
          const visitaIds = (db.prepare(
            'SELECT id FROM visitas WHERE estabelecimento_id = ?'
          ).all(estabelecimentoId) as { id: string }[]).map(r => r.id)

          if (visitaIds.length > 0) {
            const placeholders = visitaIds.map(() => '?').join(',')
            db.prepare(`DELETE FROM visita_faixas_aplicadas WHERE visita_id IN (${placeholders})`).run(...visitaIds)
          }

          db.prepare('DELETE FROM fechamentos_caixa WHERE estabelecimento_id = ?').run(estabelecimentoId)
          db.prepare('DELETE FROM logs_auditoria WHERE estabelecimento_id = ?').run(estabelecimentoId)
          db.prepare('DELETE FROM visitas WHERE estabelecimento_id = ?').run(estabelecimentoId)

          if (nivel >= 2) {
            db.prepare('DELETE FROM criancas WHERE estabelecimento_id = ?').run(estabelecimentoId)
            db.prepare('DELETE FROM responsaveis WHERE estabelecimento_id = ?').run(estabelecimentoId)
          }

          if (nivel >= 3) {
            db.prepare('DELETE FROM configuracoes_preco WHERE estabelecimento_id = ?').run(estabelecimentoId)
          }
        })()
      } finally {
        db.pragma('foreign_keys = ON')
      }

      // ── 2. Limpa Supabase ────────────────────────────────────────────────
      const headers = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }

      const del = (table: string, filter: string) =>
        fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers })

      // Busca IDs de visitas no Supabase para poder deletar faixas (sem estabelecimento_id direto)
      const visitasRes = await fetch(
        `${SUPABASE_URL}/rest/v1/visitas?estabelecimento_id=eq.${estabelecimentoId}&select=id`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${supabaseKey}` } }
      )
      if (visitasRes.ok) {
        const visitasSupabase: { id: string }[] = await visitasRes.json()
        const CHUNK = 100
        for (let i = 0; i < visitasSupabase.length; i += CHUNK) {
          const ids = visitasSupabase.slice(i, i + CHUNK).map(v => v.id).join(',')
          await del('visita_faixas_aplicadas', `visita_id=in.(${ids})`)
        }
      }

      await del('fechamentos_caixa', `estabelecimento_id=eq.${estabelecimentoId}`)
      await del('logs_auditoria', `estabelecimento_id=eq.${estabelecimentoId}`)
      await del('visitas', `estabelecimento_id=eq.${estabelecimentoId}`)

      if (nivel >= 2) {
        await del('criancas', `estabelecimento_id=eq.${estabelecimentoId}`)
        await del('responsaveis', `estabelecimento_id=eq.${estabelecimentoId}`)
      }

      if (nivel >= 3) {
        await del('configuracoes_preco', `estabelecimento_id=eq.${estabelecimentoId}`)
      }

      console.log(`[data:cleanup] nível ${nivel} concluído para ${estabelecimentoId}`)
      return { success: true }
    } catch (err: any) {
      console.error('[data:cleanup]', err)
      return { success: false, error: err.message }
    }
  })
}
