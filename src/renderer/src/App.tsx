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
import { useStore } from './store/useStore'

export default function App() {
  const { refreshVisitas, refreshCaixa, refreshPricing, setSyncStatus, setIsSyncing, setIsOnline } = useStore()
  const [ativado, setAtivado] = useState<boolean | null>(null)

  useEffect(() => {
    window.api.settings.get('app_ativado').then((val) => {
      setAtivado(val === '1')
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

  if (!ativado) return <Ativacao onAtivado={() => setAtivado(true)} />

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
