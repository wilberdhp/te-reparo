import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth } from '@/lib/http'
import { registrarLog } from '@/lib/audit'

/** POST /api/ventas/reimprimir?id= — registra el log de reimpresión (PRD §5.5). */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) throw new ApiError(400, 'Falta id')

  const venta = await db.venta.findUnique({ where: { id }, select: { id: true, codigo: true, tallerId: true } })
  if (!venta) throw new ApiError(404, 'Venta no encontrada')

  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: venta.tallerId,
    accion: 'REIMPRIMIR_TICKET',
    entidad: 'Venta',
    entidadId: venta.id,
    resultado: 'OK',
    despues: { codigo: venta.codigo },
  })
  return NextResponse.json({ ok: true })
})
