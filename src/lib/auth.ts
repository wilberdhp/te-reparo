// Autenticación: JWT en cookie httpOnly (jose) + verificación de rol/taller en servidor.
import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import type { Rol } from '@/lib/constantes'

export const COOKIE_SESION = 'te_reparo_session'
const DURACION = '7d'

function secreto(): Uint8Array {
  const s = process.env.AUTH_SECRET || 'te-reparo-secreto-dev-cambiar-en-produccion'
  return new TextEncoder().encode(s)
}

export interface SesionPayload {
  sub: string // usuarioId
  username: string
  rol: Rol
}

export async function crearToken(payload: SesionPayload): Promise<string> {
  return new SignJWT({ username: payload.username, rol: payload.rol })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(DURACION)
    .sign(secreto())
}

export async function verificarToken(token: string): Promise<SesionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secreto())
    if (!payload.sub) return null
    return { sub: payload.sub, username: String(payload.username ?? ''), rol: payload.rol as Rol }
  } catch {
    return null
  }
}

export interface UsuarioSesion {
  id: string
  nombre: string
  username: string
  rol: Rol
  tallerId: string | null
  operarioId: string | null
}

/** Usuario actual desde la cookie de sesión (o null si no hay sesión válida). */
export async function usuarioActual(req: NextRequest): Promise<UsuarioSesion | null> {
  const token = req.cookies.get(COOKIE_SESION)?.value
  if (!token) return null
  const payload = await verificarToken(token)
  if (!payload) return null
  const usuario = await db.usuario.findUnique({
    where: { id: payload.sub },
    select: {
      id: true, nombre: true, username: true, rol: true,
      tallerId: true, operarioId: true, activo: true,
    },
  })
  if (!usuario || !usuario.activo) return null
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    username: usuario.username,
    rol: usuario.rol as Rol,
    tallerId: usuario.tallerId,
    operarioId: usuario.operarioId,
  }
}
