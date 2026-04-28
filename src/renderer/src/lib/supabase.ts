import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://odoglrxtlojkbqhortiy.supabase.co'

// Anon key pública do projeto Supabase — necessária para requests REST
// PREENCHER com a anon key do painel: supabase.com → projeto → Settings → API
export const SUPABASE_ANON_KEY = 'PREENCHER_ANON_KEY'

export const supabase = (() => {
  try { return createClient(SUPABASE_URL, SUPABASE_ANON_KEY) } catch { return null }
})()

export const ESTABELECIMENTO_ID =
  import.meta.env.VITE_ESTABELECIMENTO_ID ?? '539eef80-ec1a-4567-98a2-f5dd0ab1c8c4'

export function isOnline(): boolean {
  return navigator.onLine && supabase !== null
}
