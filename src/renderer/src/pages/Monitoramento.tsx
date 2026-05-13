import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Users, LogOut, Search, Pause, Play, Phone, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChildTimer } from '@/components/ChildTimer'
import { WhatsAppButton } from '@/components/WhatsAppButton'
import { useStore } from '@/store/useStore'
import { useAuthStore } from '@/store/useAuthStore'
import { formatTime, calcularIdade, calcularValorAtual, getCorFaixa, calcularDuracao, formatCurrency, calcularProximoAcrescimo, cn } from '@/lib/utils'
import type { ConfiguracaoPreco, Visita } from '@/types'

interface GrupoMonitoramento {
  responsavel_id: string | null
  responsavel_nome: string | null
  responsavel_telefone: string | null
  responsavel_telefone2: string | null
  visitas: Visita[]
}

function getPricingForVisita(visita: Visita, configs: ConfiguracaoPreco[]): ConfiguracaoPreco | null {
  if (configs.length === 0) return null
  if (!visita.data_nascimento) return configs[0]
  const idadeAnos = calcularIdade(visita.data_nascimento)
  return configs.find(c =>
    (c.idade_min == null || idadeAnos >= c.idade_min) &&
    (c.idade_max == null || idadeAnos <= c.idade_max)
  ) ?? configs[0]
}

const corBorderCard = {
  verde: 'border-l-4 border-l-green-500',
  amarelo: 'border-l-4 border-l-yellow-500',
  vermelho: 'border-l-4 border-l-red-500'
}

const corBadge = {
  verde: 'bg-green-100 text-green-800',
  amarelo: 'bg-yellow-100 text-yellow-800',
  vermelho: 'bg-red-100 text-red-800'
}

