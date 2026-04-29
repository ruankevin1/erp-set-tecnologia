import { useEffect, useState } from 'react'
import { Users, TrendingUp, Clock, DollarSign, RefreshCw, Lock, Unlock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useStore } from '@/store/useStore'
import { formatCurrency, formatDate, formatTime } from '@/lib/utils'
import { PrintPreviewModal } from '@/components/PrintPreviewModal'
import { toast } from '@/hooks/useToast'
import type { UsuarioItem } from '@/types'

interface DayStats {
  total_visitas: number
  total_valor: number
  media_minutos: number
}

interface CaixaStats {
  total_entradas: number
  total_valor: number
  media_minutos: number
  por_forma: Array<{ forma: string; total: number }>
  suprimento_inicial: number
  abertura_em: string
  operador_nome: string
}

const FORMAS_PAGAMENTO = ['Dinheiro', 'PIX', 'Cartão Débito', 'Cartão Crédito', 'Cortesia']

export function Dashboard() {
  const { visitasAtivas, caixaAtual, estabelecimentoId, refreshVisitas, refreshCaixa, simulacaoImpressao } = useStore()
  const [stats, setStats] = useState<DayStats | null>(null)
  const [loading, setLoading] = useState(false)

  // Abertura
  const [modalAbertura, setModalAbertura] = useState(false)
  const [operadorId, setOperadorId] = useState('')
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([])
  const [suprimento, setSuprimento] = useState('')
  const [abrindo, setAbrindo] = useState(false)

  // Fechamento
  const [modalFechamento, setModalFechamento] = useState(false)
  const [caixaStats, setCaixaStats] = useState<CaixaStats | null>(null)
  const [fechando, setFechando] = useState(false)
  const [loadingStats, setLoadingStats] = useState(false)

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (modalAbertura) {
      window.api.users.list(estabelecimentoId).then((res: any) => setUsuarios(res ?? []))
      setOperadorId('')
    }
  }, [modalAbertura])

  async function load() {
    setLoading(true)
    await Promise.all([refreshVisitas(), refreshCaixa()])
    const s = await window.api.visits.stats(estabelecimentoId, today)
    setStats(s as DayStats)
    setLoading(false)
  }

  function getFormaTotal(forma: string): number {
    if (!caixaStats) return 0
    const entry = caixaStats.por_forma.find(f => f.forma?.toLowerCase() === forma.toLowerCase())
    return entry?.total ?? 0
  }

  async function handleAbrirCaixa() {
    const usuario = usuarios.find(u => u.id === operadorId)
    if (!usuario) {
      toast({ title: 'Selecione o operador', variant: 'destructive' })
      return
    }
    setAbrindo(true)
    try {
      const suprimentoVal = parseFloat(suprimento.replace(',', '.')) || 0
      const result = await window.api.cash.open({
        estabelecimentoId,
        operadorId: usuario.id,
        operador_nome: usuario.nome,
        suprimento_inicial: suprimentoVal,
      })

      if (result?.id) {
        await refreshCaixa()
        const novoCaixa = await window.api.cash.current(estabelecimentoId)
        const printResult = await window.api.printer.caixaAbertura({
          operador_nome: usuario.nome,
          suprimento_inicial: suprimentoVal,
          abertura_em: novoCaixa?.abertura_em ?? new Date().toISOString(),
        })

        if (simulacaoImpressao || !printResult.success) {
          setPreviewContent(printResult.preview)
          setPreviewTitle('Abertura de Caixa')
          setPreviewOpen(true)
        }

        setModalAbertura(false)
        setOperadorId('')
        setSuprimento('')
        toast({ title: 'Caixa aberto com sucesso!' })
      }
    } finally {
      setAbrindo(false)
    }
  }

  async function handleCliqueFecharCaixa() {
    await refreshVisitas()
    const store = useStore.getState()
    if (store.visitasAtivas.length > 0) {
      toast({
        title: `${store.visitasAtivas.length} criança(s) ainda no playground`,
        description: 'Finalize as visitas antes de fechar o caixa.',
        variant: 'destructive',
      })
      return
    }

    if (!caixaAtual) return

    setLoadingStats(true)
    try {
      const s = await window.api.cash.stats(caixaAtual.id)
      setCaixaStats(s as CaixaStats)
      setModalFechamento(true)
    } finally {
      setLoadingStats(false)
    }
  }

  async function handleConfirmarFechamento() {
    if (!caixaAtual || !caixaStats) return
    setFechando(true)
    try {
      const result = await window.api.cash.close({ caixaId: caixaAtual.id })

      if (!result.success) {
        if (result.activeVisits > 0) {
          toast({
            title: `${result.activeVisits} criança(s) ainda no playground`,
            variant: 'destructive',
          })
        }
        return
      }

      const printResult = await window.api.printer.caixaFechamento({
        operador_nome: result.operador_nome,
        abertura_em: result.abertura_em,
        fechamento_em: result.fechamento_em,
        total_entradas: result.total_entradas,
        media_minutos: result.media_minutos,
        por_forma: result.por_forma,
        suprimento_inicial: result.suprimento_inicial,
        total_descontos: result.total_descontos,
        total_bruto: result.total_bruto,
        descontos_por_motivo: result.descontos_por_motivo,
      })

      if (simulacaoImpressao || !printResult.success) {
        setPreviewContent(printResult.preview)
        setPreviewTitle('Fechamento de Caixa')
        setPreviewOpen(true)
      }

      await refreshCaixa()
      await load()
      setModalFechamento(false)
      setCaixaStats(null)
      toast({ title: 'Caixa fechado com sucesso!' })
    } finally {
      setFechando(false)
    }
  }

  const mediaMins = stats?.media_minutos ? Math.round(stats.media_minutos) : 0
  const totalDinheiro = getFormaTotal('Dinheiro')

  return (
    <div className="p-6 space-y-6 pb-[var(--space-12)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visão Geral</h1>
          <p className="text-muted-foreground text-sm">{formatDate(new Date())}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Crianças no playground</CardTitle>
            <Users className="w-4 h-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{visitasAtivas.length}</p>
            <p className="text-xs text-muted-foreground mt-1">visitas ativas agora</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entradas hoje</CardTitle>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.total_visitas ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">visitas finalizadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tempo médio</CardTitle>
            <Clock className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{Math.floor(mediaMins / 60)}h {mediaMins % 60}min</p>
            <p className="text-xs text-muted-foreground mt-1">por visita hoje</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento hoje</CardTitle>
            <DollarSign className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(stats?.total_valor ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">visitas finalizadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Status do Caixa */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status do Caixa</CardTitle>
        </CardHeader>
        <CardContent>
          {caixaAtual ? (
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="success">Aberto</Badge>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm">
                <span className="text-muted-foreground">
                  Aberto às {formatTime(caixaAtual.abertura_em)}
                  {caixaAtual.operador_nome ? ` · ${caixaAtual.operador_nome}` : ''}
                </span>
                <span className="font-medium">
                  {stats?.total_visitas ?? 0} entradas · {formatCurrency(stats?.total_valor ?? 0)}
                </span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="ml-auto"
                onClick={handleCliqueFecharCaixa}
                disabled={loadingStats}
              >
                <Lock className="w-4 h-4 mr-2" />
                {loadingStats ? 'Carregando...' : 'Fechar caixa'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Badge variant="outline">Fechado</Badge>
              <span className="text-sm text-muted-foreground">Nenhum caixa aberto</span>
              <Button
                variant="default"
                size="sm"
                className="ml-auto"
                onClick={() => setModalAbertura(true)}
              >
                <Unlock className="w-4 h-4 mr-2" />
                Abrir caixa
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Crianças ativas */}
      {visitasAtivas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crianças no playground agora</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {visitasAtivas.map((v) => (
                <div key={v.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">{v.crianca_nome}</p>
                    {v.responsavel_nome && (
                      <p className="text-xs text-muted-foreground">{v.responsavel_nome}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    desde {formatTime(v.entrada_em)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal Abertura de Caixa */}
      <Dialog open={modalAbertura} onOpenChange={(o) => { if (!abrindo) setModalAbertura(o) }}>
        <DialogContent className="max-w-sm flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Abertura de Caixa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 px-1 pb-4">
            <div className="space-y-2">
              <Label>Operador</Label>
              <Select value={operadorId} onValueChange={setOperadorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o operador" />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.filter(u => u.ativo).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="suprimento">Suprimento inicial (R$)</Label>
              <Input
                id="suprimento"
                placeholder="0,00"
                value={suprimento}
                onChange={e => setSuprimento(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAbrirCaixa()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAbertura(false)} disabled={abrindo}>
              Cancelar
            </Button>
            <Button onClick={handleAbrirCaixa} disabled={abrindo}>
              {abrindo ? 'Abrindo...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Fechamento de Caixa */}
      <Dialog open={modalFechamento} onOpenChange={(o) => { if (!fechando) setModalFechamento(o) }}>
        <DialogContent className="max-w-sm flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Fechamento de Caixa</DialogTitle>
          </DialogHeader>
          {caixaStats && (
            <div className="space-y-3 text-sm py-1 overflow-y-auto flex-1 px-1 pb-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Operador</span>
                <span className="font-medium">{caixaStats.operador_nome || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Abertura</span>
                <span>{formatTime(caixaStats.abertura_em)}</span>
              </div>

              <div className="border-t pt-3">
                <p className="font-semibold mb-2">Resumo do Dia</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total de visitas</span>
                  <span>{caixaStats.total_entradas}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tempo médio</span>
                  <span>
                    {Math.floor(caixaStats.media_minutos / 60)}h {caixaStats.media_minutos % 60}min
                  </span>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="font-semibold mb-2">Formas de Pagamento</p>
                {FORMAS_PAGAMENTO.map(forma => (
                  <div key={forma} className="flex justify-between">
                    <span className="text-muted-foreground">{forma}</span>
                    <span>{formatCurrency(getFormaTotal(forma))}</span>
                  </div>
                ))}
                {(caixaStats.total_descontos ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between mt-1 pt-1 border-t">
                      <span className="text-muted-foreground">Total bruto</span>
                      <span>{formatCurrency(caixaStats.total_bruto ?? caixaStats.total_valor)}</span>
                    </div>
                    <div className="flex justify-between text-rose-600">
                      <span>Descontos</span>
                      <span>-{formatCurrency(caixaStats.total_descontos)}</span>
                    </div>
                    {(caixaStats.descontos_por_motivo ?? []).map((d: { motivo: string; total: number }) => (
                      <div key={d.motivo} className="flex justify-between text-xs text-muted-foreground pl-3">
                        <span>{d.motivo}</span>
                        <span>-{formatCurrency(d.total)}</span>
                      </div>
                    ))}
                  </>
                )}
                <div className="flex justify-between font-semibold mt-1 pt-1 border-t">
                  <span>Total Líquido</span>
                  <span>{formatCurrency(caixaStats.total_valor)}</span>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="font-semibold mb-2">Conferência do Caixa</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Suprimento inicial</span>
                  <span>{formatCurrency(caixaStats.suprimento_inicial)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total em dinheiro</span>
                  <span>{formatCurrency(totalDinheiro)}</span>
                </div>
                <div className="flex justify-between font-semibold mt-1 pt-1 border-t">
                  <span>Total esperado no caixa</span>
                  <span>{formatCurrency(caixaStats.suprimento_inicial + totalDinheiro)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalFechamento(false)}
              disabled={fechando}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmarFechamento}
              disabled={fechando}
            >
              {fechando ? 'Fechando...' : 'Confirmar Fechamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview do ticket */}
      <PrintPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        content={previewContent}
        title={previewTitle}
      />
    </div>
  )
}
