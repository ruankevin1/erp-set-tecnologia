import { useState, useEffect, useMemo } from 'react'
import { Printer, CheckCircle, Users, Check, Phone, Tag, Search } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChildTimer } from '@/components/ChildTimer'
import { PrintPreviewModal } from '@/components/PrintPreviewModal'
import { useStore } from '@/store/useStore'
import { useToast } from '@/hooks/useToast'
import { formatCurrency, formatTime, calcularIdade, cn } from '@/lib/utils'
import type { CheckoutResult, GroupCheckoutResult, Visita } from '@/types'

const FORMAS_PAGAMENTO = ['Dinheiro', 'Cartão Débito', 'Cartão Crédito', 'PIX']

interface GrupoVisita {
  responsavel_id: string | null
  responsavel_nome: string | null
  responsavel_telefone: string | null
  visitas: Visita[]
}

export function Saida() {
  const { visitasAtivas, estabelecimentoId, removeVisitaAtiva, simulacaoImpressao } = useStore()
  const { toast } = useToast()
  const location = useLocation()

  // Saída individual
  const [selecionada, setSelecionada] = useState<Visita | null>(null)
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formaPagamento, setFormaPagamento] = useState('')
  const [precoPreview, setPrecoPreview] = useState<{ minutos: number; valor_estimado: number } | null>(null)

  // Desconto
  const [aplicarDesconto, setAplicarDesconto] = useState(false)
  const [descontoTipo, setDescontoTipo] = useState<'percentual' | 'fixo'>('percentual')
  const [descontoValorStr, setDescontoValorStr] = useState('')
  const [motivoDesconto, setMotivoDesconto] = useState('')

  // Saída em grupo
  const [grupoSelecionado, setGrupoSelecionado] = useState<GrupoVisita | null>(null)
  const [grupoDialogOpen, setGrupoDialogOpen] = useState(false)
  const [grupoCheckout, setGrupoCheckout] = useState<GroupCheckoutResult | null>(null)
  const [grupoLoading, setGrupoLoading] = useState(false)
  const [grupoFormaPagamento, setGrupoFormaPagamento] = useState('')
  const [grupoPreviews, setGrupoPreviews] = useState<Record<string, { minutos: number; valor_estimado: number }>>({})
  const [grupoSelecionados, setGrupoSelecionados] = useState<Set<string>>(new Set())

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [filtro, setFiltro] = useState('')

  const grupos = useMemo((): GrupoVisita[] => {
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

  useEffect(() => {
    const state = location.state as any
    if (!state || visitasAtivas.length === 0) return

    if (state.visitaId) {
      const v = visitasAtivas.find((x) => x.id === state.visitaId)
      if (v) iniciarSaida(v)
    } else if (state.grupoResponsavelId !== undefined) {
      const grupo = grupos.find(g => g.responsavel_id === state.grupoResponsavelId)
      if (grupo && grupo.visitas.length > 1) iniciarSaidaGrupo(grupo)
    }
  }, [location.state, visitasAtivas, grupos])

  const descontoValorNum = parseFloat(descontoValorStr.replace(',', '.')) || 0

  const valorComDesconto = useMemo(() => {
    if (!aplicarDesconto || !precoPreview || descontoValorNum <= 0) return precoPreview?.valor_estimado ?? 0
    if (descontoTipo === 'percentual') {
      return Math.max(0, precoPreview.valor_estimado * (1 - descontoValorNum / 100))
    }
    return Math.max(0, precoPreview.valor_estimado - descontoValorNum)
  }, [aplicarDesconto, descontoTipo, descontoValorNum, precoPreview])

  async function iniciarSaida(visita: Visita) {
    setSelecionada(visita)
    setCheckout(null)
    setFormaPagamento('')
    setPrecoPreview(null)
    setAplicarDesconto(false)
    setDescontoTipo('percentual')
    setDescontoValorStr('')
    setMotivoDesconto('')
    setDialogOpen(true)
    try {
      const preview = await window.api.visits.previewPrice(visita.id)
      setPrecoPreview(preview)
    } catch { /* sem preview */ }
  }

  useEffect(() => {
    if (!dialogOpen || checkout || !selecionada) return
    const interval = setInterval(async () => {
      try {
        const preview = await window.api.visits.previewPrice(selecionada.id)
        setPrecoPreview(preview)
      } catch { /* ignora */ }
    }, 30000)
    return () => clearInterval(interval)
  }, [dialogOpen, checkout, selecionada])

  async function iniciarSaidaGrupo(grupo: GrupoVisita) {
    setGrupoSelecionado(grupo)
    setGrupoSelecionados(new Set(grupo.visitas.map(v => v.id)))
    setGrupoCheckout(null)
    setGrupoFormaPagamento('')
    setGrupoPreviews({})
    setGrupoDialogOpen(true)
    for (const v of grupo.visitas) {
      try {
        const preview = await window.api.visits.previewPrice(v.id)
        setGrupoPreviews(prev => ({ ...prev, [v.id]: preview }))
      } catch { /* ignora */ }
    }
  }

  useEffect(() => {
    if (!grupoDialogOpen || grupoCheckout || !grupoSelecionado) return
    const interval = setInterval(async () => {
      for (const v of grupoSelecionado.visitas) {
        try {
          const preview = await window.api.visits.previewPrice(v.id)
          setGrupoPreviews(prev => ({ ...prev, [v.id]: preview }))
        } catch { /* ignora */ }
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [grupoDialogOpen, grupoCheckout, grupoSelecionado])

  function toggleGrupoItem(visitaId: string) {
    setGrupoSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(visitaId)) next.delete(visitaId)
      else next.add(visitaId)
      return next
    })
  }

  async function imprimirTicket(result: CheckoutResult, visita: Visita) {
    const hasDesconto = result.desconto_valor && result.desconto_valor > 0
    const res = await window.api.printer.ticket({
      criancaNome: visita.crianca_nome ?? '',
      responsavelNome: visita.responsavel_nome,
      entradaEm: result.entrada_em,
      saidaEm: result.saida_em,
      minutos: result.minutos,
      valorTotal: result.valor_total,
      valorOriginal: hasDesconto ? result.valor_original : undefined,
      descontoValor: hasDesconto ? result.desconto_valor : undefined,
      motivoDesconto: hasDesconto ? result.motivo_desconto : undefined,
      formaPagamento: result.forma_pagamento,
      ticketNumero: result.ticket_numero,
      configuracao: result.configuracao,
      estabelecimentoId
    })
    if (simulacaoImpressao || !res.success) {
      setPreviewContent(res.preview || '')
      setPreviewOpen(true)
    } else {
      toast({ title: 'Ticket impresso!' })
    }
  }

  async function imprimirTicketGrupo(result: GroupCheckoutResult, grupo: GrupoVisita) {
    const criancasMap = new Map(grupo.visitas.map(v => [v.id, v]))
    const res = await window.api.printer.ticketGrupo({
      responsavelNome: grupo.responsavel_nome ?? undefined,
      saidaEm: result.resultados[0]?.saida_em ?? new Date().toISOString(),
      criancas: result.resultados.map(r => ({
        nome: criancasMap.get(r.visita_id)?.crianca_nome ?? '',
        entradaEm: r.entrada_em,
        minutos: r.minutos,
        valorTotal: r.valor_total,
        ticketNumero: r.ticket_numero
      })),
      valorTotalGrupo: result.valor_total_grupo,
      formaPagamento: result.forma_pagamento,
      estabelecimentoId
    })
    if (simulacaoImpressao || !res.success) {
      setPreviewContent(res.preview || '')
      setPreviewOpen(true)
    } else {
      toast({ title: 'Ticket de grupo impresso!' })
    }
  }

  async function confirmarSaida() {
    if (!selecionada) return
    if (aplicarDesconto && descontoValorNum > 0 && !motivoDesconto) {
      toast({ title: 'Motivo obrigatório', description: 'Informe o motivo do desconto.', variant: 'destructive' })
      return
    }
    if (aplicarDesconto && descontoTipo === 'fixo' && precoPreview && descontoValorNum > precoPreview.valor_estimado) {
      toast({ title: 'Desconto inválido', description: 'O desconto não pode ser maior que o valor da visita.', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const desconto = aplicarDesconto && descontoValorNum > 0
        ? { tipo: descontoTipo, valor: descontoValorNum, motivo: motivoDesconto }
        : undefined
      const result = await window.api.visits.checkout(selecionada.id, estabelecimentoId, formaPagamento || undefined, desconto)
      setCheckout(result as CheckoutResult)
      removeVisitaAtiva(selecionada.id)
      await imprimirTicket(result as CheckoutResult, selecionada)
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível registrar a saída.', variant: 'destructive' })
    }
    setLoading(false)
  }

  async function confirmarSaidaGrupo() {
    if (!grupoSelecionado) return
    const visitasParaSair = grupoSelecionado.visitas.filter(v => grupoSelecionados.has(v.id))
    if (visitasParaSair.length === 0) return
    setGrupoLoading(true)
    try {
      const result = await window.api.visits.checkoutGroup({
        visitaIds: visitasParaSair.map(v => v.id),
        estabelecimentoId,
        formaPagamento: grupoFormaPagamento || undefined
      })
      setGrupoCheckout(result)
      for (const v of visitasParaSair) removeVisitaAtiva(v.id)
      const grupoFiltrado: GrupoVisita = { ...grupoSelecionado, visitas: visitasParaSair }
      await imprimirTicketGrupo(result, grupoFiltrado)
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível registrar a saída em grupo.', variant: 'destructive' })
    }
    setGrupoLoading(false)
  }

  function fecharDialog() {
    setDialogOpen(false)
    setSelecionada(null)
    setCheckout(null)
    setFormaPagamento('')
    setPrecoPreview(null)
    setAplicarDesconto(false)
    setDescontoTipo('percentual')
    setDescontoValorStr('')
    setMotivoDesconto('')
  }

  function fecharGrupoDialog() {
    setGrupoDialogOpen(false)
    setGrupoSelecionado(null)
    setGrupoCheckout(null)
    setGrupoFormaPagamento('')
    setGrupoPreviews({})
    setGrupoSelecionados(new Set())
  }

  const totalGrupoSelecionado = grupoSelecionado?.visitas
    .filter(v => grupoSelecionados.has(v.id))
    .reduce((s, v) => s + (grupoPreviews[v.id]?.valor_estimado ?? 0), 0) ?? 0

  return (
    <div className="p-6 space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold">Registrar Saída</h1>
        <p className="text-muted-foreground text-sm">Selecione a criança para calcular o valor e emitir ticket</p>
      </div>

      {visitasAtivas.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Nenhuma criança para dar saída</p>
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
            return (
              <div key={grupo.responsavel_id ?? '__no_resp'} className="space-y-3">
                {isGroup && (
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-violet-600 shrink-0" />
                        <span className="font-semibold text-violet-900">
                          {grupo.responsavel_nome || 'Sem responsável'}
                        </span>
                        {grupo.responsavel_telefone && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {grupo.responsavel_telefone}
                          </span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs text-violet-700 border-violet-300 bg-violet-50">
                        {grupo.visitas.length} crianças
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-violet-300 text-violet-700 hover:bg-violet-50 font-medium"
                      onClick={() => iniciarSaidaGrupo(grupo)}
                    >
                      <Users className="w-3.5 h-3.5 mr-1.5" />
                      Saída em Grupo
                    </Button>
                  </div>
                )}
                <div className={cn(
                  'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4',
                  isGroup && 'pl-4 border-l-2 border-violet-200'
                )}>
                  {grupo.visitas.map((v) => {
                    const idade = v.data_nascimento ? calcularIdade(v.data_nascimento) : null
                    return (
                      <Card key={v.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-base">{v.crianca_nome}</CardTitle>
                              {v.responsavel_nome && !isGroup && (
                                <p className="text-xs text-muted-foreground">{v.responsavel_nome}</p>
                              )}
                            </div>
                            {idade !== null && <Badge variant="secondary">{idade}a</Badge>}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-muted-foreground">desde {formatTime(v.entrada_em)}</span>
                            <ChildTimer entradaEm={v.entrada_em} />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              className="flex-1 bg-rose-600 hover:bg-rose-700"
                              size="sm"
                              onClick={() => iniciarSaida(v)}
                            >
                              Saída Individual
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

      {/* Dialog: saída individual */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) fecharDialog() }}>
        <DialogContent className="w-[440px] max-w-[440px] flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{checkout ? 'Saída Registrada' : 'Confirmar Saída'}</DialogTitle>
            <DialogDescription>
              {checkout ? 'Pagamento finalizado com sucesso.' : 'Revise os dados e confirme a saída.'}
            </DialogDescription>
          </DialogHeader>

          {!checkout && selecionada && (
            <div className="space-y-4 overflow-y-auto flex-1 px-1 pb-4">
              <div className="bg-slate-50 rounded-lg p-4 border">
                <p className="font-semibold text-base">{selecionada.crianca_nome}</p>
                {selecionada.responsavel_nome && (
                  <p className="text-sm text-muted-foreground">Resp: {selecionada.responsavel_nome}</p>
                )}
                <p className="text-sm text-muted-foreground">Entrada: {formatTime(selecionada.entrada_em)}</p>
                <ChildTimer entradaEm={selecionada.entrada_em} className="text-lg mt-1" />
              </div>

              {/* Valor estimado / com desconto */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                {precoPreview ? (
                  aplicarDesconto && descontoValorNum > 0 ? (
                    <>
                      <p className="text-xs text-amber-700 mb-1">Valor com desconto</p>
                      <p className="text-xl line-through text-amber-500">{formatCurrency(precoPreview.valor_estimado)}</p>
                      <p className="text-3xl font-bold text-amber-800">{formatCurrency(valorComDesconto)}</p>
                      <p className="text-xs text-amber-600 mt-1">
                        Desconto: {descontoTipo === 'percentual' ? `${descontoValorNum}%` : formatCurrency(descontoValorNum)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-amber-700 mb-1">Valor estimado</p>
                      <p className="text-3xl font-bold text-amber-800">{formatCurrency(precoPreview.valor_estimado)}</p>
                      <p className="text-xs text-amber-600 mt-1">Calculado no momento da confirmação</p>
                    </>
                  )
                ) : (
                  <>
                    <p className="text-xs text-amber-700 mb-1">Valor estimado</p>
                    <p className="text-3xl font-bold text-amber-800 opacity-40">—</p>
                  </>
                )}
              </div>

              {/* Toggle desconto */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAplicarDesconto(v => !v)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors',
                    aplicarDesconto ? 'bg-violet-50 text-violet-800' : 'bg-white text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Aplicar desconto
                  </span>
                  <div className={cn(
                    'w-9 h-5 rounded-full transition-colors relative',
                    aplicarDesconto ? 'bg-violet-600' : 'bg-slate-200'
                  )}>
                    <div className={cn(
                      'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                      aplicarDesconto ? 'translate-x-4' : 'translate-x-0.5'
                    )} />
                  </div>
                </button>
                {aplicarDesconto && (
                  <div className="px-4 pb-4 pt-3 space-y-3 border-t bg-violet-50/30">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDescontoTipo('percentual')}
                        className={cn(
                          'flex-1 py-1.5 rounded text-xs font-medium border transition-colors',
                          descontoTipo === 'percentual'
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                        )}
                      >
                        Percentual (%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDescontoTipo('fixo')}
                        className={cn(
                          'flex-1 py-1.5 rounded text-xs font-medium border transition-colors',
                          descontoTipo === 'fixo'
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                        )}
                      >
                        Valor fixo (R$)
                      </button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Valor do desconto</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          {descontoTipo === 'percentual' ? '%' : 'R$'}
                        </span>
                        <Input
                          className="pl-8 text-sm"
                          placeholder="0"
                          value={descontoValorStr}
                          onChange={e => {
                            const raw = e.target.value
                            const num = parseFloat(raw.replace(',', '.'))
                            const max = descontoTipo === 'percentual' ? 100 : (precoPreview?.valor_estimado ?? Infinity)
                            if (!isNaN(num) && num > max) return
                            setDescontoValorStr(raw)
                          }}
                          type="number"
                          min="0"
                          max={descontoTipo === 'percentual' ? 100 : precoPreview?.valor_estimado}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Motivo do desconto <span className="text-red-500">*</span></Label>
                      <Input
                        className="text-sm"
                        placeholder="Ex: Cortesia, aniversariante..."
                        value={motivoDesconto}
                        onChange={e => setMotivoDesconto(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Forma de pagamento <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAS_PAGAMENTO.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {checkout && selecionada && (
            <div className="space-y-4 overflow-y-auto flex-1 px-1 pb-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="font-semibold text-lg text-green-800">{selecionada.crianca_nome}</p>
                {checkout.desconto_valor && checkout.desconto_valor > 0 ? (
                  <>
                    <p className="text-sm line-through text-green-500 mt-1">{formatCurrency(checkout.valor_original ?? 0)}</p>
                    <p className="text-2xl font-bold text-green-700">{formatCurrency(checkout.valor_total)}</p>
                    <p className="text-xs text-green-600">
                      Desconto: {formatCurrency((checkout.valor_original ?? 0) - checkout.valor_total)}
                      {checkout.desconto_tipo === 'percentual' && ` (${checkout.desconto_valor}%)`} • {checkout.motivo_desconto}
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(checkout.valor_total)}</p>
                )}
                {checkout.forma_pagamento && (
                  <p className="text-sm text-green-600 mt-1">{checkout.forma_pagamento}</p>
                )}
              </div>
              <div className="text-sm space-y-1 text-muted-foreground">
                <div className="flex justify-between"><span>Entrada</span><span>{formatTime(checkout.entrada_em)}</span></div>
                <div className="flex justify-between"><span>Saída</span><span>{formatTime(checkout.saida_em)}</span></div>
                <div className="flex justify-between font-medium text-foreground">
                  <span>Tempo total</span>
                  <span>{Math.floor(checkout.minutos / 60)}h {checkout.minutos % 60}min</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {!checkout ? (
              <>
                <Button variant="outline" onClick={fecharDialog}>Cancelar</Button>
                <Button onClick={confirmarSaida} disabled={loading} className="bg-rose-600 hover:bg-rose-700">
                  {loading ? 'Calculando...' : 'Confirmar Saída'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={fecharDialog}>Fechar</Button>
                <Button variant="outline" onClick={() => checkout && selecionada && imprimirTicket(checkout, selecionada)}>
                  <Printer className="w-4 h-4 mr-2" />
                  Reimprimir
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: saída em grupo */}
      <Dialog open={grupoDialogOpen} onOpenChange={(open) => { if (!open) fecharGrupoDialog() }}>
        <DialogContent className="w-[560px] max-w-[560px] flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{grupoCheckout ? 'Saída em Grupo Registrada' : 'Confirmar Saída em Grupo'}</DialogTitle>
            <DialogDescription>
              {grupoCheckout
                ? 'Pagamento consolidado registrado com sucesso.'
                : 'Selecione as crianças e a forma de pagamento.'}
            </DialogDescription>
          </DialogHeader>

          {!grupoCheckout && grupoSelecionado && (
            <div className="space-y-4 overflow-y-auto flex-1 px-1 pb-4">
              {/* Cabeçalho do responsável */}
              {grupoSelecionado.responsavel_nome && (
                <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 border border-violet-100 rounded-lg">
                  <Users className="w-4 h-4 text-violet-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-violet-900">{grupoSelecionado.responsavel_nome}</p>
                    {grupoSelecionado.responsavel_telefone && (
                      <p className="text-xs text-violet-600 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        {grupoSelecionado.responsavel_telefone}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Lista de crianças com checkboxes */}
              <div className="rounded-lg border divide-y max-h-[35vh] overflow-y-auto">
                {grupoSelecionado.visitas.map((v) => {
                  const preview = grupoPreviews[v.id]
                  const checked = grupoSelecionados.has(v.id)
                  return (
                    <div
                      key={v.id}
                      className={cn(
                        'px-4 py-3 cursor-pointer hover:bg-accent/40 transition-colors',
                        !checked && 'opacity-50'
                      )}
                      onClick={() => toggleGrupoItem(v.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                          checked ? 'bg-violet-600 border-violet-600' : 'border-slate-300'
                        )}>
                          {checked && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm">{v.crianca_nome}</span>
                            {v.data_nascimento && (
                              <Badge variant="outline" className="text-xs shrink-0">{calcularIdade(v.data_nascimento)}a</Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-0.5 text-xs text-muted-foreground">
                            <span>Entrada: {formatTime(v.entrada_em)}</span>
                            <ChildTimer entradaEm={v.entrada_em} className="text-xs" />
                          </div>
                        </div>
                        {preview && (
                          <span className={cn(
                            'text-sm font-semibold shrink-0 ml-2',
                            checked ? 'text-amber-700' : 'text-muted-foreground'
                          )}>
                            {formatCurrency(preview.valor_estimado)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div>
                  <span className="text-sm font-semibold text-amber-800">Total estimado</span>
                  <p className="text-xs text-amber-600 mt-0.5">
                    {grupoSelecionados.size} criança{grupoSelecionados.size !== 1 ? 's' : ''} selecionada{grupoSelecionados.size !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="text-2xl font-bold text-amber-800">
                  {formatCurrency(totalGrupoSelecionado)}
                </span>
              </div>

              <div className="space-y-1.5">
                <Label>Forma de pagamento <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                <Select value={grupoFormaPagamento} onValueChange={setGrupoFormaPagamento}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAS_PAGAMENTO.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Um ticket consolidado será gerado para as crianças selecionadas.</p>
            </div>
          )}

          {grupoCheckout && grupoSelecionado && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="text-sm text-green-700 mb-1">Saída em grupo registrada</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(grupoCheckout.valor_total_grupo)}</p>
                {grupoCheckout.forma_pagamento && (
                  <p className="text-sm text-green-600 mt-1">{grupoCheckout.forma_pagamento}</p>
                )}
              </div>
              <div className="rounded-lg border divide-y">
                {grupoCheckout.resultados.map((r) => {
                  const visita = grupoSelecionado.visitas.find(v => v.id === r.visita_id)
                  return (
                    <div key={r.visita_id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span className="font-medium">{visita?.crianca_nome ?? '—'}</span>
                      <div className="text-right text-muted-foreground text-xs">
                        <p>{Math.floor(r.minutos / 60)}h {r.minutos % 60}min</p>
                        <p className="font-medium text-foreground">{formatCurrency(r.valor_total)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            {!grupoCheckout ? (
              <>
                <Button variant="outline" onClick={fecharGrupoDialog}>Cancelar</Button>
                <Button
                  onClick={confirmarSaidaGrupo}
                  disabled={grupoLoading || grupoSelecionados.size === 0}
                  className="bg-rose-600 hover:bg-rose-700"
                >
                  {grupoLoading
                    ? 'Calculando...'
                    : `Confirmar saída de ${grupoSelecionados.size}`}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={fecharGrupoDialog}>Fechar</Button>
                <Button variant="outline" onClick={() => grupoCheckout && grupoSelecionado && imprimirTicketGrupo(grupoCheckout, grupoSelecionado)}>
                  <Printer className="w-4 h-4 mr-2" />
                  Reimprimir
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        content={previewContent}
        title="Ticket de Saída"
      />
    </div>
  )
}
