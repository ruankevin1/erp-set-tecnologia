import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { CheckCircle, AlertTriangle, Wifi } from 'lucide-react'
import { ESTABELECIMENTO_ID } from '@/lib/supabase'

interface Props {
  onAtivado: () => void
}

export function Ativacao({ onAtivado }: Props) {
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [jwtKey, setJwtKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  async function ativar() {
    if (!url.trim() || !anonKey.trim() || !jwtKey.trim()) {
      setErro('Preencha todos os campos.')
      return
    }
    setLoading(true)
    setErro('')
    try {
      const res = await window.api.sync.fetchConfig(
        url.trim(),
        jwtKey.trim(),
        ESTABELECIMENTO_ID,
        anonKey.trim()
      )
      if (!res.success) {
        setErro(res.error ?? 'Não foi possível conectar. Verifique as credenciais.')
        setLoading(false)
        return
      }
      await window.api.settings.set('supabase_url', url.trim())
      await window.api.settings.set('supabase_anon_key', anonKey.trim())
      await window.api.settings.set('supabase_key', jwtKey.trim())
      await window.api.settings.set('app_ativado', '1')
      setSucesso(true)
      setTimeout(() => onAtivado(), 1200)
    } catch {
      setErro('Erro de conexão. Verifique a URL e tente novamente.')
    }
    setLoading(false)
  }

  async function pularSemSync() {
    await window.api.settings.set('app_ativado', '1')
    onAtivado()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">ERP Set Tecnologia</h1>
          <p className="text-sm text-muted-foreground">Configure a conexão para começar</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="w-4 h-4" />
              Conexão com o servidor
            </CardTitle>
            <CardDescription>
              Insira as credenciais fornecidas pela Set Tecnologia
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>URL do projeto</Label>
              <Input
                value={url}
                onChange={(e) => { setUrl(e.target.value); setErro('') }}
                placeholder="https://xxx.supabase.co"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Anon Key</Label>
              <Input
                type="password"
                value={anonKey}
                onChange={(e) => { setAnonKey(e.target.value); setErro('') }}
                placeholder="eyJhbGci..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Token JWT do cliente</Label>
              <Input
                type="password"
                value={jwtKey}
                onChange={(e) => { setJwtKey(e.target.value); setErro('') }}
                placeholder="eyJhbGci..."
                onKeyDown={(e) => e.key === 'Enter' && ativar()}
              />
            </div>

            {erro && (
              <div className="flex items-start gap-2 text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{erro}</span>
              </div>
            )}

            {sucesso && (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 text-xs">
                <CheckCircle className="w-4 h-4" />
                <span>Conectado com sucesso! Abrindo o sistema...</span>
              </div>
            )}

            <Button onClick={ativar} disabled={loading || sucesso} className="w-full">
              {loading ? 'Conectando...' : 'Conectar e ativar'}
            </Button>

            <button
              type="button"
              onClick={pularSemSync}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center pt-1"
            >
              Usar sem sincronização
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
