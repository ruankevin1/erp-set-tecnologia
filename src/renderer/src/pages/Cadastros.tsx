import { useState, useEffect, useRef, useMemo } from 'react'
import { WhatsAppButton } from '@/components/WhatsAppButton'
import { Search, Eye, Pencil, LogIn, ChevronUp, ChevronDown, ChevronsUpDown, Users, UserPlus, Baby, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { PrintPreviewModal } from '@/components/PrintPreviewModal'
import { CaixaFechadoModal } from '@/components/CaixaFechadoModal'
import { DatePickerInput } from '@/components/DatePickerInput'
import { useStore } from '@/store/useStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useToast } from '@/hooks/useToast'
import {
  cn, calcularIdade, formatDate, formatDateTime, formatCurrency, formatDuracao,
  maskCPF, validateCPF, maskPhone, validatePhone
} from '@/lib/utils'
import type { ChildWithStats, VisitaDetalhe, GuardianWithStats, CriancaComStatus, GuardianSearchResult } from '@/types'

type PresencaFilter = 'todos' | 'no_playground' | 'fora'
type AtividadeFilter = 'todos' | 'hoje' | 'semana' | 'mes' | 'nunca'
type ViewMode = 'criancas' | 'responsaveis'

let _childrenCache: ChildWithStats[] = []
let _guardiansCache: GuardianWithStats[] = []


function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium transition-colors border whitespace-nowrap',
        active
          ? 'bg-violet-600 text-white border-violet-600'
          : 'bg-white text-slate-600 border-slate-200 hover:border-violet-400 hover:text-violet-700'
      )}
    >
      {label}
    </button>
  )
}

type SortKey = 'nome' | 'ultima_visita' | 'total_visitas'

interface ChildDetails {
  crianca: ChildWithStats & { responsavel_nome?: string; responsavel_cpf?: string; responsavel_telefone?: string; responsavel_email?: string }
  visitas: VisitaDetalhe[]
  stats: { total_visitas: number; total_gasto: number; media_minutos: number }
}

interface EditForm {
  nome: string
  nascimento: string
  cpf: string
  observacoes: string
  respNome: string
  respCpf: string
  respTel: string
  respTel2: string
  respEmail: string
}

