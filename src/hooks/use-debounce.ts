'use client'
import { useEffect, useState } from 'react'

/** Devuelve el valor tras `ms` de estabilidad (debounce para búsquedas manuales). */
export function useDebounce<T>(valor: T, ms = 300): T {
  const [debounced, setDebounced] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return debounced
}
