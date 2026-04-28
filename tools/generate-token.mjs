// tools/generate-token.mjs
// Uso: SUPABASE_JWT_SECRET=xxx SUPABASE_REF=xxx node tools/generate-token.mjs <uuid> "<nome>"
import { createHmac } from 'crypto'

const secret  = process.env.SUPABASE_JWT_SECRET
const ref     = process.env.SUPABASE_REF        // project ref, ex: odoglrxtlojkbqhortiy
const estabId = process.argv[2]
const nome    = process.argv[3] ?? ''

if (!secret || !ref || !estabId) {
  console.error('Uso: SUPABASE_JWT_SECRET=xxx SUPABASE_REF=xxx node tools/generate-token.mjs <uuid> "<nome>"')
  process.exit(1)
}

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

const iat = Math.floor(Date.now() / 1000)
const exp = iat + (10 * 365 * 24 * 60 * 60)

const header  = base64url({ alg: 'HS256', typ: 'JWT' })
const payload = base64url({ iss: 'supabase', ref, role: 'anon', iat, exp, estabelecimento_id: estabId, nome })

const signature = createHmac('sha256', secret)
  .update(`${header}.${payload}`)
  .digest('base64')
  .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

const token = `${header}.${payload}.${signature}`

console.log('\n=== TOKEN GERADO ===')
console.log(token)
console.log('\n=== CONFIGURAR NO APP ===')
console.log(`Estabelecimento : ${nome}`)
console.log(`ID              : ${estabId}`)
console.log(`Ref             : ${ref}`)
console.log('Cole este token no campo "Token JWT do cliente" nas Configurações.\n')
