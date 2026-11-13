import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth, requireTaller } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { devolucionSchema } from '@/lib/validaciones'
import { serializar, D, d2 } from '@/lib/money'
import { esServicio } from '@/lib/constantes'
import { siguienteSecuencia, codigoDevolucion } from '@/lib/codigos'
import { claveHoy, claveDiaSiguiente } from '@/lib/fecha'
import { calcularPagoLinea } from '@/lib/pagos'

/**
 * GET /api/devoluciones?id= | ?ventaId= — detalle para ticket / historial.
 */
export const GET = route(async (req: NextRequest) => {
  await requireAuth(req)
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const ventaId = url.searchParams.get('ventaId')

  const where = id ? { id } : ventaId ? { ventaId } : null
  if (!where) throw new ApiError(400, 'Especifique id o ventaId')

  const devoluciones = await db.devolucion.findMany({
    where,
    include: {
      usuario: { select: { nombre: true, username: true } },
      venta: {
        include: {
          taller: true,
          cliente: { select: { nombre: true } },
          items: { include: { producto: { select: { nombre: true, tipo: true } } } },
        },
      },
      items: {
        include: {
          ventaItem: {
            include: {
              producto: { select: { nombre: true, codigoInterno: true } },
              operario: { select: { nombre: true, rama: true } },
            },
          },
        },
      },
      ajustes: { include: { liquidacion: { select: { fecha: true, estado: true } } } },
    },
    orderBy: { fecha: 'desc' },
  })
  return NextResponse.json(serializar({ devoluciones }))
})

