// Verifica el resultado de la transferencia: producto en destino + movimientos.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const origen = await db.producto.findUnique({
    where: { tallerId_codigoInterno: { tallerId: 'taller-republica', codigoInterno: 'REP-000431' } },
    include: { movimientos: { orderBy: { fecha: 'desc' }, take: 3 } },
  })
  const destino = await db.producto.findFirst({
    where: { tallerId: 'taller-lacaridad', nombre: origen!.nombre },
    include: { movimientos: { orderBy: { fecha: 'desc' }, take: 3 } },
  })
  console.log('Origen (República):', origen!.nombre, '| stock:', origen!.cantidad)
  console.log('  Últimos movimientos:', origen!.movimientos.map((m) => `${m.tipo}:${m.cantidad}`).join(', '))
  if (!destino) {
    console.log('✗ No existe el producto en La Caridad')
    return
  }
  console.log('Destino (La Caridad):', destino.nombre, '| stock:', destino.cantidad, '| código:', destino.codigoInterno, '| precio:', destino.precio.toString(), destino.monedaPrecio)
  console.log('  Últimos movimientos:', destino.movimientos.map((m) => `${m.tipo}:${m.cantidad}`).join(', '))
  const tr = await db.transferencia.findFirst({ orderBy: { fecha: 'desc' } })
  console.log('Transferencia:', tr?.cantidad, 'u | nota:', tr?.nota, '| destino:', tr?.tallerDestinoId)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
