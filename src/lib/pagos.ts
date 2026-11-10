// Cálculo del pago al operario por línea de venta (según snapshot del producto).
import { Decimal, d2 } from './money'

export interface DatosPagoLinea {
  tipo: string // FIJO | PORCENTAJE (pagoOperarioTipoSnapshot)
  valor: Decimal // pagoOperarioValorSnapshot
  cantidad: number
  subtotalCUP: Decimal
  operarioAsignado?: boolean // sin operario asignado no hay pago
}

/**
 * Pago que genera una línea de venta para el operario asignado:
 *  - FIJO: valor (CUP) × cantidad de unidades.
 *  - PORCENTAJE: subtotalCUP × valor / 100.
 */
export function calcularPagoLinea(datos: DatosPagoLinea): Decimal {
  if (datos.operarioAsignado === false) return new Decimal(0)
  if (datos.tipo === 'PORCENTAJE') {
    return d2(datos.subtotalCUP.times(datos.valor).dividedBy(100))
  }
  return d2(datos.valor.times(datos.cantidad))
}
