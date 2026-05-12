import { useState } from 'react'
import { Download, X, RefreshCw, Sparkles, Wrench, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from './ui/button'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'

// Converte o markdown das release notes em seções estruturadas
function parseReleaseNotes(notes: string): { heading: string; items: string[]; type: 'feature' | 'fix' | 'other' }[] {
  const sections: { heading: string; items: string[]; type: 'feature' | 'fix' | 'other' }[] = []
  let current: { heading: string; items: string[]; type: 'feature' | 'fix' | 'other' } | null = null

  for (const raw of notes.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith('### ')) {
      if (current) sections.push(current)
      const heading = line.replace(/^###\s*/, '')
      const lower = heading.toLowerCase()
      const type = lower.includes('fix') || lower.includes('corre') ? 'fix'
        : lower.includes('nova') || lower.includes('melhoria') || lower.includes('feature') ? 'feature'
        : 'other'
      current = { heading, items: [], type }
    } else if ((line.startsWith('- ') || line.startsWith('* ')) && current) {
      current.items.push(line.replace(/^[-*]\s*/, ''))
    }
  }
  if (current) sections.push(current)
  return sections.filter(s => s.items.length > 0)
}

export function UpdateBanner() {
  const {
    updateAvailable,
    updateVersion,
    updateReleaseNotes,
    updateDownloaded,
    downloadProgress,
    setDownloadProgress,
  } = useStore()

  const [dismissed, setDismissed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [showChangelogModal, setShowChangelogModal] = useState(false)
  const [notesExpanded, setNotesExpanded] = useState(false)

  // Abre modal de instalação automaticamente quando download termina
  if (updateDownloaded && !showInstallModal && !dismissed) {
    setShowInstallModal(true)
  }

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadProgress(0)
    setShowChangelogModal(false)
    await window.api.updater?.startDownload()
  }

  const handleInstall = () => {
    window.api.updater?.install()
  }

  const sections = updateReleaseNotes ? parseReleaseNotes(updateReleaseNotes) : []

  // ── Modal de changelog (ao clicar "Ver novidades") ──────────────────────────
  if (showChangelogModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b shrink-0">
            <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">O que há de novo</h2>
              <p className="text-xs text-muted-foreground">Versão v{updateVersion}</p>
            </div>
            <button
              onClick={() => setShowChangelogModal(false)}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Conteúdo rolável */}
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
            {sections.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem detalhes disponíveis para esta versão.</p>
            ) : sections.map((section, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-2">
                  {section.type === 'fix'
                    ? <Wrench className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    : <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                  }
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.heading}
                  </span>
                </div>
                <ul className="space-y-1.5 pl-5">
                  {section.items.map((item, j) => (
                    <li key={j} className="text-sm text-gray-700 list-disc">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-6 pb-5 pt-3 border-t shrink-0">
            <Button
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
              onClick={handleDownload}
            >
              <Download className="w-4 h-4 mr-2" />
              Baixar e instalar
            </Button>
            <Button variant="outline" onClick={() => setShowChangelogModal(false)}>
              Depois
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Modal de instalação (download concluído) ─────────────────────────────────
  if (showInstallModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4">
          <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b">
            <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center">
              <RefreshCw className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Atualização pronta!</h2>
              <p className="text-xs text-muted-foreground">v{updateVersion} baixada com sucesso</p>
            </div>
          </div>

          {/* Changelog colapsável no modal de instalação */}
          {sections.length > 0 && (
            <div className="px-6 pt-3">
              <button
                className="flex items-center gap-1.5 text-xs text-violet-600 hover:underline mb-2"
                onClick={() => setNotesExpanded(v => !v)}
              >
                {notesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {notesExpanded ? 'Ocultar novidades' : 'Ver o que mudou'}
              </button>
              {notesExpanded && (
                <div className="space-y-3 max-h-48 overflow-y-auto pr-1 mb-3">
                  {sections.map((section, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-1.5 mb-1">
                        {section.type === 'fix'
                          ? <Wrench className="w-3 h-3 text-amber-500" />
                          : <Sparkles className="w-3 h-3 text-violet-500" />
                        }
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {section.heading}
                        </span>
                      </div>
                      <ul className="space-y-1 pl-4">
                        {section.items.map((item, j) => (
                          <li key={j} className="text-xs text-gray-600 list-disc">{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 px-6 pb-5 pt-3">
            <Button
              className={cn('flex-1 bg-violet-600 hover:bg-violet-700 text-white')}
              onClick={handleInstall}
            >
              Reiniciar agora
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setShowInstallModal(false)}>
              Depois
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Banner de topo (update disponível / baixando) ────────────────────────────
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
              Nova versão disponível <strong>v{updateVersion}</strong>
            </span>
            {sections.length > 0 && (
              <button
                className="text-violet-200 hover:text-white text-xs underline underline-offset-2"
                onClick={() => setShowChangelogModal(true)}
              >
                Ver novidades
              </button>
            )}
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

  return null
}
