import { useState } from 'react'
import { Download, X, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'

export function UpdateBanner() {
  const {
    updateAvailable,
    updateVersion,
    updateDownloaded,
    downloadProgress,
    setDownloadProgress,
  } = useStore()

  const [dismissed, setDismissed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [showModal, setShowModal] = useState(false)

  // Mostrar modal automaticamente quando o download terminar
  if (updateDownloaded && !showModal && !dismissed) {
    setShowModal(true)
  }

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadProgress(0)
    await window.api.updater?.startDownload()
  }

  const handleInstall = () => {
    window.api.updater?.install()
  }

  // Banner de download disponível
  if (updateAvailable && !updateDownloaded && !dismissed) {
    return (
      <div className="bg-violet-600 text-white px-4 py-2 flex items-center gap-3 text-sm shrink-0">
        <Download className="w-4 h-4 shrink-0" />
        {downloading && downloadProgress !== null ? (
          <div className="flex-1 flex items-center gap-3">
            <span>Baixando atualização v{updateVersion}...</span>
            <div className="flex-1 max-w-xs bg-violet-500 rounded-full h-1.5">
              <div
                className="bg-white rounded-full h-1.5 transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <span className="text-violet-200 tabular-nums">{downloadProgress}%</span>
          </div>
        ) : (
          <>
            <span className="flex-1">
              Nova atualização disponível <strong>v{updateVersion}</strong>
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs bg-white text-violet-700 hover:bg-violet-50"
              onClick={handleDownload}
            >
              Baixar agora
            </Button>
            <button
              onClick={() => setDismissed(true)}
              className="text-violet-200 hover:text-white transition-colors"
              aria-label="Dispensar"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    )
  }

  // Modal de instalação
  if (showModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-violet-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              Atualização pronta!
            </h2>
          </div>
          <p className="text-sm text-gray-600 mb-1">
            A versão <strong>v{updateVersion}</strong> foi baixada e está pronta para instalar.
          </p>
          <p className="text-sm text-gray-500 mb-5">
            O app será reiniciado para aplicar a atualização.
          </p>
          <div className="flex gap-2">
            <Button
              className={cn('flex-1 bg-violet-600 hover:bg-violet-700 text-white')}
              onClick={handleInstall}
            >
              Reiniciar agora
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowModal(false)}
            >
              Depois
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
