// Helpers HTTP para las API routes + verificación de rol/taller EN SERVIDOR.
import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { db } from '@/lib/db'
import { usuarioActual, type UsuarioSesion } from '@/lib/auth'
import { registrarLog } from '@/lib/audit'
import type { Rol } from '@/lib/constantes'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

/** Envuelve el handler de una route con manejo de errores uniforme. */
export function route<Ctx = unknown>(fn: (req: NextRequest, ctx: Ctx) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      return await fn(req, ctx)
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      if (e instanceof ZodError) {
        const detalle = e.issues[0]?.message ?? 'Datos inválidos'
        return NextResponse.json({ error: `Datos inválidos: ${detalle}` }, { status: 400 })
      }
      console.error('[API]', e)
      const msg = e instanceof Error ? e.message : 'Error interno'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }
}

/** Exige sesión activa; opcionalmente restringe por roles. Registra DENEGADO. */
export async function requireAuth(
  req: NextRequest,
  roles?: Rol[]
): Promise<UsuarioSesion> {
  const usuario = await usuarioActual(req)
  if (!usuario) throw new ApiError(401, 'No autenticado')
  if (roles && !roles.includes(usuario.rol)) {
    await registrarLog({
      req,
      usuarioId: usuario.id,
      accion: 'ACCESO_DENEGADO',
      entidad: 'API',
      resultado: 'DENEGADO',
      despues: { rol: usuario.rol, requeridos: roles },
    })
    throw new ApiError(403, 'No tiene permisos para esta operación')
  }
  return usuario
}

/**
 * Valida el taller sobre el que actúa el usuario (verificación de servidor):
 *  - ADMIN: cualquier taller existente.
 *  - VENDEDOR: únicamente su taller asignado.
 *  - VENDEDOR_ONLINE: cualquier taller ACTIVO (elige antes de vender).
 * Devuelve el taller o lanza 403 (con registro DENEGADO).
 */
export async function requireTaller(
  req: NextRequest,
  usuario: UsuarioSesion,
  tallerId: string | null | undefined,
  opts?: { permitirInactivo?: boolean }
): Promise<{ id: string; nombre: string; activo: boolean }> {
  let id: string | null = tallerId ?? null
  if (usuario.rol === 'VENDEDOR') id = usuario.tallerId
  if (!id) throw new ApiError(400, 'Debe especificar un taller')
  const taller = await db.taller.findUnique({ where: { id } })
  if (!taller) throw new ApiError(404, 'Taller no encontrado')
  if (usuario.rol === 'VENDEDOR' && taller.id !== usuario.tallerId) {
    await registrarLog({
      req,
      usuarioId: usuario.id,
      tallerId: taller.id,
      accion: 'ACCESO_TALLER_DENEGADO',
      entidad: 'Taller',
      entidadId: taller.id,
      resultado: 'DENEGADO',
    })
    throw new ApiError(403, 'Solo puede operar en su taller asignado')
  }
  if (!opts?.permitirInactivo && !taller.activo && usuario.rol !== 'ADMIN') {
    throw new ApiError(400, 'El taller está inactivo')
  }
  return taller
}

export function ip(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}

export function csv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return ''
  const cabeceras = Object.keys(rows[0])
  const escapar = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lineas = [cabeceras.join(';')]
  for (const fila of rows) lineas.push(cabeceras.map((c) => escapar(fila[c])).join(';'))
  return '\uFEFF' + lineas.join('\n') // BOM para Excel
}

export function respuestaCsv(contenido: string, nombre: string): Response {
  return new NextResponse(contenido, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`,
    },
  })
}
