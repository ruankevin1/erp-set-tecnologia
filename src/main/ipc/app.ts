import { app, shell, IpcMain } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { resetLocalData } from '../database'

export function registerAppHandlers(ipcMain: IpcMain, db: Database.Database): void {
  const userDataPath = app.getPath('commonAppData')
  const dbDir = join(userDataPath, 'ERP Set Tecnologia', 'data')
  const dbPath = join(dbDir, 'playkids.db')

  ipcMain.handle('app:open-data-folder', () => {
    shell.openPath(dbDir)
  })

  ipcMain.handle('app:get-db-path', () => dbPath)

  ipcMain.handle('app:reset-installation', (event) => {
    resetLocalData(db)
    event.sender.reload()
  })
}
