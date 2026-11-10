import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth, requireTaller } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { garantiaSchema } from '@/lib/validaciones'
import { serializar, D } from '@/lib/money'
import { esServicio } from '@/lib/constantes'

/**
 * GET /api/garantias?clienteId= | ?ventaItemId= | ?q= — reclamos con vencimiento.
 */
export const GET = route(async (req: NextRequest) => {
  await requireAuth(req)
  const url = new URL(req.url)
  const clienteId = url.searchParams.get('clienteId')
  const ventaItemId = url.searchParams.get('ventaItemId')

  const garantias = await db.garantia.findMany({
    where: ventaItemId ? { ventaItemId } : undefined,
    include: {
      ventaItem: {
        include: {
          producto: { select: { nombre: true, tipo: true } },
          operario: { select: { nombre: true, rama: true } },
          venta: {
            include: {
              cliente: { select: { id: true, nombre: true } },
              taller: { select: { nombre: true } },
            },
          },
        },
      },
      movimiento: { select: { tipo: true, cantidad: true, nota: true } },
    },
    orderBy: { fechaReclamo: 'desc' },
    take: 300,
  })

  const filtradas = clienteId
    ? garantias.filter((g) => g.ventaItem.venta.cliente?.id === clienteId)
    : garantias

  const hoy = new Date()
  const conVencimiento = filtradas.map((g) => {
    const fechaVenta = new Date(g.ventaItem.venta.fecha)
    const vence =
      g.ventaItem.garantiaDiasSnapshot > 0
        ? new Date(fechaVenta.getTime() + g.ventaItem.garantiaDiasSnapshot * 86400000)
        : null
    return { ...g, vence, vigente: vence ? vence >= hoy : false }
  })

  return NextResponse.json(serializar({ garantias: conVencimiento }))
})

/**
 * POST /api/garantias — registrar reclamo (Opción C del PRD §4.4):
 *  - REPARACION: solo registro (sin pago al operario, sin venta a precio 0).
 *  - REEMPLAZO: movimiento de salida del producto de reemplazo (AJUSTE) +
 *    baja del defectuoso (BAJA_DEFECTUOSO, sin impacto en stock vendible:
 *    la unidad salió del stock en la venta original).
 *  NUNCA genera pago al operario ni venta a precio 0.
 */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const datos = garantiaSchema.parse(await req.json())

  // Verificación de taller ANTES de la transacción
  const itemPrev = await db.ventaItem.findUnique({
    where: { id: datos.ventaItemId },
    select: { venta: { select: { tallerId: true } } },
  })
  if (!itemPrev) throw new ApiError(404, 'Ítem de venta no encontrado')
  await requireTaller(req, usuario, itemPrev.venta.tallerId, { permitirInactivo: true })

  const resultado = await db.$transaction(async (tx) => {
    const ventaItem = await tx.ventaItem.findUnique({
      where: { id: datos.ventaItemId },
      include: { venta: true, producto: true },
    })
    if (!ventaItem) throw new ApiError(404, 'Ítem de venta no encontrado')

    const garantia = await tx.garantia.create({
      data: {
        ventaItemId: ventaItem.id,
        fechaReclamo: new Date(),
        descripcion: datos.descripcion,
        tipo: datos.tipo,
        movimientoInventarioId: null,
      },
    })

    if (datos.tipo === 'REEMPLAZO') {
      if (!datos.productoReemplazoId) {
        throw new ApiError(400, 'La garantía REEMPLAZO requiere producto de reemplazo')
      }
      const reemplazo = await tx.producto.findUnique({ where: { id: datos.productoReemplazoId } })
      if (!reemplazo) throw new ApiError(404, 'Producto de reemplazo no encontrado')
      if (esServicio(reemplazo.tipo)) throw new ApiError(400, 'El reemplazo debe ser un producto físico')
      if (reemplazo.tallerId !== ventaItem.venta.tallerId) {
        throw new ApiError(400, 'El producto de reemplazo debe ser del mismo taller que la venta')
      }
      const cantidad = datos.cantidadReemplazo ?? 1
      if (reemplazo.cantidad < cantidad) {
        throw new ApiError(400, `Stock insuficiente del reemplazo: disponible ${reemplazo.cantidad}`)
      }

      // Salida del producto de reemplazo (movimiento AJUSTE negativo)
      const movSalida = await tx.movimientoInventario.create({
        data: {
          productoId: reemplazo.id,
          tipo: 'AJUSTE',
          cantidad: -cantidad, // AJUSTE con signo: salida
          costoUnitario: D(reemplazo.costo),
          usuarioId: usuario.id,
          nota: `Salida por garantía REEMPLAZO — venta ${ventaItem.venta.codigo}`,
        },
      })
      await tx.producto.update({
        where: { id: reemplazo.id },
        data: { cantidad: { decrement: cantidad } },
      })
      await tx.garantia.update({
        where: { id: garantia.id },
        data: { movimientoInventarioId: movSalida.id },
      })

      // Baja del defectuoso recibido (delta 0: ya se descontó en la venta original)
      if (!esServicio(ventaItem.producto.tipo)) {
        await tx.movimientoInventario.create({
          data: {
            productoId: ventaItem.productoId,
            tipo: 'BAJA_DEFECTUOSO',
            cantidad: 1,
            costoUnitario: D(ventaItem.producto.costo),
            usuarioId: usuario.id,
            nota: `Defectuoso recibido por garantía REEMPLAZO — venta ${ventaItem.venta.codigo}`,
          },
        })
      }
    }

    return { garantia, ventaCodigo: ventaItem.venta.codigo, tallerId: ventaItem.venta.tallerId }
  })

  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: resultado.tallerId,
    accion: 'GARANTIA',
    entidad: 'Garantia',
    entidadId: resultado.garantia.id,
    resultado: 'OK',
    despues: { tipo: datos.tipo, venta: resultado.ventaCodigo, descripcion: datos.descripcion },
  })

  return NextResponse.json(serializar({ garantia: resultado.garantia }))
})
