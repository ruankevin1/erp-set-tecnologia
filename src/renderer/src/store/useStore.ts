import { create } from 'zustand'
import { Visita, FechamentoCaixa, SyncStatus, ConfiguracaoPreco } from '../types'
import { ESTABELECIMENTO_ID } from '../lib/supabase'

interface AppState {
  estabelecimentoId: string
  nomeEstabelecimento: string
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
  updateReleaseNotes: string | null
  updateDownloaded: boolean
  downloadProgress: number | null
  assinaturaStatus: 'trial' | 'ativo' | 'bloqueado' | null
  assinaturaDiasRestantes: number | null
  assinaturaBloqueada: boolean
  setVisitasAtivas: (visitas: Visita[]) => void
  addVisitaAtiva: (visita: Visita) => void
  removeVisitaAtiva: (id: string) => void
  setCaixaAtual: (caixa: FechamentoCaixa | null) => void
  setSyncStatus: (status: SyncStatus) => void
  setIsSyncing: (v: boolean) => void
  setIsOnline: (v: boolean) => void
  setPricingConfigs: (configs: ConfiguracaoPreco[]) => void
  setSimulacaoImpressao: (v: boolean) => void
  setEstabelecimentoId: (id: string) => void
  setNomeEstabelecimento: (nome: string) => void
  setLoading: (loading: boolean) => void
  setUpdateAvailable: (version: string, releaseNotes?: string | null) => void
  setUpdateDownloaded: (version: string) => void
  setDownloadProgress: (percent: number | null) => void
  setAssinatura: (status: 'trial' | 'ativo' | 'bloqueado', diasRestantes: number | null, bloqueada: boolean) => void
  refreshVisitas: () => Promise<void>
  refreshCaixa: () => Promise<void>
  refreshPricing: () => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  estabelecimentoId: ESTABELECIMENTO_ID,
  nomeEstabelecimento: 'ERP Set Tecnologia',
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
  updateReleaseNotes: null,
  updateDownloaded: false,
  downloadProgress: null,
  assinaturaStatus: null,
  assinaturaDiasRestantes: null,
  assinaturaBloqueada: false,

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
  setEstabelecimentoId: (id) => set({ estabelecimentoId: id }),
  setNomeEstabelecimento: (nome) => set({ nomeEstabelecimento: nome }),
  setLoading: (loading) => set({ loading }),
  setUpdateAvailable: (version, releaseNotes) => set({ updateAvailable: true, updateVersion: version, updateReleaseNotes: releaseNotes ?? null }),
  setUpdateDownloaded: (version) => set({ updateDownloaded: true, updateVersion: version }),
  setDownloadProgress: (percent) => set({ downloadProgress: percent }),
  setAssinatura: (status, diasRestantes, bloqueada) => set({ assinaturaStatus: status, assinaturaDiasRestantes: diasRestantes, assinaturaBloqueada: bloqueada }),

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
