import { IpcMain } from 'electron'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'

export function registerUsersHandlers(ipcMain: IpcMain, db: Database.Database): void {
  ipcMain.handle('auth:login', async (_event, { login, senha }: { login: string; senha: string }) => {
    try {
      const user = db.prepare(
        'SELECT id, nome, login, nivel_acesso, master, ativo, senha_hash FROM operadores WHERE login = ? AND ativo = 1 ORDER BY master DESC LIMIT 1'
      ).get(login) as any

      if (!user) return { ok: false, erro: 'Usuário ou senha incorretos' }
      if (!user.senha_hash) return { ok: false, erro: 'Usuário ou senha incorretos' }

      const valid = await bcrypt.compare(senha, user.senha_hash)
      if (!valid) return { ok: false, erro: 'Usuário ou senha incorretos' }

      const senhapadrao = Boolean(user.master) && (await bcrypt.compare('admin', user.senha_hash))

      return {
        ok: true,
        usuario: {
          id: user.id,
          nome: user.nome,
          login: user.login,
          perfil: user.nivel_acesso as 'admin' | 'operador',
          master: Boolean(user.master),
          senhapadrao,
        }
      }
    } catch (err) {
      console.error('[auth:login]', err)
      return { ok: false, erro: 'Erro interno ao fazer login' }
    }
  })

  ipcMain.handle('users:list', (_event, estabelecimentoId: string) => {
    return db.prepare(
      'SELECT id, nome, login, nivel_acesso as perfil, master, ativo FROM operadores WHERE estabelecimento_id = ? ORDER BY master DESC, nome'
    ).all(estabelecimentoId)
  })

  ipcMain.handle('users:create', async (_event, data: {
    estabelecimentoId: string; nome: string; login: string; senha: string; perfil: string
  }) => {
    try {
      const { estabelecimentoId, nome, login, senha, perfil } = data
      if (!nome.trim() || !login.trim() || !senha) {
        return { ok: false, erro: 'Campos obrigatórios não preenchidos' }
      }
      const existing = db.prepare('SELECT id FROM operadores WHERE login = ?').get(login.trim().toLowerCase())
      if (existing) return { ok: false, erro: 'Login já está em uso' }

      const hash = await bcrypt.hash(senha, 10)
      db.prepare(`
        INSERT INTO operadores (id, estabelecimento_id, nome, login, senha_hash, nivel_acesso, master, ativo)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `).run(randomUUID(), estabelecimentoId, nome.trim(), login.trim().toLowerCase(), hash, perfil)
      return { ok: true }
    } catch (err) {
      console.error('[users:create]', err)
      return { ok: false, erro: 'Erro ao criar usuário' }
    }
  })

  ipcMain.handle('users:update', (_event, data: {
    id: string; nome: string; login: string; perfil: string
  }) => {
    try {
      const { id, nome, login, perfil } = data
      const user = db.prepare('SELECT master FROM operadores WHERE id = ?').get(id) as any
      if (!user) return { ok: false, erro: 'Usuário não encontrado' }

      if (user.master) {
        db.prepare('UPDATE operadores SET nome = ?, sincronizado = 0 WHERE id = ?').run(nome.trim(), id)
        return { ok: true }
      }

      const existing = db.prepare('SELECT id FROM operadores WHERE login = ? AND id != ?').get(login.trim().toLowerCase(), id)
      if (existing) return { ok: false, erro: 'Login já está em uso' }

      db.prepare('UPDATE operadores SET nome = ?, login = ?, nivel_acesso = ?, sincronizado = 0 WHERE id = ?')
        .run(nome.trim(), login.trim().toLowerCase(), perfil, id)
      return { ok: true }
    } catch (err) {
      console.error('[users:update]', err)
      return { ok: false, erro: 'Erro ao atualizar usuário' }
    }
  })

  ipcMain.handle('users:toggle-active', (_event, { id }: { id: string }) => {
    try {
      const user = db.prepare('SELECT master, ativo FROM operadores WHERE id = ?').get(id) as any
      if (!user) return { ok: false, erro: 'Usuário não encontrado' }
      if (user.master) return { ok: false, erro: 'Admin master não pode ser desativado' }
      db.prepare('UPDATE operadores SET ativo = ?, sincronizado = 0 WHERE id = ?').run(user.ativo ? 0 : 1, id)
      return { ok: true }
    } catch (err) {
      console.error('[users:toggle-active]', err)
      return { ok: false, erro: 'Erro ao alterar status' }
    }
  })

  ipcMain.handle('users:delete', (_event, { id }: { id: string }) => {
    try {
      const user = db.prepare('SELECT master FROM operadores WHERE id = ?').get(id) as any
      if (!user) return { ok: false, erro: 'Usuário não encontrado' }
      if (user.master) return { ok: false, erro: 'Usuário master não pode ser excluído' }
      // Desvincula registros que referenciam este operador antes de excluir
      db.prepare('UPDATE visitas SET operador_id = NULL WHERE operador_id = ?').run(id)
      db.prepare('UPDATE fechamentos_caixa SET operador_id = NULL WHERE operador_id = ?').run(id)
      db.prepare('UPDATE logs_auditoria SET operador_id = NULL WHERE operador_id = ?').run(id)
      db.prepare('DELETE FROM operadores WHERE id = ?').run(id)
      return { ok: true }
    } catch (err) {
      console.error('[users:delete]', err)
      return { ok: false, erro: 'Erro ao excluir usuário' }
    }
  })

  ipcMain.handle('users:change-password', async (_event, data: {
    id: string; senhaAtual?: string; novaSenha: string
  }) => {
    try {
      const { id, senhaAtual, novaSenha } = data
      const user = db.prepare('SELECT senha_hash, master FROM operadores WHERE id = ?').get(id) as any
      if (!user) return { ok: false, erro: 'Usuário não encontrado' }

      if (user.master) {
        if (!senhaAtual) return { ok: false, erro: 'Senha atual obrigatória' }
        const valid = await bcrypt.compare(senhaAtual, user.senha_hash)
        if (!valid) return { ok: false, erro: 'Senha atual incorreta' }
      }

      const hash = await bcrypt.hash(novaSenha, 10)
      db.prepare('UPDATE operadores SET senha_hash = ? WHERE id = ?').run(hash, id)
      return { ok: true }
    } catch (err) {
      console.error('[users:change-password]', err)
      return { ok: false, erro: 'Erro ao alterar senha' }
    }
  })
}
