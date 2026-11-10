import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth, requireTaller } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { productoSchema, productoUpdateSchema } from '@/lib/validaciones'
import { serializar, D } from '@/lib/money'
import { esServicio } from '@/lib/constantes'
import { codigoInternoSugerido, siguienteSecuencia, numeroTaller } from '@/lib/codigos'

/** Campos sensibles: solo ADMIN (PRD §4.1). */
function filtrarSensibles(p: Record<string, unknown>, esAdmin: boolean) {
  if (esAdmin) return p
  const { costo, pagoOperarioTipo, pagoOperarioValor, stockMinimo, garantiaDias, ...resto } = p as Record<string, unknown>
  return { ...resto, costo: undefined, pagoOperarioTipo: undefined, pagoOperarioValor: undefined, stockMinimo: undefined, garantiaDias: undefined, _sensible: true }
}

/**
 * GET /api/productos?tallerId=&categoria=&tipo=&stockBajo=&activo=&q=
 * Listado del taller activo con filtros.
 */
export const GET = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const url = new URL(req.url)
  const tallerId = url.searchParams.get('tallerId')
  const taller = await requireTaller(req, usuario, tallerId, { permitirInactivo: true })
  const { categoria, tipo, q, stockBajo } = Object.fromEntries(url.searchParams)
  const activo = url.searchParams.get('activo')

  const productos = await db.producto.findMany({
    where: {
      tallerId: taller.id,
      ...(categoria ? { categoria } : {}),
      ...(tipo ? { tipo } : {}),
      ...(activo === 'true' || activo === 'false' ? { activo: activo === 'true' } : {}),
      ...(q ? { OR: [{ nombre: { contains: q } }, { codigoInterno: { contains: q } }, { codigoBarras: { contains: q } }] } : {}),
    },
    orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
  })

  const filtrados = stockBajo === 'true'
    ? productos.filter((p) => !esServicio(p.tipo) && p.cantidad <= p.stockMinimo)
    : productos

  const categorias = [...new Set(productos.map((p) => p.categoria))]
  return NextResponse.json(serializar({
    productos: filtrados.map((p) => filtrarSensibles(p as unknown as Record<string, unknown>, usuario.rol === 'ADMIN')),
    categorias,
  }))
})

/** POST /api/productos — crear (ADMIN completo; VENDEDOR sin campos sensibles). */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const datos = productoSchema.parse(await req.json())
  const taller = await requireTaller(req, usuario, datos.tallerId)

  const esAdmin = usuario.rol === 'ADMIN'
  if (!esAdmin) {
    // Vendedor: campos sensibles quedan en 0 (solo ADMIN los fija)
    datos.costo = D(0)
    datos.pagoOperarioTipo = 'FIJO'
    datos.pagoOperarioValor = D(0)
    datos.stockMinimo = 0
    datos.garantiaDias = 0
    datos.cantidad = 0
  }

  const creado = await db.$transaction(async (tx) => {
    // Código interno automático: T{taller}-{secuencial} (formato sugerido por el PRD)
    let codigoInterno = datos.codigoInterno?.trim() || ''
    if (!codigoInterno) {
      const seq = await siguienteSecuencia(tx, `producto_t${numeroTaller(taller.id)}`)
      codigoInterno = codigoInternoSugerido(numeroTaller(taller.id), seq)
    }
    const dup = await tx.producto.findFirst({
      where: { tallerId: taller.id, OR: [{ codigoInterno }, { codigoBarras: datos.codigoBarras?.trim() || codigoInterno }] },
    })
    if (dup) throw new ApiError(409, 'Ya existe un producto con ese código interno o de barras en el taller')

    const producto = await tx.producto.create({
      data: {
        tallerId: taller.id,
        codigoInterno,
        codigoBarras: datos.codigoBarras?.trim() || codigoInterno,
        categoria: datos.categoria,
        nombre: datos.nombre,
        tipo: datos.tipo,
        cantidad: 0, // el stock inicial se registra como movimiento ENTRADA
        costo: datos.costo ?? D(0),
        unidad: datos.unidad ?? 'u',
        stockMinimo: datos.stockMinimo ?? 0,
        precio: datos.precio,
        monedaPrecio: datos.monedaPrecio,
        pagoOperarioTipo: datos.pagoOperarioTipo ?? 'FIJO',
        pagoOperarioValor: datos.pagoOperarioValor ?? D(0),
        garantiaDias: datos.garantiaDias ?? 0,
        activo: datos.activo ?? true,
      },
    })
    // Stock inicial vía movimiento (nunca se edita cantidad directamente)
    if (esAdmin && (datos.cantidad ?? 0) > 0 && datos.tipo === 'VENTA') {
      await tx.movimientoInventario.create({
        data: {
          productoId: producto.id,
          tipo: 'ENTRADA',
          cantidad: datos.cantidad!,
          costoUnitario: datos.costo ?? D(0),
          usuarioId: usuario.id,
          nota: 'Stock inicial al crear producto',
        },
      })
      await tx.producto.update({ where: { id: producto.id }, data: { cantidad: datos.cantidad! } })
    }
    return producto
  })

  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: taller.id,
    accion: 'CREAR',
    entidad: 'Producto',
    entidadId: creado.id,
    resultado: 'OK',
    despues: { nombre: datos.nombre, tipo: datos.tipo, precio: datos.precio.toString(), codigoInterno: creado.codigoInterno },
  })
  return NextResponse.json(serializar({ producto: creado }))
})

