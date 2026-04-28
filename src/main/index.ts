import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { initDatabase } from './database'
import { registerChildrenHandlers } from './ipc/children'
import { registerVisitsHandlers } from './ipc/visits'
import { registerPrinterHandlers } from './ipc/printer'
import { registerSyncHandlers } from './ipc/sync'
import { registerCashHandlers } from './ipc/cash'
import { registerSettingsHandlers } from './ipc/settings'
import { registerAppHandlers } from './ipc/app'
import { initSyncService, setSyncWindow, startAutoSync } from './sync-service'

let mainWindow: BrowserWindow | null = null

function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    console.log('[updater] Desabilitado em desenvolvimento')
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Verificando atualizações...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Atualização disponível: v${info.version}`)
    mainWindow?.webContents.send('updater:update-available', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] App já está na versão mais recente')
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:download-progress', {
      percent: Math.round(progress.percent)
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] Atualização baixada: v${info.version}`)
    mainWindow?.webContents.send('updater:update-downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Erro:', err.message)
  })

  ipcMain.handle('updater:start-download', async () => {
    await autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    title: 'ERP Set Tecnologia',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    if (is.dev) mainWindow!.webContents.openDevTools({ mode: 'detach' })
    startAutoSync()

    if (app.isPackaged) {
      autoUpdater.checkForUpdates()
      // Verificar novamente a cada 4 horas
      setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.settecnologia.erp')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const db = initDatabase()
  initSyncService(db)

  registerChildrenHandlers(ipcMain, db)
  registerVisitsHandlers(ipcMain, db)
  registerPrinterHandlers(ipcMain, db)
  registerSyncHandlers(ipcMain, db)
  registerCashHandlers(ipcMain, db)
  registerSettingsHandlers(ipcMain, db)
  registerAppHandlers(ipcMain, db)

  setupAutoUpdater()
  createWindow()

  if (mainWindow) setSyncWindow(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
