// Utilidades de fecha.
//
// El "día" del negocio (liquidaciones diarias, panel del día, filtros por
// fecha) se define en la ZONA HORARIA DEL TALLER — America/Havana por defecto,
// configurable con la variable de entorno ZONA_HORARIA — y NO según la zona
// horaria del servidor. Antes los cortes de día usaban la medianoche del
// servidor (UTC en desarrollo): una venta hecha en Cuba a las 19:11 (00:11 UTC
// del día siguiente) quedaba fuera de la liquidación del día civil del
// usuario y "no se sumaba".
//
// Las CLAVES de día en la base de datos (LiquidacionOperario.fecha) se guardan
// como la medianoche UTC de la etiqueta 'YYYY-MM-DD': son estables aunque
// cambie la zona horaria del servidor (un cambio de TZ no duplica registros ni
// deja huérfanos). La ventana de consulta de cada día sí se calcula en la zona
// del negocio con ventanaDia().

const ZONA_NEGOCIO = process.env.ZONA_HORARIA || 'America/Havana'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Partes de la fecha civil (año/mes/día) de un instante, en la zona del negocio. */
function partesCiviles(fecha: Date): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_NEGOCIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [y, m, d] = fmt.format(fecha).split('-').map(Number)
  return { y, m, d }
}

/** Desfase en ms de la zona del negocio respecto a UTC en el instante dado. */
function offsetZona(fecha: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_NEGOCIO,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const partes: Record<string, number> = {}
  for (const p of fmt.formatToParts(fecha)) if (p.type !== 'literal') partes[p.type] = Number(p.value)
  return (
    Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour % 24, partes.minute, partes.second) -
    fecha.getTime()
  )
}

/**
 * Medianoche civil (en la zona del negocio) de la etiqueta 'YYYY-MM-DD'.
 * El desfase se mide a mediodía de la zona (las transiciones de horario de
 * verano en Cuba ocurren alrededor de la medianoche local, nunca al mediodía).
 */
function medianocheCivil(y: number, m: number, d: number): Date {
  const base = new Date(Date.UTC(y, m - 1, d))
  const sonda = new Date(base.getTime() + 12 * 3600000)
  return new Date(base.getTime() - offsetZona(sonda))
}

/** Etiqueta 'YYYY-MM-DD' del día civil (zona del negocio) que contiene `fecha`. */
export function fechaCorta(fecha: Date = new Date()): string {
  const { y, m, d } = partesCiviles(fecha)
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** Etiqueta 'YYYY-MM-DD' de una CLAVE de día en BD (medianoche UTC de la etiqueta). */
export function etiquetaDeClave(clave: Date): string {
  return `${clave.getUTCFullYear()}-${pad2(clave.getUTCMonth() + 1)}-${pad2(clave.getUTCDate())}`
}

/**
 * CLAVE de día en BD: medianoche UTC de 'YYYY-MM-DD' (null si es inválida).
 * Estable ante cambios de zona horaria del servidor.
 */
export function parseFechaCorta(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const clave = new Date(Date.UTC(y, m - 1, d))
  // descarta etiquetas que se normalizan a otra fecha (p. ej. 2026-13-40)
  return isNaN(clave.getTime()) || etiquetaDeClave(clave) !== s ? null : clave
}

/** Ventana civil del día 'YYYY-MM-DD' en la zona del negocio: [inicio, fin). */
export function ventanaDia(etiqueta: string): { inicio: Date; fin: Date } {
  const [y, m, d] = etiqueta.split('-').map(Number)
  return {
    inicio: medianocheCivil(y, m, d),
    fin: medianocheCivil(y, m, d + 1), // Date.UTC normaliza el día 32 → mes siguiente
  }
}

/** Clave del día de HOY (según la zona del negocio). */
export function claveHoy(): Date {
  return parseFechaCorta(fechaCorta())!
}

/** Clave del día siguiente a una clave dada. */
export function claveDiaSiguiente(clave: Date): Date {
  const [y, m, d] = etiquetaDeClave(clave).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1))
}

/**
 * Inicio del día civil (zona del negocio) que contiene `fecha`.
 * Para consultar por una CLAVE de BD usar ventanaDia(etiquetaDeClave(clave)).
 */
export function inicioDia(fecha: Date = new Date()): Date {
  return ventanaDia(fechaCorta(fecha)).inicio
}

/** Inicio del día civil siguiente (zona del negocio). */
export function finDia(fecha: Date = new Date()): Date {
  return ventanaDia(fechaCorta(fecha)).fin
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
