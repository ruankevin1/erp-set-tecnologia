import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, LogIn, Monitor, LogOut, BarChart3,
  Settings, WifiOff, Loader2, CheckCircle, Users, CloudOff, ArrowUpCircle, MessageCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { Badge } from './ui/badge'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/entrada', icon: LogIn, label: 'Entrada' },
  { to: '/cadastros', icon: Users, label: 'Cadastros' },
  { to: '/monitoramento', icon: Monitor, label: 'Monitoramento' },
  { to: '/saida', icon: LogOut, label: 'Saída' },
  { to: '/relatorios', icon: BarChart3, label: 'Relatórios' },
  { to: '/configuracoes', icon: Settings, label: 'Configurações' }
]

export function Sidebar() {
  const { visitasAtivas, syncStatus, isSyncing, isOnline, updateDownloaded, updateVersion, nomeEstabelecimento } = useStore()
  const totalPendente = syncStatus
    ? Object.values(syncStatus.pendentes).reduce((a, b) => a + b, 0)
    : 0

  const statusInfo = (() => {
    if (!isOnline) return {
      icon: <WifiOff className="w-3 h-3 text-red-400 shrink-0" />,
      label: totalPendente > 0
        ? `Offline — ${totalPendente} pendente${totalPendente !== 1 ? 's' : ''}`
        : 'Offline',
      color: 'text-red-400'
    }
    if (isSyncing) return {
      icon: <Loader2 className="w-3 h-3 text-yellow-400 shrink-0 animate-spin" />,
      label: 'Sincronizando...',
      color: 'text-yellow-400'
    }
    if (totalPendente > 0) return {
      icon: <CloudOff className="w-3 h-3 text-orange-400 shrink-0" />,
      label: `${totalPendente} pendente${totalPendente !== 1 ? 's' : ''}`,
      color: 'text-orange-400'
    }
    return {
      icon: <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />,
      label: 'Online ✓',
      color: 'text-green-400'
    }
  })()

  return (
    <aside className="w-56 bg-slate-900 text-slate-100 flex flex-col h-screen shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-700 flex items-center justify-center">
        <p className="font-bold text-sm text-center leading-tight">{nomeEstabelecimento}</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1">
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

      {/* Status */}
      <div className="px-4 py-3 border-t border-slate-700">
        <div className="flex items-center gap-2 text-xs">
          {statusInfo.icon}
          <span className={cn('truncate', statusInfo.color)}>{statusInfo.label}</span>
        </div>
      </div>

      {/* Rodapé fixo */}
      <div className="px-4 py-3 border-t border-slate-800 space-y-2">
        <div>
          <p className="text-[10px] text-slate-500">Desenvolvido por Set Tecnologia</p>
          <p className="text-[10px] text-slate-500">(54) 9 9297-7120</p>
        </div>
        <button
          onClick={() => window.open('https://wa.me/5554992977120?text=Olá,%20preciso%20de%20suporte%20no%20ERP%20Set%20Tecnologia')}
          className="flex items-center gap-1.5 text-[11px] text-green-400 hover:text-green-300 transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5 shrink-0" />
          Suporte via WhatsApp
        </button>
      </div>
    </aside>
  )
}
