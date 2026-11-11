// Cálculo del pago al operario por línea de venta (según snapshot del producto).
//
// PROMPT DE ACTUALIZACIÓN (Costos Internos):
//  - FIJO: el pago sigue siendo el valor fijo; el costoAdicional NO afecta este pago.
//  - PORCENTAJE: MontoPagoOperario = (subtotalCUP − costoAdicionalEnCUP) × valor / 100.
//    Si (subtotal − costo) es negativo, el pago se calcula en 0 (no se pagan montos
//    negativos). El costoAdicional se ingresa en la moneda del ítem y se convierte a
//    CUP con la tasa snapshot de la venta antes de llegar aquí (ver liquidaciones).
import { Decimal, d2, D, convertirACUP, type Tasas } from './money'

export interface DatosPagoLinea {
  tipo: string // FIJO | PORCENTAJE (pagoOperarioTipoSnapshot)
  valor: Decimal // pagoOperarioValorSnapshot
  cantidad: number
  subtotalCUP: Decimal
  /** Costo interno de la línea ya convertido a CUP (tasa snapshot de la venta). */
  costoAdicionalCUP?: Decimal | null
  operarioAsignado?: boolean // sin operario asignado no hay pago
}

/**
 * Pago que genera una línea de venta para el operario asignado:
 *  - FIJO: valor (CUP) × cantidad de unidades (el costo interno no lo afecta).
 *  - PORCENTAJE: (subtotalCUP − costoAdicionalCUP) × valor / 100, con base
 *    mínima de 0 (una pérdida del taller nunca genera pago negativo al operario).
 */
export function calcularPagoLinea(datos: DatosPagoLinea): Decimal {
  if (datos.operarioAsignado === false) return new Decimal(0)
  if (datos.tipo === 'PORCENTAJE') {
    const costo = D(datos.costoAdicionalCUP ?? 0)
    const base = datos.subtotalCUP.minus(costo)
    if (base.lte(0)) return new Decimal(0) // no se pagan montos negativos
    return d2(base.times(datos.valor).dividedBy(100))
  }
  return d2(datos.valor.times(datos.cantidad))
}

/**
 * Convierte el costoAdicional (ingresado en la moneda del ítem) a CUP usando
 * las tasas SNAPSHOT de la venta — requisito §2.1 del prompt de actualización.
 */
export function costoAdicionalEnCUP(
  costoAdicional: Decimal.Value | null | undefined,
  moneda: string,
  tasas: Tasas
): Decimal {
  return convertirACUP(D(costoAdicional as Decimal.Value ?? 0), moneda, tasas)
}
