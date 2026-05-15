import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Save, Printer, RefreshCw, CheckCircle, XCircle,
  Plus, Trash2, Lock, Eye, Wifi, Usb, AlertTriangle, Upload, ChevronDown,
  FolderOpen, RotateCcw, UserPlus, DatabaseZap
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PrintPreviewModal } from '@/components/PrintPreviewModal'
import { useStore } from '@/store/useStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useToast } from '@/hooks/useToast'
import type { UsuarioItem } from '@/types'
import { cn } from '@/lib/utils'
import { version } from '../../../../package.json'
import type { FaixaIntermediaria, SyncPushResult } from '@/types'

function NumericInput({ value, onChange, decimal = false, className, ...props }: {
  value: number
  onChange: (v: number) => void
  decimal?: boolean
  className?: string
  [key: string]: any
}) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value))

  useEffect(() => {
    const parsed = decimal ? parseFloat(raw.replace(',', '.')) : parseInt(raw)
    if (isNaN(parsed) || parsed !== value) setRaw(value === 0 ? '' : String(value))
  }, [value])

  return (
    <Input
      {...props}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      className={className}
      value={raw}
      onChange={(e) => {
        const v = e.target.value.replace(',', '.')
        if (/^[0-9]*\.?[0-9]*$/.test(v) || v === '') {
          setRaw(e.target.value)
          const parsed = decimal ? parseFloat(v) : parseInt(v)
          if (!isNaN(parsed)) onChange(parsed)
        }
      }}
      onBlur={() => {
        const parsed = decimal ? parseFloat(raw.replace(',', '.')) : parseInt(raw)
        if (isNaN(parsed) || raw === '') { setRaw('0'); onChange(0) }
        else setRaw(decimal ? String(parsed) : String(parsed))
      }}
    />
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'bg-violet-600' : 'bg-slate-200'
      )}
    >
      <span className={cn(
        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0'
      )} />
    </button>
  )
}

export function Configuracoes() {
  const { usuario } = useAuthStore()
  if (usuario?.perfil !== 'admin') return <Navigate to="/" replace />
  return <ConfiguracoesContent />
}