export function Cadastros() {
  const { estabelecimentoId, visitasAtivas, caixaAtual, addVisitaAtiva, simulacaoImpressao } = useStore()
  const { usuario } = useAuthStore()
  const canDelete = usuario?.perfil === 'admin'
  const { toast } = useToast()

  const [viewMode, setViewMode] = useState<ViewMode>('criancas')
  const [searchQuery, setSearchQuery] = useState('')
  const [presencaFilter, setPresencaFilter] = useState<PresencaFilter>('todos')
  const [atividadeFilter, setAtividadeFilter] = useState<AtividadeFilter>('todos')
  const [children, setChildren] = useState<ChildWithStats[]>(_childrenCache)
  const [loading, setLoading] = useState(_childrenCache.length === 0)
  const [sortBy, setSortBy] = useState<SortKey>('nome')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // View de responsáveis
  const [guardians, setGuardians] = useState<GuardianWithStats[]>(_guardiansCache)
  const [guardianDetail, setGuardianDetail] = useState<{ guardian: GuardianWithStats; criancas: CriancaComStatus[] } | null>(null)
  const [guardianDetailOpen, setGuardianDetailOpen] = useState(false)
  const [guardianDetailLoading, setGuardianDetailLoading] = useState(false)

  // Delete responsável
  const [deleteGuardianOpen, setDeleteGuardianOpen] = useState(false)
  const [deleteGuardian, setDeleteGuardian] = useState<GuardianWithStats | null>(null)
  const [deleteGuardianLoading, setDeleteGuardianLoading] = useState(false)

  // Adicionar criança a responsável existente
  const [addChildOpen, setAddChildOpen] = useState(false)
  const [addChildGuardian, setAddChildGuardian] = useState<GuardianWithStats | null>(null)
  const [addChildNome, setAddChildNome] = useState('')
  const [addChildNasc, setAddChildNasc] = useState('')
  const [addChildCpf, setAddChildCpf] = useState('')
  const [addChildCpfError, setAddChildCpfError] = useState('')
  const [addChildLoading, setAddChildLoading] = useState(false)

  // Detail
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState<ChildDetails | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [obsExpanded, setObsExpanded] = useState(false)

  // Edit
  const [editOpen, setEditOpen] = useState(false)
  const [editChild, setEditChild] = useState<ChildWithStats | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ nome: '', nascimento: '', cpf: '', observacoes: '', respNome: '', respCpf: '', respTel: '', respTel2: '', respEmail: '' })
  const [cpfCriancaError, setCpfCriancaError] = useState('')
  const [cpfRespError, setCpfRespError] = useState('')
  const [telEditError, setTelEditError] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteChild, setDeleteChild] = useState<ChildWithStats | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Quick entry
  const [entradaOpen, setEntradaOpen] = useState(false)
  const [entradaChild, setEntradaChild] = useState<ChildWithStats | null>(null)
  const [entradaLoading, setEntradaLoading] = useState(false)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [caixaFechadoOpen, setCaixaFechadoOpen] = useState(false)

  // Nova criança (sem entrada)
  const [novaCriancaOpen, setNovaCriancaOpen] = useState(false)
  const [novaChildNome, setNovaChildNome] = useState('')
  const [novaChildNasc, setNovaChildNasc] = useState('')
  const [novaChildCpf, setNovaChildCpf] = useState('')
  const [novaChildObs, setNovaChildObs] = useState('')
  const [novaChildCpfError, setNovaChildCpfError] = useState('')
  const [novaRespNome, setNovaRespNome] = useState('')
  const [novaRespTel, setNovaRespTel] = useState('')
  const [novaRespTel2, setNovaRespTel2] = useState('')
  const [novaRespTelError, setNovaRespTelError] = useState('')
  const [novaRespCpf, setNovaRespCpf] = useState('')
  const [novaRespCpfError, setNovaRespCpfError] = useState('')
  const [novaRespEmail, setNovaRespEmail] = useState('')
  const [novaChildLoading, setNovaChildLoading] = useState(false)
  const [novaLinkedGuardian, setNovaLinkedGuardian] = useState<{ id: string; nome: string; telefone?: string } | null>(null)
  const [novaGuardianSuggestions, setNovaGuardianSuggestions] = useState<GuardianSearchResult[]>([])
  const [novaShowSuggestions, setNovaShowSuggestions] = useState(false)

  const searchMounted = useRef(false)

  useEffect(() => {
    if (viewMode === 'criancas') loadChildren()
    else loadGuardians()
  }, [viewMode])

  useEffect(() => {
    if (!searchMounted.current) {
      searchMounted.current = true
      return
    }
    const timer = setTimeout(() => {
      if (viewMode === 'criancas') loadChildren()
      else loadGuardians()
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (novaLinkedGuardian || novaRespNome.trim().length < 1) {
      setNovaGuardianSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      const res = await window.api.guardians.search(estabelecimentoId, novaRespNome.trim())
      setNovaGuardianSuggestions(res)
      setNovaShowSuggestions(res.length > 0)
    }, 300)
    return () => clearTimeout(timer)
  }, [novaRespNome, novaLinkedGuardian])

  function resetNovaCrianca() {
    setNovaChildNome(''); setNovaChildNasc(''); setNovaChildCpf(''); setNovaChildObs('')
    setNovaChildCpfError(''); setNovaRespNome(''); setNovaRespTel(''); setNovaRespTel2(''); setNovaRespTelError('')
    setNovaRespCpf(''); setNovaRespCpfError(''); setNovaRespEmail('')
    setNovaLinkedGuardian(null); setNovaGuardianSuggestions([]); setNovaShowSuggestions(false)
  }

  async function salvarNovaCrianca() {
    if (!novaChildNome.trim()) return
    if (!validateCpfField(novaChildCpf, setNovaChildCpfError)) return
    if (!validateCpfField(novaRespCpf, setNovaRespCpfError)) return
    if (!novaLinkedGuardian) {
      if (!novaRespTel.trim()) { setNovaRespTelError('Telefone obrigatório'); return }
      if (!validatePhone(novaRespTel)) { setNovaRespTelError('Telefone inválido'); return }
    }
    setNovaChildLoading(true)
    try {
      let responsavelId: string | undefined
      if (novaLinkedGuardian) {
        responsavelId = novaLinkedGuardian.id
      } else if (novaRespNome.trim()) {
        const cpfLimpo = novaRespCpf ? novaRespCpf.replace(/\D/g, '') : undefined
        const resp = await window.api.guardians.create({
          estabelecimentoId,
          nome: novaRespNome.trim(),
          cpf: cpfLimpo || undefined,
          telefone: novaRespTel.trim() || undefined,
          telefone2: novaRespTel2.trim() || undefined,
          email: novaRespEmail.trim() || undefined
        })
        responsavelId = resp.id
      }
      const cpfLimpo = novaChildCpf ? novaChildCpf.replace(/\D/g, '') : undefined
      await window.api.children.create({
        estabelecimentoId,
        nome: novaChildNome.trim(),
        dataNascimento: novaChildNasc || undefined,
        cpf: cpfLimpo || undefined,
        observacoes: novaChildObs.trim() || undefined,
        responsavelId
      })
      toast({ title: 'Criança cadastrada com sucesso!' })
      setNovaCriancaOpen(false)
      resetNovaCrianca()
      loadChildren()
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível cadastrar.', variant: 'destructive' })
    }
    setNovaChildLoading(false)
  }

  async function loadGuardians() {
    setLoading(_guardiansCache.length === 0)
    const res = await window.api.guardians.listWithStats(estabelecimentoId, searchQuery || undefined)
    _guardiansCache = res
    setGuardians(res)
    setLoading(false)
  }

  function openDeleteGuardian(g: GuardianWithStats) {
    setDeleteGuardian(g)
    setDeleteGuardianOpen(true)
  }

  async function confirmarDeleteGuardian() {
    if (!deleteGuardian) return
    setDeleteGuardianLoading(true)
    try {
      await window.api.guardians.delete(deleteGuardian.id)
      toast({ title: 'Responsável excluído', description: `${deleteGuardian.nome} e seus cadastros foram removidos.` })
      setDeleteGuardianOpen(false)
      loadGuardians()
    } catch (err: any) {
      const raw = err?.message ?? ''
      const msg = raw.includes('Error: ') ? raw.split('Error: ').pop()! : (raw || 'Erro ao excluir responsável.')
      toast({ title: 'Não foi possível excluir', description: msg, variant: 'destructive' })
    }
    setDeleteGuardianLoading(false)
  }

  async function openGuardianDetail(g: GuardianWithStats) {
    setGuardianDetail(null)
    setGuardianDetailOpen(true)
    setGuardianDetailLoading(true)
    const criancas = await window.api.guardians.getChildren(g.id)
    setGuardianDetail({ guardian: g, criancas })
    setGuardianDetailLoading(false)
  }

  function openAddChild(g: GuardianWithStats) {
    setAddChildGuardian(g)
    setAddChildNome('')
    setAddChildNasc('')
    setAddChildCpf('')
    setAddChildCpfError('')
    setAddChildOpen(true)
  }

  async function saveAddChild() {
    if (!addChildGuardian || !addChildNome.trim()) return
    const cpfLimpo = addChildCpf ? addChildCpf.replace(/\D/g, '') : undefined
    if (cpfLimpo && cpfLimpo.length > 0) {
      if (cpfLimpo.length < 11 || !validateCPF(cpfLimpo)) {
        setAddChildCpfError('CPF inválido')
        return
      }
    }
    setAddChildLoading(true)
    try {
      await window.api.children.create({
        estabelecimentoId,
        nome: addChildNome.trim(),
        dataNascimento: addChildNasc || undefined,
        cpf: cpfLimpo || undefined,
        responsavelId: addChildGuardian.id
      })
      toast({ title: 'Criança adicionada!', description: `${addChildNome.trim()} vinculada a ${addChildGuardian.nome}.` })
      setAddChildOpen(false)
      if (guardianDetailOpen && guardianDetail?.guardian.id === addChildGuardian.id) {
        const criancas = await window.api.guardians.getChildren(addChildGuardian.id)
        setGuardianDetail(prev => prev ? { ...prev, criancas } : prev)
      }
      loadGuardians()
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível adicionar a criança.', variant: 'destructive' })
    }
    setAddChildLoading(false)
  }

  async function loadChildren() {
    setLoading(_childrenCache.length === 0)
    const res = await window.api.children.listWithStats(estabelecimentoId, searchQuery || undefined)
    _childrenCache = res
    setChildren(res)
    setLoading(false)
  }

  function toggleSort(col: SortKey) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    let list = [...children]

    const hoje = new Date().toISOString().split('T')[0]
    const sub = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0] }
    const mesAtual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

    if (presencaFilter === 'no_playground') {
      list = list.filter(c => visitasAtivas.some(v => v.crianca_id === c.id) || !!c.visita_ativa)
    } else if (presencaFilter === 'fora') {
      list = list.filter(c => !visitasAtivas.some(v => v.crianca_id === c.id) && !c.visita_ativa)
    }

    if (atividadeFilter === 'hoje') {
      list = list.filter(c => c.ultima_visita?.startsWith(hoje))
    } else if (atividadeFilter === 'semana') {
      list = list.filter(c => c.ultima_visita && c.ultima_visita >= sub(6))
    } else if (atividadeFilter === 'mes') {
      list = list.filter(c => c.ultima_visita && c.ultima_visita >= mesAtual)
    } else if (atividadeFilter === 'nunca') {
      list = list.filter(c => c.total_visitas === 0)
    }

    return list.sort((a, b) => {
      let val = 0
      if (sortBy === 'nome') val = a.nome.localeCompare(b.nome, 'pt-BR')
      else if (sortBy === 'ultima_visita') {
        const aT = a.ultima_visita ? new Date(a.ultima_visita).getTime() : 0
        const bT = b.ultima_visita ? new Date(b.ultima_visita).getTime() : 0
        val = aT - bT
      } else if (sortBy === 'total_visitas') val = a.total_visitas - b.total_visitas
      return sortDir === 'asc' ? val : -val
    })
  }, [children, sortBy, sortDir, presencaFilter, atividadeFilter, visitasAtivas])

  async function openDetail(child: ChildWithStats) {
    setDetailData(null)
    setDetailOpen(true)
    setDetailLoading(true)
    setObsExpanded(false)
    const res = await window.api.children.getDetails(child.id)
    setDetailData(res)
    setDetailLoading(false)
  }

  function openEdit(child: ChildWithStats) {
    setEditChild(child)
    setEditForm({
      nome: child.nome,
      nascimento: child.data_nascimento || '',
      cpf: child.cpf ? maskCPF(child.cpf) : '',
      observacoes: child.observacoes || '',
      respNome: child.responsavel_nome || '',
      respCpf: child.responsavel_cpf ? maskCPF(child.responsavel_cpf) : '',
      respTel: child.responsavel_telefone ? maskPhone(child.responsavel_telefone) : '',
      respTel2: (child as any).responsavel_telefone2 ? maskPhone((child as any).responsavel_telefone2) : '',
      respEmail: child.responsavel_email || ''
    })
    setCpfCriancaError('')
    setCpfRespError('')
    setTelEditError('')
    setEditOpen(true)
  }

  function validateCpfField(value: string, setter: (e: string) => void): boolean {
    const clean = value.replace(/\D/g, '')
    if (!clean) { setter(''); return true }
    if (clean.length < 11) { setter('CPF incompleto'); return false }
    if (!validateCPF(clean)) { setter('CPF inválido'); return false }
    setter('')
    return true
  }

  async function saveEdit() {
    if (!editChild) return
    if (!validateCpfField(editForm.cpf, setCpfCriancaError)) return
    if (!validateCpfField(editForm.respCpf, setCpfRespError)) return

    if (editChild.responsavel_id && !editForm.respTel.trim()) {
      setTelEditError('Telefone obrigatório')
      return
    }
    if (editForm.respTel && !validatePhone(editForm.respTel)) {
      setTelEditError('Telefone inválido')
      return
    }

    setEditLoading(true)
    try {
      const cpfCrianca = editForm.cpf ? editForm.cpf.replace(/\D/g, '') : undefined
      const cpfResp = editForm.respCpf ? editForm.respCpf.replace(/\D/g, '') : undefined

      await window.api.children.update({
        id: editChild.id,
        nome: editForm.nome.trim(),
        dataNascimento: editForm.nascimento || undefined,
        cpf: cpfCrianca || undefined,
        observacoes: editForm.observacoes.trim() || undefined,
        responsavelId: editChild.responsavel_id
      })

      if (editChild.responsavel_id) {
        await window.api.guardians.update({
          id: editChild.responsavel_id,
          nome: editForm.respNome.trim(),
          cpf: cpfResp || undefined,
          telefone: editForm.respTel.trim() || undefined,
          telefone2: editForm.respTel2.trim() || undefined,
          email: editForm.respEmail.trim() || undefined
        })
      }

      toast({ title: 'Cadastro atualizado com sucesso!' })
      setEditOpen(false)
      loadChildren()
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível salvar as alterações.', variant: 'destructive' })
    } finally {
      setEditLoading(false)
    }
  }

  function openDelete(child: ChildWithStats) {
    const ativa = visitasAtivas.some(v => v.crianca_id === child.id) || !!child.visita_ativa
    if (ativa) {
      toast({ title: 'Não é possível excluir', description: `${child.nome} está no playground no momento.`, variant: 'destructive' })
      return
    }
    setDeleteChild(child)
    setDeleteOpen(true)
  }

  async function confirmarDelete() {
    if (!deleteChild) return
    setDeleteLoading(true)
    try {
      await window.api.children.delete(deleteChild.id)
      toast({ title: 'Cadastro excluído', description: `${deleteChild.nome} foi removido.` })
      setDeleteOpen(false)
      loadChildren()
    } catch (err: any) {
      const raw = err?.message ?? ''
      const msg = raw.includes('Error: ') ? raw.split('Error: ').pop()! : (raw || 'Erro ao excluir cadastro.')
      toast({ title: 'Não foi possível excluir', description: msg, variant: 'destructive' })
    }
    setDeleteLoading(false)
  }

  function openEntrada(child: ChildWithStats) {
    if (!caixaAtual) { setCaixaFechadoOpen(true); return }
    const ativa = visitasAtivas.find(v => v.crianca_id === child.id) || child.visita_ativa
    if (ativa) {
      toast({ title: 'Criança já está no playground', description: `${child.nome} já possui uma visita ativa.`, variant: 'destructive' })
      return
    }
    setEntradaChild(child)
    setEntradaOpen(true)
  }

  async function confirmarEntrada() {
    if (!entradaChild) return
    setEntradaLoading(true)
    try {
      const visita = await window.api.visits.create({
        estabelecimentoId,
        criancaId: entradaChild.id,
        responsavelId: entradaChild.responsavel_id
      })
      addVisitaAtiva({
        ...visita,
        crianca_id: entradaChild.id,
        crianca_nome: entradaChild.nome,
        responsavel_nome: entradaChild.responsavel_nome,
        responsavel_telefone: entradaChild.responsavel_telefone,
        estabelecimento_id: estabelecimentoId,
        status: 'ativa',
        ticket_numero: visita.ticket_numero
      })
      toast({ title: 'Entrada registrada!', description: `${entradaChild.nome} entrou no playground.` })
      setEntradaOpen(false)

      const res = await window.api.printer.entrada({
        criancaNome: entradaChild.nome,
        responsavelNome: entradaChild.responsavel_nome,
        responsavelTelefone: entradaChild.responsavel_telefone,
        entradaEm: visita.entrada_em,
        ticketNumero: visita.ticket_numero,
        estabelecimentoId
      })
      if (simulacaoImpressao || !res.success) {
        setPreviewContent(res.preview || '')
        setPreviewOpen(true)
      }

      loadChildren()
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível registrar a entrada.', variant: 'destructive' })
    } finally {
      setEntradaLoading(false)
    }
  }

  function getStatusBadge(c: ChildWithStats) {
    const ativa = visitasAtivas.some(v => v.crianca_id === c.id) || !!c.visita_ativa
    if (ativa) return <Badge variant="success" className="text-xs whitespace-nowrap">No playground</Badge>
    if (c.total_visitas > 10) return <Badge className="text-xs bg-blue-100 text-blue-800 border-transparent whitespace-nowrap">Frequente</Badge>
    if (c.total_visitas === 0) return <Badge variant="warning" className="text-xs whitespace-nowrap">Novo</Badge>
    return <Badge className="text-xs bg-slate-100 text-slate-600 border-transparent whitespace-nowrap">Fora</Badge>
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortBy !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-40" />
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />
  }

  return (
    <div className="p-6 space-y-5 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cadastros</h1>
          <p className="text-muted-foreground text-sm">Gerenciar clientes, histórico de visitas e cadastros</p>
        </div>
        <div className="flex items-center gap-3">
        <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => setNovaCriancaOpen(true)}>
          <UserPlus className="w-4 h-4 mr-1.5" /> Nova criança
        </Button>
        <div className="flex rounded-lg border overflow-hidden text-sm">
          <button
            onClick={() => { setViewMode('criancas'); setSearchQuery('') }}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 transition-colors', viewMode === 'criancas' ? 'bg-violet-600 text-white' : 'hover:bg-muted')}
          >
            <Baby className="w-3.5 h-3.5" /> Crianças
          </button>
          <button
            onClick={() => { setViewMode('responsaveis'); setSearchQuery('') }}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l', viewMode === 'responsaveis' ? 'bg-violet-600 text-white' : 'hover:bg-muted')}
          >
            <Users className="w-3.5 h-3.5" /> Responsáveis
          </button>
        </div>
        </div>
      </div>

      {/* Busca e filtros */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={viewMode === 'criancas' ? 'Buscar por nome, responsável, CPF ou telefone...' : 'Buscar responsável por nome, CPF ou telefone...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {viewMode === 'criancas' && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground">Presença:</span>
                <FilterChip active={presencaFilter === 'todos'}         onClick={() => setPresencaFilter('todos')}         label="Todos" />
                <FilterChip active={presencaFilter === 'no_playground'} onClick={() => setPresencaFilter('no_playground')} label="No playground" />
                <FilterChip active={presencaFilter === 'fora'}          onClick={() => setPresencaFilter('fora')}          label="Fora agora" />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground">Última visita:</span>
                <FilterChip active={atividadeFilter === 'todos'}  onClick={() => setAtividadeFilter('todos')}  label="Qualquer data" />
                <FilterChip active={atividadeFilter === 'hoje'}   onClick={() => setAtividadeFilter('hoje')}   label="Hoje" />
                <FilterChip active={atividadeFilter === 'semana'} onClick={() => setAtividadeFilter('semana')} label="Esta semana" />
                <FilterChip active={atividadeFilter === 'mes'}    onClick={() => setAtividadeFilter('mes')}    label="Este mês" />
                <FilterChip active={atividadeFilter === 'nunca'}  onClick={() => setAtividadeFilter('nunca')}  label="Nunca visitou" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela de responsáveis */}
      {viewMode === 'responsaveis' && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Responsável</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">CPF</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Telefone</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Crianças</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Visitas</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Total gasto</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Última visita</th>
                  <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {!loading && guardians.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">
                    {searchQuery ? 'Nenhum resultado encontrado' : 'Nenhum responsável cadastrado'}
                  </td></tr>
                )}
                {!loading && guardians.map((g) => (
                  <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{g.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.cpf ? maskCPF(g.cpf) : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{g.telefone || '—'}</td>
                    <td className="px-4 py-3 text-right">{g.total_criancas}</td>
                    <td className="px-4 py-3 text-right">{g.total_visitas}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {g.total_gasto > 0 ? formatCurrency(g.total_gasto) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {g.ultima_visita ? formatDate(g.ultima_visita) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Ver detalhes" onClick={() => openGuardianDetail(g)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-violet-600 hover:text-violet-700 hover:bg-violet-50" title="Adicionar criança" onClick={() => openAddChild(g)}>
                          <UserPlus className="w-4 h-4" />
                        </Button>
                        {g.telefone && (
                          <Button
                            variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-green-50"
                            title={`WhatsApp: ${g.telefone}`}
                            onClick={() => {
                              const digits = g.telefone!.replace(/\D/g, '')
                              const num = digits.startsWith('55') ? digits : `55${digits}`
                              window.open(`https://wa.me/${num}`)
                            }}
                          >
                            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#25D366]" xmlns="http://www.w3.org/2000/svg">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                            title="Excluir responsável"
                            onClick={() => openDeleteGuardian(g)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {guardians.length > 0 && (
            <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
              {guardians.length} responsável{guardians.length !== 1 ? 'is' : ''}
              {searchQuery ? ' (filtrado)' : ''}
            </div>
          )}
        </div>
      )}

      {/* Tabela de crianças */}
      {viewMode === 'criancas' && (
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                  <button className="flex items-center hover:text-foreground" onClick={() => toggleSort('nome')}>
                    Nome <SortIcon col="nome" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Responsável</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">CPF Resp.</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Telefone</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                  <button className="flex items-center hover:text-foreground" onClick={() => toggleSort('ultima_visita')}>
                    Última visita <SortIcon col="ultima_visita" />
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                  <button className="flex items-center ml-auto hover:text-foreground" onClick={() => toggleSort('total_visitas')}>
                    Visitas <SortIcon col="total_visitas" />
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Total gasto</th>
                <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-muted-foreground">
                    {searchQuery ? 'Nenhum resultado encontrado' : 'Nenhum cadastro ainda'}
                  </td>
                </tr>
              )}
              {!loading && sorted.map((c) => {
                const ativa = visitasAtivas.some(v => v.crianca_id === c.id) || !!c.visita_ativa
                return (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        {getStatusBadge(c)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{c.nome}</span>
                    </td>
                    <td className="px-4 py-3">
                      {c.responsavel_nome || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.responsavel_cpf ? maskCPF(c.responsavel_cpf) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {c.responsavel_telefone || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {c.ultima_visita ? formatDate(c.ultima_visita) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{c.total_visitas}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {c.total_gasto > 0 ? formatCurrency(c.total_gasto) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Ver histórico" onClick={() => openDetail(c)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Editar cadastro" onClick={() => openEdit(c)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-8 w-8 p-0 ${ativa ? 'opacity-30 cursor-not-allowed' : 'text-violet-600 hover:text-violet-700 hover:bg-violet-50'}`}
                          title="Registrar entrada"
                          onClick={() => openEntrada(c)}
                        >
                          <LogIn className="w-4 h-4" />
                        </Button>
                        {(c.responsavel_telefone || c.responsavel_telefone2) && (
                          <WhatsAppButton tel1={c.responsavel_telefone} tel2={c.responsavel_telefone2} />
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                            title="Excluir cadastro"
                            onClick={() => openDelete(c)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {sorted.length > 0 && (
          <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
            {sorted.length} cadastro{sorted.length !== 1 ? 's' : ''}
            {(presencaFilter !== 'todos' || atividadeFilter !== 'todos' || searchQuery) ? ' (filtrado)' : ''}
          </div>
        )}
      </div>
      )}

      {/* Dialog: detalhes do responsável */}
      <Dialog open={guardianDetailOpen} onOpenChange={setGuardianDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Responsável</DialogTitle>
          </DialogHeader>
          {guardianDetailLoading && <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>}
          {guardianDetail && !guardianDetailLoading && (
            <div className="space-y-5">
              <div className="space-y-1">
                <p className="font-semibold text-lg">{guardianDetail.guardian.nome}</p>
                {guardianDetail.guardian.cpf && <p className="text-sm text-muted-foreground">CPF: {maskCPF(guardianDetail.guardian.cpf)}</p>}
                {guardianDetail.guardian.telefone && <p className="text-sm text-muted-foreground">Tel: {guardianDetail.guardian.telefone}</p>}
                {guardianDetail.guardian.email && <p className="text-sm text-muted-foreground">Email: {guardianDetail.guardian.email}</p>}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold">{guardianDetail.guardian.total_criancas}</p>
                  <p className="text-xs text-muted-foreground">Crianças</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold">{guardianDetail.guardian.total_visitas}</p>
                  <p className="text-xs text-muted-foreground">Visitas</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold">{formatCurrency(guardianDetail.guardian.total_gasto)}</p>
                  <p className="text-xs text-muted-foreground">Total gasto</p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Crianças vinculadas</p>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setGuardianDetailOpen(false); openAddChild(guardianDetail.guardian) }}>
                    <UserPlus className="w-3 h-3 mr-1" /> Adicionar outra criança
                  </Button>
                </div>
                {guardianDetail.criancas.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma criança vinculada</p>
                ) : (
                  <div className="rounded-md border divide-y">
                    {guardianDetail.criancas.map((c) => {
                      const ativa = visitasAtivas.some(v => v.crianca_id === c.id) || !!c.visita_ativa
                      return (
                        <div key={c.id} className="flex items-center justify-between px-3 py-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{c.nome}</span>
                              {ativa && <Badge variant="success" className="text-xs py-0">No playground</Badge>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                              {c.data_nascimento && <span>{calcularIdade(c.data_nascimento)} anos</span>}
                              <span>{c.total_visitas} visita{c.total_visitas !== 1 ? 's' : ''}</span>
                              {c.total_gasto > 0 && <span>{formatCurrency(c.total_gasto)}</span>}
                              {c.ultima_visita && <span>Última: {formatDate(c.ultima_visita)}</span>}
                            </div>
                          </div>
                          {c.data_nascimento && <Badge variant="outline" className="text-xs">{calcularIdade(c.data_nascimento)}a</Badge>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuardianDetailOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar exclusão de responsável */}
      <Dialog open={deleteGuardianOpen} onOpenChange={setDeleteGuardianOpen}>
        <DialogContent className="max-w-sm max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Excluir Responsável</DialogTitle>
          </DialogHeader>
          {deleteGuardian && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Tem certeza que deseja excluir o responsável{' '}
                <strong className="text-foreground">{deleteGuardian.nome}</strong>?{' '}
                Esta ação não pode ser desfeita.
              </p>
              {deleteGuardian.total_criancas > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5 text-sm text-amber-800">
                  <strong>{deleteGuardian.total_criancas}</strong> criança{deleteGuardian.total_criancas !== 1 ? 's' : ''} vinculada{deleteGuardian.total_criancas !== 1 ? 's' : ''} também {deleteGuardian.total_criancas !== 1 ? 'serão excluídas' : 'será excluída'}.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGuardianOpen(false)}>Cancelar</Button>
            <Button
              variant="outline"
              onClick={confirmarDeleteGuardian}
              disabled={deleteGuardianLoading}
              className="border-red-300 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600"
            >
              {deleteGuardianLoading ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: adicionar criança ao responsável */}
      <Dialog open={addChildOpen} onOpenChange={setAddChildOpen}>
        <DialogContent className="w-[480px] max-w-[480px] flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Adicionar Criança</DialogTitle>
          </DialogHeader>
          {addChildGuardian && (
            <div className="space-y-4 overflow-y-auto flex-1 px-1 pb-4">
              <div className="px-3 py-2 bg-violet-50 rounded-md text-sm">
                <p className="font-medium text-violet-800">Responsável: {addChildGuardian.nome}</p>
                {addChildGuardian.telefone && <p className="text-xs text-violet-600">{addChildGuardian.telefone}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Nome da criança *</Label>
                <Input value={addChildNome} onChange={(e) => setAddChildNome(e.target.value)} placeholder="Nome completo" />
              </div>
              <div className="space-y-1.5">
                <Label>Data de nascimento</Label>
                <DatePickerInput value={addChildNasc} onChange={setAddChildNasc} fromYear={2013} />
              </div>
              <div className="space-y-1.5">
                <Label>CPF <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input
                  value={addChildCpf}
                  onChange={(e) => setAddChildCpf(maskCPF(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
                {addChildCpfError && <p className="text-xs text-red-500">{addChildCpfError}</p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddChildOpen(false)}>Cancelar</Button>
            <Button onClick={saveAddChild} disabled={!addChildNome.trim() || addChildLoading} className="bg-violet-600 hover:bg-violet-700">
              {addChildLoading ? 'Salvando...' : 'Adicionar criança'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: histórico / detalhes */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col">
          <DialogHeader className="shrink-0 pb-4 border-b">
            <DialogTitle>Histórico da Criança</DialogTitle>
          </DialogHeader>

          {/* Conteúdo fixo — nunca rola */}
          <div className="shrink-0 pt-5 space-y-5">
            {detailLoading && <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>}

            {detailData && !detailLoading && (
              <>
                {/* Dados criança + responsável */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Criança</p>
                    <p className="font-semibold">{detailData.crianca.nome}</p>
                    {detailData.crianca.data_nascimento && (
                      <p className="text-sm text-muted-foreground">
                        {formatDate(detailData.crianca.data_nascimento)} · {calcularIdade(detailData.crianca.data_nascimento)} anos
                      </p>
                    )}
                    {detailData.crianca.cpf && (
                      <p className="text-sm text-muted-foreground">CPF: {maskCPF(detailData.crianca.cpf)}</p>
                    )}
                    {detailData.crianca.observacoes && (
                      <div className="space-y-1 pt-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observação</p>
                        {detailData.crianca.observacoes.length > 120 ? (
                          <button className="text-left w-full group" onClick={() => setObsExpanded(v => !v)}>
                            <span className={`block text-sm break-words ${obsExpanded ? '' : 'line-clamp-3'}`}>
                              {detailData.crianca.observacoes}
                            </span>
                            <span className="text-xs text-violet-600 group-hover:underline mt-0.5 inline-block">
                              {obsExpanded ? 'Ver menos' : 'Ver mais'}
                            </span>
                          </button>
                        ) : (
                          <span className="block text-sm break-words">{detailData.crianca.observacoes}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Responsável</p>
                    {detailData.crianca.responsavel_nome ? (
                      <>
                        <p className="font-semibold">{detailData.crianca.responsavel_nome}</p>
                        {detailData.crianca.responsavel_cpf && (
                          <p className="text-sm text-muted-foreground">CPF: {maskCPF(detailData.crianca.responsavel_cpf)}</p>
                        )}
                        {detailData.crianca.responsavel_telefone && (
                          <p className="text-sm text-muted-foreground">Tel 1: {detailData.crianca.responsavel_telefone}</p>
                        )}
                        {(detailData.crianca as any).responsavel_telefone2 && (
                          <p className="text-sm text-muted-foreground">Tel 2: {(detailData.crianca as any).responsavel_telefone2}</p>
                        )}
                        {detailData.crianca.responsavel_email && (
                          <p className="text-sm text-muted-foreground">Email: {detailData.crianca.responsavel_email}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sem responsável vinculado</p>
                    )}
                  </div>
                </div>

                {/* Totalizadores */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">{detailData.stats.total_visitas}</p>
                    <p className="text-xs text-muted-foreground">Visitas</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">{formatCurrency(detailData.stats.total_gasto)}</p>
                    <p className="text-xs text-muted-foreground">Total gasto</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">
                      {detailData.stats.media_minutos >= 60
                        ? `${Math.floor(detailData.stats.media_minutos / 60)}h${Math.round(detailData.stats.media_minutos % 60)}min`
                        : `${Math.round(detailData.stats.media_minutos)}min`}
                    </p>
                    <p className="text-xs text-muted-foreground">Tempo médio</p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Histórico de visitas — só essa parte rola */}
          {detailData && !detailLoading && (
            <div className="flex flex-col flex-1 min-h-0 pt-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 shrink-0">Histórico de visitas</p>
              {detailData.visitas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma visita registrada</p>
              ) : (
                <div className="rounded-md border overflow-hidden flex flex-col flex-1 min-h-0">
                  {/* Header fixo */}
                  <table className="w-full text-sm table-fixed">
                    <colgroup>
                      <col className="w-[100px]" />
                      <col className="w-[70px]" />
                      <col className="w-[70px]" />
                      <col className="w-[80px]" />
                      <col className="w-[90px]" />
                      <col />
                    </colgroup>
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Data</th>
                        <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Entrada</th>
                        <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Saída</th>
                        <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Duração</th>
                        <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Valor</th>
                        <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Pagamento</th>
                      </tr>
                    </thead>
                  </table>
                  {/* Body com scroll */}
                  <div className="overflow-y-auto flex-1 min-h-0">
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col className="w-[100px]" />
                        <col className="w-[70px]" />
                        <col className="w-[70px]" />
                        <col className="w-[80px]" />
                        <col className="w-[90px]" />
                        <col />
                      </colgroup>
                      <tbody className="divide-y">
                        {detailData.visitas.map((v) => (
                          <tr key={v.id} className="hover:bg-muted/20">
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                              {formatDate(v.entrada_em)}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {new Date(v.entrada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {v.saida_em
                                ? new Date(v.saida_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                                : <Badge variant="success" className="text-xs">Ativo</Badge>}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                              {v.saida_em ? formatDuracao(v.entrada_em, v.saida_em) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                              {v.valor_total != null ? formatCurrency(v.valor_total) : '—'}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {v.forma_pagamento || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="shrink-0 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => {
                if (detailData?.crianca) openEdit(detailData.crianca as ChildWithStats)
                setDetailOpen(false)
              }}
            >
              <Pencil className="w-4 h-4 mr-2" />
              Editar cadastro
            </Button>
            <Button onClick={() => setDetailOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: editar cadastro */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[580px] max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cadastro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados da Criança</p>
            <div className="space-y-1.5">
              <Label>Nome <span className="text-red-500">*</span></Label>
              <Input value={editForm.nome} onChange={(e) => setEditForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Data de nascimento <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
              <DatePickerInput value={editForm.nascimento} onChange={(v) => setEditForm(f => ({ ...f, nascimento: v }))} fromYear={2013} />
            </div>
            <div className="space-y-1.5">
              <Label>CPF <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
              <Input
                value={editForm.cpf}
                onChange={(e) => setEditForm(f => ({ ...f, cpf: maskCPF(e.target.value) }))}
                onBlur={() => validateCpfField(editForm.cpf, setCpfCriancaError)}
                placeholder="000.000.000-00"
                maxLength={14}
                className={cpfCriancaError ? 'border-red-400 focus-visible:ring-red-400' : ''}
              />
              {cpfCriancaError && <p className="text-xs text-red-500">{cpfCriancaError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Observações <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
              <Input value={editForm.observacoes} onChange={(e) => setEditForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Alergias, necessidades especiais, etc." />
            </div>

            {editChild?.responsavel_id && (
              <>
                <div className="border-t my-1" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Responsável</p>
                <div className="space-y-1.5">
                  <Label>Nome <span className="text-red-500">*</span></Label>
                  <Input value={editForm.respNome} onChange={(e) => setEditForm(f => ({ ...f, respNome: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Telefone 1 <span className="text-red-500">*</span></Label>
                    <Input
                      value={editForm.respTel}
                      onChange={(e) => { setEditForm(f => ({ ...f, respTel: maskPhone(e.target.value) })); setTelEditError('') }}
                      onBlur={() => {
                        if (!editForm.respTel.trim()) setTelEditError('Telefone obrigatório')
                        else if (!validatePhone(editForm.respTel)) setTelEditError('Telefone inválido')
                        else setTelEditError('')
                      }}
                      placeholder="(00) 00000-0000"
                      className={telEditError ? 'border-red-400 focus-visible:ring-red-400' : editForm.respTel && validatePhone(editForm.respTel) ? 'border-green-400 focus-visible:ring-green-400' : ''}
                    />
                    {telEditError && <p className="text-xs text-red-500">{telEditError}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefone 2 <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                    <Input
                      value={editForm.respTel2}
                      onChange={(e) => setEditForm(f => ({ ...f, respTel2: maskPhone(e.target.value) }))}
                      placeholder="(00) 00000-0000"
                      className={editForm.respTel2 && validatePhone(editForm.respTel2) ? 'border-green-400 focus-visible:ring-green-400' : ''}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>CPF <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                  <Input
                    value={editForm.respCpf}
                    onChange={(e) => setEditForm(f => ({ ...f, respCpf: maskCPF(e.target.value) }))}
                    onBlur={() => validateCpfField(editForm.respCpf, setCpfRespError)}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className={cpfRespError ? 'border-red-400 focus-visible:ring-red-400' : ''}
                  />
                  {cpfRespError && <p className="text-xs text-red-500">{cpfRespError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Email <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                  <Input type="email" value={editForm.respEmail} onChange={(e) => setEditForm(f => ({ ...f, respEmail: e.target.value }))} placeholder="email@exemplo.com" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={!editForm.nome.trim() || editLoading} className="bg-violet-600 hover:bg-violet-700">
              {editLoading ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar exclusão */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="w-[420px] max-w-[420px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              Excluir Cadastro
            </DialogTitle>
          </DialogHeader>
          {deleteChild && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Tem certeza que deseja excluir o cadastro de{' '}
                <strong className="text-foreground">{deleteChild.nome}</strong>?
              </p>
              <p className="text-sm text-red-600 font-medium">Esta ação não pode ser desfeita.</p>
              {deleteChild.total_visitas > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5 text-sm text-amber-800">
                  Este cadastro possui <strong>{deleteChild.total_visitas}</strong> visita{deleteChild.total_visitas !== 1 ? 's' : ''} registrada{deleteChild.total_visitas !== 1 ? 's' : ''}. O histórico será mantido mas o cadastro será removido.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button
              onClick={confirmarDelete}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteLoading ? 'Excluindo...' : 'Excluir cadastro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar entrada rápida */}
      <Dialog open={entradaOpen} onOpenChange={setEntradaOpen}>
        <DialogContent className="w-[440px] max-w-[440px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Confirmar Entrada</DialogTitle>
          </DialogHeader>
          {entradaChild && (
            <div className="space-y-3">
              <div className="bg-violet-50 rounded-lg p-4">
                <p className="font-semibold text-lg">{entradaChild.nome}</p>
                {entradaChild.data_nascimento && (
                  <p className="text-sm text-muted-foreground">
                    {calcularIdade(entradaChild.data_nascimento)} anos · Nasc: {formatDate(entradaChild.data_nascimento)}
                  </p>
                )}
                {entradaChild.responsavel_nome && (
                  <p className="text-sm text-muted-foreground">Responsável: {entradaChild.responsavel_nome}</p>
                )}
                {entradaChild.responsavel_telefone && (
                  <p className="text-sm text-muted-foreground">Tel: {entradaChild.responsavel_telefone}</p>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Hora de entrada: <strong>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntradaOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarEntrada} disabled={entradaLoading} className="bg-violet-600 hover:bg-violet-700">
              {entradaLoading ? 'Registrando...' : 'Confirmar Entrada'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: nova criança */}
      <Dialog open={novaCriancaOpen} onOpenChange={(o) => { setNovaCriancaOpen(o); if (!o) resetNovaCrianca() }}>
        <DialogContent className="w-[600px] max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Criança</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados da Criança</p>
            <div className="space-y-1.5">
              <Label>Nome <span className="text-red-500">*</span></Label>
              <Input value={novaChildNome} onChange={(e) => setNovaChildNome(e.target.value)} placeholder="Nome completo da criança" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Data de nascimento <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
              <DatePickerInput value={novaChildNasc} onChange={setNovaChildNasc} fromYear={2013} />
            </div>
            <div className="space-y-1.5">
              <Label>CPF <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
              <Input
                value={novaChildCpf}
                onChange={(e) => setNovaChildCpf(maskCPF(e.target.value))}
                onBlur={() => validateCpfField(novaChildCpf, setNovaChildCpfError)}
                placeholder="000.000.000-00"
                maxLength={14}
                className={novaChildCpfError ? 'border-red-400 focus-visible:ring-red-400' : ''}
              />
              {novaChildCpfError && <p className="text-xs text-red-500">{novaChildCpfError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Observações <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
              <Input value={novaChildObs} onChange={(e) => setNovaChildObs(e.target.value)} placeholder="Alergias, necessidades especiais, etc." />
            </div>

            <div className="border-t my-1" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Responsável</p>

            {novaLinkedGuardian ? (
              <div className="flex items-center justify-between px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-green-800">Vinculado: {novaLinkedGuardian.nome}</p>
                  {novaLinkedGuardian.telefone && <p className="text-xs text-green-600 mt-0.5">{novaLinkedGuardian.telefone}</p>}
                </div>
                <Button variant="ghost" size="sm" className="text-green-700 hover:text-red-600 h-7 px-2"
                  onClick={() => { setNovaLinkedGuardian(null); setNovaRespNome(''); setNovaRespTel('') }}>
                  Alterar
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5 relative">
                  <Label>Nome do responsável <span className="text-red-500">*</span></Label>
                  <Input
                    value={novaRespNome}
                    onChange={(e) => { setNovaRespNome(e.target.value); setNovaLinkedGuardian(null) }}
                    onBlur={() => setTimeout(() => setNovaShowSuggestions(false), 150)}
                    onFocus={() => novaGuardianSuggestions.length > 0 && setNovaShowSuggestions(true)}
                    placeholder="Nome completo do responsável"
                  />
                  {novaShowSuggestions && novaGuardianSuggestions.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
                      {novaGuardianSuggestions.map(g => (
                        <button key={g.id} type="button"
                          onMouseDown={() => {
                            setNovaLinkedGuardian({ id: g.id, nome: g.nome, telefone: g.telefone })
                            setNovaRespNome(g.nome)
                            setNovaRespTel(g.telefone ? maskPhone(g.telefone) : '')
                            setNovaRespTelError('')
                            setNovaShowSuggestions(false)
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Telefone 1 <span className="text-red-500">*</span></Label>
                    <Input
                      value={novaRespTel}
                      onChange={(e) => { setNovaRespTel(maskPhone(e.target.value)); setNovaRespTelError('') }}
                      onBlur={() => {
                        if (!novaRespTel.trim()) setNovaRespTelError('Telefone obrigatório')
                        else if (!validatePhone(novaRespTel)) setNovaRespTelError('Telefone inválido')
                        else setNovaRespTelError('')
                      }}
                      placeholder="(00) 00000-0000"
                      className={novaRespTelError ? 'border-red-400 focus-visible:ring-red-400' : novaRespTel && validatePhone(novaRespTel) ? 'border-green-400 focus-visible:ring-green-400' : ''}
                    />
                    {novaRespTelError && <p className="text-xs text-red-500">{novaRespTelError}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefone 2 <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                    <Input
                      value={novaRespTel2}
                      onChange={(e) => setNovaRespTel2(maskPhone(e.target.value))}
                      placeholder="(00) 00000-0000"
                      className={novaRespTel2 && validatePhone(novaRespTel2) ? 'border-green-400 focus-visible:ring-green-400' : ''}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>CPF do responsável <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                  <Input
                    value={novaRespCpf}
                    onChange={(e) => setNovaRespCpf(maskCPF(e.target.value))}
                    onBlur={() => validateCpfField(novaRespCpf, setNovaRespCpfError)}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className={novaRespCpfError ? 'border-red-400 focus-visible:ring-red-400' : ''}
                  />
                  {novaRespCpfError && <p className="text-xs text-red-500">{novaRespCpfError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Email <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                  <Input type="email" value={novaRespEmail} onChange={(e) => setNovaRespEmail(e.target.value)} placeholder="email@exemplo.com" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaCriancaOpen(false)}>Cancelar</Button>
            <Button
              onClick={salvarNovaCrianca}
              disabled={!novaChildNome.trim() || novaChildLoading}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {novaChildLoading ? 'Salvando...' : 'Cadastrar criança'}
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
