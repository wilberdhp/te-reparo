import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth, requireTaller } from '@/lib/http'
import { serializar, D } from '@/lib/money'
import { calcularLiquidacion } from '@/lib/liquidacion'
import { costoAdicionalEnCUP } from '@/lib/pagos'
import { parseFechaCorta, claveHoy, ventanaDia, etiquetaDeClave } from '@/lib/fecha'
import { ajusteValor } from '@/lib/ajustes'

/**
 * GET /api/liquidaciones?tallerId=&fecha=YYYY-MM-DD
 * Vista diaria por taller: cálculo automático por rama (§4.6) mientras está ABIERTA;
 * si está CERRADA se muestran las líneas/pagos persistidos al cierre (no se recalcula).
 * La primera vista del día genera el registro ABIERTA ("ADMIN abre día").
 */
export const GET = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const url = new URL(req.url)
  const tallerId = url.searchParams.get('tallerId')
  const fechaParam = url.searchParams.get('fecha')
  // Clave del día (medianoche UTC de la etiqueta, estable en BD); la ventana
  // de ventas se calcula en la zona del negocio (p. ej. Cuba), no en la del
  // servidor: una venta de las 19:11 de Cuba pertenece a SU día civil.
  const fecha = parseFechaCorta(fechaParam) ?? claveHoy()
  const { inicio: inicioVentana, fin: finVentana } = ventanaDia(etiquetaDeClave(fecha))

  const taller = await requireTaller(req, usuario, tallerId, { permitirInactivo: true })

  // Registro del día (se crea ABIERTA si no existe)
  let liquidacion = await db.liquidacionOperario.findUnique({
    where: { tallerId_fecha: { tallerId: taller.id, fecha } },
  })
  if (!liquidacion) {
    liquidacion = await db.liquidacionOperario.create({
      data: { tallerId: taller.id, fecha, estado: 'ABIERTA', totalCUP: D(0) },
    })
  }

  const porcentajeAdmin = D(await ajusteValor('porcentajeAdmin', '0'))

  // Datos del día (para ABIERTA se calcula en vivo; para CERRADA es solo referencia).
  // Tope de seguridad en cada listado (regla de oro: ningún findMany sin take).
  const [ventas, operariosTaller, ajustesRows] = await Promise.all([
    db.venta.findMany({
      where: { tallerId: taller.id, fecha: { gte: inicioVentana, lt: finVentana } },
      include: { items: true },
      orderBy: { fecha: 'asc' },
      take: 5000,
    }),
    db.operario.findMany({
      where: { activo: true, talleres: { some: { tallerId: taller.id } } },
      include: { talleres: { select: { tallerId: true } } },
      take: 500,
    }),
    db.ajusteLiquidacion.findMany({
      where: { liquidacionId: liquidacion.id },
      include: {
        operario: { select: { nombre: true, rama: true } },
        devolucion: { select: { codigo: true } },
      },
      orderBy: { id: 'asc' },
      take: 1000,
    }),
  ])

  // Operarios vinculados a usuarios VENDEDOR_ONLINE (pago individual)
  const usuariosVinculados = await db.usuario.findMany({
    where: { operarioId: { not: null }, activo: true },
    select: { id: true, rol: true, operarioId: true },
    take: 500,
  })
  const onlinePorOperario = new Map(
    usuariosVinculados.filter((u) => u.rol === 'VENDEDOR_ONLINE' && u.operarioId).map((u) => [u.operarioId!, u.id])
  )

  // Incluir además a los operarios con líneas vendidas ese día aunque no estén
  // registrados en OperarioTaller (p. ej. vendedores en línea rotando)
  const idsEnVentas = new Set<string>()
  for (const v of ventas) for (const it of v.items) if (it.operarioId) idsEnVentas.add(it.operarioId)
  const vendedoresDelDia = await db.usuario.findMany({
    where: { id: { in: ventas.map((v) => v.vendedorUsuarioId) } },
    select: { id: true, operarioId: true, rol: true },
    take: 500,
  })
  for (const u of vendedoresDelDia) if (u.operarioId) idsEnVentas.add(u.operarioId)
  const extra = idsEnVentas.size
    ? await db.operario.findMany({ where: { id: { in: [...idsEnVentas] } }, take: 500 })
    : []

  const operariosInfo = [
    ...operariosTaller,
    ...extra.filter((e) => !operariosTaller.some((o) => o.id === e.id)),
  ]
    .filter((o) => o.activo)
    .map((o) => ({
      id: o.id,
      nombre: o.nombre,
      rama: o.rama,
      esOnline: onlinePorOperario.has(o.id),
      usuarioId: onlinePorOperario.get(o.id) ?? null,
    }))

  const calculo =
    liquidacion.estado === 'CERRADA'
      ? // CERRADA: no se recalcula — se muestran las líneas persistidas al cierre
        await lineasPersistidas(liquidacion.id, D(liquidacion.totalCUP), ventas)
      : calcularLiquidacion({
          ventas: ventas.map((v) => ({
            id: v.id,
            codigo: v.codigo,
            totalCUP: D(v.totalCUP),
            vendedorUsuarioId: v.vendedorUsuarioId,
            items: v.items.map((it) => ({
              operarioId: it.operarioId,
              cantidad: it.cantidad,
              subtotalCUP: D(it.subtotalCUP),
              // Costo interno en CUP con las tasas SNAPSHOT de la venta (§2.1/§2.2)
              costoAdicionalCUP: costoAdicionalEnCUP(it.costoAdicional, it.monedaPrecio, {
                USD: D(v.tasaUSDSnapshot),
                EUR: D(v.tasaEURSnapshot),
              }),
              pagoOperarioTipoSnapshot: it.pagoOperarioTipoSnapshot,
              pagoOperarioValorSnapshot: D(it.pagoOperarioValorSnapshot),
            })),
          })),
          operarios: operariosInfo,
          ajustes: ajustesRows.map((a) => ({
            id: a.id,
            operarioId: a.operarioId,
            montoCUP: D(a.montoCUP),
            motivo: a.motivo,
            devolucionId: a.devolucionId,
          })),
          porcentajeAdmin,
        })

  // Comprobantes emitidos (si está cerrada)
  const pagos = await db.pagoLiquidacion.findMany({
    where: { liquidacionId: liquidacion.id },
    include: { operario: { select: { nombre: true, rama: true } } },
    orderBy: { comprobanteCodigo: 'asc' },
    take: 500,
  })

  return NextResponse.json(
    serializar({
      liquidacion,
      calculo,
      ajustes: ajustesRows,
      pagos,
      resumenVentas: {
        cantidad: ventas.length,
        total: calculo.totalVentasDia,
        codigos: ventas.map((v) => v.codigo),
      },
      fecha: etiquetaDeClave(fecha),
      taller,
      porcentajeAdmin,
    })
  )
})

export const dynamic = 'force-dynamic'

/** Líneas persistidas al cierre (la liquidación cerrada no se recalcula). */
async function lineasPersistidas(
  liquidacionId: string,
  totalCUP: import('decimal.js').Decimal,
  ventas: Array<{ totalCUP: import('@prisma/client').Prisma.Decimal }>
) {
  const lineas = await db.liquidacionLinea.findMany({
    where: { liquidacionId },
    include: { operario: { select: { nombre: true, rama: true } } },
    orderBy: { id: 'asc' },
    take: 500,
  })
  return {
    totalVentasDia: ventas.reduce((acc, v) => acc.plus(D(v.totalCUP)), D(0)),
    totalLiquidacion: totalCUP,
    lineas: lineas.map((l) => ({
      operarioId: l.operarioId,
      operarioNombre: l.operario.nombre,
      rama: l.operario.rama,
      tipo: (JSON.parse(l.detalle || '{}').tipoLinea ?? 'AJUSTE') as string,
      montoCUP: D(l.montoCUP),
      detalle: JSON.parse(l.detalle || '{}'),
    })),
  }
}
