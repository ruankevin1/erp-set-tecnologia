import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, LogIn, Monitor, LogOut, BarChart3,
  Settings, WifiOff, Loader2, CheckCircle, Users, CloudOff, ArrowUpCircle, MessageCircle, Power
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { useAuthStore } from '@/store/useAuthStore'
import { Badge } from './ui/badge'
import { version } from '../../../../package.json'

const allNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Visão Geral', roles: ['admin', 'operador'] },
  { to: '/entrada', icon: LogIn, label: 'Entrada', roles: ['admin', 'operador'] },
  { to: '/cadastros', icon: Users, label: 'Cadastros', roles: ['admin', 'operador'] },
  { to: '/monitoramento', icon: Monitor, label: 'Monitoramento', roles: ['admin', 'operador'] },
  { to: '/saida', icon: LogOut, label: 'Saída', roles: ['admin', 'operador'] },
  { to: '/relatorios', icon: BarChart3, label: 'Relatórios', roles: ['admin'] },
  { to: '/configuracoes', icon: Settings, label: 'Configurações', roles: ['admin'] },
]

export function Sidebar() {
  const { visitasAtivas, syncStatus, isSyncing, isOnline, updateDownloaded, updateVersion, nomeEstabelecimento } = useStore()
  const { usuario, logout } = useAuthStore()
  const navItems = allNavItems.filter(item => !usuario || item.roles.includes(usuario.perfil))
  const totalPendente = syncStatus
    ? Object.values(syncStatus.pendentes).reduce((a, b) => a + b, 0)
    : 0

  const syncState = (() => {
    if (!isOnline) return {
      icon: <WifiOff className="w-3.5 h-3.5 shrink-0" />,
      label: 'Sem conexão',
      sub: totalPendente > 0 ? `${totalPendente} registro${totalPendente !== 1 ? 's' : ''} aguardando` : undefined,
      color: 'text-red-400',
      border: 'border-red-500',
      bg: 'bg-red-950/30',
    }
    if (isSyncing) return {
      icon: <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />,
      label: 'Sincronizando...',
      sub: totalPendente > 0 ? `${totalPendente} registro${totalPendente !== 1 ? 's' : ''}` : undefined,
      color: 'text-yellow-400',
      border: 'border-yellow-500',
      bg: 'bg-yellow-950/30',
    }
    if (totalPendente > 0) return {
      icon: <CloudOff className="w-3.5 h-3.5 shrink-0" />,
      label: 'Pendente',
      sub: `${totalPendente} registro${totalPendente !== 1 ? 's' : ''} aguardando`,
      color: 'text-orange-400',
      border: 'border-orange-500',
      bg: 'bg-orange-950/30',
    }
    return {
      icon: <CheckCircle className="w-3.5 h-3.5 shrink-0" />,
      label: 'Sincronizado',
      sub: undefined,
      color: 'text-green-400',
      border: 'border-green-600',
      bg: 'bg-green-950/30',
    }
  })()

  return (
    <aside className="w-56 bg-slate-900 text-slate-100 flex flex-col h-screen shrink-0">
      {/* Cabeçalho do estabelecimento */}
      <div className="px-4 py-4 border-b border-slate-700">
        <div className="flex items-center gap-3" title={nomeEstabelecimento}>
          {/* Avatar com iniciais */}
          <div
            className="shrink-0 flex items-center justify-center text-white font-bold text-base select-none"
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
            }}
          >
            {nomeEstabelecimento
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0].toUpperCase())
              .join('')}
          </div>

          {/* Textos */}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-white text-sm leading-tight">
              {nomeEstabelecimento}
            </p>
          </div>
        </div>
      </div>

      {/* Status de sincronização */}
      <div className="px-3 pt-3 pb-1">
        <div className={cn('rounded-md px-3 py-2.5 border-l-2', syncState.bg, syncState.border)}>
          <div className="flex items-center gap-2">
            <span className={syncState.color}>{syncState.icon}</span>
            <span className={cn('text-xs font-semibold', syncState.color)}>{syncState.label}</span>
          </div>
          {syncState.sub && (
            <p className="text-[10px] text-slate-500 mt-0.5 ml-[22px]">{syncState.sub}</p>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{label}</span>
            {label === 'Monitoramento' && visitasAtivas.length > 0 && (
              <Badge className="ml-auto bg-violet-500 text-white text-xs px-1.5 py-0">{visitasAtivas.length}</Badge>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Atualização pendente */}
      {updateDownloaded && (
        <div className="px-4 py-2 border-t border-slate-700 bg-violet-900/40">
          <div className="flex items-center gap-2 text-xs text-violet-300">
            <ArrowUpCircle className="w-3 h-3 shrink-0" />
            <span className="truncate">v{updateVersion} pronta para instalar</span>
          </div>
        </div>
      )}

      {/* Usuário logado */}
      {usuario && (
        <div className="px-4 py-3 border-t border-slate-700">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{usuario.nome}</p>
              <p className="text-xs text-slate-400">
                {usuario.perfil === 'admin' ? 'Administrador' : 'Operador'}
              </p>
            </div>
            <button
              onClick={logout}
              title="Sair do sistema"
              className="text-slate-400 hover:text-red-400 transition-colors p-1"
            >
              <Power className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Rodapé fixo */}
      <div className="px-4 py-3 border-t border-slate-800 space-y-2">
        <div>
          <p className="text-xs text-slate-400 font-medium">Desenvolvido por Set Tecnologia</p>
          <p className="text-xs text-slate-500">(54) 9 9297-7120</p>
          <p className="text-xs text-slate-600">v{version}</p>
        </div>
        <button
          onClick={() => window.open('https://wa.me/5554992977120?text=Olá,%20preciso%20de%20suporte%20no%20ERP%20Set%20Tecnologia')}
          className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5 shrink-0" />
          Suporte via WhatsApp
        </button>
      </div>
    </aside>
  )
}
