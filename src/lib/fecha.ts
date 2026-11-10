// Utilidades de fecha — el "día" de liquidación usa la zona horaria del servidor
// (configurar TZ=America/Havana en producción, ver docs/DEPLOY.md).

/** Normaliza una fecha al inicio del día local (00:00:00.000). */
export function inicioDia(fecha: Date = new Date()): Date {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Inicio del día siguiente. */
export function finDia(fecha: Date = new Date()): Date {
  const d = inicioDia(fecha)
  d.setDate(d.getDate() + 1)
  return d
}

/** 'YYYY-MM-DD' en hora local. */
export function fechaCorta(fecha: Date = new Date()): string {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parsea 'YYYY-MM-DD' a Date local a medianoche (nulo si es inválida). */
export function parseFechaCorta(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  return isNaN(fecha.getTime()) ? null : fecha
}

/** Fecha/hora legible: '09/11/2026 14:05' */
export function fechaHora(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`
}
