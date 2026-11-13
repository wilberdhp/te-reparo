import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth, requireTaller } from '@/lib/http'
import { serializar, D } from '@/lib/money'
import { RAMA_LABEL } from '@/lib/constantes'
import { etiquetaDeClave, ventanaDia } from '@/lib/fecha'

/**
 * GET /api/liquidaciones/comprobante?pagoId= — datos del comprobante de pago
 * por operario (imprimible). Contenido según rama (PRD §4.6):
 *  - Vendedor: total del taller del día (regla grupal) y su pago.
 *  - Informático/Electrónico: acumulado individual + nota al pie con el reparto
 *    equitativo como referencia (no afecta el monto).
 *  - Vendedor en línea: detalle de sus ventas y total.
 *  - Admin: base del porcentaje y monto.
 */
export const GET = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const pagoId = new URL(req.url).searchParams.get('pagoId')
  if (!pagoId) throw new ApiError(400, 'Falta pagoId')

  const pago = await db.pagoLiquidacion.findUnique({
    where: { id: pagoId },
    include: {
      operario: true,
      liquidacion: { include: { taller: true } },
    },
  })
  if (!pago) throw new ApiError(404, 'Comprobante no encontrado')
  await requireTaller(req, usuario, pago.liquidacion.tallerId, { permitirInactivo: true })

  const { liquidacion } = pago
  const linea = await db.liquidacionLinea.findFirst({
    where: { liquidacionId: liquidacion.id, operarioId: pago.operarioId },
  })
  const detalle = linea ? JSON.parse(linea.detalle || '{}') : {}
  const ajustes = await db.ajusteLiquidacion.findMany({
    where: { liquidacionId: liquidacion.id, operarioId: pago.operarioId },
    include: { devolucion: { select: { codigo: true } } },
    take: 1000,
  })

  // Detalle de ventas propias (vendedor en línea)
  let ventasPropias: Array<{ codigo: string; totalCUP: string }> = []
  const usuarioVinculado = await db.usuario.findFirst({
    where: { operarioId: pago.operarioId, rol: 'VENDEDOR_ONLINE' },
    select: { id: true },
  })
  if (usuarioVinculado) {
    // Ventana del día civil de la liquidación en la zona del negocio
    const { inicio, fin } = ventanaDia(etiquetaDeClave(liquidacion.fecha))
    const ventas = await db.venta.findMany({
      where: { vendedorUsuarioId: usuarioVinculado.id, tallerId: liquidacion.tallerId, fecha: { gte: inicio, lt: fin } },
      select: { codigo: true, totalCUP: true },
      take: 1000,
    })
    ventasPropias = ventas.map((v) => ({ codigo: v.codigo, totalCUP: D(v.totalCUP).toFixed(2) }))
  }

  const rama = pago.operario.rama
  const esTecnico = rama === 'INFORMATICO' || rama === 'ELECTRONICO'

  return NextResponse.json(
    serializar({
      comprobante: {
        codigo: pago.comprobanteCodigo,
        fechaPago: pago.fechaPago,
        montoCUP: D(pago.montoCUP),
        fechaLiquidacion: etiquetaDeClave(liquidacion.fecha),
        estadoLiquidacion: liquidacion.estado,
        operario: {
          nombre: pago.operario.nombre,
          rama,
          ramaLabel: RAMA_LABEL[rama] ?? rama,
        },
        taller: {
          nombre: liquidacion.taller.nombre,
          direccion: liquidacion.taller.direccion,
          telefono: liquidacion.taller.telefono,
        },
        // Contenido por rama
        tipoLinea: detalle.tipoLinea ?? null,
        base: detalle.base ?? null, // base del grupo (vendedores) o del % (admin)
        formula: detalle.formula ?? detalle.tipo ?? null,
        lineas: detalle.lineas ?? null,
        ventas: detalle.ventas ?? null,
        repartoEquitativo: esTecnico ? detalle.repartoEquitativo ?? null : null, // nota al pie solo técnicos
        ventasPropias,
        ajustes: ajustes.map((a) => ({
          motivo: a.motivo,
          montoCUP: D(a.montoCUP),
          devolucion: a.devolucion?.codigo ?? null,
        })),
      },
    })
  )
})
