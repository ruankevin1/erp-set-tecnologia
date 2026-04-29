import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Users, LogOut, Phone, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChildTimer } from '@/components/ChildTimer'
import { useStore } from '@/store/useStore'
import { formatTime, calcularIdade, calcularValorAtual, getCorFaixa, calcularDuracao, formatCurrency, calcularProximoAcrescimo, cn } from '@/lib/utils'
import type { ConfiguracaoPreco, Visita } from '@/types'

interface GrupoMonitoramento {
  responsavel_id: string | null
  responsavel_nome: string | null
  responsavel_telefone: string | null
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
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    refreshVisitas()
    refreshPricing()
    const interval = setInterval(refreshVisitas, 30000)
    return () => clearInterval(interval)
  }, [])

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
                    const { total: minutos } = calcularDuracao(v.entrada_em)
                    const valor = config ? calcularValorAtual(minutos, config) : null
                    const cor = config ? getCorFaixa(minutos, config) : 'verde'
                    const proximo = config ? calcularProximoAcrescimo(minutos, config) : null

                    return (
                      <Card key={v.id} className={`hover:shadow-md transition-shadow ${corBorderCard[cor]}`}>
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
                              {idade !== null && (
                                <Badge variant="secondary">{idade} anos</Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between mb-1">
                            <div className="text-xs text-muted-foreground">
                              Entrada: <strong>{formatTime(v.entrada_em)}</strong>
                            </div>
                            <ChildTimer entradaEm={v.entrada_em} className="text-sm" />
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

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => navigate('/saida', { state: { visitaId: v.id } })}
                            >
                              <LogOut className="w-3.5 h-3.5 mr-1.5" />
                              Dar saída
                            </Button>
                            {v.responsavel_telefone && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="px-2.5 hover:bg-green-50 border-green-200"
                                title={`WhatsApp: ${v.responsavel_telefone}`}
                                onClick={() => {
                                  const digits = v.responsavel_telefone!.replace(/\D/g, '')
                                  const num = digits.startsWith('55') ? digits : `55${digits}`
                                  window.open(`https://wa.me/${num}`)
                                }}
                              >
                                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#25D366]" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                              </Button>
                            )}
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
