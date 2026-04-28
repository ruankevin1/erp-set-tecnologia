import { useState, useEffect } from 'react'
import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency, formatDateTime, formatDuracao } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import type { Visita } from '@/types'

type Periodo = 'hoje' | '7d' | '30d' | 'mes' | 'ano' | 'custom'

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

export function Relatorios() {
  const { estabelecimentoId } = useStore()
  const [periodo, setPeriodo] = useState<Periodo>('hoje')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState(new Date().toISOString().split('T')[0])
  const [visitas, setVisitas] = useState<Visita[]>([])
  const [loading, setLoading] = useState(false)

  async function buscar(p: Periodo, from: string, to: string) {
    const range = getPeriodRange(p, from, to)
    if (!range) return
    setLoading(true)
    const res = await window.api.visits.history(estabelecimentoId, 5000, 0, range.from, range.to)
    setVisitas(res as Visita[])
    setLoading(false)
  }

  useEffect(() => {
    if (periodo !== 'custom') buscar(periodo, '', '')
  }, [periodo])

  useEffect(() => {
    if (periodo === 'custom' && customFrom && customTo) buscar('custom', customFrom, customTo)
  }, [customFrom, customTo])

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
      {/* Header + período */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Relatórios</h1>
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
      </div>

      {/* Inputs de data para personalizado */}
      {periodo === 'custom' && (
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
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

      {/* Tabela */}
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
                      <td className="py-2.5 text-right font-semibold text-green-700">
                        {v.valor_total != null ? formatCurrency(v.valor_total) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td colSpan={5} className="py-2.5">Total</td>
                    <td className="py-2.5 text-right text-green-700">{formatCurrency(totalValor)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
