// Manejo de dinero — SIEMPRE Decimal (nunca float), según requisito del PRD.
import Decimal from 'decimal.js'

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })
export { Decimal }

/** Crea un Decimal de forma tolerante (null/undefined → 0). */
export function D(v: Decimal.Value | null | undefined): Decimal {
  if (v === null || v === undefined || v === '') return new Decimal(0)
  try {
    return new Decimal(v as Decimal.Value)
  } catch {
    return new Decimal(0)
  }
}

/** Redondea a 2 decimales (ROUND_HALF_UP). */
export function d2(v: Decimal): Decimal {
  return v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

export interface Tasas {
  USD: Decimal
  EUR: Decimal
}

/**
 * Convierte un monto en `moneda` a CUP usando las tasas vigentes.
 * CUP: 1:1. USD/EUR: monto × tasa.
 */
export function convertirACUP(monto: Decimal, moneda: string, tasas: Tasas): Decimal {
  switch (moneda) {
    case 'USD':
      return d2(monto.times(tasas.USD))
    case 'EUR':
      return d2(monto.times(tasas.EUR))
    default:
      return d2(monto)
  }
}

/** Tasa implícita aplicada a un pago (CUP por unidad de moneda). */
export function tasaAplicada(moneda: string, tasas: Tasas): Decimal {
  switch (moneda) {
    case 'USD':
      return tasas.USD
    case 'EUR':
      return tasas.EUR
    default:
      return new Decimal(1)
  }
}

function separarMiles(entero: string): string {
  const neg = entero.startsWith('-')
  const digits = neg ? entero.slice(1) : entero
  const partes: string[] = []
  for (let i = digits.length; i > 0; i -= 3) {
    partes.unshift(digits.slice(Math.max(0, i - 3), i))
  }
  return (neg ? '-' : '') + partes.join('.')
}

/** Formato cubano habitual: 12.345,67 */
export function formatoNumero(v: Decimal | number | string): string {
  const d = D(v as Decimal.Value)
  const fijo = d2(d).toFixed(2)
  const [entero, dec] = fijo.split('.')
  return `${separarMiles(entero)},${dec}`
}

export function formatoCUP(v: Decimal | number | string): string {
  return `${formatoNumero(v)} CUP`
}

export function formatoMoneda(v: Decimal | number | string, moneda: string): string {
  return `${formatoNumero(v)} ${moneda}`
}

/** Convierte a número JS SOLO para serializar a JSON (pérdida controlada a 2 decimales). */
export function aNumero(v: Decimal | number | string): number {
  return d2(D(v as Decimal.Value)).toNumber()
}

/** Detecta Decimal de decimal.js O de Prisma (instanceof falla entre copias distintas). */
function esDecimal(v: unknown): boolean {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { toNumber?: unknown }).toNumber === 'function' &&
    typeof (v as { toFixed?: unknown }).toFixed === 'function' &&
    typeof (v as { times?: unknown }).times === 'function'
  )
}

/** Transforma recursivamente Decimals (decimal.js o Prisma) a números. */
function transformar(v: unknown): unknown {
  if (esDecimal(v)) return aNumero(v as Decimal)
  if (Array.isArray(v)) return v.map(transformar)
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const salida: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) salida[k] = transformar(val)
    return salida
  }
  return v
}

/** Serializa un objeto con Decimals a JSON plano (números a 2 decimales). */
export function serializar<T>(obj: T): T {
  return JSON.parse(JSON.stringify(transformar(obj))) as T
}
