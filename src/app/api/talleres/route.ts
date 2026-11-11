import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { tallerSchema } from '@/lib/validaciones'
import { serializar } from '@/lib/money'

/** GET /api/talleres — ADMIN ve todos; VENDEDOR_ONLINE los activos. */
export const GET = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const soloActivos = usuario.rol === 'VENDEDOR_ONLINE'
  const talleres = await db.taller.findMany({
    where: soloActivos ? { activo: true } : undefined,
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  return NextResponse.json(serializar({ talleres }))
})

/** POST /api/talleres — crear taller (solo ADMIN; se permite crear sin usuarios). */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req, ['ADMIN'])
  const datos = tallerSchema.parse(await req.json())

  const taller = await db.taller.create({ data: datos })
  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: taller.id,
    accion: 'CREAR',
    entidad: 'Taller',
    entidadId: taller.id,
    resultado: 'OK',
    despues: { ...datos },
  })
  return NextResponse.json(serializar({ taller }))
})

/** PATCH /api/talleres?id= — editar / activar / desactivar (solo ADMIN). */
export const PATCH = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req, ['ADMIN'])
  const id = new URL(req.url).searchParams.get('id')
  if (!id) throw new ApiError(400, 'Falta id')
  const datos = tallerSchema.partial().parse(await req.json())

  const antes = await db.taller.findUnique({ where: { id } })
  if (!antes) throw new ApiError(404, 'Taller no encontrado')

  const taller = await db.taller.update({ where: { id }, data: datos })
  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: id,
    accion: 'ACTUALIZAR',
    entidad: 'Taller',
    entidadId: id,
    resultado: 'OK',
    antes: { nombre: antes.nombre, activo: antes.activo },
    despues: { ...datos },
  })
  return NextResponse.json(serializar({ taller }))
})