/**
 * POST /api/devoluciones — totales o parciales (ADMIN y vendedor).
 * Transacción atómica:
 *  1. Validar cantidades devolvibles por ítem.
 *  2. Crear Devolucion + items (destino DEFECTUOSO).
 *  3. Movimiento DEVOLUCION_DEFECTUOSO (NO re-incorpora al stock vendible).
 *  4. Actualizar cantidadDevuelta y estado de la venta.
 *  5. Impacto en liquidación:
 *     - liquidación del día ABIERTA → ajustes negativos en ella (recalcula).
 *     - liquidación del día CERRADA → AjusteLiquidacion en la del DÍA SIGUIENTE
 *       (se crea ABIERTA si no existe).
 *  Solo los ítems con operario asignado generan ajuste (esos generaron pago);
 *  los ítems sin operario no tenían pago individual (documentado).
 */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const datos = devolucionSchema.parse(await req.json())

  // Verificación de taller ANTES de la transacción (VENTEDOR: solo devoluciones de su taller)
  const ventaPrev = await db.venta.findUnique({
    where: { id: datos.ventaId },
    select: { tallerId: true },
  })
  if (!ventaPrev) throw new ApiError(404, 'Venta no encontrada')
  await requireTaller(req, usuario, ventaPrev.tallerId, { permitirInactivo: true })

  const resultado = await db.$transaction(async (tx) => {
    const venta = await tx.venta.findUnique({
      where: { id: datos.ventaId },
      include: { items: true, taller: true },
    })
    if (!venta) throw new ApiError(404, 'Venta no encontrada')
    if (venta.estado === 'DEVUELTA_TOTAL') throw new ApiError(400, 'La venta ya fue devuelta total')

    // Validaciones por ítem + cálculo del total a devolver
    interface DevolucionPrep {
      ventaItemId: string
      cantidad: number
      motivo: string
      subtotalDevuelto: import('decimal.js').Decimal
      operarioId: string | null
      productoNombre: string
      productoTipo: string
      pagoAfectado: import('decimal.js').Decimal
    }
    const items: DevolucionPrep[] = []
    let totalCUP = D(0)

    for (const di of datos.items) {
      const vi = venta.items.find((i) => i.id === di.ventaItemId)
      if (!vi) throw new ApiError(400, 'Ítem no pertenece a la venta')
      const disponible = vi.cantidad - vi.cantidadDevuelta
      if (di.cantidad > disponible) {
        throw new ApiError(400, `No se pueden devolver ${di.cantidad} de ${vi.cantidad - vi.cantidadDevuelta} disponibles`)
      }
      const subtotalDevuelto = d2(D(vi.subtotalCUP).dividedBy(vi.cantidad).times(di.cantidad))
      totalCUP = totalCUP.plus(subtotalDevuelto)

      // Pago al operario que se revierte (proporcional según snapshot)
      const pagoAfectado = vi.operarioId
        ? d2(
            calcularPagoLinea({
              tipo: vi.pagoOperarioTipoSnapshot,
              valor: D(vi.pagoOperarioValorSnapshot),
              cantidad: di.cantidad,
              subtotalCUP: d2(D(vi.subtotalCUP).dividedBy(vi.cantidad).times(di.cantidad)),
              operarioAsignado: true,
            })
          )
        : D(0)

      const producto = await tx.producto.findUnique({ where: { id: vi.productoId } })
      items.push({
        ventaItemId: vi.id,
        cantidad: di.cantidad,
        motivo: di.motivo,
        subtotalDevuelto,
        operarioId: vi.operarioId,
        productoNombre: producto?.nombre ?? '',
        productoTipo: producto?.tipo ?? 'VENTA',
        pagoAfectado,
      })
    }

    const seq = await siguienteSecuencia(tx, 'devolucion')
    const codigo = codigoDevolucion(seq)

    const devolucion = await tx.devolucion.create({
      data: {
        ventaId: venta.id,
        usuarioId: usuario.id,
        motivo: datos.motivo,
        totalCUP: d2(totalCUP),
        codigo,
      },
    })

    for (const it of items) {
      await tx.devolucionItem.create({
        data: {
          devolucionId: devolucion.id,
          ventaItemId: it.ventaItemId,
          cantidad: it.cantidad,
          motivo: it.motivo,
          destino: 'DEFECTUOSO',
        },
      })

      // Movimiento DEVOLUCION_DEFECTUOSO (solo productos físicos; delta stock = 0:
      // el defectuoso NO se reincorpora al stock vendible)
      if (!esServicio(it.productoTipo)) {
        const vi = venta.items.find((i) => i.id === it.ventaItemId)!
        const producto = await tx.producto.findUnique({ where: { id: vi.productoId } })
        await tx.movimientoInventario.create({
          data: {
            productoId: vi.productoId,
            tipo: 'DEVOLUCION_DEFECTUOSO',
            cantidad: it.cantidad,
            costoUnitario: D(producto?.costo ?? 0),
            usuarioId: usuario.id,
            devolucionId: devolucion.id,
            nota: `Devolución ${codigo}: ${it.motivo}`,
          },
        })
      }

      await tx.ventaItem.update({
        where: { id: it.ventaItemId },
        data: { cantidadDevuelta: { increment: it.cantidad } },
      })

      // Ajuste de liquidación por operario (negativo, proporcional al pago)
      if (it.operarioId && it.pagoAfectado.gt(0)) {
        const ajuste = await resolverLiquidacionAjuste(tx, venta.tallerId, codigo, it.motivo)
        await tx.ajusteLiquidacion.create({
          data: {
            liquidacionId: ajuste.id,
            operarioId: it.operarioId,
            montoCUP: it.pagoAfectado.negated(),
            motivo: `Devolución ${codigo} (${it.productoNombre}): ${it.motivo}`,
            devolucionId: devolucion.id,
          },
        })
      }
    }

    // Estado de la venta
    const itemsActualizados = await tx.ventaItem.findMany({ where: { ventaId: venta.id } })
    const todoDevuelto = itemsActualizados.every((i) => i.cantidadDevuelta >= i.cantidad)
    const algoDevuelto = itemsActualizados.some((i) => i.cantidadDevuelta > 0)
    await tx.venta.update({
      where: { id: venta.id },
      data: { estado: todoDevuelto ? 'DEVUELTA_TOTAL' : algoDevuelto ? 'DEVUELTA_PARCIAL' : 'COMPLETADA' },
    })

    return { devolucion, codigo, totalCUP: d2(totalCUP), ventaEstado: todoDevuelto ? 'DEVUELTA_TOTAL' : 'DEVUELTA_PARCIAL', tallerId: venta.tallerId }
  })

  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: resultado.tallerId,
    accion: 'DEVOLUCION',
    entidad: 'Devolucion',
    entidadId: resultado.devolucion.id,
    resultado: 'OK',
    antes: { venta: datos.ventaId, estado: 'COMPLETADA' },
    despues: { codigo: resultado.codigo, totalCUP: resultado.totalCUP.toFixed(2), estadoVenta: resultado.ventaEstado },
  })

  return NextResponse.json(serializar({ devolucion: resultado.devolucion, codigo: resultado.codigo }))
})

/**
 * Resuelve a qué liquidación va el ajuste de una devolución:
 *  - liquidación del día ABIERTA (o inexistente → se crea) → esa.
 *  - liquidación del día CERRADA → la del día siguiente (se crea ABIERTA si no existe).
 */
async function resolverLiquidacionAjuste(
  tx: import('@prisma/client').Prisma.TransactionClient,
  tallerId: string,
  codigo: string,
  _motivo: string
): Promise<{ id: string }> {
  // Clave del día civil en la zona del negocio (medianoche UTC de la etiqueta,
  // estable en BD — ver lib/fecha.ts)
  const hoy = claveHoy()
  const liqHoy = await tx.liquidacionOperario.findUnique({
    where: { tallerId_fecha: { tallerId, fecha: hoy } },
  })

  if (!liqHoy || liqHoy.estado === 'ABIERTA') {
    if (liqHoy) return liqHoy
    return tx.liquidacionOperario.create({
      data: { tallerId, fecha: hoy, estado: 'ABIERTA', totalCUP: D(0) },
    })
  }

  // Cerrada → día siguiente (se crea si no existe)
  const manana = claveDiaSiguiente(hoy)
  const liqManana = await tx.liquidacionOperario.findUnique({
    where: { tallerId_fecha: { tallerId, fecha: manana } },
  })
  if (liqManana) return liqManana
  return tx.liquidacionOperario.create({
    data: { tallerId, fecha: manana, estado: 'ABIERTA', totalCUP: D(0) },
  })
}
