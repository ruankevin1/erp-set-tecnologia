import { contextBridge, ipcRenderer } from 'electron'

const api = {
  children: {
    list: (estabelecimentoId: string) => ipcRenderer.invoke('children:list', estabelecimentoId),
    search: (estabelecimentoId: string, query: string) => ipcRenderer.invoke('children:search', { estabelecimentoId, query }),
    listWithStats: (estabelecimentoId: string, query?: string) => ipcRenderer.invoke('children:list-with-stats', { estabelecimentoId, query }),
    create: (data: any) => ipcRenderer.invoke('children:create', data),
    get: (id: string) => ipcRenderer.invoke('children:get', id),
    getDetails: (id: string) => ipcRenderer.invoke('children:get-details', id),
    update: (data: any) => ipcRenderer.invoke('children:update', data),
    delete: (id: string) => ipcRenderer.invoke('children:delete', id),
  },
  guardians: {
    list: (estabelecimentoId: string) => ipcRenderer.invoke('guardians:list', estabelecimentoId),
    create: (data: any) => ipcRenderer.invoke('guardians:create', data),
    update: (data: any) => ipcRenderer.invoke('guardians:update', data),
    findByCpf: (estabelecimentoId: string, cpf: string) => ipcRenderer.invoke('guardians:find-by-cpf', { estabelecimentoId, cpf }),
    search: (estabelecimentoId: string, query: string) => ipcRenderer.invoke('guardians:search', { estabelecimentoId, query }),
    getChildren: (guardianId: string) => ipcRenderer.invoke('guardians:get-children', guardianId),
    listWithStats: (estabelecimentoId: string, query?: string) => ipcRenderer.invoke('guardians:list-with-stats', { estabelecimentoId, query }),
    delete: (id: string) => ipcRenderer.invoke('guardians:delete', id),
  },
  visits: {
    active: (estabelecimentoId: string) => ipcRenderer.invoke('visits:active', estabelecimentoId),
    create: (data: any) => ipcRenderer.invoke('visits:create', data),
    createBatch: (data: any) => ipcRenderer.invoke('visits:create-batch', data),
    checkout: (visitaId: string, estabelecimentoId: string, formaPagamento?: string, desconto?: { tipo: 'percentual' | 'fixo'; valor: number; motivo: string }) =>
      ipcRenderer.invoke('visits:checkout', { visitaId, estabelecimentoId, formaPagamento, desconto }),
    checkoutGroup: (data: any) => ipcRenderer.invoke('visits:checkout-group', data),
    previewPrice: (visitaId: string) => ipcRenderer.invoke('visits:preview-price', visitaId),
    pricing: (estabelecimentoId: string) => ipcRenderer.invoke('visits:pricing', estabelecimentoId),
    history: (estabelecimentoId: string, limit?: number, offset?: number, dataInicio?: string, dataFim?: string) =>
      ipcRenderer.invoke('visits:history', { estabelecimentoId, limit, offset, dataInicio, dataFim }),
    stats: (estabelecimentoId: string, data: string) =>
      ipcRenderer.invoke('visits:stats', { estabelecimentoId, data }),
    ranking: (estabelecimentoId: string, dataInicio?: string, dataFim?: string) =>
      ipcRenderer.invoke('visits:ranking', { estabelecimentoId, dataInicio, dataFim }),
    pause: (visitaId: string) => ipcRenderer.invoke('visits:pause', visitaId),
    resume: (visitaId: string) => ipcRenderer.invoke('visits:resume', visitaId),
  },
  pricing: {
    get: (estabelecimentoId: string) => ipcRenderer.invoke('pricing:get', estabelecimentoId),
    save: (data: any) => ipcRenderer.invoke('pricing:save', data),
    activeCount: (estabelecimentoId: string) => ipcRenderer.invoke('pricing:active-count', estabelecimentoId),
  },
  printer: {
    entrada: (data: any) => ipcRenderer.invoke('printer:entrada', data),
    ticket: (data: any) => ipcRenderer.invoke('printer:ticket', data),
    ticketGrupo: (data: any) => ipcRenderer.invoke('printer:ticket-grupo', data),
    caixaAbertura: (data: any) => ipcRenderer.invoke('printer:caixa-abertura', data),
    caixaFechamento: (data: any) => ipcRenderer.invoke('printer:caixa-fechamento', data),
    test: (interfaceUrl?: string) => ipcRenderer.invoke('printer:test', interfaceUrl),
    printTest: (interfaceUrl?: string) => ipcRenderer.invoke('printer:print-test', interfaceUrl),
    listUsb: () => ipcRenderer.invoke('printer:list-usb'),
  },
  settings: {
    get: (chave: string) => ipcRenderer.invoke('settings:get', chave),
    set: (chave: string, valor: string) => ipcRenderer.invoke('settings:set', chave, valor),
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    saveEstabelecimento: (data: { nome: string; cnpj?: string; endereco?: string; telefone1?: string; telefone2?: string; unidade?: string }) =>
      ipcRenderer.invoke('estabelecimento:save', data) as Promise<{ success: boolean }>
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    trigger: () => ipcRenderer.invoke('sync:trigger'),
    fetchConfig: (supabaseKey: string | undefined, estabelecimentoId: string) =>
      ipcRenderer.invoke('sync:fetch-config', { supabaseKey, estabelecimentoId }),
    pushData: () => ipcRenderer.invoke('sync:push-data'),
    resetAll: () => ipcRenderer.invoke('sync:reset-all'),
    pullAll: (estabelecimentoId: string) =>
      ipcRenderer.invoke('sync:pull-all', { estabelecimentoId }) as Promise<{
        success: boolean; error?: string
        restored?: { operadores: number; responsaveis: number; criancas: number; visitas: number; faixas: number; fechamentos: number; configuracoes: number }
      }>,
    onStatusUpdate: (callback: (data: { isSyncing: boolean; pendentes?: any }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on('sync:status-update', handler)
      return () => ipcRenderer.removeListener('sync:status-update', handler)
    }
  },
  cash: {
    current: (estabelecimentoId: string) => ipcRenderer.invoke('cash:current', estabelecimentoId),
    open: (data: any) => ipcRenderer.invoke('cash:open', data),
    stats: (caixaId: string) => ipcRenderer.invoke('cash:stats', caixaId),
    close: (data: { caixaId: string; observacoes?: string }) => ipcRenderer.invoke('cash:close', data),
    history: (estabelecimentoId: string, limit?: number, dataInicio?: string, dataFim?: string) =>
      ipcRenderer.invoke('cash:history', { estabelecimentoId, limit, dataInicio, dataFim })
  },
  auth: {
    login: (login: string, senha: string) =>
      ipcRenderer.invoke('auth:login', { login, senha }) as Promise<{
        ok: boolean; erro?: string;
        usuario?: { id: string; nome: string; login: string; perfil: 'admin' | 'operador'; master: boolean; senhapadrao: boolean }
      }>,
  },
  users: {
    list: (estabelecimentoId: string) => ipcRenderer.invoke('users:list', estabelecimentoId),
    create: (data: any) => ipcRenderer.invoke('users:create', data),
    update: (data: any) => ipcRenderer.invoke('users:update', data),
    toggleActive: (id: string) => ipcRenderer.invoke('users:toggle-active', { id }),
    changePassword: (data: { id: string; senhaAtual?: string; novaSenha: string }) =>
      ipcRenderer.invoke('users:change-password', data) as Promise<{ ok: boolean; erro?: string }>,
    delete: (id: string) =>
      ipcRenderer.invoke('users:delete', { id }) as Promise<{ ok: boolean; erro?: string }>,
  },
  data: {
    cleanup: (nivel: 1 | 2 | 3, estabelecimentoId: string) =>
      ipcRenderer.invoke('data:cleanup', { nivel, estabelecimentoId }) as Promise<{ success: boolean; error?: string }>,
  },
  app: {
    openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
    getDbPath: () => ipcRenderer.invoke('app:get-db-path') as Promise<string>,
    resetInstallation: () => ipcRenderer.invoke('app:reset-installation'),
  },
  updater: {
    onUpdateAvailable: (cb: (data: { version: string; releaseNotes: string | null }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { version: string; releaseNotes: string | null }) => cb(data)
      ipcRenderer.on('updater:update-available', handler)
      return () => ipcRenderer.removeListener('updater:update-available', handler)
    },
    onDownloadProgress: (cb: (data: { percent: number }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { percent: number }) => cb(data)
      ipcRenderer.on('updater:download-progress', handler)
      return () => ipcRenderer.removeListener('updater:download-progress', handler)
    },
    onUpdateDownloaded: (cb: (data: { version: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { version: string }) => cb(data)
      ipcRenderer.on('updater:update-downloaded', handler)
      return () => ipcRenderer.removeListener('updater:update-downloaded', handler)
    },
    onError: (cb: (data: { message: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { message: string }) => cb(data)
      ipcRenderer.on('updater:error', handler)
      return () => ipcRenderer.removeListener('updater:error', handler)
    },
    startDownload: () => ipcRenderer.invoke('updater:start-download'),
    install: () => ipcRenderer.invoke('updater:install'),
    checkNow: () => ipcRenderer.invoke('updater:check-now'),
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ErpSetAPI = typeof api
