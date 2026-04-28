import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Usuario } from '@/store/useAuthStore'
import setIcon from '@/assets/icon.png'

interface LoginProps {
  onLogin: (usuario: Usuario) => void
}

export function Login({ onLogin }: LoginProps) {
  const [loginInput, setLoginInput] = useState('')
  const [senha, setSenha] = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!loginInput.trim() || !senha) return
    setLoading(true)
    setErro('')
    try {
      const res = await window.api.auth.login(loginInput.trim(), senha)
      if (res.ok) {
        onLogin(res.usuario)
      } else {
        setErro(res.erro ?? 'Usuário ou senha incorretos')
      }
    } catch {
      setErro('Erro interno ao fazer login')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <img src={setIcon} alt="Set Tecnologia" className="w-20 h-20 rounded-full object-cover shadow-md" />
            <div className="text-center">
              <h1 className="text-xl font-bold text-slate-900">ERP Set Tecnologia</h1>
              <p className="text-sm text-slate-500 mt-0.5">Sistema de Gestão de Playground</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-input" className="text-slate-700">Usuário</Label>
              <Input
                id="login-input"
                type="text"
                autoFocus
                autoComplete="username"
                value={loginInput}
                onChange={(e) => { setLoginInput(e.target.value); setErro('') }}
                placeholder="Digite seu usuário"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha-input" className="text-slate-700">Senha</Label>
              <div className="relative">
                <Input
                  id="senha-input"
                  type={showSenha ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => { setSenha(e.target.value); setErro('') }}
                  placeholder="Digite sua senha"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(v => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {erro && (
              <p className="text-sm text-red-600 text-center">{erro}</p>
            )}

            <Button
              type="submit"
              className="w-full bg-violet-600 hover:bg-violet-700"
              disabled={loading || !loginInput.trim() || !senha}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Sistema fornecido por Set Tecnologia
        </p>
      </div>
    </div>
  )
}
