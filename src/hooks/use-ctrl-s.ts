'use client'
import { useEffect, useRef } from 'react'

/**
 * Ctrl + S / Cmd + S para guardar el formulario actual.
 * Previene el comportamiento nativo del navegador (guardar página).
 */
export function useGuardarConCtrlS(guardar: () => void, habilitado = true) {
  const ref = useRef(guardar)
  useEffect(() => {
    ref.current = guardar
  })
  useEffect(() => {
    if (!habilitado) return
    function alPulsar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        ref.current()
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [habilitado])
}
