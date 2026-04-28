import { create } from 'zustand'

export interface Usuario {
  id: string
  nome: string
  login: string
  perfil: 'admin' | 'operador'
  master: boolean
  senhapadrao?: boolean
}

interface AuthState {
  usuario: Usuario | null
  setUsuario: (u: Usuario | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  usuario: null,
  setUsuario: (usuario) => set({ usuario }),
  logout: () => set({ usuario: null }),
}))
