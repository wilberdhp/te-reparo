import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { transferenciaSchema } from '@/lib/validaciones'
import { serializar, D } from '@/lib/money'
import { esServicio } from '@/lib/constantes'

/**
 * GET /api/transferencias?tallerId= — historial (cualquier rol autenticado, del taller).
 */
export const GET = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const tallerId = new URL(req.url).searchParams.get('tallerId')
  if (usuario.rol === 'VENDEDOR' && tallerId !== usuario.tallerId) {
    throw new ApiError(403, 'Solo puede ver transferencias de su taller')
  }
  const transferencias = await db.transferencia.findMany({
    where: tallerId ? { OR: [{ tallerOrigenId: tallerId }, { tallerDestinoId: tallerId }] } : undefined,
    include: {
      producto: { select: { nombre: true, codigoInterno: true } },
      tallerOrigen: { select: { nombre: true } },
      tallerDestino: { select: { nombre: true } },
      usuario: { select: { nombre: true } },
    },
    orderBy: { fecha: 'desc' },
    take: 200,
  })
  return NextResponse.json(serializar({ transferencias }))
})

/**
 * POST /api/transferencias — SOLO ADMIN (PRD §4.1).
 * Transacción atómica: TRANSFERENCIA_SALIDA en origen y TRANSFERENCIA_ENTRADA en
 * destino con el mismo costo. En destino se usa (o crea) el producto con el mismo
 * código interno, de modo que el stock llegue al inventario de ese taller.
 */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req, ['ADMIN'])
  const datos = transferenciaSchema.parse(await req.json())

  const resultado = await db.$transaction(async (tx) => {
    const producto = await tx.producto.findUnique({ where: { id: datos.productoId } })
    if (!producto) throw new ApiError(404, 'Producto no encontrado')
    if (esServicio(producto.tipo)) throw new ApiError(400, 'Los servicios no se transfieren')
    if (producto.tallerId === datos.tallerDestinoId) {
      throw new ApiError(400, 'El taller destino no puede ser el mismo que el origen')
    }
    if (producto.cantidad < datos.cantidad) {
      throw new ApiError(400, `Stock insuficiente: disponible ${producto.cantidad}`)
    }
    const destino = await tx.taller.findUnique({ where: { id: datos.tallerDestinoId } })
    if (!destino || !destino.activo) throw new ApiError(400, 'Taller destino inválido o inactivo')
    const origen = await tx.taller.findUnique({ where: { id: producto.tallerId } })

    // Producto equivalente en destino (mismo código interno); se crea si no existe
    let productoDestino = await tx.producto.findFirst({
      where: { tallerId: destino.id, codigoInterno: producto.codigoInterno },
    })
    if (!productoDestino) {
      productoDestino = await tx.producto.create({
        data: {
          tallerId: destino.id,
          codigoInterno: producto.codigoInterno,
          codigoBarras: producto.codigoBarras,
          categoria: producto.categoria,
          nombre: producto.nombre,
          tipo: producto.tipo,
          cantidad: 0,
          costo: producto.costo,
          unidad: producto.unidad,
          stockMinimo: 0,
          precio: producto.precio,
          monedaPrecio: producto.monedaPrecio,
          pagoOperarioTipo: producto.pagoOperarioTipo,
          pagoOperarioValor: producto.pagoOperarioValor,
          garantiaDias: producto.garantiaDias,
          activo: true,
        },
      })
    }

    const transferencia = await tx.transferencia.create({
      data: {
        tallerOrigenId: producto.tallerId,
        tallerDestinoId: destino.id,
        productoId: producto.id,
        cantidad: datos.cantidad,
        usuarioId: usuario.id,
        nota: datos.nota ?? null,
      },
    })

    await tx.movimientoInventario.create({
      data: {
        productoId: producto.id,
        tipo: 'TRANSFERENCIA_SALIDA',
        cantidad: datos.cantidad,
        costoUnitario: D(producto.costo),
        usuarioId: usuario.id,
        transferenciaId: transferencia.id,
        nota: `Transferencia a ${destino.nombre}${datos.nota ? ': ' + datos.nota : ''}`,
      },
    })
    await tx.producto.update({
      where: { id: producto.id },
      data: { cantidad: producto.cantidad - datos.cantidad },
    })

    await tx.movimientoInventario.create({
      data: {
        productoId: productoDestino.id,
        tipo: 'TRANSFERENCIA_ENTRADA',
        cantidad: datos.cantidad,
        costoUnitario: D(producto.costo),
        usuarioId: usuario.id,
        transferenciaId: transferencia.id,
        nota: `Transferencia desde ${origen?.nombre ?? 'taller origen'}${datos.nota ? ': ' + datos.nota : ''}`,
      },
    })
    await tx.producto.update({
      where: { id: productoDestino.id },
      data: { cantidad: productoDestino.cantidad + datos.cantidad },
    })

    return { transferencia, producto }
  })

  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: resultado.producto.tallerId,
    accion: 'TRANSFERENCIA',
    entidad: 'Transferencia',
    entidadId: resultado.transferencia.id,
    resultado: 'OK',
    despues: {
      producto: resultado.producto.nombre,
      cantidad: datos.cantidad,
      destino: datos.tallerDestinoId,
    },
  })
  return NextResponse.json(serializar({ transferencia: resultado.transferencia }))
})
