import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Toaster } from './ui/toaster'
import { UpdateBanner } from './UpdateBanner'
import { useStore } from '@/store/useStore'
import setIcon from '@/assets/icon.png'

export function Layout() {
  const { setUpdateAvailable, setUpdateDownloaded, setDownloadProgress, setNomeEstabelecimento } = useStore()

  useEffect(() => {
    window.api.settings.get('estabelecimento_nome').then((nome) => {
      if (nome) setNomeEstabelecimento(nome)
    })
  }, [])

  useEffect(() => {
    if (!window.api.updater) return

    const offAvailable = window.api.updater.onUpdateAvailable(({ version }) => {
      setUpdateAvailable(version)
    })
    const offProgress = window.api.updater.onDownloadProgress(({ percent }) => {
      setDownloadProgress(percent)
    })
    const offDownloaded = window.api.updater.onUpdateDownloaded(({ version }) => {
      setDownloadProgress(null)
      setUpdateDownloaded(version)
    })
    return () => {
      offAvailable()
      offProgress()
      offDownloaded()
    }
  }, [])

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <UpdateBanner />
        <div className="flex-1 max-w-[1440px] mx-auto w-full">
          <Outlet />
        </div>
      </main>
      <Toaster />
      <img
        src={setIcon}
        alt="Set Tecnologia"
        className="fixed bottom-4 right-4 w-32 h-32 rounded-full object-cover opacity-60 pointer-events-none select-none"
      />
    </div>
  )
}
