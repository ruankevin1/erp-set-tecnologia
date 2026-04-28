import { useState, useEffect, useRef, useMemo } from 'react'
import { UserPlus, ArrowRight, AlertTriangle, Users, CheckSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { PrintPreviewModal } from '@/components/PrintPreviewModal'
import { CaixaFechadoModal } from '@/components/CaixaFechadoModal'
import { useStore } from '@/store/useStore'
import { useToast } from '@/hooks/useToast'
import { calcularIdade, formatDate, formatDateTime, maskCPF, validateCPF, maskPhone, validatePhone } from '@/lib/utils'
import type { Crianca, GuardianSearchResult } from '@/types'

export function Entrada() {
  const { estabelecimentoId, visitasAtivas, caixaAtual, addVisitaAtiva, simulacaoImpressao } = useStore()
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Crianca[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Crianca | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const [avisoAtivaOpen, setAvisoAtivaOpen] = useState(false)
  const [visitaAtivaNome, setVisitaAtivaNome] = useState('')
  const [visitaAtivaHora, setVisitaAtivaHora] = useState('')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)

  // Cadastro
  const [cadastroOpen, setCadastroOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoNasc, setNovoNasc] = useState('')
  const [novoCpfCrianca, setNovoCpfCrianca] = useState('')
  const [novoObs, setNovoObs] = useState('')
  const [cpfCriancaError, setCpfCriancaError] = useState('')
  const [novoResp, setNovoResp] = useState('')
  const [novoTel, setNovoTel] = useState('')
  const [telError, setTelError] = useState('')
  const [novoCpfResp, setNovoCpfResp] = useState('')
  const [cpfRespError, setCpfRespError] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [cadastroLoading, setCadastroLoading] = useState(false)

  const [guardianSuggestions, setGuardianSuggestions] = useState<GuardianSearchResult[]>([])
  const [linkedGuardian, setLinkedGuardian] = useState<{ id: string; nome: string; telefone?: string } | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const [cpfDupOpen, setCpfDupOpen] = useState(false)
  const [cpfDupResp, setCpfDupResp] = useState<{ id: string; nome: string; telefone?: string } | null>(null)
  const pendingCadastroRef = useRef<{ nome: string; nasc: string; cpfCrianca: string; obs: string; resp: string; tel: string; cpfResp: string; email: string } | null>(null)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [caixaFechadoOpen, setCaixaFechadoOpen] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(buscar, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (linkedGuardian || novoResp.trim().length < 2) {
      setGuardianSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      const res = await window.api.guardians.search(estabelecimentoId, novoResp.trim())
      setGuardianSuggestions(res)
      setShowSuggestions(res.length > 0)
    }, 300)
    return () => clearTimeout(timer)
  }, [novoResp, linkedGuardian])

  async function buscar() {
    if (query.trim().length < 2) return
    setLoading(true)
    const res = await window.api.children.search(estabelecimentoId, query.trim())
    setResults(res)
    setLoading(false)
  }

  const grouped = useMemo(() => {
    const map = new Map<string | null, {
      responsavel_id: string | null
      responsavel_nome: string | null
      responsavel_telefone: string | null
      criancas: Crianca[]
    }>()
    for (const c of results) {
      const key = c.responsavel_id ?? null
      if (!map.has(key)) {
        map.set(key, {
          responsavel_id: key,
          responsavel_nome: c.responsavel_nome ?? null,
          responsavel_telefone: c.responsavel_telefone ?? null,
          criancas: []
        })
      }
      map.get(key)!.criancas.push(c)
    }
    return Array.from(map.values())
  }, [results])

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(criancas: Crianca[]) {
    const ids = criancas.map(c => c.id).filter(id => !visitasAtivas.some(v => v.crianca_id === id))
    const allSelected = ids.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  function selecionarCrianca(c: Crianca) {
    if (!caixaAtual) { setCaixaFechadoOpen(true); return }
    const visitaAtiva = visitasAtivas.find(v => v.crianca_id === c.id)
    if (visitaAtiva) {
      setVisitaAtivaNome(c.nome)
      setVisitaAtivaHora(formatDateTime(visitaAtiva.entrada_em))
      setAvisoAtivaOpen(true)
      return
    }
    setSelected(c)
    setDialogOpen(true)
  }

  async function imprimirEntrada(crianca: Crianca, entradaEm: string, ticketNumero: number) {
    const res = await window.api.printer.entrada({
      criancaNome: crianca.nome,
      responsavelNome: crianca.responsavel_nome,
      responsavelTelefone: crianca.responsavel_telefone,
      entradaEm,
      ticketNumero,
      estabelecimentoId
    })
    if (simulacaoImpressao || !res.success) {
      setPreviewContent(res.preview || '')
      setPreviewOpen(true)
    } else {
      toast({ title: 'Ticket de entrada impresso!' })
    }
  }

  async function confirmarEntrada() {
    if (!selected) return
    try {
      const visita = await window.api.visits.create({
        estabelecimentoId,
        criancaId: selected.id,
        responsavelId: selected.responsavel_id
      })
      addVisitaAtiva({
        ...visita,
        crianca_id: selected.id,
        crianca_nome: selected.nome,
        responsavel_nome: selected.responsavel_nome,
        responsavel_telefone: selected.responsavel_telefone,
        estabelecimento_id: estabelecimentoId,
        status: 'ativa',
        ticket_numero: visita.ticket_numero
      })
      toast({ title: 'Entrada registrada!', description: `${selected.nome} entrou no playground.` })
      setDialogOpen(false)
      setSelected(null)
      setQuery('')
      setResults([])
      setSelectedIds(new Set())
      await imprimirEntrada(selected, visita.entrada_em, visita.ticket_numero || 1)
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível registrar a entrada.', variant: 'destructive' })
    }
  }

  async function confirmarEntradaEmLote() {
    const criancasSelecionadas = results.filter(c => selectedIds.has(c.id))
    if (criancasSelecionadas.length === 0) return

    setBatchLoading(true)
    try {
      const responsavelId = criancasSelecionadas[0]?.responsavel_id
      const visitas = await window.api.visits.createBatch({
        estabelecimentoId,
        criancaIds: criancasSelecionadas.map(c => c.id),
        responsavelId
      })

      for (let i = 0; i < criancasSelecionadas.length; i++) {
        const c = criancasSelecionadas[i]
        const v = visitas[i]
        addVisitaAtiva({
          ...v,
          crianca_id: c.id,
          crianca_nome: c.nome,
          responsavel_nome: c.responsavel_nome,
          responsavel_telefone: c.responsavel_telefone,
          estabelecimento_id: estabelecimentoId,
          status: 'ativa',
          ticket_numero: v.ticket_numero
        })
        await window.api.printer.entrada({
          criancaNome: c.nome,
          responsavelNome: c.responsavel_nome,
          responsavelTelefone: c.responsavel_telefone,
          entradaEm: v.entrada_em,
          ticketNumero: v.ticket_numero,
          estabelecimentoId
        })
      }

      toast({
        title: `${criancasSelecionadas.length} entradas registradas!`,
        description: criancasSelecionadas.map(c => c.nome).join(', ')
      })
      setBatchDialogOpen(false)
      setQuery('')
      setResults([])
      setSelectedIds(new Set())
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível registrar as entradas.', variant: 'destructive' })
    }
    setBatchLoading(false)
  }

  function validateCpfField(value: string, setter: (e: string) => void): boolean {
    const clean = value.replace(/\D/g, '')
    if (!clean) { setter(''); return true }
    if (clean.length < 11) { setter('CPF incompleto'); return false }
    if (!validateCPF(clean)) { setter('CPF inválido'); return false }
    setter('')
    return true
  }

  function validateTelField(): boolean {
    if (!novoTel.trim()) { setTelError('Telefone obrigatório'); return false }
    if (!validatePhone(novoTel)) { setTelError('Telefone inválido'); return false }
    setTelError('')
    return true
  }

  async function tentarCadastrar() {
    if (!novoNome.trim()) return
    const cpfCriancaOk = validateCpfField(novoCpfCrianca, setCpfCriancaError)
    const cpfRespOk = validateCpfField(novoCpfResp, setCpfRespError)
    if (!cpfCriancaOk || !cpfRespOk) return

    if (!linkedGuardian) {
      if (!validateTelField()) return
    }

    setCadastroLoading(true)

    if (linkedGuardian) {
      await executarCadastro(linkedGuardian.id)
      setCadastroLoading(false)
      return
    }

    if (novoResp.trim() && novoCpfResp) {
      const cpfLimpo = novoCpfResp.replace(/\D/g, '')
      const existente = await window.api.guardians.findByCpf(estabelecimentoId, cpfLimpo)
      if (existente) {
        pendingCadastroRef.current = {
          nome: novoNome, nasc: novoNasc, cpfCrianca: novoCpfCrianca, obs: novoObs,
          resp: novoResp, tel: novoTel, cpfResp: novoCpfResp, email: novoEmail
        }
        setCpfDupResp(existente)
        setCpfDupOpen(true)
        setCadastroLoading(false)
        return
      }
    }

    await executarCadastro(undefined)
    setCadastroLoading(false)
  }

  async function executarCadastro(responsavelIdExistente: string | undefined) {
    const dados = pendingCadastroRef.current || {
      nome: novoNome, nasc: novoNasc, cpfCrianca: novoCpfCrianca, obs: novoObs,
      resp: novoResp, tel: novoTel, cpfResp: novoCpfResp, email: novoEmail
    }
    try {
      let responsavelId = responsavelIdExistente
      if (!responsavelIdExistente && dados.resp.trim()) {
        const cpfLimpo = dados.cpfResp ? dados.cpfResp.replace(/\D/g, '') : undefined
        const resp = await window.api.guardians.create({
          estabelecimentoId,
          nome: dados.resp.trim(),
          cpf: cpfLimpo || undefined,
          telefone: dados.tel.trim() || undefined,
          email: dados.email.trim() || undefined
        })
        responsavelId = resp.id
      }

      const cpfCriancaLimpo = dados.cpfCrianca ? dados.cpfCrianca.replace(/\D/g, '') : undefined
      const crianca = await window.api.children.create({
        estabelecimentoId,
        nome: dados.nome.trim(),
        dataNascimento: dados.nasc || undefined,
        cpf: cpfCriancaLimpo || undefined,
        observacoes: dados.obs.trim() || undefined,
        responsavelId
      })

      let respNome: string | undefined
      let respTel: string | undefined
      if (linkedGuardian) {
        respNome = linkedGuardian.nome
        respTel = linkedGuardian.telefone
      } else if (responsavelIdExistente && cpfDupResp) {
        respNome = cpfDupResp.nome
        respTel = cpfDupResp.telefone
      } else {
        respNome = dados.resp.trim() || undefined
        respTel = dados.tel.trim() || undefined
      }

      const criancaData: Crianca = {
        id: crianca.id,
        estabelecimento_id: estabelecimentoId,
        nome: dados.nome.trim(),
        data_nascimento: dados.nasc || undefined,
        cpf: cpfCriancaLimpo || undefined,
        responsavel_id: responsavelId,
        responsavel_nome: respNome,
        responsavel_telefone: respTel
      }
      setCadastroOpen(false)
      resetCadastroForm()
      pendingCadastroRef.current = null
      setSelected(criancaData)
      setDialogOpen(true)
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível cadastrar.', variant: 'destructive' })
    }
  }

  function resetCadastroForm() {
    setNovoNome('')
    setNovoNasc('')
    setNovoCpfCrianca('')
    setNovoObs('')
    setCpfCriancaError('')
    setNovoResp('')
    setNovoTel('')
    setTelError('')
    setNovoCpfResp('')
    setCpfRespError('')
    setNovoEmail('')
    setLinkedGuardian(null)
    setGuardianSuggestions([])
    setShowSuggestions(false)
  }

  const criancasSelecionadas = results.filter(c => selectedIds.has(c.id))

  const canSubmit = novoNome.trim() && (
    linkedGuardian || (novoResp.trim() && novoTel.trim() && validatePhone(novoTel))
  ) && !cadastroLoading

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold">Registrar Entrada</h1>
        <p className="text-muted-foreground text-sm">Busque uma criança ou responsável cadastrado, ou cadastre uma nova criança</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buscar criança ou responsável</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Nome da criança, responsável ou telefone..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIds(new Set()) }}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            autoFocus
          />

          {loading && (
            <p className="text-sm text-center text-muted-foreground py-2">Buscando...</p>
          )}

          {!loading && grouped.length > 0 && (
            <div className="space-y-3 max-h-80 overflow-auto">
              {grouped.map((group) => {
                const isGroup = group.criancas.length > 1
                const groupKey = group.responsavel_id ?? `__solo_${group.criancas[0]?.id}`

                if (!isGroup) {
                  const c = group.criancas[0]
                  const ativa = visitasAtivas.some(v => v.crianca_id === c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => selecionarCrianca(c)}
                      className="w-full text-left px-3 py-2.5 rounded-md border hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{c.nome}</p>
                            {ativa && (
                              <Badge variant="destructive" className="text-xs shrink-0">No playground</Badge>
                            )}
                          </div>
                          {c.responsavel_nome && (
                            <p className="text-xs text-muted-foreground truncate">
                              Resp: {c.responsavel_nome}{c.responsavel_telefone ? ` · ${c.responsavel_telefone}` : ''}
                            </p>
                          )}
                          {c.ultima_visita && (
                            <p className="text-xs text-muted-foreground">
                              Última visita: {formatDate(c.ultima_visita)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {c.data_nascimento && (
                            <Badge variant="outline" className="text-xs">{calcularIdade(c.data_nascimento)} anos</Badge>
                          )}
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </button>
                  )
                }

                const availableIds = group.criancas.filter(c => !visitasAtivas.some(v => v.crianca_id === c.id)).map(c => c.id)
                const allGroupSelected = availableIds.length > 0 && availableIds.every(id => selectedIds.has(id))

                return (
                  <div key={groupKey} className="rounded-md border overflow-hidden">
                    <div
                      className="flex items-center justify-between px-3 py-2 bg-violet-50 border-b cursor-pointer hover:bg-violet-100 transition-colors"
                      onClick={() => toggleGroup(group.criancas)}
                    >
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-violet-600 shrink-0" />
                        <span className="text-sm font-medium text-violet-800">
                          {group.responsavel_nome || 'Sem responsável'}
                          {group.responsavel_telefone ? ` · ${group.responsavel_telefone}` : ''}
                        </span>
                        <Badge variant="outline" className="text-xs text-violet-700 border-violet-300">
                          {group.criancas.length} crianças
                        </Badge>
                      </div>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${allGroupSelected ? 'bg-violet-600 border-violet-600' : 'border-slate-300'}`}>
                        {allGroupSelected && <CheckSquare className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                    {group.criancas.map((c) => {
                      const ativa = visitasAtivas.some(v => v.crianca_id === c.id)
                      const checked = selectedIds.has(c.id)
                      return (
                        <div
                          key={c.id}
                          className={`flex items-center gap-3 px-3 py-2.5 border-b last:border-0 transition-colors ${ativa ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-accent cursor-pointer'}`}
                          onClick={() => !ativa && toggleSelect(c.id)}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${checked && !ativa ? 'bg-violet-600 border-violet-600' : 'border-slate-300'}`}>
                            {checked && !ativa && <CheckSquare className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{c.nome}</p>
                              {ativa && <Badge variant="destructive" className="text-xs">No playground</Badge>}
                            </div>
                            {c.data_nascimento && (
                              <p className="text-xs text-muted-foreground">{calcularIdade(c.data_nascimento)} anos</p>
                            )}
                          </div>
                          {c.data_nascimento && (
                            <Badge variant="outline" className="text-xs shrink-0">{calcularIdade(c.data_nascimento)}a</Badge>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {!loading && results.length === 0 && query.length >= 2 && (
            <p className="text-sm text-center text-muted-foreground py-4">Nenhum resultado encontrado</p>
          )}
        </CardContent>
      </Card>

      {criancasSelecionadas.length > 0 && (
        <Button
          className="w-full bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => { if (!caixaAtual) { setCaixaFechadoOpen(true); return }; setBatchDialogOpen(true) }}
        >
          <Users className="w-4 h-4 mr-2" />
          Confirmar Entrada para {criancasSelecionadas.length} criança{criancasSelecionadas.length !== 1 ? 's' : ''}
        </Button>
      )}

      <Button variant="outline" className="w-full" onClick={() => { if (!caixaAtual) { setCaixaFechadoOpen(true); return }; setCadastroOpen(true) }}>
        <UserPlus className="w-4 h-4 mr-2" />
        Cadastrar nova criança
      </Button>

      {/* Dialog: criança já está no playground */}
      <Dialog open={avisoAtivaOpen} onOpenChange={setAvisoAtivaOpen}>
        <DialogContent className="w-[420px] max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Criança já está no playground
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            <strong>{visitaAtivaNome}</strong> já está no playground desde <strong>{visitaAtivaHora}</strong>.
          </p>
          <p className="text-sm text-muted-foreground">Registre a saída antes de fazer uma nova entrada.</p>
          <DialogFooter>
            <Button onClick={() => setAvisoAtivaOpen(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar entrada individual */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[440px] max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Confirmar Entrada</DialogTitle>
            <DialogDescription>Revise os dados antes de registrar a entrada.</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="bg-violet-50 border border-violet-100 rounded-lg p-4">
                <p className="font-semibold text-lg">{selected.nome}</p>
                {selected.data_nascimento && (
                  <p className="text-sm text-muted-foreground">
                    {calcularIdade(selected.data_nascimento)} anos · Nasc: {formatDate(selected.data_nascimento)}
                  </p>
                )}
                {selected.responsavel_nome && (
                  <p className="text-sm text-muted-foreground mt-1">Responsável: {selected.responsavel_nome}</p>
                )}
                {selected.responsavel_telefone && (
                  <p className="text-sm text-muted-foreground">Tel: {selected.responsavel_telefone}</p>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Hora de entrada: <strong>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarEntrada} className="bg-violet-600 hover:bg-violet-700">
              Confirmar Entrada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar entrada em lote */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="w-[480px] max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Confirmar Entrada em Grupo</DialogTitle>
            <DialogDescription>
              {criancasSelecionadas[0]?.responsavel_nome
                ? `Responsável: ${criancasSelecionadas[0].responsavel_nome}${criancasSelecionadas[0].responsavel_telefone ? ` · ${criancasSelecionadas[0].responsavel_telefone}` : ''}`
                : 'Cada criança receberá um ticket individual.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border divide-y">
              {criancasSelecionadas.map(c => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-medium text-sm">{c.nome}</span>
                  {c.data_nascimento && (
                    <Badge variant="outline" className="text-xs">{calcularIdade(c.data_nascimento)} anos</Badge>
                  )}
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Hora de entrada: <strong>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarEntradaEmLote} disabled={batchLoading} className="bg-violet-600 hover:bg-violet-700">
              {batchLoading ? 'Registrando...' : `Confirmar ${criancasSelecionadas.length} entradas`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: cadastro nova criança */}
      <Dialog open={cadastroOpen} onOpenChange={(open) => { setCadastroOpen(open); if (!open) resetCadastroForm() }}>
        <DialogContent className="w-[600px] max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastrar Criança</DialogTitle>
            <DialogDescription>
              Preencha os dados para cadastrar e registrar a entrada.{' '}
              <span className="text-red-500 font-medium">*</span> Campos obrigatórios.
            </DialogDescription>
          </DialogHeader>

          {/* Seção: Dados da Criança */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados da Criança</p>

            <div className="space-y-1.5">
              <Label>
                Nome da criança <span className="text-red-500">*</span>
              </Label>
              <Input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Nome completo da criança"
                className={novoNome.trim() ? 'border-green-400 focus-visible:ring-green-400' : ''}
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Data de nascimento{' '}
                <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
              </Label>
              <Input type="date" value={novoNasc} onChange={(e) => setNovoNasc(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>
                CPF da criança{' '}
                <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
              </Label>
              <Input
                value={novoCpfCrianca}
                onChange={(e) => setNovoCpfCrianca(maskCPF(e.target.value))}
                onBlur={() => validateCpfField(novoCpfCrianca, setCpfCriancaError)}
                placeholder="000.000.000-00"
                maxLength={14}
                className={cpfCriancaError ? 'border-red-400 focus-visible:ring-red-400' : ''}
              />
              {cpfCriancaError && <p className="text-xs text-red-500">{cpfCriancaError}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>
                Observações{' '}
                <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
              </Label>
              <Input
                value={novoObs}
                onChange={(e) => setNovoObs(e.target.value)}
                placeholder="Alergias, necessidades especiais, etc."
              />
            </div>
          </div>

          {/* Separador de seção */}
          <div className="border-t my-2" />

          {/* Seção: Dados do Responsável */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Responsável</p>

            {linkedGuardian ? (
              <div className="flex items-center justify-between px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-green-800">Vinculado: {linkedGuardian.nome}</p>
                  {linkedGuardian.telefone && <p className="text-xs text-green-600 mt-0.5">{linkedGuardian.telefone}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-green-700 hover:text-red-600 h-7 px-2"
                  onClick={() => { setLinkedGuardian(null); setNovoResp(''); setNovoTel('') }}
                >
                  Alterar
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5 relative">
                  <Label>
                    Nome do responsável <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={novoResp}
                    onChange={(e) => { setNovoResp(e.target.value); setLinkedGuardian(null) }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    onFocus={() => guardianSuggestions.length > 0 && setShowSuggestions(true)}
                    placeholder="Nome completo do responsável"
                    className={novoResp.trim() ? 'border-green-400 focus-visible:ring-green-400' : ''}
                  />
                  {showSuggestions && guardianSuggestions.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
                      {guardianSuggestions.map(g => (
                        <button
                          key={g.id}
                          type="button"
                          onMouseDown={() => {
                            setLinkedGuardian({ id: g.id, nome: g.nome, telefone: g.telefone })
                            setNovoResp(g.nome)
                            setNovoTel(g.telefone ? maskPhone(g.telefone) : '')
                            setTelError('')
                            setShowSuggestions(false)
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                        >
                          <p className="font-medium">Vincular ao responsável: {g.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {g.telefone ? `${g.telefone} · ` : ''}{g.total_criancas} criança{g.total_criancas !== 1 ? 's' : ''} cadastrada{g.total_criancas !== 1 ? 's' : ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>
                    Telefone <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={novoTel}
                    onChange={(e) => { setNovoTel(maskPhone(e.target.value)); setTelError('') }}
                    onBlur={validateTelField}
                    placeholder="(00) 00000-0000"
                    className={telError ? 'border-red-400 focus-visible:ring-red-400' : novoTel && validatePhone(novoTel) ? 'border-green-400 focus-visible:ring-green-400' : ''}
                  />
                  {telError && <p className="text-xs text-red-500">{telError}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label>
                    CPF do responsável{' '}
                    <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                  </Label>
                  <Input
                    value={novoCpfResp}
                    onChange={(e) => setNovoCpfResp(maskCPF(e.target.value))}
                    onBlur={() => validateCpfField(novoCpfResp, setCpfRespError)}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className={cpfRespError ? 'border-red-400 focus-visible:ring-red-400' : ''}
                  />
                  {cpfRespError && <p className="text-xs text-red-500">{cpfRespError}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label>
                    Email{' '}
                    <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                  </Label>
                  <Input
                    type="email"
                    value={novoEmail}
                    onChange={(e) => setNovoEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCadastroOpen(false)}>Cancelar</Button>
            <Button
              onClick={tentarCadastrar}
              disabled={!canSubmit}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {cadastroLoading ? 'Salvando...' : 'Cadastrar e registrar entrada'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: CPF duplicado */}
      <Dialog open={cpfDupOpen} onOpenChange={setCpfDupOpen}>
        <DialogContent className="w-[440px] max-w-[440px]">
          <DialogHeader>
            <DialogTitle>CPF já cadastrado</DialogTitle>
          </DialogHeader>
          {cpfDupResp && (
            <div className="space-y-3">
              <p className="text-sm">
                O CPF informado já está cadastrado para o responsável{' '}
                <strong>{cpfDupResp.nome}</strong>
                {cpfDupResp.telefone ? ` (${cpfDupResp.telefone})` : ''}.
              </p>
              <p className="text-sm text-muted-foreground">
                Deseja vincular a nova criança a este responsável existente?
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={async () => {
                setCpfDupOpen(false)
                setCadastroLoading(true)
                const dados = pendingCadastroRef.current
                if (dados) {
                  const resp = await window.api.guardians.create({
                    estabelecimentoId,
                    nome: dados.resp.trim(),
                    telefone: dados.tel.trim() || undefined
                  })
                  await executarCadastro(resp.id)
                }
                setCadastroLoading(false)
              }}
            >
              Criar novo responsável
            </Button>
            <Button
              onClick={async () => {
                setCpfDupOpen(false)
                if (cpfDupResp) {
                  setCadastroLoading(true)
                  await executarCadastro(cpfDupResp.id)
                  setCadastroLoading(false)
                }
              }}
              className="bg-violet-600 hover:bg-violet-700"
            >
              Vincular ao existente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        content={previewContent}
        title="Ticket de Entrada"
      />

      <CaixaFechadoModal open={caixaFechadoOpen} onClose={() => setCaixaFechadoOpen(false)} />
    </div>
  )
}
