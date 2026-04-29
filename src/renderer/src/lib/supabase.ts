import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://odoglrxtlojkbqhortiy.supabase.co'

export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = (() => {
  try { return createClient(SUPABASE_URL, SUPABASE_ANON_KEY) } catch { return null }
})()

export const ESTABELECIMENTO_ID =
  import.meta.env.VITE_ESTABELECIMENTO_ID ?? '539eef80-ec1a-4567-98a2-f5dd0ab1c8c4'

export function isOnline(): boolean {
  return navigator.onLine && supabase !== null
}
