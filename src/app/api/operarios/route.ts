import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { operarioSchema, operarioUpdateSchema } from '@/lib/validaciones'
import { serializar } from '@/lib/money'
import { paginacionDesde, metaPaginacion } from '@/lib/paginacion'

/**
 * GET /api/operarios — todos los roles (para asignar en POS y ventas).
 * Con ?page=: página + total (tabla de Configuración); sin ?page= (POS,
 * selects de formularios): listado del taller con tope de seguridad.
 */
export const GET = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const url = new URL(req.url)
  const tallerId = url.searchParams.get('tallerId')
  const pag = paginacionDesde(req)

  const where = tallerId ? { talleres: { some: { tallerId } } } : undefined

  const incluirUsuariosVinculados = async () => {
    // usuarios vinculados (para marcar vendedores en línea) — tope de seguridad
    const usuarios = await db.usuario.findMany({
      where: { operarioId: { not: null } },
      select: { id: true, rol: true, operarioId: true, username: true },
      take: 500,
    })
    return usuarios.filter((u) => usuario.rol === 'ADMIN' || u.rol !== 'ADMIN')
  }

  if (pag) {
    const [operarios, total] = await Promise.all([
      db.operario.findMany({ where, include: { talleres: { select: { tallerId: true } } }, orderBy: { nombre: 'asc' }, take: pag.limit, skip: pag.skip }),
      db.operario.count({ where }),
    ])
    return NextResponse.json(
      serializar({ operarios, usuariosVinculados: await incluirUsuariosVinculados(), page: pag.page, limit: pag.limit, ...metaPaginacion(total, pag.limit) })
    )
  }

  const operarios = await db.operario.findMany({
    where,
    include: { talleres: { select: { tallerId: true } } },
    orderBy: { nombre: 'asc' },
    take: 500,
  })
  return NextResponse.json(serializar({ operarios, usuariosVinculados: await incluirUsuariosVinculados() }))
})

/** POST /api/operarios — crear operario con talleres asignados (solo ADMIN). */
export const POST = route(async (req: NextRequest) => {
  const admin = await requireAuth(req, ['ADMIN'])
  const datos = operarioSchema.parse(await req.json())

  const operario = await db.operario.create({
    data: {
      nombre: datos.nombre,
      rama: datos.rama,
      activo: datos.activo ?? true,
      talleres: {
        create: (datos.tallerIds ?? []).map((tallerId) => ({ tallerId })),
      },
    },
    include: { talleres: { select: { tallerId: true } } },
  })
  await registrarLog({
    req,
    usuarioId: admin.id,
    accion: 'CREAR',
    entidad: 'Operario',
    entidadId: operario.id,
    resultado: 'OK',
    despues: { nombre: datos.nombre, rama: datos.rama, talleres: datos.tallerIds ?? [] },
  })
  return NextResponse.json(serializar({ operario }))
})

/** PATCH /api/operarios?id= — editar rama / activo / talleres (solo ADMIN). */
export const PATCH = route(async (req: NextRequest) => {
  const admin = await requireAuth(req, ['ADMIN'])
  const id = new URL(req.url).searchParams.get('id')
  if (!id) throw new ApiError(400, 'Falta id')
  const datos = operarioUpdateSchema.parse(await req.json())

  const antes = await db.operario.findUnique({
    where: { id },
    include: { talleres: { select: { tallerId: true } } },
  })
  if (!antes) throw new ApiError(404, 'Operario no encontrado')

  const operario = await db.$transaction(async (tx) => {
    const data: Record<string, unknown> = {}
    if (datos.nombre !== undefined) data.nombre = datos.nombre
    if (datos.rama !== undefined) data.rama = datos.rama
    if (datos.activo !== undefined) data.activo = datos.activo
    const actualizado = await tx.operario.update({ where: { id }, data })
    if (datos.tallerIds !== undefined) {
      await tx.operarioTaller.deleteMany({ where: { operarioId: id } })
      await tx.operarioTaller.createMany({
        data: datos.tallerIds.map((tallerId) => ({ operarioId: id, tallerId })),
      })
    }
    return tx.operario.findUnique({
      where: { id },
      include: { talleres: { select: { tallerId: true } } },
    })
  })

  await registrarLog({
    req,
    usuarioId: admin.id,
    accion: 'ACTUALIZAR',
    entidad: 'Operario',
    entidadId: id,
    resultado: 'OK',
    antes: { nombre: antes.nombre, rama: antes.rama, activo: antes.activo, talleres: antes.talleres.map((t) => t.tallerId) },
    despues: { ...datos },
  })
  return NextResponse.json(serializar({ operario }))
})
