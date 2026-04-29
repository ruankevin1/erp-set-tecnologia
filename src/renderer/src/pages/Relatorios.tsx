import { useState, useEffect } from 'react'
import { TrendingUp, Printer, Trophy, LogIn } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency, formatDateTime, formatDuracao, formatDate, formatTime } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { DatePickerInput } from '@/components/DatePickerInput'
import { PrintPreviewModal } from '@/components/PrintPreviewModal'
import { toast } from '@/hooks/useToast'
import type { Visita, FechamentoCaixa, RankingVisita, RankingGasto } from '@/types'

type Periodo = 'hoje' | '7d' | '30d' | 'mes' | 'ano' | 'custom'
type PeriodoRanking = 'mes' | '3m' | '6m' | 'ano' | 'tudo'
type Aba = 'visitas' | 'caixas' | 'ranking'

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'hoje',   label: 'Hoje' },
  { key: '7d',     label: '7 dias' },
  { key: '30d',    label: '30 dias' },
  { key: 'mes',    label: 'Este mês' },
  { key: 'ano',    label: 'Este ano' },
  { key: 'custom', label: 'Personalizado' },
]

const PERIODO_LABEL: Record<Periodo, string> = {
  hoje:   'hoje',
  '7d':   'nos últimos 7 dias',
  '30d':  'nos últimos 30 dias',
  mes:    'este mês',
  ano:    'este ano',
  custom: 'no período selecionado',
}

function getPeriodRange(periodo: Periodo, from: string, to: string): { from: string; to: string } | null {
  const hoje = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const sub = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() - n); return r }
  const todayStr = fmt(hoje)

  if (periodo === 'custom') {
    if (!from || !to) return null
    return { from, to }
  }
  if (periodo === 'hoje')  return { from: todayStr, to: todayStr }
  if (periodo === '7d')    return { from: fmt(sub(hoje, 6)), to: todayStr }
  if (periodo === '30d')   return { from: fmt(sub(hoje, 29)), to: todayStr }
  if (periodo === 'mes')   return { from: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`, to: todayStr }
  return { from: `${hoje.getFullYear()}-01-01`, to: todayStr }
}

const PERIODOS_RANKING: { key: PeriodoRanking; label: string }[] = [
  { key: 'mes',  label: 'Este mês' },
  { key: '3m',   label: 'Últimos 3 meses' },
  { key: '6m',   label: 'Últimos 6 meses' },
  { key: 'ano',  label: 'Este ano' },
  { key: 'tudo', label: 'Tudo' },
]

function getRankingRange(p: PeriodoRanking): { from?: string; to?: string } {
  const hoje = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const sub = (d: Date, months: number) => { const r = new Date(d); r.setMonth(r.getMonth() - months); return r }
  const todayStr = fmt(hoje)
  if (p === 'tudo') return {}
  if (p === 'mes')  return { from: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`, to: todayStr }
  if (p === '3m')   return { from: fmt(sub(hoje, 3)), to: todayStr }
  if (p === '6m')   return { from: fmt(sub(hoje, 6)), to: todayStr }
  return { from: `${hoje.getFullYear()}-01-01`, to: todayStr }
}

function RankingBadge({ pos }: { pos: number }) {
  if (pos === 1) return <span title="1º lugar" className="text-lg">🥇</span>
  if (pos === 2) return <span title="2º lugar" className="text-lg">🥈</span>
  if (pos === 3) return <span title="3º lugar" className="text-lg">🥉</span>
  return <span className="text-sm font-semibold text-muted-foreground w-6 text-center">{pos}</span>
}

