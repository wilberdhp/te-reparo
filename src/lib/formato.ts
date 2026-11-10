'use client'
// Formateo y etiquetas para la UI (espejo de las librerías de servidor).

export const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  VENDEDOR: 'Vendedor',
  VENDEDOR_ONLINE: 'Vendedor en línea',
}

export const RAMA_LABEL: Record<string, string> = {
  VENDEDOR: 'Vendedor',
  INFORMATICO: 'Informático',
  ELECTRONICO: 'Electrónico',
  ADMIN: 'Administración',
}

export const TIPO_PRODUCTO_LABEL: Record<string, string> = {
  VENTA: 'Producto',
  SERVICIO_ELECTRONICA: 'Servicio (electrónica)',
  SERVICIO_INFORMATICA: 'Servicio (informática)',
}

export const METODO_PAGO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  ZELLE: 'Zelle',
}

export const MOVIMIENTO_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada',
  VENTA: 'Venta',
  DEVOLUCION_DEFECTUOSO: 'Devolución (defectuoso)',
  BAJA_DEFECTUOSO: 'Baja por defectuoso',
  AJUSTE: 'Ajuste',
  TRANSFERENCIA_SALIDA: 'Transf. salida',
  TRANSFERENCIA_ENTRADA: 'Transf. entrada',
}

export const ESTADO_VENTA_LABEL: Record<string, string> = {
  COMPLETADA: 'Completada',
  DEVUELTA_PARCIAL: 'Devuelta parcial',
  DEVUELTA_TOTAL: 'Devuelta total',
}

export function esServicio(tipo: string): boolean {
  return tipo === 'SERVICIO_ELECTRONICA' || tipo === 'SERVICIO_INFORMATICA'
}

function separarMiles(entero: string): string {
  const neg = entero.startsWith('-')
  const digits = neg ? entero.slice(1) : entero
  const partes: string[] = []
  for (let i = digits.length; i > 0; i -= 3) partes.unshift(digits.slice(Math.max(0, i - 3), i))
  return (neg ? '-' : '') + partes.join('.')
}

/** 1234.5 → "1.234,50" */
export function fmt(v: number | string | null | undefined, decimales = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0)
  if (!isFinite(n)) return '0,00'
  const fijo = n.toFixed(decimales)
  const [entero, dec] = fijo.split('.')
  return `${separarMiles(entero)},${dec}`
}

export function fmtCUP(v: number | string | null | undefined): string {
  return `${fmt(v)} CUP`
}

export function fmtMoneda(v: number | string | null | undefined, moneda: string): string {
  return `${fmt(v)} ${moneda}`
}

export function fmtFechaHora(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`
}

export function fmtFechaCorta(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Convierte monto en moneda a CUP con tasas dadas (espejo del servidor). Acepta number|string. */
export function aCUP(monto: number | string, moneda: string, tasas: { USD: number; EUR: number }): number {
  const n = typeof monto === 'string' ? parseFloat(monto) : (monto ?? 0)
  if (!isFinite(n)) return 0
  if (moneda === 'USD') return redondear(n * tasas.USD)
  if (moneda === 'EUR') return redondear(n * tasas.EUR)
  return redondear(n)
}

function redondear(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}
