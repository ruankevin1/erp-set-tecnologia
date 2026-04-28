import { create } from 'zustand'
import { Visita, FechamentoCaixa, SyncStatus, ConfiguracaoPreco } from '../types'
import { ESTABELECIMENTO_ID } from '../lib/supabase'

interface AppState {
  estabelecimentoId: string
  visitasAtivas: Visita[]
  caixaAtual: FechamentoCaixa | null
  caixaCarregado: boolean
  syncStatus: SyncStatus | null
  isSyncing: boolean
  isOnline: boolean
  pricingConfigs: ConfiguracaoPreco[]
  simulacaoImpressao: boolean
  loading: boolean
  updateAvailable: boolean
  updateVersion: string | null
  updateDownloaded: boolean
  downloadProgress: number | null
  setVisitasAtivas: (visitas: Visita[]) => void
  addVisitaAtiva: (visita: Visita) => void
  removeVisitaAtiva: (id: string) => void
  setCaixaAtual: (caixa: FechamentoCaixa | null) => void
  setSyncStatus: (status: SyncStatus) => void
  setIsSyncing: (v: boolean) => void
  setIsOnline: (v: boolean) => void
  setPricingConfigs: (configs: ConfiguracaoPreco[]) => void
  setSimulacaoImpressao: (v: boolean) => void
  setLoading: (loading: boolean) => void
  setUpdateAvailable: (version: string) => void
  setUpdateDownloaded: (version: string) => void
  setDownloadProgress: (percent: number | null) => void
  refreshVisitas: () => Promise<void>
  refreshCaixa: () => Promise<void>
  refreshPricing: () => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  estabelecimentoId: ESTABELECIMENTO_ID,
  visitasAtivas: [],
  caixaAtual: null,
  caixaCarregado: false,
  syncStatus: null,
  isSyncing: false,
  isOnline: navigator.onLine,
  pricingConfigs: [],
  simulacaoImpressao: localStorage.getItem('simulacaoImpressao') === 'true',
  loading: false,
  updateAvailable: false,
  updateVersion: null,
  updateDownloaded: false,
  downloadProgress: null,

  setVisitasAtivas: (visitas) => set({ visitasAtivas: visitas }),
  addVisitaAtiva: (visita) => set((s) => ({ visitasAtivas: [visita, ...s.visitasAtivas] })),
  removeVisitaAtiva: (id) => set((s) => ({ visitasAtivas: s.visitasAtivas.filter((v) => v.id !== id) })),
  setCaixaAtual: (caixa) => set({ caixaAtual: caixa }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setIsOnline: (isOnline) => set({ isOnline }),
  setPricingConfigs: (pricingConfigs) => set({ pricingConfigs }),
  setSimulacaoImpressao: (v) => {
    localStorage.setItem('simulacaoImpressao', String(v))
    set({ simulacaoImpressao: v })
  },
  setLoading: (loading) => set({ loading }),
  setUpdateAvailable: (version) => set({ updateAvailable: true, updateVersion: version }),
  setUpdateDownloaded: (version) => set({ updateDownloaded: true, updateVersion: version }),
  setDownloadProgress: (percent) => set({ downloadProgress: percent }),

  refreshVisitas: async () => {
    const { estabelecimentoId } = get()
    const visitas = await window.api.visits.active(estabelecimentoId)
    set({ visitasAtivas: visitas })
  },

  refreshCaixa: async () => {
    const { estabelecimentoId } = get()
    const caixa = await window.api.cash.current(estabelecimentoId)
    set({ caixaAtual: caixa ?? null, caixaCarregado: true })
  },

  refreshPricing: async () => {
    const { estabelecimentoId } = get()
    const configs = await window.api.visits.pricing(estabelecimentoId)
    set({ pricingConfigs: configs })
  }
}))