export function Relatorios() {
  const { estabelecimentoId, simulacaoImpressao } = useStore()
  const navigate = useNavigate()
  const [aba, setAba] = useState<Aba>('visitas')

  // Aba visitas
  const [periodo, setPeriodo] = useState<Periodo>('hoje')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState(new Date().toISOString().split('T')[0])
  const [visitas, setVisitas] = useState<Visita[]>([])
  const [loading, setLoading] = useState(false)

  // Aba caixas
  const [fechamentos, setFechamentos] = useState<FechamentoCaixa[]>([])
  const [loadingCaixas, setLoadingCaixas] = useState(false)
  const [reimprimindo, setReimprimindo] = useState<string | null>(null)
  const [periodoCaixas, setPeriodoCaixas] = useState<Periodo>('mes')
  const [customFromCaixas, setCustomFromCaixas] = useState('')
  const [customToCaixas, setCustomToCaixas] = useState(new Date().toISOString().split('T')[0])

  // Aba ranking
  const [periodoRanking, setPeriodoRanking] = useState<PeriodoRanking>('mes')
  const [rankingVisitas, setRankingVisitas] = useState<RankingVisita[]>([])
  const [rankingGasto, setRankingGasto] = useState<RankingGasto[]>([])
  const [loadingRanking, setLoadingRanking] = useState(false)

  // Preview impressão
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')

  async function buscar(p: Periodo, from: string, to: string) {
    const range = getPeriodRange(p, from, to)
    if (!range) return
    setLoading(true)
    const res = await window.api.visits.history(estabelecimentoId, 5000, 0, range.from, range.to)
    setVisitas(res as Visita[])
    setLoading(false)
  }

  async function carregarCaixas(p: Periodo = periodoCaixas, from = customFromCaixas, to = customToCaixas) {
    const range = getPeriodRange(p, from, to)
    if (!range) return
    setLoadingCaixas(true)
    const res = await window.api.cash.history(estabelecimentoId, 200, range.from, range.to)
    setFechamentos(res as FechamentoCaixa[])
    setLoadingCaixas(false)
  }

  useEffect(() => {
    if (periodo !== 'custom') buscar(periodo, '', '')
  }, [periodo])

  useEffect(() => {
    if (periodo === 'custom' && customFrom && customTo) buscar('custom', customFrom, customTo)
  }, [customFrom, customTo])

  useEffect(() => {
    if (aba === 'caixas') carregarCaixas(periodoCaixas, customFromCaixas, customToCaixas)
  }, [aba])

  useEffect(() => {
    if (aba === 'caixas' && periodoCaixas !== 'custom') carregarCaixas(periodoCaixas, '', '')
  }, [periodoCaixas])

  useEffect(() => {
    if (aba === 'caixas' && periodoCaixas === 'custom' && customFromCaixas && customToCaixas)
      carregarCaixas('custom', customFromCaixas, customToCaixas)
  }, [customFromCaixas, customToCaixas])

  useEffect(() => {
    if (aba === 'ranking') carregarRanking(periodoRanking)
  }, [aba, periodoRanking])

  async function carregarRanking(p: PeriodoRanking = periodoRanking) {
    setLoadingRanking(true)
    const range = getRankingRange(p)
    const res = await window.api.visits.ranking(estabelecimentoId, range.from, range.to) as any
    setRankingVisitas(res.por_visitas ?? [])
    setRankingGasto(res.por_gasto ?? [])
    setLoadingRanking(false)
  }

  async function handleReimprimir(caixa: FechamentoCaixa) {
    if (!caixa.fechamento_em) return
    setReimprimindo(caixa.id)
    try {
      const stats = await window.api.cash.stats(caixa.id) as any
      const printResult = await window.api.printer.caixaFechamento({
        operador_nome: caixa.operador_nome ?? '',
        abertura_em: caixa.abertura_em,
        fechamento_em: caixa.fechamento_em,
        total_entradas: stats.total_entradas,
        media_minutos: stats.media_minutos,
        por_forma: stats.por_forma,
        suprimento_inicial: caixa.suprimento_inicial ?? 0,
        total_descontos: stats.total_descontos,
        total_bruto: stats.total_bruto,
        descontos_por_motivo: stats.descontos_por_motivo,
      })
      if (simulacaoImpressao || !printResult.success) {
        setPreviewContent(printResult.preview)
        setPreviewTitle('Fechamento de Caixa')
        setPreviewOpen(true)
      } else {
        toast({ title: 'Comprovante enviado para impressão' })
      }
    } catch {
      toast({ title: 'Erro ao reimprimir', variant: 'destructive' })
    } finally {
      setReimprimindo(null)
    }
  }

  const totalValor = visitas.reduce((acc, v) => acc + (v.valor_total ?? 0), 0)
  const mediaMins = visitas.length
    ? visitas.reduce((acc, v) => {
        const e = new Date(v.entrada_em)
        const s = v.saida_em ? new Date(v.saida_em) : new Date()
        return acc + Math.floor((s.getTime() - e.getTime()) / 60000)
      }, 0) / visitas.length
    : 0

  return (
    <div className="p-6 space-y-6">
      {/* Header + abas */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <div className="flex items-center gap-1.5">
          {(['visitas', 'caixas', 'ranking'] as Aba[]).map((a) => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-colors border',
                aba === a
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900'
              )}
            >
              {a === 'visitas' ? 'Visitas' : a === 'caixas' ? 'Fechamentos de Caixa' : 'Ranking'}
            </button>
          ))}
        </div>
      </div>

      {/* === ABA VISITAS === */}
      {aba === 'visitas' && (
        <>
          {/* Filtro de período */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {PERIODOS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriodo(key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                  periodo === key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {periodo === 'custom' && (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1.5">
                <Label className="text-xs">De</Label>
                <DatePickerInput value={customFrom} onChange={setCustomFrom} fromYear={2024} toYear={new Date().getFullYear()} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Até</Label>
                <DatePickerInput value={customTo} onChange={setCustomTo} fromYear={2024} toYear={new Date().getFullYear()} />
              </div>
              <Button size="sm" onClick={() => buscar('custom', customFrom, customTo)} disabled={!customFrom || !customTo || loading}>
                {loading ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
          )}

          {/* Resumo */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground capitalize">Visitas {PERIODO_LABEL[periodo]}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{loading ? '—' : visitas.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Faturamento</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-700">{loading ? '—' : formatCurrency(totalValor)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Tempo médio</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {loading ? '—' : `${Math.floor(mediaMins / 60)}h ${Math.round(mediaMins % 60)}min`}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabela de visitas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Visitas finalizadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Buscando...</p>
              ) : visitas.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhuma visita {PERIODO_LABEL[periodo]}</p>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 font-medium">Criança</th>
                        <th className="text-left py-2 font-medium">Responsável</th>
                        <th className="text-left py-2 font-medium">Entrada</th>
                        <th className="text-left py-2 font-medium">Saída</th>
                        <th className="text-left py-2 font-medium">Tempo</th>
                        <th className="text-right py-2 font-medium">Desconto</th>
                        <th className="text-right py-2 font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visitas.map((v) => (
                        <tr key={v.id} className="hover:bg-muted/50">
                          <td className="py-2.5 font-medium">{v.crianca_nome}</td>
                          <td className="py-2.5 text-muted-foreground">{v.responsavel_nome ?? '-'}</td>
                          <td className="py-2.5">{formatDateTime(v.entrada_em)}</td>
                          <td className="py-2.5">{v.saida_em ? formatDateTime(v.saida_em) : '-'}</td>
                          <td className="py-2.5">{formatDuracao(v.entrada_em, v.saida_em)}</td>
                          <td className="py-2.5 text-right text-rose-600">
                            {v.desconto_valor && v.desconto_valor > 0 && v.valor_original != null
                              ? <span title={v.motivo_desconto}>-{formatCurrency(v.valor_original - (v.valor_total ?? 0))}</span>
                              : <span className="text-muted-foreground">—</span>
                            }
                          </td>
                          <td className="py-2.5 text-right font-semibold text-green-700">
                            {v.valor_total != null ? formatCurrency(v.valor_total) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-semibold">
                        <td colSpan={5} className="py-2.5">Total</td>
                        <td className="py-2.5 text-right text-rose-600">
                          -{formatCurrency(visitas.reduce((s, v) => s + (v.desconto_valor && v.valor_original != null ? (v.valor_original - (v.valor_total ?? 0)) : 0), 0))}
                        </td>
                        <td className="py-2.5 text-right text-green-700">{formatCurrency(totalValor)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* === ABA CAIXAS === */}
      {aba === 'caixas' && (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PERIODOS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriodoCaixas(key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                  periodoCaixas === key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {periodoCaixas === 'custom' && (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1.5">
                <Label className="text-xs">De</Label>
                <DatePickerInput value={customFromCaixas} onChange={setCustomFromCaixas} fromYear={2024} toYear={new Date().getFullYear()} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Até</Label>
                <DatePickerInput value={customToCaixas} onChange={setCustomToCaixas} fromYear={2024} toYear={new Date().getFullYear()} />
              </div>
              <Button size="sm" onClick={() => carregarCaixas('custom', customFromCaixas, customToCaixas)} disabled={!customFromCaixas || !customToCaixas || loadingCaixas}>
                {loadingCaixas ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
          )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de Fechamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCaixas ? (
              <p className="text-center text-muted-foreground py-8">Buscando...</p>
            ) : fechamentos.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum fechamento registrado</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 font-medium">Data</th>
                      <th className="text-left py-2 font-medium">Operador</th>
                      <th className="text-left py-2 font-medium">Abertura</th>
                      <th className="text-left py-2 font-medium">Fechamento</th>
                      <th className="text-right py-2 font-medium">Entradas</th>
                      <th className="text-right py-2 font-medium">Total</th>
                      <th className="text-center py-2 font-medium">Status</th>
                      <th className="text-right py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {fechamentos.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/50">
                        <td className="py-2.5 text-muted-foreground">{formatDate(new Date(c.abertura_em))}</td>
                        <td className="py-2.5 font-medium">{c.operador_nome || '—'}</td>
                        <td className="py-2.5">{formatTime(c.abertura_em)}</td>
                        <td className="py-2.5">{c.fechamento_em ? formatTime(c.fechamento_em) : '—'}</td>
                        <td className="py-2.5 text-right">{c.total_entradas ?? 0}</td>
                        <td className="py-2.5 text-right font-semibold text-green-700">
                          {formatCurrency(c.total_valor ?? 0)}
                        </td>
                        <td className="py-2.5 text-center">
                          <Badge variant={c.status === 'aberto' ? 'success' : 'outline'}>
                            {c.status === 'aberto' ? 'Aberto' : 'Fechado'}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-right">
                          {c.status === 'fechado' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              disabled={reimprimindo === c.id}
                              onClick={() => handleReimprimir(c)}
                              title="Reimprimir comprovante"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        </>
      )}

      {/* === ABA RANKING === */}
      {aba === 'ranking' && (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PERIODOS_RANKING.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriodoRanking(key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                  periodoRanking === key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {loadingRanking ? (
            <p className="text-center text-muted-foreground py-12">Carregando ranking...</p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* TOP 10 — MAIS VISITAS */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    TOP 10 — Mais Visitas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {rankingVisitas.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6 text-sm">Nenhum dado no período</p>
                  ) : (
                    <div className="space-y-0 divide-y">
                      {rankingVisitas.map((item, i) => (
                        <div key={item.id} className="flex items-center gap-3 py-2.5">
                          <div className="w-8 flex items-center justify-center shrink-0">
                            <RankingBadge pos={i + 1} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{item.crianca_nome}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.responsavel_nome ?? '—'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold text-sm">{item.total_visitas} visitas</p>
                            {item.ultima_visita && (
                              <p className="text-xs text-muted-foreground">{formatDate(new Date(item.ultima_visita))}</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 shrink-0 text-xs"
                            title="Registrar entrada"
                            onClick={() => navigate('/entrada', { state: { criancaId: item.id, criancaNome: item.crianca_nome } })}
                          >
                            <LogIn className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* TOP 10 — MAIOR GASTO */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-green-600" />
                    TOP 10 — Maior Gasto
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {rankingGasto.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6 text-sm">Nenhum dado no período</p>
                  ) : (
                    <div className="space-y-0 divide-y">
                      {rankingGasto.map((item, i) => (
                        <div key={item.id} className="flex items-center gap-3 py-2.5">
                          <div className="w-8 flex items-center justify-center shrink-0">
                            <RankingBadge pos={i + 1} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{item.crianca_nome}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.responsavel_nome ?? '—'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold text-sm text-green-700">{formatCurrency(item.total_gasto)}</p>
                            <p className="text-xs text-muted-foreground">{item.total_visitas}x · médio {formatCurrency(item.ticket_medio)}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 shrink-0 text-xs"
                            title="Registrar entrada"
                            onClick={() => navigate('/entrada', { state: { criancaId: item.id, criancaNome: item.crianca_nome } })}
                          >
                            <LogIn className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      <PrintPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        content={previewContent}
        title={previewTitle}
      />
    </div>
  )
}
