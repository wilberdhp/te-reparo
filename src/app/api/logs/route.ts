import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth, csv, respuestaCsv } from '@/lib/http'
import { serializar } from '@/lib/money'
import { registrarLog } from '@/lib/audit'
import { logPosSchema } from '@/lib/validaciones'
import { paginacionDesde, metaPaginacion } from '@/lib/paginacion'
import { ventanaDia } from '@/lib/fecha'

/**
 * POST /api/logs — auditoría de acciones del POS EN EL CARRITO (antes de
 * confirmar la venta): MODIFICAR_COSTO_ITEM y AGREGAR_NOTA_ITEM.
 * El usuario se identifica por la sesión (cookie) en servidor; un VENDEDOR
 * solo puede loguear sobre su propio taller. La línea afectada se identifica
 * por productoId (los VentaItem todavía no existen).
 */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const datos = logPosSchema.parse(await req.json())

  let tallerId = datos.tallerId ?? null
  if (usuario.rol === 'VENDEDOR') {
    tallerId = usuario.tallerId
  } else if (tallerId) {
    const taller = await db.taller.findUnique({ where: { id: tallerId } })
    if (!taller) throw new ApiError(404, 'Taller no encontrado')
  }

  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId,
    accion: datos.accion,
    entidad: 'VentaItem',
    entidadId: datos.productoId,
    resultado: 'OK',
    antes: { producto: datos.productoNombre, ...(datos.antes ?? {}) },
    despues: { producto: datos.productoNombre, ...(datos.despues ?? {}) },
  })
  return NextResponse.json({ ok: true })
})

/**
 * GET /api/logs — SOLO ADMIN (PRD §5.10). Filtros: fecha desde/hasta, usuarioId,
 * entidad, accion, resultado. Ver datos antes/después. ?export=csv|json.
 */
export const GET = route(async (req: NextRequest) => {
  await requireAuth(req, ['ADMIN'])
  const url = new URL(req.url)
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')
  const usuarioId = url.searchParams.get('usuarioId')
  const entidad = url.searchParams.get('entidad')
  const accion = url.searchParams.get('accion')
  const resultado = url.searchParams.get('resultado')
  const exportar = url.searchParams.get('export')
  // ?limit= configurable (10/25/50/100, defecto 25) — antes era fijo 100.
  const pag = paginacionDesde(req) ?? { page: 1, limit: 25, skip: 0 }

  // Filtros por fecha civil en la zona del negocio (no la del servidor)
  const dDesde = desde ? ventanaDia(desde).inicio : null
  const dHasta = hasta ? ventanaDia(hasta).fin : null

  const where = {
    ...(dDesde || dHasta ? { fecha: { ...(dDesde ? { gte: dDesde } : {}), ...(dHasta ? { lt: dHasta } : {}) } } : {}),
    ...(usuarioId ? { usuarioId } : {}),
    ...(entidad ? { entidad } : {}),
    ...(accion ? { accion: { contains: accion } } : {}),
    ...(resultado ? { resultado } : {}),
  }

  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      include: {
        usuario: { select: { nombre: true, username: true } },
        taller: { select: { nombre: true } },
      },
      orderBy: { fecha: 'desc' },
      ...(exportar ? {} : { skip: pag.skip, take: pag.limit }),
    }),
  ])

  if (exportar === 'csv') {
    const filas = logs.map((l) => ({
      fecha: l.fecha.toISOString(),
      usuario: l.usuario?.username ?? '',
      accion: l.accion,
      entidad: l.entidad,
      entidadId: l.entidadId ?? '',
      resultado: l.resultado,
      taller: l.taller?.nombre ?? '',
      datosAntes: l.datosAntes ?? '',
      datosDespues: l.datosDespues ?? '',
    }))
    return respuestaCsv(csv(filas), 'logs.csv')
  }
  if (exportar === 'json') {
    return new NextResponse(JSON.stringify(logs, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="logs.json"',
      },
    })
  }

  const entidades = [...new Set((await db.auditLog.findMany({ select: { entidad: true }, take: 2000 })).map((l) => l.entidad))]

  return NextResponse.json(
    serializar({
      logs: logs.map((l) => ({
        ...l,
        datosAntes: l.datosAntes ? JSON.parse(l.datosAntes) : null,
        datosDespues: l.datosDespues ? JSON.parse(l.datosDespues) : null,
      })),
      total,
      page: pag.page,
      limit: pag.limit,
      paginas: metaPaginacion(total, pag.limit).totalPages,
      entidades,
    })
  )
})
