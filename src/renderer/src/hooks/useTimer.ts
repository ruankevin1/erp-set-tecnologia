import { useState, useEffect } from 'react'
import { calcularDuracao } from '../lib/utils'

export function useTimer(entradaEm: string, ativo = true) {
  const [duracao, setDuracao] = useState(() => calcularDuracao(entradaEm))

  useEffect(() => {
    if (!ativo) return
    const interval = setInterval(() => {
      setDuracao(calcularDuracao(entradaEm))
    }, 5000)
    return () => clearInterval(interval)
  }, [entradaEm, ativo])

  return duracao
}
