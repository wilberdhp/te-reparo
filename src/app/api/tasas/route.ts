import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, requireAuth } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { tasaSchema } from '@/lib/validaciones'
import { tasasVigentes } from '@/lib/ajustes'
import { serializar } from '@/lib/money'

/** GET /api/tasas — vigentes + historial (histórico visible para todos los que venden). */
export const GET = route(async (req: NextRequest) => {
  await requireAuth(req)
  const [tasas, historial] = await Promise.all([
    tasasVigentes(),
    db.tasaCambio.findMany({
      orderBy: { fechaVigencia: 'desc' },
      take: 100,
      include: { usuario: { select: { username: true, nombre: true } } },
    }),
  ])
  return NextResponse.json(serializar({ tasas, historial }))
})

/**
 * POST /api/tasas — actualizar tasa vigente (USD o EUR hacia CUP).
 * Cualquier VENDEDOR, VENDEDOR_ONLINE o ADMIN puede actualizar (PRD §4.5).
 * Cada venta/pago guarda su snapshot; el historial es completo.
 */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const { moneda, valorCUP } = tasaSchema.parse(await req.json())

  const tasa = await db.tasaCambio.create({
    data: { moneda, valorCUP, fechaVigencia: new Date(), actualizadoPor: usuario.id },
    include: { usuario: { select: { username: true, nombre: true } } },
  })
  await registrarLog({
    req,
    usuarioId: usuario.id,
    accion: 'ACTUALIZAR_TASA',
    entidad: 'TasaCambio',
    entidadId: tasa.id,
    resultado: 'OK',
    despues: { moneda, valorCUP: valorCUP.toFixed(2) },
  })
  return NextResponse.json(serializar({ tasa }))
})