/** PATCH /api/productos?id= — editar. Campos sensibles solo ADMIN. */
export const PATCH = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) throw new ApiError(400, 'Falta id')
  const datos = productoUpdateSchema.parse(await req.json())

  const antes = await db.producto.findUnique({ where: { id } })
  if (!antes) throw new ApiError(404, 'Producto no encontrado')
  await requireTaller(req, usuario, antes.tallerId, { permitirInactivo: true })

  const esAdmin = usuario.rol === 'ADMIN'
  const data: Record<string, unknown> = {}
  const camposLibres = ['nombre', 'categoria', 'precio', 'monedaPrecio', 'unidad', 'codigoBarras'] as const
  const camposSensibles = ['costo', 'pagoOperarioTipo', 'pagoOperarioValor', 'stockMinimo', 'garantiaDias'] as const

  for (const c of camposLibres) {
    if (datos[c] !== undefined) data[c] = datos[c]
  }
  for (const c of camposSensibles) {
    if (datos[c] !== undefined) {
      if (!esAdmin) throw new ApiError(403, `El campo ${c} es sensible: solo ADMIN`)
      data[c] = datos[c]
    }
  }
  if (datos.activo !== undefined) {
    if (!esAdmin) throw new ApiError(403, 'Solo ADMIN desactiva productos')
    data.activo = datos.activo
  }

  const producto = await db.producto.update({ where: { id }, data })
  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: antes.tallerId,
    accion: 'ACTUALIZAR',
    entidad: 'Producto',
    entidadId: id,
    resultado: 'OK',
    antes: { nombre: antes.nombre, categoria: antes.categoria, precio: antes.precio.toString(), activo: antes.activo },
    despues: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v?.toString?.() ?? v])),
  })
  return NextResponse.json(serializar({ producto }))
})

/** DELETE /api/productos?id= — solo si nunca tuvo movimientos; si no, desactivar. */
export const DELETE = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req, ['ADMIN'])
  const id = new URL(req.url).searchParams.get('id')
  if (!id) throw new ApiError(400, 'Falta id')

  const antes = await db.producto.findUnique({ where: { id }, include: { _count: { select: { movimientos: true, ventaItems: true } } } })
  if (!antes) throw new ApiError(404, 'Producto no encontrado')
  if (antes._count.movimientos > 0 || antes._count.ventaItems > 0) {
    throw new ApiError(400, 'El producto tiene movimientos/ventas: debe desactivarlo en lugar de eliminar')
  }
  await db.producto.delete({ where: { id } })
  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: antes.tallerId,
    accion: 'ELIMINAR',
    entidad: 'Producto',
    entidadId: id,
    resultado: 'OK',
    antes: { nombre: antes.nombre, codigoInterno: antes.codigoInterno },
  })
  return NextResponse.json({ ok: true })
})
