import { Clock, AlertTriangle } from 'lucide-react'
import { useStore } from '@/store/useStore'

const TELEFONE = '(54) 9 9297-7120'

export function TrialBanner() {
  const { assinaturaStatus, assinaturaDiasRestantes } = useStore()

  if (assinaturaStatus !== 'trial') return null

  const dias = assinaturaDiasRestantes ?? 0
  const expirado = dias <= 0
  const critico = dias <= 2 // inclui expirado

  let texto: string
  if (expirado) {
    texto = `Período de teste encerrou. Entre em contato para contratar: ${TELEFONE}.`
  } else if (dias === 1) {
    texto = `Último dia do período de teste. Entre em contato para contratar: ${TELEFONE}.`
  } else if (critico) {
    texto = `Faltam ${dias} dias do seu teste. Entre em contato para contratar: ${TELEFONE}.`
  } else {
    texto = `Restam ${dias} dias do seu período de teste. Em caso de dúvidas, fale com a Set Tecnologia: ${TELEFONE}.`
  }

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
      <span>{texto}</span>
    </div>
  )
}
