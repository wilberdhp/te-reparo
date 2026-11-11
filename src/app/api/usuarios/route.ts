import { NextResponse, type NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { usuarioSchema, usuarioUpdateSchema } from '@/lib/validaciones'
import { serializar } from '@/lib/money'
import { paginacionDesde, metaPaginacion } from '@/lib/paginacion'

function publico(u: {
  id?: string
  nombre?: string | null
  username?: string
  rol?: string
  tallerId?: string | null
  operarioId?: string | null
  activo?: boolean
  [k: string]: unknown
}) {
  return {
    id: u.id,
    nombre: u.nombre,
    username: u.username,
    rol: u.rol,
    tallerId: u.tallerId,
    operarioId: u.operarioId,
    activo: u.activo,
  }
}

/**
 * GET /api/usuarios — solo ADMIN. Con ?page= devuelve la página pedida + total
 * (tabla de Configuración); sin ?page= (filtro de auditoría, selects) devuelve
 * la lista con un tope de seguridad. Ningún listado se ejecuta sin take.
 */
export const GET = route(async (req: NextRequest) => {
  await requireAuth(req, ['ADMIN'])
  const pag = paginacionDesde(req)
  const select = {
    id: true, nombre: true, username: true, rol: true,
    tallerId: true, operarioId: true, activo: true,
    createdAt: true,
  }

  if (pag) {
    const [usuarios, total] = await Promise.all([
      db.usuario.findMany({ orderBy: { username: 'asc' }, select, take: pag.limit, skip: pag.skip }),
      db.usuario.count(),
    ])
    const talleres = await db.taller.findMany({ select: { id: true, nombre: true }, take: 200 })
    return NextResponse.json(
      serializar({ usuarios, talleres, page: pag.page, limit: pag.limit, ...metaPaginacion(total, pag.limit) })
    )
  }

  const usuarios = await db.usuario.findMany({ orderBy: { username: 'asc' }, select, take: 200 })
  const talleres = await db.taller.findMany({ select: { id: true, nombre: true }, take: 200 })
  return NextResponse.json(serializar({ usuarios, talleres }))
})

/** POST /api/usuarios — crear usuario (solo ADMIN). */
export const POST = route(async (req: NextRequest) => {
  const admin = await requireAuth(req, ['ADMIN'])
  const datos = usuarioSchema.parse(await req.json())

  const existente = await db.usuario.findUnique({ where: { username: datos.username } })
  if (existente) throw new ApiError(409, 'El usuario ya existe')

  if (datos.rol === 'VENDEDOR' && !datos.tallerId) {
    throw new ApiError(400, 'Un VENDEDOR requiere taller asignado')
  }
  if (datos.rol === 'ADMIN' || datos.rol === 'VENDEDOR_ONLINE') {
    datos.tallerId = null
  }
  if (datos.rol === 'VENDEDOR' && !datos.operarioId) {
    throw new ApiError(400, 'Un usuario VENDEDOR debe estar registrado como operario (asígnelo)')
  }

  const usuario = await db.usuario.create({
    data: {
      nombre: datos.nombre,
      username: datos.username,
      passwordHash: bcrypt.hashSync(datos.password, 10),
      rol: datos.rol,
      tallerId: datos.tallerId ?? null,
      operarioId: datos.operarioId ?? null,
      activo: datos.activo ?? true,
    },
  })
  await registrarLog({
    req,
    usuarioId: admin.id,
    accion: 'CREAR',
    entidad: 'Usuario',
    entidadId: usuario.id,
    resultado: 'OK',
    despues: { nombre: datos.nombre, username: datos.username, rol: datos.rol, tallerId: datos.tallerId, operarioId: datos.operarioId },
  })
  return NextResponse.json(
    serializar({ usuario: publico({ ...usuario, passwordHash: '' }) })
  )
})

/** PATCH /api/usuarios?id= — editar / activar / desactivar (solo ADMIN). */
export const PATCH = route(async (req: NextRequest) => {
  const admin = await requireAuth(req, ['ADMIN'])
  const id = new URL(req.url).searchParams.get('id')
  if (!id) throw new ApiError(400, 'Falta id')
  const datos = usuarioUpdateSchema.parse(await req.json())

  const antes = await db.usuario.findUnique({ where: { id } })
  if (!antes) throw new ApiError(404, 'Usuario no encontrado')

  const data: Record<string, unknown> = {}
  if (datos.nombre !== undefined) data.nombre = datos.nombre
  if (datos.username !== undefined) {
    if (datos.username !== antes.username) {
      const dup = await db.usuario.findUnique({ where: { username: datos.username } })
      if (dup) throw new ApiError(409, 'El usuario ya existe')
    }
    data.username = datos.username
  }
  if (datos.rol !== undefined) data.rol = datos.rol
  if (datos.tallerId !== undefined) data.tallerId = datos.tallerId
  if (datos.operarioId !== undefined) data.operarioId = datos.operarioId
  if (datos.activo !== undefined) data.activo = datos.activo
  if (datos.password !== undefined) data.passwordHash = bcrypt.hashSync(datos.password, 10)

  if ((datos.rol ?? antes.rol) === 'VENDEDOR' && (datos.tallerId ?? antes.tallerId) === null) {
    throw new ApiError(400, 'Un VENDEDOR requiere taller asignado')
  }
  if ((datos.rol ?? antes.rol) === 'VENDEDOR' && !(datos.operarioId ?? antes.operarioId)) {
    throw new ApiError(400, 'Un usuario VENDEDOR debe estar vinculado a un operario')
  }
  // ADMIN y VENDEDOR_ONLINE no tienen taller fijo
  const rolFinal = datos.rol ?? antes.rol
  if (rolFinal === 'ADMIN' || rolFinal === 'VENDEDOR_ONLINE') {
    data.tallerId = null
  }

  const usuario = await db.usuario.update({ where: { id }, data })
  await registrarLog({
    req,
    usuarioId: admin.id,
    accion: 'ACTUALIZAR',
    entidad: 'Usuario',
    entidadId: id,
    resultado: 'OK',
    antes: { nombre: antes.nombre, username: antes.username, rol: antes.rol, activo: antes.activo, tallerId: antes.tallerId, operarioId: antes.operarioId },
    despues: { ...datos, password: datos.password ? '***' : undefined },
  })
  return NextResponse.json(serializar({ usuario: publico(usuario) }))
})
