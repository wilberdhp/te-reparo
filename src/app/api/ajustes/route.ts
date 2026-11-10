import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, requireAuth } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { ajustesSchema } from '@/lib/validaciones'
import { obtenerAjustesMap } from '@/lib/ajustes'
import { serializar } from '@/lib/money'

/** GET /api/ajustes — ajustes de ticket y porcentajeAdmin (todos los roles leen). */
export const GET = route(async (req: NextRequest) => {
  await requireAuth(req)
  const ajustes = await obtenerAjustesMap()
  return NextResponse.json({ ajustes })
})

/** PATCH /api/ajustes — solo ADMIN: ancho de ticket, encabezado/pie, porcentajeAdmin. */
export const PATCH = route(async (req: NextRequest) => {
  const admin = await requireAuth(req, ['ADMIN'])
  const datos = ajustesSchema.parse(await req.json())

  const antes = await obtenerAjustesMap()
  const data: Record<string, string> = {}
  if (datos.ticketAncho !== undefined) data.ticketAncho = datos.ticketAncho
  if (datos.ticketEncabezado !== undefined) data.ticketEncabezado = datos.ticketEncabezado
  if (datos.ticketPie !== undefined) data.ticketPie = datos.ticketPie
  if (datos.porcentajeAdmin !== undefined) data.porcentajeAdmin = datos.porcentajeAdmin.toFixed(2)

  for (const [clave, valor] of Object.entries(data)) {
    await db.ajuste.upsert({
      where: { clave },
      update: { valor },
      create: { clave, valor },
    })
  }
  await registrarLog({
    req,
    usuarioId: admin.id,
    accion: 'ACTUALIZAR_AJUSTES',
    entidad: 'Ajuste',
    resultado: 'OK',
    antes: { ...antes },
    despues: { ...data },
  })
  return NextResponse.json({ ajustes: await obtenerAjustesMap() })
})