export function Monitoramento() {
  const { visitasAtivas, pricingConfigs, refreshVisitas, refreshPricing } = useStore()
  const { usuario } = useAuthStore()
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState('')
  const [pausandoId, setPausandoId] = useState<string | null>(null)
  const [podePausar, setPodePausar] = useState(false)
  const [obsExpandidas, setObsExpandidas] = useState<Set<string>>(new Set())

  function toggleObs(id: string) {
    setObsExpandidas(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function togglePausa(v: Visita) {
    if (pausandoId) return
    setPausandoId(v.id)
    try {
      const pausasArr = Array.isArray(v.pausas) ? v.pausas : (typeof v.pausas === 'string' ? JSON.parse(v.pausas || '[]') : [])
      const pausado = pausasArr.some((p: any) => p.fim === null)
      if (pausado) {
        await window.api.visits.resume(v.id)
      } else {
        await window.api.visits.pause(v.id)
      }
      await refreshVisitas()
    } catch (e) {
      console.error(e)
    } finally {
      setPausandoId(null)
    }
  }

  useEffect(() => {
    refreshVisitas()
    refreshPricing()
    window.api.settings.get('permissao_pausa_operador').then(v => setPodePausar(v === 'true'))
    const interval = setInterval(refreshVisitas, 30000)
    return () => clearInterval(interval)
  }, [])

  const podeUsarPausa = usuario?.perfil === 'admin' || podePausar

  const grupos = useMemo((): GrupoMonitoramento[] => {
    const map = new Map<string | null, Visita[]>()
    for (const v of visitasAtivas) {
      const key = v.responsavel_id ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(v)
    }
    return Array.from(map.entries()).map(([responsavel_id, visitas]) => ({
      responsavel_id,
      responsavel_nome: visitas[0]?.responsavel_nome ?? null,
      responsavel_telefone: visitas[0]?.responsavel_telefone ?? null,
      responsavel_telefone2: (visitas[0] as any)?.responsavel_telefone2 ?? null,
      visitas
    }))
  }, [visitasAtivas])

  const gruposFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return grupos
    return grupos
      .map(g => ({
        ...g,
        visitas: g.visitas.filter(v =>
          v.crianca_nome.toLowerCase().includes(q) ||
          (g.responsavel_nome ?? '').toLowerCase().includes(q)
        )
      }))
      .filter(g => g.visitas.length > 0)
  }, [grupos, filtro])

  return (
    <div className="p-6 space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Monitoramento</h1>
          <Badge className="bg-violet-600 text-white">{visitasAtivas.length} ativas</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={refreshVisitas}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {visitasAtivas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Users className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-lg font-medium">Nenhuma criança no playground</p>
          <p className="text-sm">As visitas ativas aparecerão aqui em tempo real</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome da criança ou responsável..."
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="space-y-8">
          {gruposFiltrados.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum resultado para "{filtro}".</p>
          ) : gruposFiltrados.map((grupo) => {
            const isGroup = grupo.visitas.length > 1
            const hasResp = !!grupo.responsavel_nome

            return (
              <div key={grupo.responsavel_id ?? '__no_resp'} className="space-y-3">
                {hasResp && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-violet-600 shrink-0" />
                        <span className="font-semibold text-violet-900">{grupo.responsavel_nome}</span>
                        {grupo.responsavel_telefone && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {grupo.responsavel_telefone}
                          </span>
                        )}
                      </div>
                      {isGroup && (
                        <Badge variant="outline" className="text-xs text-violet-700 border-violet-300 bg-violet-50">
                          {grupo.visitas.length} crianças
                        </Badge>
                      )}
                    </div>
                    {isGroup && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-medium"
                        onClick={() => navigate('/saida', { state: { grupoResponsavelId: grupo.responsavel_id } })}
                      >
                        <LogOut className="w-3.5 h-3.5 mr-1.5" />
                        Dar saída em grupo
                      </Button>
                    )}
                  </div>
                )}

                <div className={cn(
                  'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4',
                  isGroup && hasResp && 'pl-4 border-l-2 border-violet-200'
                )}>
                  {grupo.visitas.map((v) => {
                    const idade = v.data_nascimento ? calcularIdade(v.data_nascimento) : null
                    const config = getPricingForVisita(v, pricingConfigs)
                    const pausas = Array.isArray(v.pausas) ? v.pausas : (typeof v.pausas === 'string' ? JSON.parse(v.pausas || '[]') : [])
                    const pausado = pausas.some((p: any) => p.fim === null)
                    const { total: minutos } = calcularDuracao(v.entrada_em, undefined, pausas)
                    const valor = config && !pausado ? calcularValorAtual(minutos, config) : null
                    const cor = pausado ? 'verde' : (config ? getCorFaixa(minutos, config) : 'verde')
                    const proximo = config && !pausado ? calcularProximoAcrescimo(minutos, config) : null

                    return (
                      <Card key={v.id} className={`hover:shadow-md transition-shadow ${pausado ? 'border-l-4 border-l-blue-400 opacity-80' : corBorderCard[cor]}`}>
                        <CardContent className="pt-5 pb-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-base truncate">{v.crianca_nome}</p>
                              {hasResp && !isGroup && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {v.responsavel_nome}
                                  {v.responsavel_telefone && ` · ${v.responsavel_telefone}`}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
                              {pausado && (
                                <Badge className="bg-blue-100 text-blue-700 border-blue-300" variant="outline">⏸ Pausado</Badge>
                              )}
                              {idade !== null && (
                                <Badge variant="secondary">{idade} anos</Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between mb-1">
                            <div className="text-xs text-muted-foreground">
                              Entrada: <strong>{formatTime(v.entrada_em)}</strong>
                            </div>
                            <ChildTimer entradaEm={v.entrada_em} pausas={pausas} className="text-sm" />
                          </div>

                          {valor !== null && (
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">Valor atual</span>
                              <span className={`text-sm font-bold px-2 py-0.5 rounded ${corBadge[cor]}`}>
                                {formatCurrency(valor)}
                              </span>
                            </div>
                          )}
                          {proximo && (
                            <div className={`text-xs font-medium mb-3 ${proximo.modo_bloco ? 'text-red-600' : 'text-yellow-600'}`}>
                              Próximo acréscimo em {proximo.minutos_restantes} min
                            </div>
                          )}
                          {!proximo && valor !== null && <div className="mb-3" />}

                          {v.crianca_observacoes && (
                            <div className="mb-3 overflow-hidden">
                              <button
                                className="w-full flex items-start gap-1.5 text-left group min-w-0"
                                onClick={() => toggleObs(v.id)}
                              >
                                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                <span className="text-xs text-amber-700 flex-1 min-w-0 break-words leading-snug">
                                  {obsExpandidas.has(v.id)
                                    ? v.crianca_observacoes
                                    : v.crianca_observacoes.length > 60
                                      ? v.crianca_observacoes.slice(0, 60) + '…'
                                      : v.crianca_observacoes
                                  }
                                </span>
                                {v.crianca_observacoes.length > 60 && (
                                  <span className="text-amber-400 shrink-0 mt-0.5">
                                    {obsExpandidas.has(v.id)
                                      ? <ChevronUp className="w-3 h-3" />
                                      : <ChevronDown className="w-3 h-3" />
                                    }
                                  </span>
                                )}
                              </button>
                            </div>
                          )}

                          <div className="flex gap-2">
                            {podeUsarPausa && (
                              <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                  'px-2.5',
                                  pausado
                                    ? 'border-blue-300 text-blue-600 hover:bg-blue-50'
                                    : 'border-yellow-300 text-yellow-600 hover:bg-yellow-50'
                                )}
                                title={pausado ? 'Retomar' : 'Pausar'}
                                disabled={pausandoId === v.id}
                                onClick={() => togglePausa(v)}
                              >
                                {pausado
                                  ? <Play className="w-3.5 h-3.5" />
                                  : <Pause className="w-3.5 h-3.5" />
                                }
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => navigate('/saida', { state: { visitaId: v.id } })}
                            >
                              <LogOut className="w-3.5 h-3.5 mr-1.5" />
                              Dar saída
                            </Button>
                            <WhatsAppButton
                              tel1={v.responsavel_telefone}
                              tel2={(v as any).responsavel_telefone2}
                              variant="outline"
                              className="border-green-200"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}
          </div>
        </div>
      )}
    </div>
  )
}
