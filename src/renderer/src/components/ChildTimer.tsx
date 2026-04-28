import { useTimer } from '@/hooks/useTimer'
import { cn } from '@/lib/utils'

interface ChildTimerProps {
  entradaEm: string
  className?: string
}

export function ChildTimer({ entradaEm, className }: ChildTimerProps) {
  const { horas, minutos, total } = useTimer(entradaEm)

  const urgente = total >= 120
  const alerta = total >= 90 && total < 120

  return (
    <span className={cn(
      'font-mono font-semibold tabular-nums',
      urgente && 'text-red-600',
      alerta && 'text-yellow-600',
      !urgente && !alerta && 'text-green-700',
      className
    )}>
      {horas > 0 ? `${horas}h ` : ''}{String(minutos).padStart(2, '0')}min
    </span>
  )
}
