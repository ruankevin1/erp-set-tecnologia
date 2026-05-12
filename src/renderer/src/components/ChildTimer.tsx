import { useTimer } from '@/hooks/useTimer'
import { cn } from '@/lib/utils'

type Pausa = { inicio: string; fim: string | null }

interface ChildTimerProps {
  entradaEm: string
  pausas?: Pausa[]
  className?: string
}

export function ChildTimer({ entradaEm, pausas, className }: ChildTimerProps) {
  const { horas, minutos, total, pausado } = useTimer(entradaEm, pausas)

  const urgente = !pausado && total >= 120
  const alerta = !pausado && total >= 90 && total < 120

  return (
    <span className={cn(
      'font-mono font-semibold tabular-nums',
      pausado && 'text-blue-500',
      urgente && 'text-red-600',
      alerta && 'text-yellow-600',
      !pausado && !urgente && !alerta && 'text-green-700',
      className
    )}>
      {horas > 0 ? `${horas}h ` : ''}{String(minutos).padStart(2, '0')}min
      {pausado && ' ⏸'}
    </span>
  )
}
