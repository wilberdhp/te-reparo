import { NextResponse, type NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth } from '@/lib/http'
import { registrarLog } from '@/lib/audit'

const schema = z.object({
  usuarioId: z.string(),
  passwordNueva: z.string().min(6, 'Mínimo 6 caracteres').max(200),
})

/** Cambio de contraseña — solo ADMIN (PRD §5.1: no hay recuperación por correo). */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req, ['ADMIN'])
  const { usuarioId, passwordNueva } = schema.parse(await req.json())

  const objetivo = await db.usuario.findUnique({ where: { id: usuarioId } })
  if (!objetivo) throw new ApiError(404, 'Usuario no encontrado')

  const passwordHash = bcrypt.hashSync(passwordNueva, 10)
  await db.usuario.update({ where: { id: usuarioId }, data: { passwordHash } })

  await registrarLog({
    req,
    usuarioId: usuario.id,
    accion: 'CAMBIO_PASSWORD',
    entidad: 'Usuario',
    entidadId: usuarioId,
    resultado: 'OK',
    antes: { username: objetivo.username, passwordHash: '***' },
    despues: { username: objetivo.username, passwordHash: '***' },
  })

  return NextResponse.json({ ok: true })
})
