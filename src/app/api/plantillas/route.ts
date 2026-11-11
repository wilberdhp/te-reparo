import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { plantillaSchema, plantillaUpdateSchema } from '@/lib/validaciones'
import { serializar } from '@/lib/money'

/**
 * /api/plantillas — Plantillas de tickets (PROMPT DE ACTUALIZACIÓN §4 y §7).
 *  GET    (cualquier usuario autenticado): plantillas ACTIVAS para el selector
 *         del POS. `?todas=true` (solo ADMIN) incluye las desactivadas.
 *  POST   (solo ADMIN): crear.        Auditoría: PLANTILLA_CREADA.
 *  PATCH ?id= (solo ADMIN): editar / activar / desactivar.
 *         Auditoría: PLANTILLA_EDITADA / PLANTILLA_DESACTIVADA / PLANTILLA_ACTIVADA.
 */
export const GET = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const url = new URL(req.url)
  const todas = url.searchParams.get('todas') === 'true'
  if (todas && usuario.rol !== 'ADMIN') {
    throw new ApiError(403, 'Solo ADMIN puede ver plantillas desactivadas')
  }
  const plantillas = await db.plantillaTicket.findMany({
    where: todas ? {} : { activo: true },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { ventas: true } } },
  })
  return NextResponse.json(
    serializar({
      plantillas: plantillas.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        contenido: p.contenido,
        activo: p.activo,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        usos: p._count.ventas,
      })),
    })
  )
})

export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req, ['ADMIN'])
  const datos = plantillaSchema.parse(await req.json())

  const plantilla = await db.plantillaTicket.create({
    data: { nombre: datos.nombre.trim(), contenido: datos.contenido, activo: datos.activo ?? true },
  })

  await registrarLog({
    req,
    usuarioId: usuario.id,
    accion: 'PLANTILLA_CREADA',
    entidad: 'PlantillaTicket',
    entidadId: plantilla.id,
    resultado: 'OK',
    despues: { nombre: plantilla.nombre, activo: plantilla.activo },
  })
  return NextResponse.json(serializar({ plantilla }), { status: 201 })
})

export const PATCH = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req, ['ADMIN'])
  const id = new URL(req.url).searchParams.get('id')
  if (!id) throw new ApiError(400, 'Falta id')
  const datos = plantillaUpdateSchema.parse(await req.json())

  const actual = await db.plantillaTicket.findUnique({ where: { id } })
  if (!actual) throw new ApiError(404, 'Plantilla no encontrada')

  const plantilla = await db.plantillaTicket.update({
    where: { id },
    data: {
      ...(datos.nombre !== undefined ? { nombre: datos.nombre.trim() } : {}),
      ...(datos.contenido !== undefined ? { contenido: datos.contenido } : {}),
      ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
    },
  })

  const desactivada = datos.activo === false && actual.activo === true
  const activada = datos.activo === true && actual.activo === false
  await registrarLog({
    req,
    usuarioId: usuario.id,
    accion: desactivada ? 'PLANTILLA_DESACTIVADA' : activada ? 'PLANTILLA_ACTIVADA' : 'PLANTILLA_EDITADA',
    entidad: 'PlantillaTicket',
    entidadId: plantilla.id,
    resultado: 'OK',
    antes: { nombre: actual.nombre, activo: actual.activo, contenido: actual.contenido },
    despues: { nombre: plantilla.nombre, activo: plantilla.activo, contenido: plantilla.contenido },
  })
  return NextResponse.json(serializar({ plantilla }))
})
