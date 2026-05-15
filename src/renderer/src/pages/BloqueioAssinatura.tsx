import { Lock, Phone } from 'lucide-react'

export function BloqueioAssinatura() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 rounded-2xl mb-6 shadow-xl">
          <Lock className="text-white w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">
          Acesso suspenso
        </h1>

        <p className="text-slate-400 text-sm leading-relaxed mb-8">
          Seu período de teste encerrou ou sua assinatura está inativa.
          Para continuar usando o <strong className="text-slate-300">ERP Set Tecnologia</strong>,
          entre em contato com a Set Tecnologia e regularize sua assinatura.
        </p>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 text-left space-y-3">
          <p className="text-slate-300 text-sm font-semibold">Set Tecnologia</p>
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Phone className="w-4 h-4 shrink-0" />
            <span>(41) 9 9999-9999</span>
          </div>
        </div>

        <p className="text-slate-600 text-xs mt-8">
          ERP Set Tecnologia — sistema fornecido por Set Tecnologia
        </p>
      </div>
    </div>
  )
}
