import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Entrada } from './pages/Entrada'
import { Cadastros } from './pages/Cadastros'
import { Monitoramento } from './pages/Monitoramento'
import { Saida } from './pages/Saida'
import { Relatorios } from './pages/Relatorios'
import { Configuracoes } from './pages/Configuracoes'
import { Ativacao } from './pages/Ativacao'
import { Login } from './pages/Login'
import { BloqueioAssinatura } from './pages/BloqueioAssinatura'
import { useStore } from './store/useStore'
import { useAuthStore, type Usuario } from './store/useAuthStore'
import { ESTABELECIMENTO_ID } from './lib/supabase'

function decodeJwt(jwt: string): Record<string, any> | null {
  try { return JSON.parse(atob(jwt.split('.')[1])) } catch { return null }
}

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutos

export default function App() {
  const { refreshVisitas, refreshCaixa, refreshPricing, setSyncStatus, setIsSyncing, setIsOnline, setEstabelecimentoId, setAssinatura, assinaturaBloqueada } = useStore()
  const { usuario, setUsuario } = useAuthStore()
  const [ativado, setAtivado] = useState<boolean | null>(null)
  const [estabId, setEstabId] = useState<string>(ESTABELECIMENTO_ID)

  async function checkAssinatura(id: string) {
    try {
      const r = await window.api.assinatura.check(id)
      setAssinatura(r.status as any, r.dias_restantes, r.bloqueado)
    } catch {
      // sem internet e sem cache: não bloqueia
    }
  }

  useEffect(() => {
    window.api.settings.get('app_ativado').then(async (val) => {
      if (val === '1') {
        const savedId = await window.api.settings.get('estabelecimento_id')
        const id = savedId ?? ESTABELECIMENTO_ID
        setEstabelecimentoId(id)
        setEstabId(id)
        setAtivado(true)
      } else if (import.meta.env.DEV && import.meta.env.VITE_DEV_JWT_TOKEN) {
        const devToken = import.meta.env.VITE_DEV_JWT_TOKEN as string
        const payload = decodeJwt(devToken)
        const id = payload?.estabelecimento_id ?? ESTABELECIMENTO_ID
        await window.api.settings.set('supabase_key', devToken)
        await window.api.settings.set('app_ativado', '1')
        await window.api.settings.set('estabelecimento_id', id)
        setEstabelecimentoId(id)
        setEstabId(id)
        setAtivado(true)
      } else {
        setAtivado(false)
      }
    })
  }, [])

  // Helper de teste — acessível via DevTools console:
  //   window.__trial(10)   → trial com 10 dias restantes
  //   window.__trial(1)    → crítico (último dia)
  //   window.__trial(0)    → expirado (banner vermelho, sem bloqueio ainda)
  //   window.__trial(-1)   → expirado + bloqueia (vai pra tela de bloqueio)
  //   window.__ativo()     → volta ao estado ativo normal
  useEffect(() => {
    ;(window as any).__trial = (dias: number) => {
      setAssinatura('trial', dias, dias < 0)
      console.log(`[test] trial: ${dias} dias, bloqueado: ${dias < 0}`)
    }
    ;(window as any).__ativo = () => {
      setAssinatura('ativo', null, false)
      console.log('[test] estado: ativo')
    }
  }, [setAssinatura])

  useEffect(() => {
    if (!ativado) return

    refreshVisitas()
    refreshCaixa()
    refreshPricing()
    window.api.sync.status().then(setSyncStatus)
    checkAssinatura(estabId)

    const assinaturaInterval = setInterval(() => checkAssinatura(estabId), CHECK_INTERVAL_MS)

    const removeStatusListener = window.api.sync.onStatusUpdate((data) => {
      if (typeof data.isSyncing === 'boolean') setIsSyncing(data.isSyncing)
      if (data.pendentes) setSyncStatus({ pendentes: data.pendentes })
    })

    const handleOnline = () => {
      setIsOnline(true)
      window.api.sync.trigger()
      checkAssinatura(estabId)
    }
    const handleOffline = () => setIsOnline(false)

    // Re-check ao voltar para a janela (minimizou, trocou de aba, etc.)
    const handleVisibility = () => { if (!document.hidden) checkAssinatura(estabId) }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(assinaturaInterval)
      removeStatusListener()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [ativado, estabId])

  if (ativado === null) return null

  if (!ativado) return <Ativacao onAtivado={(id) => { setEstabelecimentoId(id); setEstabId(id); setAtivado(true) }} />

  if (assinaturaBloqueada) return <BloqueioAssinatura />

  if (!usuario) return <Login onLogin={(u: Usuario) => setUsuario(u)} />

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="entrada" element={<Entrada />} />
          <Route path="cadastros" element={<Cadastros />} />
          <Route path="monitoramento" element={<Monitoramento />} />
          <Route path="saida" element={<Saida />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="configuracoes" element={<Configuracoes />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
