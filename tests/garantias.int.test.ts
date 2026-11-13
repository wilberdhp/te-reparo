import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import type { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { crearToken, COOKIE_SESION } from '../src/lib/auth'

const db = new PrismaClient()

/**
 * Test de INTEGRACIÓN de la sección de Garantías:
 *  - GET /api/garantias debe listar las garantías OTORGADAS por ventas (ítems
 *    vendidos con días de garantía > 0), con vencimiento y vigencia — antes la
 *    sección solo mostraba reclamos y una venta de un producto con garantía no
 *    aparecía en ningún lado (bug reportado).
 *  - Un ítem totalmente devuelto no conserva garantía.
 *  - POST registra el reclamo y queda visible en ambas listas (reclamos + contador).
 */

const TALLER = 'test-taller-gar'
let tokenAdmin = ''
let itemConGarantiaId = ''
let itemDevueltoId = ''

function mockReq(url: string, body?: unknown) {
  return {
    cookies: {
      get: (name: string) => (name === COOKIE_SESION ? { value: tokenAdmin } : undefined),
    },
    headers: { get: () => null },
    url,
    json: async () => body,
  } as unknown as NextRequest
}

async function crearVenta(codigo: string, adminId: string, productoId: string, opts?: { devuelta?: boolean; garantiaDias?: number; pagoPct?: number }) {
  const v = await db.venta.create({
    data: {
      codigo,
      tallerId: TALLER,
      vendedorUsuarioId: adminId,
      estado: 'COMPLETADA',
      totalCUP: 1000,
      tasaUSDSnapshot: 400,
      tasaEURSnapshot: 430,
      ventaMostrador: true,
    },
  })
  return db.ventaItem.create({
    data: {
      ventaId: v.id,
      productoId,
      cantidad: 1,
      cantidadDevuelta: opts?.devuelta ? 1 : 0,
      precioUnitario: 1000,
      monedaPrecio: 'CUP',
      precioUnitarioCUP: 1000,
      subtotalCUP: 1000,
      pagoOperarioTipoSnapshot: 'PORCENTAJE',
      pagoOperarioValorSnapshot: opts?.pagoPct ?? 5,
      garantiaDiasSnapshot: opts?.garantiaDias ?? 30,
    },
  })
}

async function limpiar() {
  await db.garantia.deleteMany({ where: { ventaItem: { venta: { tallerId: TALLER } } } })
  const ventas = await db.venta.findMany({ where: { tallerId: TALLER } })
  for (const v of ventas) {
    await db.ventaItem.deleteMany({ where: { ventaId: v.id } })
    await db.venta.deleteMany({ where: { id: v.id } })
  }
  const prods = await db.producto.findMany({ where: { tallerId: TALLER } })
  for (const p of prods) {
    await db.movimientoInventario.deleteMany({ where: { productoId: p.id } })
    await db.producto.delete({ where: { id: p.id } })
  }
  const u = await db.usuario.findFirst({ where: { tallerId: TALLER } })
  const admin = await db.usuario.findFirst({ where: { username: 'admin.test.gar' } })
  for (const usuario of [u, admin]) {
    if (usuario) {
      await db.auditLog.deleteMany({ where: { usuarioId: usuario.id } })
      await db.usuario.delete({ where: { id: usuario.id } })
    }
  }
  const op = await db.operario.findFirst({ where: { nombre: 'Admin Test Gar' } })
  if (op) {
    await db.operarioTaller.deleteMany({ where: { operarioId: op.id } })
    await db.operario.delete({ where: { id: op.id } })
  }
  await db.taller.deleteMany({ where: { id: TALLER } })
}

beforeAll(async () => {
  await limpiar()
  const taller = await db.taller.create({
    data: { id: TALLER, nombre: 'Taller Test Garantías', direccion: 'x', telefono: 'x' },
  })
  const operario = await db.operario.create({
    data: { nombre: 'Admin Test Gar', rama: 'ADMIN', talleres: { create: { tallerId: taller.id } } },
  })
  const admin = await db.usuario.create({
    data: {
      nombre: 'Admin Test Gar',
      username: 'admin.test.gar',
      passwordHash: bcrypt.hashSync('clave123', 10),
      rol: 'ADMIN',
      tallerId: null,
      operarioId: operario.id,
    },
  })
  tokenAdmin = await crearToken({ sub: admin.id, username: admin.username, rol: 'ADMIN' })

  const producto = await db.producto.create({
    data: {
      tallerId: taller.id,
      codigoInterno: 'GAR-000001',
      codigoBarras: 'GAR-000001',
      categoria: 'Test',
      nombre: 'Producto Con Garantía',
      tipo: 'VENTA',
      cantidad: 5,
      costo: 100,
      precio: 1000,
      monedaPrecio: 'CUP',
      pagoOperarioTipo: 'PORCENTAJE',
      pagoOperarioValor: 5,
      garantiaDias: 30,
    },
  })

  // Venta con ítem con garantía (escenario reportado: 5% + 30 días)
  const item1 = await crearVenta('VGAR0001', admin.id, producto.id)
  itemConGarantiaId = item1.id
  // Venta totalmente devuelta: NO conserva garantía
  const item2 = await crearVenta('VGAR0002', admin.id, producto.id, { devuelta: true })
  itemDevueltoId = item2.id
  // Ítem sin días de garantía: no debe aparecer
  await crearVenta('VGAR0003', admin.id, producto.id, { garantiaDias: 0 })
})

afterAll(async () => {
  await limpiar()
  await db.$disconnect()
})

describe('Sección de Garantías (integración)', () => {
  test('GET lista las garantías otorgadas por ventas (vencimiento + vigencia)', async () => {
    const { GET } = await import('../src/app/api/garantias/route')
    const res = await GET(mockReq(`http://localhost:3000/api/garantias?tallerId=${TALLER}`))
    expect(res.status).toBe(200)
    const datos = await res.json()

    // Solo el ítem con garantía no devuelto; el devuelto y el sin garantía quedan fuera
    expect(datos.garantiasVentas.length).toBe(1)
    const g = datos.garantiasVentas[0]
    expect(g.id).toBe(itemConGarantiaId)
    expect(g.venta.codigo).toBe('VGAR0001')
    expect(g.producto.nombre).toBe('Producto Con Garantía')
    expect(g.garantiaDias).toBe(30)
    expect(g.reclamos).toBe(0)
    expect(g.vigente).toBe(true)
    expect(new Date(g.vence).getTime()).toBeGreaterThan(Date.now())
    // Aún no hay reclamos
    expect(datos.garantias.length).toBe(0)
  })

  test('POST registra un reclamo y queda visible en ambas vistas', async () => {
    const { POST } = await import('../src/app/api/garantias/route')
    const res = await POST(
      mockReq('http://localhost:3000/api/garantias', {
        ventaItemId: itemConGarantiaId,
        descripcion: 'Pantalla con puntos muertos',
        tipo: 'REPARACION',
      })
    )
    expect(res.status).toBe(200)

    const { GET } = await import('../src/app/api/garantias/route')
    const res2 = await GET(mockReq(`http://localhost:3000/api/garantias?tallerId=${TALLER}`))
    const datos = await res2.json()
    expect(datos.garantias.length).toBe(1)
    expect(datos.garantias[0].tipo).toBe('REPARACION')
    expect(datos.garantias[0].ventaItem.venta.codigo).toBe('VGAR0001')
    // El contador de reclamos de la garantía de venta sube a 1
    expect(datos.garantiasVentas[0].reclamos).toBe(1)
  })

  test('GET sin tallerId → 400 (ADMIN debe especificar taller)', async () => {
    const { GET } = await import('../src/app/api/garantias/route')
    const res = await GET(mockReq('http://localhost:3000/api/garantias'))
    expect(res.status).toBe(400)
  })
})
