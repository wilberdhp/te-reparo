import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, requireAuth, csv, respuestaCsv } from '@/lib/http'
import { serializar } from '@/lib/money'

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
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const porPagina = 100

  const dDesde = desde ? new Date(desde + 'T00:00:00') : null
  const dHasta = hasta ? new Date(hasta + 'T23:59:59') : null

  const where = {
    ...(dDesde || dHasta ? { fecha: { ...(dDesde ? { gte: dDesde } : {}), ...(dHasta ? { lte: dHasta } : {}) } } : {}),
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
      ...(exportar ? {} : { skip: (page - 1) * porPagina, take: porPagina }),
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
      page,
      paginas: Math.ceil(total / porPagina),
      entidades,
    })
  )
})
