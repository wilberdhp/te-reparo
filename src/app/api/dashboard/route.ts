import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, requireAuth, requireTaller, csv, respuestaCsv } from '@/lib/http'
import { serializar, D, d2 } from '@/lib/money'
import { inicioDia, finDia, fechaCorta, claveHoy } from '@/lib/fecha'
import { calcularLiquidacion } from '@/lib/liquidacion'
import { costoAdicionalEnCUP } from '@/lib/pagos'
import { ajusteValor } from '@/lib/ajustes'
import { esServicio } from '@/lib/constantes'

/**
 * GET /api/dashboard?tallerId= — panel del día:
 *  - ventas del día en CUP (por taller: solo ADMIN y VENDEDOR_ONLINE)
 *  - productos más vendidos, stock bajo, pagos del día por operario,
 *    ventas por método y moneda. ?export=csv disponible.
 */
export const GET = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const url = new URL(req.url)
  const tallerId = url.searchParams.get('tallerId')
  const exportar = url.searchParams.get('export')
  const desde = inicioDia()
  const hasta = finDia()

  const taller = await requireTaller(req, usuario, tallerId, { permitirInactivo: true })
  const puedeVerTodos = usuario.rol === 'ADMIN' || usuario.rol === 'VENDEDOR_ONLINE'

  const [ventasHoy, pagosHoy, productos, porcentajeAdmin] = await Promise.all([
    db.venta.findMany({
      where: { fecha: { gte: desde, lt: hasta }, ...(taller ? { tallerId: taller.id } : {}) },
      include: {
        taller: { select: { nombre: true } },
        items: { include: { producto: { select: { nombre: true, tipo: true } } } },
      },
      take: 5000,
    }),
    db.pagoVenta.findMany({
      where: { venta: { fecha: { gte: desde, lt: hasta }, tallerId: taller.id } },
      include: { venta: { select: { codigo: true } } },
      take: 5000,
    }),
    db.producto.findMany({ where: { tallerId: taller.id, activo: true }, take: 5000 }),
    ajusteValor('porcentajeAdmin', '0'),
  ])

  // Ventas por taller (solo ADMIN / VENDEDOR_ONLINE)
  let ventasPorTaller: Array<{ taller: string; totalCUP: number; cantidad: number }> = []
  if (puedeVerTodos) {
    const todas = await db.venta.findMany({
      where: { fecha: { gte: desde, lt: hasta } },
      include: { taller: { select: { nombre: true } } },
      take: 5000,
    })
    const mapa = new Map<string, { total: number; cantidad: number }>()
    for (const v of todas) {
      const e = mapa.get(v.taller.nombre) ?? { total: 0, cantidad: 0 }
      e.total += D(v.totalCUP).toNumber()
      e.cantidad++
      mapa.set(v.taller.nombre, e)
    }
    ventasPorTaller = [...mapa.entries()].map(([t, e]) => ({ taller: t, totalCUP: d2(D(e.total)).toNumber(), cantidad: e.cantidad }))
  }

  // Totales del taller activo
  const totalDia = ventasHoy.reduce((acc, v) => acc.plus(D(v.totalCUP)), D(0))

  // Productos más vendidos (por unidades)
  const conteo = new Map<string, { nombre: string; unidades: number; importe: number }>()
  for (const v of ventasHoy) {
    for (const it of v.items) {
      const e = conteo.get(it.producto.nombre) ?? { nombre: it.producto.nombre, unidades: 0, importe: 0 }
      e.unidades += it.cantidad
      e.importe += D(it.subtotalCUP).toNumber()
      conteo.set(it.producto.nombre, e)
    }
  }
  const masVendidos = [...conteo.values()].sort((a, b) => b.unidades - a.unidades).slice(0, 8)

  // Stock bajo (solo productos físicos)
  const stockBajo = productos
    .filter((p) => !esServicio(p.tipo) && p.cantidad <= p.stockMinimo)
    .map((p) => ({ id: p.id, nombre: p.nombre, cantidad: p.cantidad, stockMinimo: p.stockMinimo }))

  // Ventas por método y moneda
  const porMetodoMoneda: Record<string, number> = {}
  for (const pago of pagosHoy) {
    const clave = `${pago.metodo}-${pago.moneda}`
    porMetodoMoneda[clave] = d2(D((porMetodoMoneda[clave] ?? 0) + D(pago.montoCUP).toNumber())).toNumber()
  }

  // Pagos del día por operario (vista liquidación del día)
  const [operariosTaller, ajustesRows] = await Promise.all([
    db.operario.findMany({
      where: { activo: true, talleres: { some: { tallerId: taller.id } } },
      take: 500,
    }),
    db.ajusteLiquidacion.findMany({
      // La liquidación se busca por CLAVE del día (medianoche UTC de la
      // etiqueta), no por el inicio de la ventana civil.
      where: { liquidacion: { tallerId: taller.id, fecha: claveHoy() } },
      take: 1000,
    }),
  ])
  const usuariosVinculados = await db.usuario.findMany({
    where: { operarioId: { not: null }, activo: true },
    select: { id: true, rol: true, operarioId: true },
    take: 500,
  })
  const onlinePorOperario = new Map(
    usuariosVinculados.filter((u) => u.rol === 'VENDEDOR_ONLINE' && u.operarioId).map((u) => [u.operarioId!, u.id])
  )
  const calculo = calcularLiquidacion({
    ventas: ventasHoy.map((v) => ({
      id: v.id,
      codigo: v.codigo,
      totalCUP: D(v.totalCUP),
      vendedorUsuarioId: v.vendedorUsuarioId,
      items: v.items.map((it) => ({
        operarioId: it.operarioId,
        cantidad: it.cantidad,
        subtotalCUP: D(it.subtotalCUP),
        // Costo interno en CUP con las tasas SNAPSHOT de la venta (igual que
        // liquidaciones: el pago PORCENTAJE descuenta el costo interno)
        costoAdicionalCUP: costoAdicionalEnCUP(it.costoAdicional, it.monedaPrecio, {
          USD: D(v.tasaUSDSnapshot),
          EUR: D(v.tasaEURSnapshot),
        }),
        pagoOperarioTipoSnapshot: it.pagoOperarioTipoSnapshot,
        pagoOperarioValorSnapshot: D(it.pagoOperarioValorSnapshot),
      })),
    })),
    operarios: operariosTaller.map((o) => ({
      id: o.id, nombre: o.nombre, rama: o.rama,
      esOnline: onlinePorOperario.has(o.id), usuarioId: onlinePorOperario.get(o.id) ?? null,
    })),
    ajustes: ajustesRows.map((a) => ({
      id: a.id, operarioId: a.operarioId, montoCUP: D(a.montoCUP), motivo: a.motivo, devolucionId: a.devolucionId,
    })),
    porcentajeAdmin: D(porcentajeAdmin),
  })

  if (exportar === 'csv') {
    const filas = ventasHoy.map((v) => ({
      codigo: v.codigo,
      fecha: v.fecha.toISOString(),
      taller: v.taller.nombre,
      estado: v.estado,
      totalCUP: d2(D(v.totalCUP)).toFixed(2),
    }))
    return respuestaCsv(csv(filas), `dashboard-${fechaCorta()}.csv`)
  }

  return NextResponse.json(
    serializar({
      fecha: fechaCorta(),
      taller,
      ventasDia: { cantidad: ventasHoy.length, totalCUP: totalDia },
      ventasPorTaller,
      masVendidos,
      stockBajo,
      porMetodoMoneda,
      pagosPorOperario: calculo.lineas,
      totalPagosOperario: calculo.totalLiquidacion,
    })
  )
})
