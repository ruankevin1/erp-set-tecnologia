import { app, shell, IpcMain } from 'electron'
import { join, dirname } from 'path'
import Database from 'better-sqlite3'
import { resetLocalData } from '../database'

export function registerAppHandlers(ipcMain: IpcMain, db: Database.Database): void {
  const baseDir = app.isPackaged ? dirname(app.getPath('exe')) : app.getPath('userData')
  const dbDir = join(baseDir, 'data')
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
