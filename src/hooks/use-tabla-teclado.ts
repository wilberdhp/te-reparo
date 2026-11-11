'use client'
import { useCallback, useState } from 'react'

/**
 * Navegación por teclado en tablas (§3.3 del prompt de UI/UX):
 *   ↑/↓ mueven la fila · Inicio/Fin primera/última · Enter abre · Supr elimina.
 *
 * Convención: las filas se renderizan con {...propsFila(i)} dentro de un
 * contenedor con data-tabla="filas". Las filas reciben data-fila={i},
 * tabIndex 0 y el manejador de teclado.
 */
export interface OpcionesTablaTeclado {
  total: number
  onAbrir?: (indice: number) => void
  onEliminar?: (indice: number) => void
  habilitado?: boolean
}

export function useTablaTeclado({ total, onAbrir, onEliminar, habilitado = true }: OpcionesTablaTeclado) {
  const [indiceEstado, setIndice] = useState(-1)
  // Ajuste durante el render (sin efecto): si la lista se acorta, se limita el índice
  const indice = Math.min(indiceEstado, total - 1)

  const enfocarFila = useCallback((i: number) => {
    const filas = document.querySelectorAll<HTMLElement>('[data-tabla="filas"] [data-fila]')
    const destino = Math.max(0, Math.min(i, filas.length - 1))
    filas[destino]?.focus()
    setIndice(destino)
  }, [])

  const propsFila = useCallback(
    (i: number) => ({
      'data-fila': i,
      tabIndex: 0,
      'aria-selected': indice === i,
      onClick: () => setIndice(i),
      onFocus: () => setIndice(i),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (!habilitado) return
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault()
            enfocarFila(i + 1)
            break
          case 'ArrowUp':
            e.preventDefault()
            enfocarFila(i - 1)
            break
          case 'Home':
            e.preventDefault()
            enfocarFila(0)
            break
          case 'End':
            e.preventDefault()
            enfocarFila(total - 1)
            break
          case 'Enter':
            e.preventDefault()
            onAbrir?.(i)
            break
          case 'Delete':
            e.preventDefault()
            onEliminar?.(i)
            break
        }
      },
    }),
    [indice, total, habilitado, enfocarFila, onAbrir, onEliminar]
  )

  return { indice, setIndice, propsFila }
}
