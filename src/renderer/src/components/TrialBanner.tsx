import { Clock, AlertTriangle } from 'lucide-react'
import { useStore } from '@/store/useStore'

export function TrialBanner() {
  const { assinaturaStatus, assinaturaDiasRestantes } = useStore()

  if (assinaturaStatus !== 'trial') return null

  const dias = assinaturaDiasRestantes ?? 0
  const critico = dias <= 2

  const texto =
    dias <= 0
      ? 'Seu período de teste encerrou'
      : dias === 1
      ? 'Último dia do período de teste'
      : `${dias} dias restantes no período de teste`

  return (
    <div className={`flex items-center gap-2 px-4 py-2 text-sm border-b ${
      critico
        ? 'bg-red-50 border-red-200 text-red-800'
        : 'bg-amber-50 border-amber-200 text-amber-800'
    }`}>
      {critico
        ? <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
        : <Clock className="w-4 h-4 shrink-0 text-amber-500" />
      }
      <span>
        <strong>{texto}</strong>
        {' — '}
        Entre em contato com a <strong>Set Tecnologia</strong> para continuar usando o sistema.
      </span>
    </div>
  )
}
