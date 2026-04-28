import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

function hasValidCredentials(): boolean {
  return (
    !!supabaseUrl &&
    supabaseUrl.startsWith('https://') &&
    supabaseUrl.includes('.supabase.co') &&
    !supabaseUrl.includes('your-project') &&
    !!supabaseKey &&
    supabaseKey.length > 30 &&
    !supabaseKey.includes('your-anon-key')
  )
}

export const supabase = hasValidCredentials()
  ? (() => { try { return createClient(supabaseUrl, supabaseKey) } catch { return null } })()
  : null

export const ESTABELECIMENTO_ID =
  import.meta.env.VITE_ESTABELECIMENTO_ID ?? '539eef80-ec1a-4567-98a2-f5dd0ab1c8c4'

export function isOnline(): boolean {
  return navigator.onLine && supabase !== null
}
