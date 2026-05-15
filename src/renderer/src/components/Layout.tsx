import { useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Toaster } from './ui/toaster'
import { UpdateBanner } from './UpdateBanner'
import { TrialBanner } from './TrialBanner'
import { useStore } from '@/store/useStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useToast } from '@/hooks/useToast'

export function Layout() {
  const { setUpdateAvailable, setUpdateDownloaded, setDownloadProgress, setNomeEstabelecimento } = useStore()
  const { usuario } = useAuthStore()
  const { toast } = useToast()
  const toastShown = useRef(false)

  useEffect(() => {
    window.api.settings.get('estabelecimento_nome').then((nome) => {
      if (nome) setNomeEstabelecimento(nome)
    })
  }, [])

  useEffect(() => {
    if (usuario?.senhapadrao && !toastShown.current) {
      toastShown.current = true
      toast({
        title: 'Senha padrão detectada',
        description: 'Você está usando a senha padrão (admin). Recomendamos trocar em Configurações → Usuários.',
      })
    }
  }, [usuario?.id])

  useEffect(() => {
    if (!window.api.updater) return

    const offAvailable = window.api.updater.onUpdateAvailable(({ version, releaseNotes }) => {
      setUpdateAvailable(version, releaseNotes)
    })
    const offProgress = window.api.updater.onDownloadProgress(({ percent }) => {
      setDownloadProgress(percent)
    })
    const offDownloaded = window.api.updater.onUpdateDownloaded(({ version }) => {
      setDownloadProgress(null)
      setUpdateDownloaded(version)
    })
    const offError = window.api.updater.onError(({ message }) => {
      toast({ title: 'Erro ao verificar atualizações', description: message, variant: 'destructive' })
    })
    return () => {
      offAvailable()
      offProgress()
      offDownloaded()
      offError()
    }
  }, [])

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <TrialBanner />
        <UpdateBanner />
        <div className="flex-1 max-w-[1440px] mx-auto w-full">
          <Outlet />
        </div>
      </main>
      <Toaster />
    </div>
  )
}
