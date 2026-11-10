import { NextResponse, type NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { route, ApiError, ip } from '@/lib/http'
import { crearToken, COOKIE_SESION } from '@/lib/auth'
import { registrarLog } from '@/lib/audit'
import { demasiadoIntentos, registrarFallo, limpiarIntentos } from '@/lib/rate-limit'
import { loginSchema } from '@/lib/validaciones'

export const POST = route(async (req: NextRequest) => {
  const body = await req.json().catch(() => {
    throw new ApiError(400, 'Cuerpo inválido')
  })
  const { username, password } = loginSchema.parse(body)
  const clave = `${ip(req)}:${username.toLowerCase()}`

  if (demasiadoIntentos(clave)) {
    throw new ApiError(429, 'Demasiados intentos. Espere 15 minutos e intente de nuevo.')
  }

  const usuario = await db.usuario.findUnique({ where: { username } })
  const hashValido = usuario ? await bcrypt.compare(password, usuario.passwordHash) : false

  if (!usuario || !hashValido || !usuario.activo) {
    registrarFallo(clave)
    await registrarLog({
      req,
      usuarioId: usuario?.id ?? null,
      accion: 'LOGIN_FALLIDO',
      entidad: 'Usuario',
      entidadId: usuario?.id ?? null,
      resultado: 'DENEGADO',
      despues: { username },
    })
    throw new ApiError(401, 'Usuario o contraseña incorrectos')
  }

  limpiarIntentos(clave)
  const token = await crearToken({
    sub: usuario.id,
    username: usuario.username,
    rol: usuario.rol as 'ADMIN' | 'VENDEDOR' | 'VENDEDOR_ONLINE',
  })

  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: usuario.tallerId,
    accion: 'LOGIN',
    entidad: 'Usuario',
    entidadId: usuario.id,
    resultado: 'OK',
  })

  const res = NextResponse.json({
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      username: usuario.username,
      rol: usuario.rol,
      tallerId: usuario.tallerId,
      operarioId: usuario.operarioId,
    },
  })
  res.cookies.set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })
  return res
})
