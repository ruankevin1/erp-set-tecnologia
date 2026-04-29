import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  onAtivado: (estabelecimentoId: string) => void
}

function decodeJwt(jwt: string): Record<string, any> | null {
  try { return JSON.parse(atob(jwt.split('.')[1])) } catch { return null }
}

export function Ativacao({ onAtivado }: Props) {
  const [chave, setChave] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [restaurando, setRestaurando] = useState(false)

  async function ativar() {
    const chaveT = chave.trim()
    if (!chaveT) { setErro('Digite a chave de acesso.'); return }

    const payload = decodeJwt(chaveT)
    if (!payload) { setErro('Formato de chave inválido.'); return }
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      setErro('Chave de acesso expirada. Solicite uma nova chave à Set Tecnologia.')
      return
    }
    const estabId = payload.estabelecimento_id as string | undefined
    if (!estabId) { setErro('Chave inválida: estabelecimento não identificado.'); return }

    setLoading(true)
    setErro('')
    try {
      const res = await window.api.sync.fetchConfig(chaveT, estabId)
      if (!res.success) {
        const detail = (res as any).error ? ` (${(res as any).error})` : ''
        setErro(`Chave de acesso inválida.${detail} Verifique com a Set Tecnologia.`)
        setLoading(false)
        return
      }
      await window.api.settings.set('supabase_key', chaveT)
      await window.api.settings.set('app_ativado', '1')
      await window.api.settings.set('estabelecimento_id', estabId)
      if (payload.nome) await window.api.settings.set('estabelecimento_nome', String(payload.nome))
      setSucesso(true)
      setRestaurando(true)
      await window.api.sync.pullAll(estabId)
      setRestaurando(false)
      setTimeout(() => onAtivado(estabId), 800)
    } catch (err: any) {
      setErro(`Erro ao verificar chave: ${err?.message ?? 'falha de conexão'}. Verifique a internet.`)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-violet-600 rounded-2xl mb-4 shadow-xl">
            <span className="text-white text-2xl font-bold tracking-tight">S</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Bem-vindo ao ERP Set Tecnologia
          </h1>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            Digite a chave de acesso fornecida pela Set Tecnologia para ativar o sistema
          </p>
        </div>

        <Card className="border-0 shadow-2xl bg-white">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="space-y-1.5">
              <Label>Chave de acesso</Label>
              <Input
                value={chave}
                onChange={(e) => { setChave(e.target.value); setErro('') }}
                placeholder="Chave fornecida pela Set Tecnologia"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && !loading && !sucesso && ativar()}
              />
            </div>

            {erro && (
              <div className="flex items-start gap-2 text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{erro}</span>
              </div>
            )}

            {sucesso && (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 text-sm">
                {restaurando
                  ? <><RefreshCw className="w-4 h-4 shrink-0 animate-spin" /><span>Restaurando dados da nuvem...</span></>
                  : <><CheckCircle className="w-4 h-4 shrink-0" /><span>Sistema ativado! Entrando...</span></>
                }
              </div>
            )}

            <Button
              onClick={ativar}
              disabled={loading || sucesso}
              className="w-full bg-violet-600 hover:bg-violet-700"
            >
              {loading ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Verificando...</>
              ) : 'Ativar sistema'}
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-slate-500 text-xs mt-6">
          Sistema fornecido por Set Tecnologia
        </p>
      </div>
    </div>
  )
}
