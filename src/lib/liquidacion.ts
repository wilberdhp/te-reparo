// Cálculo de la liquidación diaria de operarios — funciones PURAS (testeables).
//
// Reglas del PRD §4.6 (interpretación documentada):
//  - VENDEDOR de taller (presencial): la base del grupo es el TOTAL vendido por el
//    taller ese día (todas las ventas) y ese total se paga ÍNTEGRO a cada operario
//    vendedor presencial activo del taller, incluido el que vendió 0.
//  - INFORMATICO / ELECTRONICO: acumulado individual (suma del pago por línea según
//    snapshot). El reparto equitativo se calcula solo como vista de referencia
//    (total del día ÷ técnicos activos del taller) y NO afecta el monto pagado.
//  - VENDEDOR_ONLINE: pago individual por sus propias ventas del día en ese taller
//    (líneas asignadas a su operario), sin regla grupal.
//  - ADMIN: porcentajeAdmin × total vendido del taller ese día (default 0) MÁS el
//    pago individual de las líneas de venta que tenga asignadas (snapshot).
//  - Los ajustes (devoluciones post-cierre) se restan de la línea del operario.
import { Decimal, d2 } from './money'
import { calcularPagoLinea } from './pagos'

export interface ItemLiquidacion {
  operarioId: string | null
  cantidad: number
  subtotalCUP: Decimal
  /** Costo interno de la línea ya convertido a CUP (tasa snapshot de la venta). */
  costoAdicionalCUP?: Decimal | null
  pagoOperarioTipoSnapshot: string
  pagoOperarioValorSnapshot: Decimal
}

export interface VentaLiquidacion {
  id: string
  codigo: string
  totalCUP: Decimal
  vendedorUsuarioId: string
  items: ItemLiquidacion[]
}

export interface OperarioLiq {
  id: string
  nombre: string
  rama: string
  esOnline: boolean // operario vinculado a un usuario VENDEDOR_ONLINE
  usuarioId: string | null
}

export interface AjusteLiq {
  id: string
  operarioId: string
  montoCUP: Decimal // negativo
  motivo: string
  devolucionId: string | null
}

export interface DetalleLinea {
  tipo: string
  base?: string
  formula?: string
  lineas?: number
  ventas?: number
  repartoEquitativo?: string
  ajustes?: Array<{ motivo: string; monto: string }>
}

export interface LineaCalculada {
  operarioId: string
  operarioNombre: string
  rama: string
  tipo: 'GRUPO' | 'INDIVIDUAL' | 'ONLINE' | 'ADMIN_PCT' | 'AJUSTE'
  montoCUP: Decimal
  detalle: DetalleLinea
}

export interface ResultadoLiquidacion {
  totalVentasDia: Decimal
  totalLiquidacion: Decimal
  lineas: LineaCalculada[]
}

/** Pago individual acumulado de un operario por las líneas que tiene asignadas. */
function acumuladoIndividual(operarioId: string, ventas: VentaLiquidacion[]): { monto: Decimal; lineas: number } {
  let monto = new Decimal(0)
  let lineas = 0
  for (const v of ventas) {
    for (const it of v.items) {
      if (it.operarioId === operarioId) {
        monto = monto.plus(
          calcularPagoLinea({
            tipo: it.pagoOperarioTipoSnapshot,
            valor: it.pagoOperarioValorSnapshot,
            cantidad: it.cantidad,
            subtotalCUP: it.subtotalCUP,
            costoAdicionalCUP: it.costoAdicionalCUP,
            operarioAsignado: true,
          })
        )
        lineas++
      }
    }
  }
  return { monto: d2(monto), lineas }
}

