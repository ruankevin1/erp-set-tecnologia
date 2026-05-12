import { useState, useEffect } from 'react'
import { calcularDuracao } from '../lib/utils'

type Pausa = { inicio: string; fim: string | null }

export function useTimer(entradaEm: string, pausas?: Pausa[], ativo = true) {
  const pausado = pausas?.some(p => p.fim === null) ?? false

  const [duracao, setDuracao] = useState(() => calcularDuracao(entradaEm, undefined, pausas))

  useEffect(() => {
    setDuracao(calcularDuracao(entradaEm, undefined, pausas))
    if (!ativo || pausado) return
    const interval = setInterval(() => {
      setDuracao(calcularDuracao(entradaEm, undefined, pausas))
    }, 5000)
    return () => clearInterval(interval)
  }, [entradaEm, pausas, ativo, pausado])

  return { ...duracao, pausado }
}
