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
import { useStore } from './store/useStore'
import { useAuthStore, type Usuario } from './store/useAuthStore'
import { ESTABELECIMENTO_ID } from './lib/supabase'

function decodeJwt(jwt: string): Record<string, any> | null {
  try { return JSON.parse(atob(jwt.split('.')[1])) } catch { return null }
}

export default function App() {
  const { refreshVisitas, refreshCaixa, refreshPricing, setSyncStatus, setIsSyncing, setIsOnline, setEstabelecimentoId } = useStore()
  const { usuario, setUsuario } = useAuthStore()
  const [ativado, setAtivado] = useState<boolean | null>(null)

  useEffect(() => {
    window.api.settings.get('app_ativado').then(async (val) => {
      if (val === '1') {
        const savedId = await window.api.settings.get('estabelecimento_id')
        if (savedId) setEstabelecimentoId(savedId)
        setAtivado(true)
      } else if (import.meta.env.DEV && import.meta.env.VITE_DEV_JWT_TOKEN) {
        const devToken = import.meta.env.VITE_DEV_JWT_TOKEN as string
        const payload = decodeJwt(devToken)
        const estabId = payload?.estabelecimento_id ?? ESTABELECIMENTO_ID
        await window.api.settings.set('supabase_key', devToken)
        await window.api.settings.set('app_ativado', '1')
        await window.api.settings.set('estabelecimento_id', estabId)
        setEstabelecimentoId(estabId)
        setAtivado(true)
      } else {
        setAtivado(false)
      }
    })
  }, [])

  useEffect(() => {
    if (!ativado) return
    refreshVisitas()
    refreshCaixa()
    refreshPricing()
    window.api.sync.status().then(setSyncStatus)

    const removeStatusListener = window.api.sync.onStatusUpdate((data) => {
      if (typeof data.isSyncing === 'boolean') setIsSyncing(data.isSyncing)
      if (data.pendentes) setSyncStatus({ pendentes: data.pendentes })
    })

    const handleOnline = () => {
      setIsOnline(true)
      window.api.sync.trigger()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      removeStatusListener()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [ativado])

  if (ativado === null) return null

  if (!ativado) return <Ativacao onAtivado={(estabId) => { setEstabelecimentoId(estabId); setAtivado(true) }} />

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
