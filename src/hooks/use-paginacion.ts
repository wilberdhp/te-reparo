'use client'
// Paginación del lado del cliente para las tablas de listado (prompt §3/§4):
//   - el estado (página/límite) se guarda en la URL como ?{clave}_page=2&{clave}_limit=50
//     con history.replaceState (sin recargar, sin navegar) → al recargar o
//     compartir el enlace la tabla vuelve a la página guardada;
//   - la clave por tabla (inv/ven/cli/log/…) evita colisiones entre módulos;
//   - al cambiar un filtro la vista llama reiniciar() → página 1 (§1).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { LIMITES_PAGINA, LIMITE_DEFECTO } from '@/lib/paginacion'

export interface UsePaginacion {
  pagina: number
  limite: number
  total: number
  totalPaginas: number
  /** Parámetros listos para la URL de la API (?page=&limit=). */
  params: URLSearchParams
  /** Fija el total devuelto por el servidor; recorta la página si quedó fuera de rango. */
  fijarMeta: (total: number) => void
  /** Cambia de página (1-index). */
  cambiarPagina: (p: number) => void
  /** Cambia el tamaño de página y vuelve a la página 1. */
  cambiarLimite: (l: number) => void
  /** Vuelve a la página 1 (cambio de filtro/búsqueda/taller). */
  reiniciar: () => void
}

export function usePaginacion(clave: string, limiteInicial: number = LIMITE_DEFECTO): UsePaginacion {
  const [pagina, setPagina] = useState(() => {
    if (typeof window === 'undefined') return 1
    const v = Number(new URLSearchParams(window.location.search).get(`${clave}_page`))
    return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1
  })
  const [limite, setLimite] = useState(() => {
    if (typeof window === 'undefined') return limiteInicial
    const v = Number(new URLSearchParams(window.location.search).get(`${clave}_limit`))
    return (LIMITES_PAGINA as readonly number[]).includes(v) ? v : limiteInicial
  })
  const [total, setTotal] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)

  // ---- Sincroniza el estado con la URL (replaceState: no recarga la pantalla) ----
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    if (pagina > 1) sp.set(`${clave}_page`, String(pagina))
    else sp.delete(`${clave}_page`)
    if (limite !== LIMITE_DEFECTO) sp.set(`${clave}_limit`, String(limite))
    else sp.delete(`${clave}_limit`)
    const qs = sp.toString()
    window.history.replaceState(null, '', qs ? `/?${qs}` : '/')
  }, [clave, pagina, limite])

  const fijarMeta = useCallback(
    (nuevoTotal: number) => {
      const t = Number.isFinite(nuevoTotal) && nuevoTotal >= 0 ? Math.floor(nuevoTotal) : 0
      setTotal(t)
      const paginas = Math.max(1, Math.ceil(t / limite))
      setTotalPaginas(paginas)
      // Si la página actual quedó fuera de rango (p. ej. borraron registros),
      // salta a la última página válida — dispara el re-fetch correcto.
      setPagina((p) => (p > paginas ? paginas : p))
    },
    [limite]
  )

  const cambiarPagina = useCallback((p: number) => {
    setPagina((prev) => Math.max(1, Math.floor(p)) === prev ? prev : Math.max(1, Math.floor(p)))
  }, [])

  const cambiarLimite = useCallback((l: number) => {
    if (!(LIMITES_PAGINA as readonly number[]).includes(l)) return
    setLimite((prev) => (prev === l ? prev : l))
    setPagina(1)
  }, [])

  const reiniciar = useCallback(() => setPagina(1), [])

  // Parámetros estables para la URL de la API (?page=&limit=): ident memoizada
  // para que las dependencias de los efectos de carga no cambien en cada render.
  const params = useMemo(() => {
    const sp = new URLSearchParams()
    sp.set('page', String(pagina))
    sp.set('limit', String(limite))
    return sp
  }, [pagina, limite])

  return { pagina, limite, total, totalPaginas, params, fijarMeta, cambiarPagina, cambiarLimite, reiniciar }
}
