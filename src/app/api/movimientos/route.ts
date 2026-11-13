import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth, requireTaller } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import {
  entradaInventarioSchema,
  bajaDefectuosoSchema,
  ajusteInventarioSchema,
} from '@/lib/validaciones'
import { serializar, D, type Decimal } from '@/lib/money'
import { esServicio } from '@/lib/constantes'
import { ventanaDia } from '@/lib/fecha'

/**
 * GET /api/movimientos?productoId= | ?tallerId=&tipo=&desde=&hasta=
 * Historial de movimientos (por producto o por taller).
 */
export const GET = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const url = new URL(req.url)
  const productoId = url.searchParams.get('productoId')
  const tipo = url.searchParams.get('tipo')
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')

  let tallerId = url.searchParams.get('tallerId')
  if (productoId) {
    const producto = await db.producto.findUnique({ where: { id: productoId } })
    if (!producto) throw new ApiError(404, 'Producto no encontrado')
    await requireTaller(req, usuario, producto.tallerId, { permitirInactivo: true })
    tallerId = producto.tallerId
  } else {
    await requireTaller(req, usuario, tallerId, { permitirInactivo: true })
  }

  // Filtros por fecha civil en la zona del negocio (no la del servidor)
  const dDesde = desde ? ventanaDia(desde).inicio : null
  const dHasta = hasta ? ventanaDia(hasta).fin : null

  const movimientos = await db.movimientoInventario.findMany({
    where: {
      producto: { tallerId: tallerId ?? undefined },
      ...(productoId ? { productoId } : {}),
      ...(tipo ? { tipo } : {}),
      ...(dDesde || dHasta ? { fecha: { ...(dDesde ? { gte: dDesde } : {}), ...(dHasta ? { lt: dHasta } : {}) } } : {}),
    },
    include: {
      producto: { select: { nombre: true, codigoInterno: true, tipo: true } },
      usuario: { select: { nombre: true, username: true } },
    },
    orderBy: { fecha: 'desc' },
    take: 500,
  })
  return NextResponse.json(serializar({ movimientos }))
})

/**
 * POST /api/movimientos — Entrada de inventario / Baja por defectuoso / Ajuste.
 * El stock SOLO cambia mediante movimientos (dentro de transacción).
 *  - ENTRADA: admin y vendedor.
 *  - BAJA_DEFECTUOSO: admin y vendedor (descuenta stock, registra motivo y costo).
 *  - AJUSTE: solo ADMIN (cantidad con signo).
 */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const body = await req.json()
  const tipoAcción = body?.tipo as 'ENTRADA' | 'BAJA_DEFECTUOSO' | 'AJUSTE'
  if (!['ENTRADA', 'BAJA_DEFECTUOSO', 'AJUSTE'].includes(tipoAcción)) {
    throw new ApiError(400, 'Tipo de movimiento inválido')
  }

  const producto = await db.producto.findUnique({ where: { id: body?.productoId } })
  if (!producto) throw new ApiError(404, 'Producto no encontrado')
  const taller = await requireTaller(req, usuario, producto.tallerId)
  if (esServicio(producto.tipo)) throw new ApiError(400, 'Los servicios no manejan stock')

  let entrada: { cantidad: number; costoUnitario?: unknown; nota?: string; motivo?: string }
  if (tipoAcción === 'ENTRADA') entrada = entradaInventarioSchema.parse(body)
  else if (tipoAcción === 'BAJA_DEFECTUOSO') entrada = bajaDefectuosoSchema.parse(body)
  else entrada = ajusteInventarioSchema.parse(body)
  const costoEntrada: Decimal | null =
    tipoAcción === 'ENTRADA' ? D((entrada as { costoUnitario?: Decimal.Value }).costoUnitario ?? 0) : null

  if (tipoAcción === 'AJUSTE' && usuario.rol !== 'ADMIN') {
    throw new ApiError(403, 'Los ajustes de inventario son solo para ADMIN')
  }

  const resultado = await db.$transaction(async (tx) => {
    const p = await tx.producto.findUnique({ where: { id: producto.id } })
    if (!p) throw new ApiError(404, 'Producto no encontrado')

    let delta = 0
    if (tipoAcción === 'ENTRADA') delta = entrada.cantidad
    else if (tipoAcción === 'BAJA_DEFECTUOSO') delta = -entrada.cantidad
    else delta = entrada.cantidad // AJUSTE con signo

    const nuevo = p.cantidad + delta
    if (nuevo < 0) {
      throw new ApiError(400, `Stock insuficiente: disponible ${p.cantidad}, movimiento ${delta}`)
    }

    const mov = await tx.movimientoInventario.create({
      data: {
        productoId: p.id,
        tipo: tipoAcción,
        cantidad: entrada.cantidad,
        costoUnitario: costoEntrada && costoEntrada.gt(0) ? costoEntrada : D(p.costo),
        usuarioId: usuario.id,
        nota: entrada.nota ?? entrada.motivo ?? null,
      },
      include: { producto: { select: { nombre: true, codigoInterno: true } } },
    })
    const actualizado = await tx.producto.update({ where: { id: p.id }, data: { cantidad: nuevo } })
    return { mov, actualizado }
  })

  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: taller.id,
    accion: tipoAcción,
    entidad: 'MovimientoInventario',
    entidadId: resultado.mov.id,
    resultado: 'OK',
    antes: { stock: producto.cantidad },
    despues: { stock: resultado.actualizado.cantidad, cantidad: entrada.cantidad, producto: producto.nombre },
  })
  return NextResponse.json(serializar({ movimiento: resultado.mov, producto: resultado.actualizado }))
})
