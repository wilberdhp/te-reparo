import { NextResponse, type NextRequest } from 'next/server'
import { route } from '@/lib/http'
import { usuarioActual, COOKIE_SESION } from '@/lib/auth'
import { registrarLog } from '@/lib/audit'

export const POST = route(async (req: NextRequest) => {
  const usuario = await usuarioActual(req)
  if (usuario) {
    await registrarLog({
      req,
      usuarioId: usuario.id,
      accion: 'LOGOUT',
      entidad: 'Usuario',
      entidadId: usuario.id,
      resultado: 'OK',
    })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_SESION, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
})
