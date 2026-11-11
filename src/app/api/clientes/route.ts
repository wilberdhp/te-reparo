import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { clienteSchema } from '@/lib/validaciones'
import { serializar, D } from '@/lib/money'
import { paginacionDesde, metaPaginacion } from '@/lib/paginacion'

/** GET /api/clientes?q=&id= — listado global con búsqueda (homónimos permitidos). */
export const GET = route(async (req: NextRequest) => {
  await requireAuth(req)
  const url = new URL(req.url)
  const q = url.searchParams.get('q')
  const id = url.searchParams.get('id')

  if (id) {
    const cliente = await db.cliente.findUnique({
      where: { id },
      include: {
        ventas: {
          include: {
            taller: { select: { nombre: true } },
            vendedor: { select: { nombre: true } },
            items: {
              include: {
                producto: { select: { nombre: true, tipo: true } },
                garantias: true,
                operario: { select: { nombre: true } },
              },
            },
          },
          orderBy: { fecha: 'desc' },
          take: 100,
        },
      },
    })
    if (!cliente) throw new ApiError(404, 'Cliente no encontrado')
    // Vencimiento de garantía: fecha venta + garantiaDiasSnapshot
    const hoy = new Date()
    const garantiasInfo = cliente.ventas.flatMap((v) =>
      v.items.map((it) => ({
        ventaCodigo: v.codigo,
        producto: it.producto.nombre,
        vence: it.garantiaDiasSnapshot > 0
          ? new Date(new Date(v.fecha).getTime() + it.garantiaDiasSnapshot * 86400000)
          : null,
        dias: it.garantiaDiasSnapshot,
        reclamos: it.garantias.length,
      }))
    )
    return NextResponse.json(
      serializar({
        cliente,
        garantiasVigentes: garantiasInfo.filter((g) => g.vence && g.vence >= hoy),
        garantiasVencidas: garantiasInfo.filter((g) => g.vence && g.vence < hoy),
        totalComprado: cliente.ventas.reduce((acc, v) => acc + D(v.totalCUP).toNumber(), 0),
      })
    )
  }

  // Listado paginado por nombre/teléfono (prompt de actualización §2):
  // con ?page= devuelve { clientes, total, totalPages }; sin ?page= (buscador
  // del POS, búsqueda mientras se escribe) mantiene el modo anterior.
  const pag = paginacionDesde(req)
  const where = q
    ? {
        OR: [
          { nombre: { contains: q } },
          { telefono: { contains: q } },
          { ci: { contains: q } },
        ],
      }
    : undefined

  if (pag) {
    const [clientes, total] = await Promise.all([
      db.cliente.findMany({
        where,
        include: { _count: { select: { ventas: true } } },
        orderBy: { nombre: 'asc' },
        take: pag.limit,
        skip: pag.skip,
      }),
      db.cliente.count({ where }),
    ])
    return NextResponse.json(
      serializar({ clientes, page: pag.page, limit: pag.limit, ...metaPaginacion(total, pag.limit) })
    )
  }

  const clientes = await db.cliente.findMany({
    where,
    include: { _count: { select: { ventas: true } } },
    orderBy: { nombre: 'asc' },
    take: 300,
  })
  return NextResponse.json(serializar({ clientes }))
})

/** POST /api/clientes — crear (clientes globales, homónimos permitidos). */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const datos = clienteSchema.parse(await req.json())

  const cliente = await db.cliente.create({
    data: { nombre: datos.nombre, telefono: datos.telefono ?? null, ci: datos.ci ?? null },
  })
  await registrarLog({
    req,
    usuarioId: usuario.id,
    accion: 'CREAR',
    entidad: 'Cliente',
    entidadId: cliente.id,
    resultado: 'OK',
    despues: { nombre: datos.nombre, telefono: datos.telefono, ci: datos.ci },
  })
  return NextResponse.json(serializar({ cliente }))
})

/** PATCH /api/clientes?id= — editar. */
export const PATCH = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) throw new ApiError(400, 'Falta id')
  const datos = clienteSchema.partial().parse(await req.json())

  const antes = await db.cliente.findUnique({ where: { id } })
  if (!antes) throw new ApiError(404, 'Cliente no encontrado')

  const cliente = await db.cliente.update({
    where: { id },
    data: {
      ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
      ...(datos.telefono !== undefined ? { telefono: datos.telefono } : {}),
      ...(datos.ci !== undefined ? { ci: datos.ci } : {}),
    },
  })
  await registrarLog({
    req,
    usuarioId: usuario.id,
    accion: 'ACTUALIZAR',
    entidad: 'Cliente',
    entidadId: id,
    resultado: 'OK',
    antes: { nombre: antes.nombre, telefono: antes.telefono, ci: antes.ci },
    despues: { ...datos },
  })
  return NextResponse.json(serializar({ cliente }))
})
