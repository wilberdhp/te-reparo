// Verifica la devolución total post-cierre: estado de venta, ajuste en la
// liquidación del DÍA SIGUIENTE (regla: cierre ya emitido).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const venta = await db.venta.findUnique({
    where: { codigo: 'V000012' },
    include: { items: true },
  })
  console.log('V000012: estado =', venta!.estado, '(esperado DEVUELTA_TOTAL) | item devuelto =', venta!.items[0].cantidadDevuelta)

  const ajustes = await db.ajusteLiquidacion.findMany({
    include: { operario: true, liquidacion: true, devolucion: true },
  })
  for (const a of ajustes) {
    const fecha = a.liquidacion.fecha.toISOString().slice(0, 10)
    console.log(`Ajuste: ${a.operario.nombre} ${a.montoCUP.toString()} CUP | liq. ${fecha} (${a.liquidacion.estado}) | ${a.motivo} | dev ${a.devolucion?.codigo}`)
  }

  const dev = await db.devolucion.findUnique({ where: { codigo: 'D000002' }, include: { items: true } })
  console.log('D000002: total =', dev!.totalCUP.toString(), 'CUP | motivo:', dev!.motivo)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
