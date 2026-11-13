// Verifica la devolución parcial: estado y total de la venta, movimientos, stock.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const venta = await db.venta.findUnique({
    where: { codigo: 'V000011' },
    include: { items: true, devoluciones: { include: { items: true } } },
  })
  console.log('V000011: estado =', venta!.estado, '| totalCUP =', venta!.totalCUP.toString(), '(esperado 1000 tras devolver 1 de 3 covers de 500)')
  console.log('  Item cover: cantidad =', venta!.items[0].cantidad, '| cantidadDevuelta =', venta!.items[0].cantidadDevuelta)
  const dev = venta!.devoluciones[0]
  console.log('  Devolución:', dev!.codigo, '| totalCUP =', dev!.totalCUP.toString(), '| motivo:', dev!.motivo)

  const cover = await db.producto.findFirst({ where: { nombre: 'COVER XIAOMI 12C', tallerId: 'taller-republica' }, include: { movimientos: { orderBy: { fecha: 'desc' }, take: 3 } } })
  console.log('Cover stock:', cover!.cantidad, '(7 − 3 vendidas = 4; la devolución va a DEFECTUOSO, no recupera stock vendible)')
  console.log('  Movimientos:', cover!.movimientos.map((m) => `${m.tipo}:${m.cantidad}`).join(', '))
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
