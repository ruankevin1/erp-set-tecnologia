import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

// SQLite datetime('now') stores UTC as "YYYY-MM-DD HH:MM:SS" (space, no Z); parse as UTC
function parseDate(date: string | Date): Date {
  if (typeof date === 'string' && date.includes(' ') && !date.includes('Z') && !date.includes('+')) {
    return new Date(date.replace(' ', 'T') + 'Z')
  }
  return new Date(date)
}

export function formatTime(date: string | Date): string {
  return parseDate(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(date: string | Date): string {
  return parseDate(date).toLocaleDateString('pt-BR')
}

export function formatDateTime(date: string | Date): string {
  return parseDate(date).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export function calcularIdade(dataNascimento: string): number {
  const nasc = new Date(dataNascimento)
  const hoje = new Date()
  let idade = hoje.getFullYear() - nasc.getFullYear()
  const m = hoje.getMonth() - nasc.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--
  return idade
}

export function calcularDuracao(
  entrada: string,
  saida?: string,
  pausas?: Array<{ inicio: string; fim: string | null }>
): { horas: number; minutos: number; total: number } {
  const inicioMs = new Date(entrada).getTime()
  const fimMs = saida ? new Date(saida).getTime() : Date.now()
  let totalMs = fimMs - inicioMs

  const pausasArr = Array.isArray(pausas) ? pausas : []
  if (pausasArr.length > 0) {
    for (const p of pausasArr) {
      const pInicio = new Date(p.inicio).getTime()
      const pFim = p.fim ? new Date(p.fim).getTime() : fimMs
      totalMs -= (pFim - pInicio)
    }
  }

  const total = Math.max(0, Math.floor(totalMs / 60000))
  return { horas: Math.floor(total / 60), minutos: total % 60, total }
}

export function formatDuracao(entrada: string, saida?: string): string {
  const { horas, minutos } = calcularDuracao(entrada, saida)
  if (horas === 0) return `${minutos}min`
  return `${horas}h ${minutos}min`
}

export function calcularValorAtual(minutos: number, config: {
  valor_base: number
  minutos_base: number
  faixas_intermediarias: string
  franquia_minutos: number
  valor_bloco: number
  minutos_por_bloco: number
}): number {
  if (minutos <= config.minutos_base) return config.valor_base

  const faixas: { ate_minutos: number; valor: number }[] = JSON.parse(config.faixas_intermediarias || '[]')
  faixas.sort((a, b) => a.ate_minutos - b.ate_minutos)

  for (const f of faixas) {
    if (minutos <= f.ate_minutos) return f.valor
  }

  const base = faixas.length > 0 ? faixas[faixas.length - 1].valor : config.valor_base
  const extra = minutos - config.franquia_minutos
  if (extra <= 0) return base
  const blocos = Math.floor(extra / config.minutos_por_bloco)
  return base + blocos * config.valor_bloco
}

export function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i)
  let d1 = (sum * 10) % 11
  if (d1 >= 10) d1 = 0
  if (d1 !== parseInt(digits[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i)
  let d2 = (sum * 10) % 11
  if (d2 >= 10) d2 = 0
  return d2 === parseInt(digits[10])
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  const len = digits.length
  if (len === 0) return ''
  if (len <= 2) return `(${digits}`
  if (len <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (len <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function validatePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length === 10 || digits.length === 11
}

export function getCorFaixa(
  minutos: number,
  config: { minutos_base: number; franquia_minutos: number }
): 'verde' | 'amarelo' | 'vermelho' {
  if (minutos <= config.minutos_base) return 'verde'
  if (minutos <= config.franquia_minutos) return 'amarelo'
  return 'vermelho'
}

export function calcularProximoAcrescimo(
  minutos: number,
  config: {
    minutos_base: number
    faixas_intermediarias: string
    franquia_minutos: number
    minutos_por_bloco: number
  }
): { minutos_restantes: number; modo_bloco: boolean } | null {
  const faixas: { ate_minutos: number }[] = JSON.parse(config.faixas_intermediarias || '[]')
  faixas.sort((a, b) => a.ate_minutos - b.ate_minutos)

  if (minutos > config.franquia_minutos) {
    const extra = minutos - config.franquia_minutos
    const currentBlocos = Math.floor(extra / config.minutos_por_bloco)
    const nextChange = config.franquia_minutos + (currentBlocos + 1) * config.minutos_por_bloco
    return { minutos_restantes: nextChange - minutos, modo_bloco: true }
  }

  let nextChange: number
  if (minutos <= config.minutos_base) {
    nextChange = config.minutos_base + 1
  } else {
    const prox = faixas.find(f => minutos <= f.ate_minutos)
    if (prox && prox.ate_minutos === config.franquia_minutos) {
      // Última faixa: próximo acréscimo só após bloco completo
      nextChange = config.franquia_minutos + config.minutos_por_bloco
    } else {
      nextChange = prox ? prox.ate_minutos + 1 : config.franquia_minutos + config.minutos_por_bloco
    }
  }

  const rest = nextChange - minutos
  return rest <= 5 ? { minutos_restantes: rest, modo_bloco: false } : null
}
