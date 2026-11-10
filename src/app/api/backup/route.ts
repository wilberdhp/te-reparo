import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, requireAuth } from '@/lib/http'
import { registrarLog } from '@/lib/audit'

/** GET /api/backup — SOLO ADMIN: export manual completo (JSON). */
export const GET = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req, ['ADMIN'])

  const [
    talleres, usuarios, operarios, operarioTaller, productos, movimientos,
    transferencias, clientes, ventas, ventaItems, pagosVenta, devoluciones,
    devolucionItems, garantias, liquidaciones, liquidacionLineas, pagosLiquidacion,
    ajustesLiquidacion, tasas, auditLogs, ajustes,
  ] = await Promise.all([
    db.taller.findMany(), db.usuario.findMany({
      select: { id: true, nombre: true, username: true, rol: true, tallerId: true, operarioId: true, activo: true, createdAt: true, updatedAt: true },
    }),
    db.operario.findMany(), db.operarioTaller.findMany(),
    db.producto.findMany(), db.movimientoInventario.findMany(),
    db.transferencia.findMany(), db.cliente.findMany(),
    db.venta.findMany(), db.ventaItem.findMany(), db.pagoVenta.findMany(),
    db.devolucion.findMany(), db.devolucionItem.findMany(), db.garantia.findMany(),
    db.liquidacionOperario.findMany(), db.liquidacionLinea.findMany(), db.pagoLiquidacion.findMany(),
    db.ajusteLiquidacion.findMany(), db.tasaCambio.findMany(),
    db.auditLog.findMany(), db.ajuste.findMany(),
  ])

  await registrarLog({
    req,
    usuarioId: usuario.id,
    accion: 'EXPORTAR_BACKUP',
    entidad: 'Sistema',
    resultado: 'OK',
    despues: { fecha: new Date().toISOString() },
  })

  const datos = {
    generadoEn: new Date().toISOString(),
    version: 1,
    tablas: {
      talleres, usuarios, operarios, operarioTaller, productos, movimientos,
      transferencias, clientes, ventas, ventaItems, pagosVenta, devoluciones,
      devolucionItems, garantias, liquidaciones, liquidacionLineas, pagosLiquidacion,
      ajustesLiquidacion, tasas, auditLogs, ajustes,
    },
  }

  const fecha = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(datos, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="te-reparo-backup-${fecha}.json"`,
    },
  })
})