function ConfiguracoesContent() {
  const { syncStatus, setSyncStatus, simulacaoImpressao, setSimulacaoImpressao, setNomeEstabelecimento, estabelecimentoId } = useStore()
  const { usuario } = useAuthStore()
  const [secoesAbertas, setSecoesAbertas] = useState({
    usuarios: false, estab: false, precos: false, impressora: false, ticket: false, supabase: false, sobre: false, ferramentas: false
  })
  function toggleSecao(sec: keyof typeof secoesAbertas) {
    setSecoesAbertas(s => ({ ...s, [sec]: !s[sec] }))
  }
  const [avancadoAberto, setAvancadoAberto] = useState(false)
  const [tecnicoAutenticado, setTecnicoAutenticado] = useState(false)
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false)
  const [senhaInput, setSenhaInput] = useState('')
  const [senhaErro, setSenhaErro] = useState(false)
  const [modalResetAberto, setModalResetAberto] = useState(false)
  const [senhaResetInput, setSenhaResetInput] = useState('')
  const [senhaResetErro, setSenhaResetErro] = useState(false)
  const [resettingApp, setResettingApp] = useState(false)
  const [modalLimpezaAberto, setModalLimpezaAberto] = useState(false)
  const [limpezaNivel, setLimpezaNivel] = useState<1 | 2 | 3 | null>(null)
  const [limpezaLoading, setLimpezaLoading] = useState(false)
  const [dbPath, setDbPath] = useState('')
  const { toast } = useToast()

  // Usuários
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([])
  const [loadingUsuarios, setLoadingUsuarios] = useState(false)
  const [modalUsuario, setModalUsuario] = useState<{ open: boolean; editando: UsuarioItem | null }>({ open: false, editando: null })
  const [modalSenhaUser, setModalSenhaUser] = useState<{ open: boolean; user: UsuarioItem | null }>({ open: false, user: null })
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UsuarioItem | null>(null)
  const [deletingUser, setDeletingUser] = useState(false)
  const [userForm, setUserForm] = useState({ nome: '', login: '', senha: '', confirmar: '', perfil: 'operador' as 'admin' | 'operador' })
  const [userFormErro, setUserFormErro] = useState('')
  const [savingUser, setSavingUser] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ senhaAtual: '', nova: '', confirmar: '' })
  const [passwordErro, setPasswordErro] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  function autenticarTecnico() {
    if (senhaInput === 'settecnologia') {
      setTecnicoAutenticado(true)
      setModalSenhaAberto(false)
      setSenhaInput('')
      setSenhaErro(false)
    } else {
      setSenhaErro(true)
      setSenhaInput('')
    }
  }

  // Supabase
  const [supabaseKey, setSupabaseKey] = useState('')
  const [syncLoading, setSyncLoading] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [forceLoading, setForceLoading] = useState(false)
  const [pullLoading, setPullLoading] = useState(false)
  const [pullResult, setPullResult] = useState<{ operadores: number; responsaveis: number; criancas: number; visitas: number; faixas: number; fechamentos: number; configuracoes: number } | null>(null)
  const [modalRestaurarAberto, setModalRestaurarAberto] = useState(false)
  const [savingSupabase, setSavingSupabase] = useState(false)

  // Dados do estabelecimento
  const [estabNome, setEstabNome] = useState('PlayKids')
  const [estabUnidade, setEstabUnidade] = useState('')
  const [estabCnpj, setEstabCnpj] = useState('')
  const [estabEndereco, setEstabEndereco] = useState('')
  const [estabTel1, setEstabTel1] = useState('')
  const [estabTel2, setEstabTel2] = useState('')
  const [savingEstab, setSavingEstab] = useState(false)

  // Permissões de operador
  const [permissaoPausaOperador, setPermissaoPausaOperador] = useState(false)

  // Tabela de preços
  const [precoBase, setPrecoBase] = useState(25)
  const [minutosBase, setMinutosBase] = useState(30)
  const [faixas, setFaixas] = useState<FaixaIntermediaria[]>([
    { ate_minutos: 45, valor: 30 },
    { ate_minutos: 60, valor: 35 },
  ])
  const [valorBloco, setValorBloco] = useState(5)
  const [minutosPorBloco, setMinutosPorBloco] = useState(15)
  const [aplicarAtivas, setAplicarAtivas] = useState(false)
  const [visitasAtivasCount, setVisitasAtivasCount] = useState(0)
  const [savingPreco, setSavingPreco] = useState(false)

  // Impressora
  const [printerType, setPrinterType] = useState<'usb' | 'network'>('network')
  const [printerBrand, setPrinterBrand] = useState<'epson' | 'daruma'>('epson')
  const [printerIp, setPrinterIp] = useState('192.168.1.100')
  const [printerPort, setPrinterPort] = useState('9100')
  const [printerUsbName, setPrinterUsbName] = useState('')
  const [usbPrinters, setUsbPrinters] = useState<string[]>([])
  const [loadingUsbPrinters, setLoadingUsbPrinters] = useState(false)
  const [printerOk, setPrinterOk] = useState<boolean | null>(null)
  const [printerLoading, setPrinterLoading] = useState(false)
  const [printTestLoading, setPrintTestLoading] = useState(false)
  const [savingPrinter, setSavingPrinter] = useState(false)

  // Personalização do ticket
  const [ticketExibirCodigo, setTicketExibirCodigo] = useState(true)
  const [ticketExibirEntrada, setTicketExibirEntrada] = useState(true)
  const [ticketExibirTabela, setTicketExibirTabela] = useState(true)
  const [ticketRodape1, setTicketRodape1] = useState('Agradecemos sua visita!')
  const [ticketRodape2, setTicketRodape2] = useState('')
  const [savingTicket, setSavingTicket] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)

  useEffect(() => {
    loadSyncStatus()
    loadSettings()
    loadPricing()
    loadUsuarios()
    window.api.app?.getDbPath().then(setDbPath)
  }, [])

  async function loadUsuarios() {
    setLoadingUsuarios(true)
    const lista = await window.api.users.list(estabelecimentoId)
    setUsuarios(lista as UsuarioItem[])
    setLoadingUsuarios(false)
  }

  async function salvarUsuario() {
    setSavingUser(true)
    setUserFormErro('')
    try {
      const { nome, login, senha, confirmar, perfil } = userForm
      if (!nome.trim()) { setUserFormErro('Nome obrigatório'); return }
      if (modalUsuario.editando) {
        const res = await window.api.users.update({ id: modalUsuario.editando.id, nome, login, perfil })
        if (!res.ok) { setUserFormErro(res.erro ?? 'Erro ao salvar'); return }
      } else {
        if (!login.trim()) { setUserFormErro('Login obrigatório'); return }
        if (!senha) { setUserFormErro('Senha obrigatória'); return }
        if (senha !== confirmar) { setUserFormErro('Senhas não conferem'); return }
        const res = await window.api.users.create({ estabelecimentoId: estabelecimentoId, nome, login, senha, perfil })
        if (!res.ok) { setUserFormErro(res.erro ?? 'Erro ao criar'); return }
      }
      await loadUsuarios()
      setModalUsuario({ open: false, editando: null })
      toast({ title: modalUsuario.editando ? 'Usuário atualizado' : 'Usuário criado' })
    } finally {
      setSavingUser(false)
    }
  }

  async function alterarSenhaUsuario() {
    if (!modalSenhaUser.user) return
    setSavingPassword(true)
    setPasswordErro('')
    try {
      const { senhaAtual, nova, confirmar } = passwordForm
      if (!nova) { setPasswordErro('Nova senha obrigatória'); return }
      if (nova !== confirmar) { setPasswordErro('Senhas não conferem'); return }
      if (nova.length < 4) { setPasswordErro('Mínimo 4 caracteres'); return }
      const data: { id: string; senhaAtual?: string; novaSenha: string } = { id: modalSenhaUser.user.id, novaSenha: nova }
      if (modalSenhaUser.user.master) data.senhaAtual = senhaAtual
      const res = await window.api.users.changePassword(data)
      if (!res.ok) { setPasswordErro(res.erro ?? 'Erro ao alterar senha'); return }
      setModalSenhaUser({ open: false, user: null })
      toast({ title: 'Senha alterada com sucesso' })
    } finally {
      setSavingPassword(false)
    }
  }

  async function toggleAtivoUsuario(u: UsuarioItem) {
    const res = await window.api.users.toggleActive(u.id)
    if (!res.ok) {
      toast({ title: 'Erro', description: (res as any).erro, variant: 'destructive' })
      return
    }
    await loadUsuarios()
  }

  async function excluirUsuario(u: UsuarioItem) {
    setDeletingUser(true)
    const res = await window.api.users.delete(u.id)
    setDeletingUser(false)
    setConfirmDeleteUser(null)
    if (!res.ok) {
      toast({ title: 'Erro ao excluir', description: (res as any).erro, variant: 'destructive' })
      return
    }
    await loadUsuarios()
    toast({ title: 'Usuário excluído' })
  }

  async function loadSyncStatus() {
    const s = await window.api.sync.status()
    setSyncStatus(s)
  }

  async function loadSettings() {
    const all = await window.api.settings.getAll()
    setEstabNome(all['estabelecimento_nome'] ?? 'PlayKids')
    setEstabUnidade(all['ticket_unidade'] ?? '')
    setEstabCnpj(all['estabelecimento_cnpj'] ?? '')
    setEstabEndereco(all['estabelecimento_endereco'] ?? '')
    setEstabTel1(all['estabelecimento_telefone1'] ?? '')
    setEstabTel2(all['estabelecimento_telefone2'] ?? '')

    const pt = (all['printer_type'] ?? 'network') as 'usb' | 'network'
    setPrinterType(pt)
    setPrinterBrand((all['printer_brand'] ?? 'epson') as 'epson' | 'daruma')
    setPrinterIp(all['printer_ip'] ?? '192.168.1.100')
    setPrinterPort(all['printer_port'] ?? '9100')
    setPrinterUsbName(all['printer_usb_name'] ?? '')

    const savedIface = all['printer_interface'] as string | undefined
    if (savedIface) {
      window.api.printer.test(savedIface).then(res => setPrinterOk(res.success)).catch(() => setPrinterOk(false))
    }

    setTicketExibirCodigo((all['ticket_exibir_codigo'] ?? 'true') !== 'false')
    setTicketExibirEntrada((all['ticket_exibir_entrada'] ?? 'true') !== 'false')
    setTicketExibirTabela((all['ticket_exibir_tabela'] ?? 'true') !== 'false')
    setTicketRodape1(all['rodape_ticket'] ?? 'Agradecemos sua visita!')
    setTicketRodape2(all['ticket_rodape2'] ?? '')
    setPermissaoPausaOperador(all['permissao_pausa_operador'] === 'true')

    if (all['supabase_key']) setSupabaseKey(all['supabase_key'])
  }

  async function loadPricing() {
    const config = await window.api.pricing.get(estabelecimentoId)
    if (config) {
      setPrecoBase(config.valor_base)
      setMinutosBase(config.minutos_base)
      try {
        setFaixas(JSON.parse(config.faixas_intermediarias || '[]'))
      } catch {
        setFaixas([])
      }
      setValorBloco(config.valor_bloco)
      setMinutosPorBloco(config.minutos_por_bloco)
    }
    const count = await window.api.pricing.activeCount(estabelecimentoId)
    setVisitasAtivasCount(count)
  }

  async function salvarEstabelecimento() {
    setSavingEstab(true)
    try {
      const nome = estabNome.trim() || 'PlayKids'
      await window.api.settings.saveEstabelecimento({
        nome,
        endereco: estabEndereco.trim(),
        telefone1: estabTel1.trim(),
        telefone2: estabTel2.trim(),
        unidade: estabUnidade.trim(),
      })
      setNomeEstabelecimento(nome)
      toast({ title: 'Dados do estabelecimento salvos!' })
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' })
    }
    setSavingEstab(false)
  }

  async function salvarPreco() {
    if (precoBase <= 0 || minutosBase <= 0 || valorBloco <= 0 || minutosPorBloco <= 0) {
      toast({ title: 'Valores inválidos', description: 'Todos os valores devem ser maiores que zero.', variant: 'destructive' })
      return
    }
    setSavingPreco(true)
    try {
      const sortedFaixas = [...faixas].sort((a, b) => a.ate_minutos - b.ate_minutos)
      const franquiaMinutos = sortedFaixas.length > 0
        ? sortedFaixas[sortedFaixas.length - 1].ate_minutos
        : minutosBase
      await window.api.pricing.save({
        estabelecimentoId: estabelecimentoId,
        nome: 'Padrão',
        valor_base: precoBase,
        minutos_base: minutosBase,
        faixas_intermediarias: JSON.stringify(sortedFaixas),
        franquia_minutos: franquiaMinutos,
        valor_bloco: valorBloco,
        minutos_por_bloco: minutosPorBloco,
        aplicarAtivas,
      })
      toast({ title: 'Tabela de preços salva!' })
      await loadPricing()
      setAplicarAtivas(false)
    } catch {
      toast({ title: 'Erro ao salvar preços', variant: 'destructive' })
    }
    setSavingPreco(false)
  }

  async function salvarImpressora() {
    setSavingPrinter(true)
    try {
      const iface = printerType === 'network'
        ? `tcp://${printerIp.trim()}:${printerPort.trim()}`
        : `printer:${printerUsbName}`
      await window.api.settings.set('printer_type', printerType)
      await window.api.settings.set('printer_brand', printerBrand)
      await window.api.settings.set('printer_ip', printerIp.trim())
      await window.api.settings.set('printer_port', printerPort.trim())
      await window.api.settings.set('printer_usb_name', printerUsbName)
      await window.api.settings.set('printer_interface', iface)
      toast({ title: 'Configurações de impressora salvas!' })
    } catch {
      toast({ title: 'Erro ao salvar impressora', variant: 'destructive' })
    }
    setSavingPrinter(false)
  }

  async function salvarTicket() {
    setSavingTicket(true)
    try {
      await window.api.settings.set('ticket_exibir_codigo', ticketExibirCodigo ? 'true' : 'false')
      await window.api.settings.set('ticket_exibir_entrada', ticketExibirEntrada ? 'true' : 'false')
      await window.api.settings.set('ticket_exibir_tabela', ticketExibirTabela ? 'true' : 'false')
      await window.api.settings.set('rodape_ticket', ticketRodape1.trim())
      await window.api.settings.set('ticket_rodape2', ticketRodape2.trim())
      toast({ title: 'Personalização do ticket salva!' })
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' })
    }
    setSavingTicket(false)
  }

  async function detectarImpressorasUsb() {
    setLoadingUsbPrinters(true)
    try {
      const printers = await window.api.printer.listUsb()
      setUsbPrinters(printers)
      if (printers.length === 0) {
        toast({ title: 'Nenhuma impressora USB encontrada', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Erro ao detectar impressoras', variant: 'destructive' })
    }
    setLoadingUsbPrinters(false)
  }

  async function testarImpressora() {
    setPrinterLoading(true)
    const iface = printerType === 'network'
      ? `tcp://${printerIp.trim()}:${printerPort.trim()}`
      : `printer:${printerUsbName}`
    const res = await window.api.printer.test(iface)
    setPrinterOk(res.success)
    if (!res.success) {
      toast({ title: 'Impressora não encontrada', description: res.error, variant: 'destructive' })
    }
    setPrinterLoading(false)
  }

  async function imprimirTeste() {
    setPrintTestLoading(true)
    const iface = printerType === 'network'
      ? `tcp://${printerIp.trim()}:${printerPort.trim()}`
      : `printer:${printerUsbName}`
    const res = await window.api.printer.printTest(iface)
    if (res.success) {
      toast({ title: 'Página de teste impressa!' })
    } else {
      toast({ title: 'Falha na impressão', description: res.error, variant: 'destructive' })
    }
    setPrintTestLoading(false)
  }

  async function visualizarPreview() {
    setLoadingPreview(true)
    try {
      const res = await window.api.printer.entrada({
        criancaNome: 'Ana Paula (preview)',
        responsavelNome: 'Maria Santos',
        responsavelTelefone: '(11) 99999-9999',
        entradaEm: new Date().toISOString(),
        ticketNumero: 1,
        estabelecimentoId: estabelecimentoId,
      })
      setPreviewContent(res.preview)
      setPreviewOpen(true)
    } catch {
      toast({ title: 'Erro ao gerar preview', variant: 'destructive' })
    }
    setLoadingPreview(false)
  }

  async function sincronizar() {
    setSyncLoading(true)
    try {
      const res = await window.api.sync.fetchConfig(undefined, estabelecimentoId)
      if (res.success) {
        toast({ title: 'Sincronizado!', description: `${res.count} configurações de preço importadas.` })
        await loadSyncStatus()
      } else {
        toast({ title: 'Erro na sincronização', description: res.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Erro', description: 'Falha ao conectar com o Supabase.', variant: 'destructive' })
    }
    setSyncLoading(false)
  }

  async function enviarDados() {
    setPushLoading(true)
    try {
      const res: SyncPushResult = await window.api.sync.pushData()
      if (res.errors.length > 0) {
        toast({ title: 'Erro no sync', description: res.errors[0], variant: 'destructive' })
      } else {
        const totalEnviado = Object.values(res.pushed).reduce((a, b) => a + b, 0)
        toast({ title: 'Dados enviados!', description: `${totalEnviado} registro(s) sincronizado(s) com o Supabase.` })
      }
      await loadSyncStatus()
    } catch {
      toast({ title: 'Falha ao conectar com o Supabase.', variant: 'destructive' })
    }
    setPushLoading(false)
  }

  async function restaurarDaNuvem() {
    setPullLoading(true)
    setPullResult(null)
    try {
      const res = await window.api.sync.pullAll(estabelecimentoId)
      if (!res.success) {
        toast({ title: 'Erro ao restaurar', description: res.error, variant: 'destructive' })
        return
      }
      setPullResult(res.restored!)
      toast({ title: 'Dados restaurados com sucesso!' })
    } catch {
      toast({ title: 'Falha ao conectar com o Supabase.', variant: 'destructive' })
    } finally {
      setPullLoading(false)
      setModalRestaurarAberto(false)
    }
  }

  async function forcarSyncCompleto() {
    setForceLoading(true)
    try {
      await window.api.sync.resetAll()
      const res: SyncPushResult = await window.api.sync.pushData()
      if (res.errors.length > 0) {
        toast({ title: 'Erro no sync', description: res.errors[0], variant: 'destructive' })
      } else {
        const totalEnviado = Object.values(res.pushed).reduce((a, b) => a + b, 0)
        toast({ title: 'Sync completo!', description: `${totalEnviado} registro(s) reenviado(s) ao Supabase.` })
      }
      await loadSyncStatus()
    } catch {
      toast({ title: 'Falha ao conectar com o Supabase.', variant: 'destructive' })
    }
    setForceLoading(false)
  }

  async function abrirPastaDados() {
    await window.api.app.openDataFolder()
  }

  async function executarLimpeza() {
    if (!limpezaNivel) return
    setLimpezaLoading(true)
    try {
      const res = await window.api.data.cleanup(limpezaNivel, estabelecimentoId)
      if (res.success) {
        toast({ title: 'Limpeza concluída com sucesso!' })
        setModalLimpezaAberto(false)
        setLimpezaNivel(null)
      } else {
        toast({ title: 'Erro na limpeza', description: res.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Erro inesperado', variant: 'destructive' })
    }
    setLimpezaLoading(false)
  }

  function confirmarReset() {
    if (senhaResetInput !== 'settecnologia') {
      setSenhaResetErro(true)
      setSenhaResetInput('')
      return
    }
    setSenhaResetErro(false)
    setResettingApp(true)
    window.api.app.resetInstallation()
  }

  async function salvarChave() {
    setSavingSupabase(true)
    await window.api.settings.set('supabase_key', supabaseKey)
    toast({ title: 'Chave de acesso salva!' })
    setSavingSupabase(false)
  }

  function updateFaixa(i: number, field: keyof FaixaIntermediaria, value: number) {
    setFaixas(f => f.map((faixa, idx) => idx === i ? { ...faixa, [field]: value } : faixa))
  }

  function removeFaixa(i: number) {
    setFaixas(f => f.filter((_, idx) => idx !== i))
  }

  function addFaixa() {
    const lastMax = faixas.length > 0 ? Math.max(...faixas.map(f => f.ate_minutos)) : minutosBase
    setFaixas(f => [...f, { ate_minutos: lastMax + 15, valor: 0 }])
  }

  const totalPendente = syncStatus
    ? Object.values(syncStatus.pendentes).reduce((a, b) => a + b, 0)
    : 0

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 pb-12">
      <h1 className="text-2xl font-bold">Configurações</h1>

      {/* Status de sincronização — visível para todos */}
      <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-card">
        <span className="text-sm text-muted-foreground">Sincronização com a nuvem</span>
        {totalPendente === 0 ? (
          <Badge variant="outline" className="border-green-500 text-green-700 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Sincronizado
          </Badge>
        ) : (
          <Badge variant="outline" className="border-yellow-500 text-yellow-700 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Offline — {totalPendente} pendente{totalPendente !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* 0 — Usuários */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none flex flex-row items-center justify-between"
          onClick={() => toggleSecao('usuarios')}
        >
          <div>
            <CardTitle className="text-base">Usuários</CardTitle>
            <CardDescription>Gerencie os usuários do sistema</CardDescription>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', secoesAbertas.usuarios ? 'rotate-180' : '')} />
        </CardHeader>
        {secoesAbertas.usuarios && (
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{usuarios.length} usuário{usuarios.length !== 1 ? 's' : ''}</p>
              <Button size="sm" onClick={() => {
                setUserForm({ nome: '', login: '', senha: '', confirmar: '', perfil: 'operador' })
                setUserFormErro('')
                setModalUsuario({ open: true, editando: null })
              }}>
                <UserPlus className="w-4 h-4 mr-2" />
                Novo usuário
              </Button>
            </div>
            {loadingUsuarios ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : (
              <div className="border rounded-md divide-y">
                {usuarios.map(u => (
                  <div key={u.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.nome}</p>
                        <p className="text-xs text-muted-foreground">{u.login}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {Boolean(u.master) && (
                          <Badge variant="outline" className="text-xs border-violet-300 text-violet-700">Master</Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {u.perfil === 'admin' ? 'Admin' : 'Operador'}
                        </Badge>
                        {!u.ativo && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Inativo</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => {
                        setUserForm({ nome: u.nome, login: u.login, senha: '', confirmar: '', perfil: u.perfil })
                        setUserFormErro('')
                        setModalUsuario({ open: true, editando: u })
                      }}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => {
                        setPasswordForm({ senhaAtual: '', nova: '', confirmar: '' })
                        setPasswordErro('')
                        setModalSenhaUser({ open: true, user: u })
                      }}>
                        Senha
                      </Button>
                      {!Boolean(u.master) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn('h-7 px-2 text-xs', u.ativo ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-700')}
                          onClick={() => toggleAtivoUsuario(u)}
                        >
                          {u.ativo ? 'Desativar' : 'Ativar'}
                        </Button>
                      )}
                      {!Boolean(u.master) && u.id !== usuario?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-red-500 hover:text-red-700"
                          onClick={() => setConfirmDeleteUser(u)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {usuario?.master && (
              <div className="border-t pt-4 mt-2 space-y-3">
                <p className="text-sm font-medium">Permissões dos operadores</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Pausar tempo de visita</p>
                    <p className="text-xs text-muted-foreground">Permite que operadores pausem o cronômetro</p>
                  </div>
                  <Toggle
                    checked={permissaoPausaOperador}
                    onChange={async (v) => {
                      setPermissaoPausaOperador(v)
                      await window.api.settings.set('permissao_pausa_operador', v ? 'true' : 'false')
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* 1 — Dados do Estabelecimento */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none flex flex-row items-center justify-between"
          onClick={() => toggleSecao('estab')}
        >
          <div>
            <CardTitle className="text-base">Dados do Estabelecimento</CardTitle>
            <CardDescription>Informações exibidas no cabeçalho dos tickets</CardDescription>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', secoesAbertas.estab ? 'rotate-180' : '')} />
        </CardHeader>
        {secoesAbertas.estab && <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome da empresa</Label>
            <Input value={estabNome} onChange={(e) => setEstabNome(e.target.value)} placeholder="Play Kids Lazer Infantil" />
          </div>
          <div className="space-y-1.5">
            <Label>Nome do local / unidade</Label>
            <Input value={estabUnidade} onChange={(e) => setEstabUnidade(e.target.value)} placeholder="Master Sonda Shopping" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>CNPJ <span className="text-xs text-muted-foreground">(definido pelo master)</span></Label>
              <Input value={estabCnpj} readOnly disabled className="opacity-60 cursor-not-allowed" placeholder="Vinculado ao contrato" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone 1</Label>
              <Input value={estabTel1} onChange={(e) => setEstabTel1(e.target.value)} placeholder="(00) 9999-9999" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Endereço</Label>
            <Input value={estabEndereco} onChange={(e) => setEstabEndereco(e.target.value)} placeholder="Rua Example, 123 – Bairro – Cidade/UF" />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone 2</Label>
            <Input value={estabTel2} onChange={(e) => setEstabTel2(e.target.value)} placeholder="(00) 9999-9999" />
          </div>
          <Button onClick={salvarEstabelecimento} disabled={savingEstab}>
            <Save className="w-4 h-4 mr-2" />
            {savingEstab ? 'Salvando...' : 'Salvar dados'}
          </Button>
        </CardContent>}
      </Card>

      {/* 2 — Tabela de Preços */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none flex flex-row items-center justify-between"
          onClick={() => toggleSecao('precos')}
        >
          <div>
            <CardTitle className="text-base">Tabela de Preços</CardTitle>
            <CardDescription>Define o valor cobrado por tempo de permanência no playground</CardDescription>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', secoesAbertas.precos ? 'rotate-180' : '')} />
        </CardHeader>
        {secoesAbertas.precos && <CardContent className="space-y-5">
          {/* Base */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor base (R$)</Label>
              <NumericInput decimal value={precoBase} onChange={setPrecoBase} />
              <p className="text-xs text-muted-foreground">Valor cobrado na franquia inicial</p>
            </div>
            <div className="space-y-1.5">
              <Label>Franquia inicial (min)</Label>
              <NumericInput value={minutosBase} onChange={setMinutosBase} />
              <p className="text-xs text-muted-foreground">Tempo incluso no valor base</p>
            </div>
          </div>

          {/* Faixas intermediárias */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Faixas intermediárias</Label>
              <Button variant="outline" size="sm" onClick={addFaixa}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Adicionar faixa
              </Button>
            </div>
            {faixas.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">Nenhuma faixa. Após o valor base, já serão cobrados blocos extras.</p>
            )}
            <div className="space-y-2">
              {faixas.map((faixa, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-muted/40 rounded-md">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Até</span>
                  <NumericInput
                    value={faixa.ate_minutos}
                    onChange={(v) => updateFaixa(i, 'ate_minutos', v)}
                    className="w-20 h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">min →</span>
                  <span className="text-xs text-muted-foreground">R$</span>
                  <NumericInput
                    decimal
                    value={faixa.valor}
                    onChange={(v) => updateFaixa(i, 'valor', v)}
                    className="w-24 h-8 text-sm"
                  />
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => removeFaixa(i)}
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Blocos extras */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor por bloco (R$)</Label>
              <NumericInput decimal value={valorBloco} onChange={setValorBloco} />
              <p className="text-xs text-muted-foreground">Acréscimo após todas as faixas</p>
            </div>
            <div className="space-y-1.5">
              <Label>Minutos por bloco</Label>
              <NumericInput value={minutosPorBloco} onChange={setMinutosPorBloco} />
              <p className="text-xs text-muted-foreground">Intervalo de cobrança extra</p>
            </div>
          </div>

          {/* Aplicar às visitas em andamento */}
          <div className="border rounded-md p-3 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={aplicarAtivas}
                onChange={(e) => setAplicarAtivas(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-violet-600"
              />
              <div>
                <p className="text-sm font-medium">Aplicar novos valores às visitas em andamento</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Quando desmarcado, visitas já em andamento continuam com a tabela anterior até a saída.
                  Apenas novas entradas usarão a nova tabela.
                </p>
              </div>
            </label>
            {aplicarAtivas && visitasAtivasCount > 0 && (
              <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <p className="text-xs font-medium">
                  {visitasAtivasCount} criança{visitasAtivasCount !== 1 ? 's' : ''} no playground {visitasAtivasCount !== 1 ? 'serão afetadas' : 'será afetada'} imediatamente.
                </p>
              </div>
            )}
          </div>

          <Button onClick={salvarPreco} disabled={savingPreco}>
            <Save className="w-4 h-4 mr-2" />
            {savingPreco ? 'Salvando...' : 'Salvar tabela de preços'}
          </Button>
        </CardContent>}
      </Card>

      {/* 3 — Impressora Térmica */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none flex flex-row items-center justify-between"
          onClick={() => toggleSecao('impressora')}
        >
          <div>
            <CardTitle className="text-base">Impressora Térmica</CardTitle>
            <CardDescription>Configure a conexão com a impressora de tickets</CardDescription>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', secoesAbertas.impressora ? 'rotate-180' : '')} />
        </CardHeader>
        {secoesAbertas.impressora && <CardContent className="space-y-4">
          {/* Marca da impressora */}
          <div className="space-y-1.5">
            <Label>Marca / protocolo</Label>
            <div className="flex gap-2">
              <Button
                variant={printerBrand === 'epson' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setPrinterBrand('epson'); setPrinterOk(null) }}
              >
                Epson / Bematech / Genérica
              </Button>
              <Button
                variant={printerBrand === 'daruma' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setPrinterBrand('daruma'); setPrinterOk(null) }}
              >
                Daruma
              </Button>
            </div>
          </div>

          {/* Seletor USB / Rede */}
          <div className="space-y-1.5">
            <Label>Conexão</Label>
            <div className="flex gap-2">
              <Button
                variant={printerType === 'network' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setPrinterType('network'); setPrinterOk(null) }}
                className="gap-1.5"
              >
                <Wifi className="w-3.5 h-3.5" />
                Rede (TCP/IP)
              </Button>
              <Button
                variant={printerType === 'usb' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setPrinterType('usb'); setPrinterOk(null) }}
                className="gap-1.5"
              >
                <Usb className="w-3.5 h-3.5" />
                USB
              </Button>
            </div>
          </div>

          {/* Rede */}
          {printerType === 'network' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>IP da impressora</Label>
                <Input
                  value={printerIp}
                  onChange={(e) => { setPrinterIp(e.target.value); setPrinterOk(null) }}
                  placeholder="192.168.1.100"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Porta</Label>
                <Input
                  value={printerPort}
                  onChange={(e) => { setPrinterPort(e.target.value); setPrinterOk(null) }}
                  placeholder="9100"
                />
              </div>
            </div>
          )}

          {/* USB */}
          {printerType === 'usb' && (
            <div className="space-y-3">
              <Button
                variant="outline"
                size="sm"
                onClick={detectarImpressorasUsb}
                disabled={loadingUsbPrinters}
              >
                <Printer className="w-3.5 h-3.5 mr-2" />
                {loadingUsbPrinters ? 'Detectando...' : 'Detectar impressoras USB'}
              </Button>
              {(usbPrinters.length > 0 || printerUsbName) && (
                <div className="space-y-1.5">
                  <Label>Impressora selecionada</Label>
                  <Select
                    value={printerUsbName}
                    onValueChange={(v) => { setPrinterUsbName(v); setPrinterOk(null) }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma impressora..." />
                    </SelectTrigger>
                    <SelectContent>
                      {[...new Set([...usbPrinters, ...(printerUsbName ? [printerUsbName] : [])])].map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {usbPrinters.length === 0 && !printerUsbName && (
                <p className="text-xs text-muted-foreground">
                  Clique em "Detectar impressoras USB" para listar as impressoras disponíveis.
                </p>
              )}
            </div>
          )}

          {/* Ações */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" onClick={testarImpressora} disabled={printerLoading || (printerType === 'usb' && !printerUsbName)}>
              <Printer className="w-4 h-4 mr-2" />
              {printerLoading ? 'Testando...' : 'Testar conexão'}
            </Button>
            <Button variant="outline" onClick={imprimirTeste} disabled={printTestLoading || (printerType === 'usb' && !printerUsbName)}>
              <Printer className="w-4 h-4 mr-2" />
              {printTestLoading ? 'Imprimindo...' : 'Imprimir teste'}
            </Button>
            <Button onClick={salvarImpressora} disabled={savingPrinter}>
              <Save className="w-4 h-4 mr-2" />
              {savingPrinter ? 'Salvando...' : 'Salvar'}
            </Button>
            {printerOk === true && (
              <Badge variant="outline" className="flex items-center gap-1 border-green-500 text-green-700">
                <CheckCircle className="w-3 h-3" /> Conectada
              </Badge>
            )}
            {printerOk === false && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <XCircle className="w-3 h-3" /> Sem conexão
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <p className="text-sm font-medium">Modo simulação de impressão</p>
              <p className="text-xs text-muted-foreground">
                Mostra preview do ticket ao invés de imprimir
              </p>
            </div>
            <Toggle checked={simulacaoImpressao} onChange={setSimulacaoImpressao} />
          </div>
        </CardContent>}
      </Card>

      {/* 4 — Personalização do Ticket */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none flex flex-row items-center justify-between"
          onClick={() => toggleSecao('ticket')}
        >
          <div>
            <CardTitle className="text-base">Personalização do Ticket</CardTitle>
            <CardDescription>Defina o que aparece em cada seção do ticket impresso</CardDescription>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', secoesAbertas.ticket ? 'rotate-180' : '')} />
        </CardHeader>
        {secoesAbertas.ticket && <CardContent className="space-y-5">
          {/* Cabeçalho (referência) */}
          <div className="bg-muted/40 rounded-md px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Cabeçalho</p>
            <p className="text-xs text-muted-foreground">
              Nome da empresa, local/unidade e telefones são configurados em <strong>Dados do Estabelecimento</strong> acima.
            </p>
          </div>

          {/* Corpo — toggles */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Corpo</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Exibir código do ticket</p>
                  <p className="text-xs text-muted-foreground">Ex: #001</p>
                </div>
                <Toggle checked={ticketExibirCodigo} onChange={setTicketExibirCodigo} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Exibir data e hora de entrada</p>
                  <p className="text-xs text-muted-foreground">Ex: 25/04/2026  14:30</p>
                </div>
                <Toggle checked={ticketExibirEntrada} onChange={setTicketExibirEntrada} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Exibir tabela de valores no ticket de entrada</p>
                  <p className="text-xs text-muted-foreground">Imprime a tabela de preços no ticket de entrada da criança</p>
                </div>
                <Toggle checked={ticketExibirTabela} onChange={setTicketExibirTabela} />
              </div>
            </div>
          </div>

          {/* Rodapé personalizável */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rodapé personalizável</p>
            <div className="space-y-1.5">
              <Label>Mensagem personalizada — linha 1</Label>
              <Input
                value={ticketRodape1}
                onChange={(e) => setTicketRodape1(e.target.value)}
                placeholder="Agradecemos sua visita!"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mensagem personalizada — linha 2</Label>
              <Input
                value={ticketRodape2}
                onChange={(e) => setTicketRodape2(e.target.value)}
                placeholder="Locação para Festas de Aniversário"
              />
            </div>
          </div>


          {/* Ações */}
          <div className="flex items-center gap-3">
            <Button onClick={salvarTicket} disabled={savingTicket}>
              <Save className="w-4 h-4 mr-2" />
              {savingTicket ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button variant="outline" onClick={visualizarPreview} disabled={loadingPreview}>
              <Eye className="w-4 h-4 mr-2" />
              {loadingPreview ? 'Gerando...' : 'Visualizar preview do ticket'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O preview reflete as configurações já salvas. Salve antes de visualizar para ver as alterações.
          </p>
        </CardContent>}
      </Card>

      {/* 5 — Sincronização (técnico) */}
      {tecnicoAutenticado && <Card>
        <CardHeader
          className="cursor-pointer select-none flex flex-row items-center justify-between"
          onClick={() => toggleSecao('supabase')}
        >
          <div>
            <CardTitle className="text-base">Sincronização</CardTitle>
            <CardDescription>Chave de acesso ao servidor e ferramentas de sync</CardDescription>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', secoesAbertas.supabase ? 'rotate-180' : '')} />
        </CardHeader>
        {secoesAbertas.supabase && <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Chave de acesso</Label>
            <p className="text-xs text-muted-foreground">Chave fornecida pela Set Tecnologia</p>
            <Input
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGci... (chave de acesso)"
              type="password"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={salvarChave}
            disabled={savingSupabase || !supabaseKey}
          >
            <Save className="w-3.5 h-3.5 mr-2" />
            {savingSupabase ? 'Salvando...' : 'Salvar chave'}
          </Button>

          <div className="space-y-3 pt-2">
            {/* Status detalhado de pendentes */}
            <div className="text-sm">
              {totalPendente > 0 ? (
                <div className="space-y-1">
                  <span className="text-yellow-600 font-medium">{totalPendente} registro(s) pendente(s) de sync</span>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {syncStatus && (
                      <>
                        {syncStatus.pendentes.visitas > 0 && <span>Visitas: {syncStatus.pendentes.visitas}</span>}
                        {syncStatus.pendentes.criancas > 0 && <span>Crianças: {syncStatus.pendentes.criancas}</span>}
                        {syncStatus.pendentes.responsaveis > 0 && <span>Responsáveis: {syncStatus.pendentes.responsaveis}</span>}
                        {syncStatus.pendentes.logs > 0 && <span>Logs: {syncStatus.pendentes.logs}</span>}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <span className="text-green-600">Tudo sincronizado</span>
              )}
            </div>

            {/* Avançado */}
            <div className="border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setAvancadoAberto((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <span>Avançado</span>
                <span className="text-xs">{avancadoAberto ? '▲' : '▼'}</span>
              </button>
              {avancadoAberto && (
                <div className="border-t divide-y">
                  <button
                    onClick={enviarDados}
                    disabled={pushLoading || !supabaseKey || totalPendente === 0}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                  >
                    <Upload className={`w-4 h-4 shrink-0 text-muted-foreground ${pushLoading ? 'animate-pulse' : ''}`} />
                    <div>
                      <p className="text-sm font-medium">{pushLoading ? 'Enviando...' : 'Enviar dados locais'}</p>
                      <p className="text-xs text-muted-foreground">Envia registros pendentes para o Supabase</p>
                    </div>
                  </button>

                  <button
                    onClick={sincronizar}
                    disabled={syncLoading || !supabaseKey}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                  >
                    <RefreshCw className={`w-4 h-4 shrink-0 text-muted-foreground ${syncLoading ? 'animate-spin' : ''}`} />
                    <div>
                      <p className="text-sm font-medium">{syncLoading ? 'Importando...' : 'Importar preços'}</p>
                      <p className="text-xs text-muted-foreground">Puxa tabela de preços do Supabase</p>
                    </div>
                  </button>

                  <button
                    onClick={forcarSyncCompleto}
                    disabled={forceLoading || !supabaseKey}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-orange-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                  >
                    <RefreshCw className={`w-4 h-4 shrink-0 text-orange-500 ${forceLoading ? 'animate-spin' : ''}`} />
                    <div>
                      <p className="text-sm font-medium text-orange-600">{forceLoading ? 'Forçando...' : 'Forçar sync completo'}</p>
                      <p className="text-xs text-muted-foreground">Reenvia todos os registros, mesmo os já sincronizados</p>
                    </div>
                  </button>

                  <button
                    onClick={() => { setPullResult(null); setModalRestaurarAberto(true) }}
                    disabled={!supabaseKey}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                  >
                    <RotateCcw className="w-4 h-4 shrink-0 text-violet-500" />
                    <div>
                      <p className="text-sm font-medium text-violet-600">Restaurar dados da nuvem</p>
                      <p className="text-xs text-muted-foreground">Importa crianças, responsáveis e visitas do Supabase</p>
                    </div>
                  </button>

                  {pullResult && (
                    <div className="px-3 py-2.5 bg-green-50">
                      <p className="text-xs font-semibold text-green-800">Restauração concluída:</p>
                      <p className="text-xs text-green-700 mt-0.5">{pullResult.operadores} operador(es) · {pullResult.responsaveis} responsável(is) · {pullResult.criancas} criança(s) · {pullResult.visitas} visita(s) · {pullResult.fechamentos} fechamento(s) · {pullResult.configuracoes} configuração(ões)</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>}
      </Card>}

      {/* 6 — Ferramentas técnicas */}
      {tecnicoAutenticado && (
        <Card>
          <CardHeader
            className="cursor-pointer select-none flex flex-row items-center justify-between"
            onClick={() => toggleSecao('ferramentas')}
          >
            <div>
              <CardTitle className="text-base">Ferramentas</CardTitle>
              <CardDescription>Utilitários para suporte e reinstalação</CardDescription>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', secoesAbertas.ferramentas ? 'rotate-180' : '')} />
          </CardHeader>
          {secoesAbertas.ferramentas && (
            <CardContent className="space-y-4">
              {dbPath && (
                <div className="bg-muted/40 rounded-md px-3 py-2 text-xs font-mono text-muted-foreground break-all">
                  {dbPath}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={abrirPastaDados}>
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Abrir pasta de dados
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setSenhaResetInput(''); setSenhaResetErro(false); setModalResetAberto(true) }}
                  className="text-red-600 border-red-400 hover:bg-red-50"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Resetar instalação
                </Button>
              </div>

              <div className="border-t pt-4 space-y-2">
                <p className="text-sm font-medium">Limpeza de dados</p>
                <p className="text-xs text-muted-foreground">Remove dados localmente e no Supabase. Operadores e configurações do sistema nunca são apagados.</p>
                <div className="space-y-2">
                  {([
                    { nivel: 1 as const, label: 'Nível 1 — Dados operacionais', desc: 'Visitas, fechamentos de caixa e logs de auditoria', color: 'text-orange-600 border-orange-400 hover:bg-orange-50' },
                    { nivel: 2 as const, label: 'Nível 2 — + Cadastros', desc: 'Nível 1 + crianças e responsáveis', color: 'text-red-500 border-red-400 hover:bg-red-50' },
                    { nivel: 3 as const, label: 'Nível 3 — + Configurações', desc: 'Nível 2 + tabelas de preço', color: 'text-red-700 border-red-600 hover:bg-red-50' },
                  ]).map(({ nivel, label, desc, color }) => (
                    <Button
                      key={nivel}
                      variant="outline"
                      className={`w-full justify-start h-auto py-2 px-3 ${color}`}
                      onClick={() => { setLimpezaNivel(nivel); setModalLimpezaAberto(true) }}
                    >
                      <DatabaseZap className="w-4 h-4 mr-2 shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs opacity-70">{desc}</p>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* 7 — Sobre */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none flex flex-row items-center justify-between"
          onClick={() => toggleSecao('sobre')}
        >
          <div>
            <CardTitle className="text-base">Sobre</CardTitle>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', secoesAbertas.sobre ? 'rotate-180' : '')} />
        </CardHeader>
        {secoesAbertas.sobre && <CardContent className="text-sm text-muted-foreground space-y-3">
          <div className="space-y-1">
            <p>ERP Set Tecnologia <strong>v{version}</strong></p>
            <p>Estabelecimento ID: <code className="text-xs bg-muted px-1 py-0.5 rounded">{estabelecimentoId}</code></p>
          </div>
          <Button variant="outline" size="sm" onClick={async () => {
            await window.api.updater?.checkNow?.()
            toast({ title: 'Verificando atualizações...', description: 'Aguarde alguns segundos.' })
          }}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Verificar atualizações
          </Button>
        </CardContent>}
      </Card>

      {/* Acesso técnico — discreto, sem indicação visual */}
      {!tecnicoAutenticado && (
        <p
          className="text-xs text-center cursor-default select-none pb-2"
          style={{ color: 'transparent', textShadow: '0 0 0 rgba(0,0,0,0.08)' }}
          onClick={() => setModalSenhaAberto(true)}
        >
          Acesso técnico
        </p>
      )}

      <Dialog
        open={modalSenhaAberto}
        onOpenChange={(v) => { setModalSenhaAberto(v); setSenhaInput(''); setSenhaErro(false) }}
      >
        <DialogContent className="max-w-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Autenticação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Input
              type="password"
              placeholder="Senha"
              value={senhaInput}
              autoFocus
              className={senhaErro ? 'border-red-400' : ''}
              onChange={(e) => { setSenhaInput(e.target.value); setSenhaErro(false) }}
              onKeyDown={(e) => e.key === 'Enter' && autenticarTecnico()}
            />
            {senhaErro && <p className="text-xs text-red-500">Senha incorreta</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setModalSenhaAberto(false); setSenhaInput(''); setSenhaErro(false) }}>
                Cancelar
              </Button>
              <Button size="sm" onClick={autenticarTecnico} disabled={!senhaInput}>
                Acessar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modalResetAberto}
        onOpenChange={(v) => { setModalResetAberto(v); setSenhaResetInput(''); setSenhaResetErro(false) }}
      >
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-red-600">Resetar instalação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Esta ação apaga o banco de dados local e todas as configurações.
                O app será reiniciado na tela de ativação. <strong>Esta ação não pode ser desfeita.</strong>
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Confirme com a senha técnica:</p>
              <Input
                type="password"
                placeholder="Senha técnica"
                value={senhaResetInput}
                autoFocus
                className={senhaResetErro ? 'border-red-400' : ''}
                onChange={(e) => { setSenhaResetInput(e.target.value); setSenhaResetErro(false) }}
                onKeyDown={(e) => e.key === 'Enter' && confirmarReset()}
              />
              {senhaResetErro && <p className="text-xs text-red-500">Senha incorreta</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setModalResetAberto(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={confirmarReset}
                disabled={!senhaResetInput || resettingApp}
              >
                {resettingApp ? 'Resetando...' : 'Confirmar reset'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Criar/Editar Usuário */}
      <Dialog
        open={modalUsuario.open}
        onOpenChange={(v) => { if (!v) { setModalUsuario({ open: false, editando: null }); setUserFormErro('') } }}
      >
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{modalUsuario.editando ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={userForm.nome}
                onChange={(e) => setUserForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Nome completo"
                autoFocus
              />
            </div>
            {!modalUsuario.editando?.master && (
              <div className="space-y-1.5">
                <Label>Login *</Label>
                <Input
                  value={userForm.login}
                  onChange={(e) => setUserForm(f => ({ ...f, login: e.target.value }))}
                  placeholder="Nome de usuário (sem espaços)"
                  disabled={Boolean(modalUsuario.editando)}
                />
              </div>
            )}
            {!modalUsuario.editando && (
              <>
                <div className="space-y-1.5">
                  <Label>Senha *</Label>
                  <Input
                    type="password"
                    value={userForm.senha}
                    onChange={(e) => setUserForm(f => ({ ...f, senha: e.target.value }))}
                    placeholder="Senha"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirmar senha *</Label>
                  <Input
                    type="password"
                    value={userForm.confirmar}
                    onChange={(e) => setUserForm(f => ({ ...f, confirmar: e.target.value }))}
                    placeholder="Confirmar senha"
                  />
                </div>
              </>
            )}
            {!modalUsuario.editando?.master && (
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select value={userForm.perfil} onValueChange={(v) => setUserForm(f => ({ ...f, perfil: v as 'admin' | 'operador' }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="operador">Operador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {userFormErro && <p className="text-xs text-red-500">{userFormErro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setModalUsuario({ open: false, editando: null })}>
                Cancelar
              </Button>
              <Button size="sm" onClick={salvarUsuario} disabled={savingUser}>
                {savingUser ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Alterar Senha do Usuário */}
      <Dialog
        open={modalSenhaUser.open}
        onOpenChange={(v) => { if (!v) { setModalSenhaUser({ open: false, user: null }); setPasswordErro('') } }}
      >
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Alterar senha — {modalSenhaUser.user?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {Boolean(modalSenhaUser.user?.master) && (
              <div className="space-y-1.5">
                <Label>Senha atual *</Label>
                <Input
                  type="password"
                  value={passwordForm.senhaAtual}
                  onChange={(e) => setPasswordForm(f => ({ ...f, senhaAtual: e.target.value }))}
                  placeholder="Senha atual"
                  autoFocus
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Nova senha *</Label>
              <Input
                type="password"
                value={passwordForm.nova}
                onChange={(e) => setPasswordForm(f => ({ ...f, nova: e.target.value }))}
                placeholder="Nova senha"
                autoFocus={!modalSenhaUser.user?.master}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirmar nova senha *</Label>
              <Input
                type="password"
                value={passwordForm.confirmar}
                onChange={(e) => setPasswordForm(f => ({ ...f, confirmar: e.target.value }))}
                placeholder="Confirmar nova senha"
              />
            </div>
            {passwordErro && <p className="text-xs text-red-500">{passwordErro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setModalSenhaUser({ open: false, user: null })}>
                Cancelar
              </Button>
              <Button size="sm" onClick={alterarSenhaUsuario} disabled={savingPassword}>
                {savingPassword ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Restaurar dados da nuvem */}
      <Dialog
        open={modalRestaurarAberto}
        onOpenChange={(v) => { if (!v) setModalRestaurarAberto(false) }}
      >
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Restaurar dados da nuvem</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Isso importa crianças, responsáveis, visitas e configurações de preço do Supabase para o banco local.
                Registros existentes com o mesmo ID serão substituídos.
                Dados que nunca foram sincronizados <strong>não podem ser recuperados</strong>.
              </span>
            </div>
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Atenção:</strong> registros <strong>deletados localmente</strong> voltam da nuvem, pois exclusões não são sincronizadas.
                Após restaurar, verifique e remova manualmente os cadastros indesejados.
              </span>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setModalRestaurarAberto(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={restaurarDaNuvem} disabled={pullLoading}>
                {pullLoading ? 'Restaurando...' : 'Restaurar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Exclusão de Usuário */}
      <Dialog
        open={Boolean(confirmDeleteUser)}
        onOpenChange={(v) => { if (!v) setConfirmDeleteUser(null) }}
      >
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-red-600">Excluir usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Tem certeza que deseja excluir <strong>{confirmDeleteUser?.nome}</strong>?
                Esta ação não pode ser desfeita.
              </span>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeleteUser(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => confirmDeleteUser && excluirUsuario(confirmDeleteUser)}
                disabled={deletingUser}
              >
                {deletingUser ? 'Excluindo...' : 'Excluir'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PrintPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        content={previewContent}
        title="Preview do Ticket de Entrada"
      />

      {/* Modal Limpeza de dados */}
      <Dialog
        open={modalLimpezaAberto}
        onOpenChange={(v) => { if (!v && !limpezaLoading) { setModalLimpezaAberto(false); setLimpezaNivel(null) } }}
      >
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {limpezaNivel === 1 && 'Limpar dados operacionais'}
              {limpezaNivel === 2 && 'Limpar dados operacionais e cadastros'}
              {limpezaNivel === 3 && 'Limpar todos os dados'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p><strong>Esta ação não pode ser desfeita.</strong> Serão removidos localmente e no Supabase:</p>
                <ul className="list-disc list-inside space-y-0.5 mt-1">
                  <li>Visitas, fechamentos de caixa e logs</li>
                  {(limpezaNivel ?? 0) >= 2 && <li>Crianças e responsáveis</li>}
                  {(limpezaNivel ?? 0) >= 3 && <li>Tabelas de preço</li>}
                </ul>
                <p className="mt-1">Operadores e configurações do sistema <strong>não serão afetados</strong>.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => { setModalLimpezaAberto(false); setLimpezaNivel(null) }} disabled={limpezaLoading}>
                Cancelar
              </Button>
              <Button size="sm" variant="destructive" onClick={executarLimpeza} disabled={limpezaLoading}>
                {limpezaLoading ? 'Limpando...' : 'Confirmar limpeza'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