export function calcularLiquidacion(input: {
  ventas: VentaLiquidacion[]
  operarios: OperarioLiq[]
  ajustes: AjusteLiq[]
  porcentajeAdmin: Decimal
}): ResultadoLiquidacion {
  const { ventas, operarios, ajustes, porcentajeAdmin } = input

  const totalVentasDia = d2(ventas.reduce((acc, v) => acc.plus(v.totalCUP), new Decimal(0)))
  const tecnicos = operarios.filter((o) => o.rama === 'INFORMATICO' || o.rama === 'ELECTRONICO')
  const repartoEquitativo =
    tecnicos.length > 0 ? d2(totalVentasDia.dividedBy(tecnicos.length)) : new Decimal(0)

  const lineas: LineaCalculada[] = []
  const porOperario = new Map<string, LineaCalculada>()

  for (const op of operarios) {
    let linea: LineaCalculada | null = null

    if (op.rama === 'VENDEDOR' && op.esOnline) {
      // Vendedor en línea: individual por sus propias ventas
      const propias = ventas.filter((v) => op.usuarioId && v.vendedorUsuarioId === op.usuarioId)
      let monto = new Decimal(0)
      let nLineas = 0
      for (const v of propias) {
        for (const it of v.items) {
          if (it.operarioId === op.id) {
            monto = monto.plus(
              calcularPagoLinea({
                tipo: it.pagoOperarioTipoSnapshot,
                valor: it.pagoOperarioValorSnapshot,
                cantidad: it.cantidad,
                subtotalCUP: it.subtotalCUP,
                costoAdicionalCUP: it.costoAdicionalCUP,
                operarioAsignado: true,
              })
            )
            nLineas++
          }
        }
      }
      linea = {
        operarioId: op.id,
        operarioNombre: op.nombre,
        rama: op.rama,
        tipo: 'ONLINE',
        montoCUP: d2(monto),
        detalle: {
          tipo: 'Pago individual por sus ventas del día',
          ventas: propias.length,
          lineas: nLineas,
          formula: 'Σ pagoOperario de líneas propias',
        },
      }
    } else if (op.rama === 'VENDEDOR') {
      // Vendedor presencial: regla grupal — total del taller íntegro a cada uno
      linea = {
        operarioId: op.id,
        operarioNombre: op.nombre,
        rama: op.rama,
        tipo: 'GRUPO',
        montoCUP: totalVentasDia,
        detalle: {
          tipo: 'Regla grupal: total vendido del taller',
          base: totalVentasDia.toFixed(2),
          ventas: ventas.length,
          formula: 'total taller del día (íntegro a cada vendedor activo)',
        },
      }
    } else if (op.rama === 'INFORMATICO' || op.rama === 'ELECTRONICO') {
      const ind = acumuladoIndividual(op.id, ventas)
      linea = {
        operarioId: op.id,
        operarioNombre: op.nombre,
        rama: op.rama,
        tipo: 'INDIVIDUAL',
        montoCUP: ind.monto,
        detalle: {
          tipo: 'Acumulado individual por líneas asignadas',
          lineas: ind.lineas,
          repartoEquitativo: repartoEquitativo.toFixed(2), // solo referencia
          formula: 'Σ pagoOperario snapshot (FIJO×cant | %×(subtotal−costo int.))',
        },
      }
    } else if (op.rama === 'ADMIN') {
      // El admin cobra el porcentajeAdmin global sobre el total del día MÁS el
      // pago de las líneas de venta que tenga asignadas (snapshot del producto).
      // Antes las líneas asignadas a un operario ADMIN se ignoraban: una venta
      // con pago PORCENTAJE (p. ej. 5%) asignada al admin liquidaba en 0.
      const ind = acumuladoIndividual(op.id, ventas)
      const pct = d2(totalVentasDia.times(porcentajeAdmin).dividedBy(100))
      linea = {
        operarioId: op.id,
        operarioNombre: op.nombre,
        rama: op.rama,
        tipo: 'ADMIN_PCT',
        montoCUP: d2(ind.monto.plus(pct)),
        detalle: {
          tipo: 'Porcentaje del admin + líneas asignadas',
          base: totalVentasDia.toFixed(2),
          lineas: ind.lineas,
          formula: `${porcentajeAdmin.toFixed(2)}% × total del día + Σ pagoOperario de líneas asignadas`,
        },
      }
    }

    if (linea) {
      lineas.push(linea)
      porOperario.set(op.id, linea)
    }
  }

  // Ajustes (negativos) — se suman a la línea del operario o crean línea de ajuste
  for (const aj of ajustes) {
    let linea = porOperario.get(aj.operarioId)
    if (!linea) {
      const op = operarios.find((o) => o.id === aj.operarioId)
      linea = {
        operarioId: aj.operarioId,
        operarioNombre: op?.nombre ?? 'Operario',
        rama: op?.rama ?? 'VENDEDOR',
        tipo: 'AJUSTE',
        montoCUP: new Decimal(0),
        detalle: { tipo: 'Ajustes (devoluciones post-cierre)', ajustes: [] },
      }
      lineas.push(linea)
      porOperario.set(aj.operarioId, linea)
    }
    linea.montoCUP = d2(linea.montoCUP.plus(aj.montoCUP))
    linea.detalle.ajustes = linea.detalle.ajustes ?? []
    linea.detalle.ajustes.push({ motivo: aj.motivo, monto: aj.montoCUP.toFixed(2) })
  }

  const totalLiquidacion = d2(lineas.reduce((acc, l) => acc.plus(l.montoCUP), new Decimal(0)))
  return { totalVentasDia, totalLiquidacion, lineas }
}
