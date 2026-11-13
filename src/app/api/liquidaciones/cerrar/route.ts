import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth, requireTaller } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { cerrarLiquidacionSchema } from '@/lib/validaciones'
import { serializar, D } from '@/lib/money'
import { calcularLiquidacion } from '@/lib/liquidacion'
import { costoAdicionalEnCUP } from '@/lib/pagos'
import { parseFechaCorta, claveHoy, ventanaDia, etiquetaDeClave } from '@/lib/fecha'
import { ajusteValor } from '@/lib/ajustes'
import { siguienteSecuencia, codigoComprobante } from '@/lib/codigos'

/**
 * POST /api/liquidaciones/cerrar — SOLO ADMIN (PRD §4.6/§5.11).
 * Transacción: bloquea la liquidación del día (ya no se recalcula), persiste las
 * líneas calculadas y genera un comprobante de pago por operario
 * (PagoLiquidacion.comprobanteCodigo único).
 */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req, ['ADMIN'])
  const datos = cerrarLiquidacionSchema.parse(await req.json())
  const fecha = parseFechaCorta(datos.fecha) ?? claveHoy()
  // Ventana del día civil en la zona del negocio (ver lib/fecha.ts)
  const { inicio: inicioVentana, fin: finVentana } = ventanaDia(etiquetaDeClave(fecha))
  const taller = await requireTaller(req, usuario, datos.tallerId, { permitirInactivo: true })
  const porcentajeAdmin = D(await ajusteValor('porcentajeAdmin', '0'))

  const resultado = await db.$transaction(async (tx) => {
    let liquidacion = await tx.liquidacionOperario.findUnique({
      where: { tallerId_fecha: { tallerId: taller.id, fecha } },
    })
    if (!liquidacion) {
      liquidacion = await tx.liquidacionOperario.create({
        data: { tallerId: taller.id, fecha, estado: 'ABIERTA', totalCUP: D(0) },
      })
    }
    if (liquidacion.estado === 'CERRADA') {
      throw new ApiError(400, 'La liquidación ya está cerrada: no se recalcula')
    }

    // Datos del día (tope de seguridad: ningún findMany sin take)
    const [ventas, operariosTaller, ajustesRows] = await Promise.all([
      tx.venta.findMany({
        where: { tallerId: taller.id, fecha: { gte: inicioVentana, lt: finVentana } },
        include: { items: true },
        take: 5000,
      }),
      tx.operario.findMany({
        where: { activo: true, talleres: { some: { tallerId: taller.id } } },
        take: 500,
      }),
      tx.ajusteLiquidacion.findMany({ where: { liquidacionId: liquidacion.id }, take: 1000 }),
    ])

    const usuariosVinculados = await tx.usuario.findMany({
      where: { operarioId: { not: null }, activo: true },
      select: { id: true, rol: true, operarioId: true },
      take: 500,
    })
    const onlinePorOperario = new Map(
      usuariosVinculados.filter((u) => u.rol === 'VENDEDOR_ONLINE' && u.operarioId).map((u) => [u.operarioId!, u.id])
    )

    // Operarios del taller + operarios con actividad ese día
    const idsEnVentas = new Set<string>()
    for (const v of ventas) for (const it of v.items) if (it.operarioId) idsEnVentas.add(it.operarioId)
    const vendedoresDelDia = await tx.usuario.findMany({
      where: { id: { in: ventas.map((v) => v.vendedorUsuarioId) } },
      select: { operarioId: true },
      take: 500,
    })
    for (const u of vendedoresDelDia) if (u.operarioId) idsEnVentas.add(u.operarioId)
    const extra = idsEnVentas.size
      ? await tx.operario.findMany({ where: { id: { in: [...idsEnVentas] } }, take: 500 })
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

    const calculo = calcularLiquidacion({
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

    // Persistir líneas + comprobantes de pago por operario
    const pagosCreados: Array<{ comprobanteCodigo: string; operarioNombre: string; montoCUP: string }> = []
    for (const linea of calculo.lineas) {
      await tx.liquidacionLinea.create({
        data: {
          liquidacionId: liquidacion.id,
          operarioId: linea.operarioId,
          montoCUP: linea.montoCUP,
          detalle: JSON.stringify({ ...linea.detalle, tipoLinea: linea.tipo }),
        },
      })
      const seq = await siguienteSecuencia(tx, 'comprobante')
      const comprobanteCodigo = codigoComprobante(seq)
      const pago = await tx.pagoLiquidacion.create({
        data: {
          liquidacionId: liquidacion.id,
          operarioId: linea.operarioId,
          montoCUP: linea.montoCUP,
          fechaPago: new Date(),
          comprobanteCodigo,
        },
      })
      pagosCreados.push({
        comprobanteCodigo: pago.comprobanteCodigo,
        operarioNombre: linea.operarioNombre,
        montoCUP: linea.montoCUP.toFixed(2),
      })
    }

    const cerrada = await tx.liquidacionOperario.update({
      where: { id: liquidacion.id },
      data: {
        estado: 'CERRADA',
        totalCUP: calculo.totalLiquidacion,
        cerradaPor: usuario.id,
        fechaCierre: new Date(),
      },
    })

    return { liquidacion: cerrada, calculo, pagosCreados }
  })

  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: taller.id,
    accion: 'CERRAR_LIQUIDACION',
    entidad: 'LiquidacionOperario',
    entidadId: resultado.liquidacion.id,
    resultado: 'OK',
    antes: { estado: 'ABIERTA' },
    despues: {
      estado: 'CERRADA',
      totalCUP: resultado.calculo.totalLiquidacion.toFixed(2),
      comprobantes: resultado.pagosCreados.length,
      fecha: datos.fecha,
    },
  })

  return NextResponse.json(
    serializar({
      liquidacion: resultado.liquidacion,
      calculo: resultado.calculo,
      pagos: resultado.pagosCreados,
    })
  )
})
