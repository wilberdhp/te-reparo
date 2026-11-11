'use client'
// Componente de paginación reutilizable para todas las tablas de listado
// (prompt de actualización §3): texto informativo, Anterior/Siguiente con
// deshabilitado en los extremos, selector de tamaño de página y estado de
// carga sutil (spinner) sin recargar la pantalla.
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { LIMITES_PAGINA } from '@/lib/paginacion'

const nf = new Intl.NumberFormat('es')

interface TablePaginationProps {
  /** Página actual (1-index). */
  pagina: number
  totalPaginas: number
  /** Total de registros que coinciden con los filtros. */
  total: number
  /** Tamaño de página vigente. */
  limite: number
  /** Muestra un spinner sutil mientras llegan los datos. */
  cargando?: boolean
  onCambiarPagina: (pagina: number) => void
  onCambiarLimite: (limite: number) => void
}

export function TablePagination({
  pagina,
  totalPaginas,
  total,
  limite,
  cargando,
  onCambiarPagina,
  onCambiarLimite,
}: TablePaginationProps) {
  const primero = total === 0 ? 0 : (pagina - 1) * limite + 1
  const ultimo = Math.min(pagina * limite, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <p className="text-muted-foreground" aria-live="polite">
        {total === 0
          ? 'Sin registros'
          : `Mostrando del ${nf.format(primero)} al ${nf.format(ultimo)} de un total de ${nf.format(total)} registros`}
      </p>
      <div className="flex items-center gap-2">
        <nav aria-label="Paginación de la tabla" className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina <= 1 || cargando}
            onClick={() => onCambiarPagina(pagina - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
          </Button>
          <span className="px-2 text-muted-foreground tabular-nums whitespace-nowrap" aria-current="page">
            Página {pagina} de {Math.max(1, totalPaginas)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagina >= totalPaginas || cargando}
            onClick={() => onCambiarPagina(pagina + 1)}
            aria-label="Página siguiente"
          >
            Siguiente <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </nav>
        {cargando && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Cargando página" role="status" />
        )}
        <div className="flex items-center gap-1.5">
          <label htmlFor={`tp-limite-${limite}`} className="sr-only">
            Registros por página
          </label>
          <span className="text-muted-foreground hidden sm:inline">Filas:</span>
          <Select value={String(limite)} onValueChange={(v) => onCambiarLimite(Number(v))}>
            <SelectTrigger id={`tp-limite-${limite}`} className="w-[74px] h-8" aria-label="Registros por página">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMITES_PAGINA.map((l) => (
                <SelectItem key={l} value={String(l)}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

/** Filas "skeleton" para el cuerpo de la tabla mientras se trae la página
 * nueva (§3: no se recarga toda la pantalla, solo la tabla). */
export function FilasEsqueleto({ columnas, filas = 6 }: { columnas: number; filas?: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, f) => (
        <TableRow key={f} aria-hidden className="pointer-events-none">
          {Array.from({ length: columnas }, (_, c) => (
            <TableCell key={c}>
              <Skeleton
                className={`h-5 ${c === 0 ? 'w-[70%]' : 'w-[60%]'} ${c >= columnas - 2 ? 'ml-auto' : ''}`}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
