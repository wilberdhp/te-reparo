import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import type { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { crearToken, COOKIE_SESION } from '../src/lib/auth'

const db = new PrismaClient()

/**
 * Test de INTEGRACIÓN del flujo de venta (PRD §7: "tests de integración para flujo
 * de venta"). Llama al handler POST /api/ventas real con la base de datos SQLite y
 * verifica la transacción atómica: si falla un paso, no queda venta parcial.
 */

const TALLER = 'test-taller-int'
let usuarioId: string
let productoId: string
let operarioId: string
let plantillaId: string

function mockReq(token: string, body: unknown) {
  return {
    cookies: {
      get: (name: string) => (name === COOKIE_SESION ? { value: token } : undefined),
    },
    headers: { get: () => null },
    url: 'http://localhost:3000/api/ventas',
    json: async () => body,
  } as unknown as NextRequest
}

let tokenVendedor = ''

beforeAll(async () => {
  // Limpieza defensiva de corridas anteriores
  await limpiar()

  const taller = await db.taller.create({
    data: { id: TALLER, nombre: 'Taller Test Integración', direccion: 'x', telefono: 'x' },
  })
  const operario = await db.operario.create({
    data: { nombre: 'Técnico Test', rama: 'INFORMATICO', talleres: { create: { tallerId: taller.id } } },
  })
  const usuario = await db.usuario.create({
    data: {
      nombre: 'Vendedor Test',
      username: 'vendedor.test',
      passwordHash: bcrypt.hashSync('clave123', 10),
      rol: 'VENDEDOR',
      tallerId: taller.id,
      operarioId: operario.id,
    },
  })
  const producto = await db.producto.create({
    data: {
      tallerId: taller.id,
      codigoInterno: 'TST-000001',
      codigoBarras: 'TST-000001',
      categoria: 'Test',
      nombre: 'Producto Test Integración',
      tipo: 'VENTA',
      cantidad: 0,
      costo: 100,
      precio: 500,
      monedaPrecio: 'CUP',
      pagoOperarioTipo: 'FIJO',
      pagoOperarioValor: 50,
      garantiaDias: 30,
    },
  })
  // Stock inicial vía movimiento ENTRADA (regla: stock nunca se edita directo)
  await db.movimientoInventario.create({
    data: { productoId: producto.id, tipo: 'ENTRADA', cantidad: 10, costoUnitario: 100 },
  })
  await db.producto.update({ where: { id: producto.id }, data: { cantidad: 10 } })

  usuarioId = usuario.id
  operarioId = operario.id
  productoId = producto.id

  // Plantilla de ticket para probar la venta con plantilla seleccionada
  const plantilla = await db.plantillaTicket.create({
    data: { nombre: 'Plantilla Test', contenido: '{{taller_nombre}}\n{{items_detalle}}', activo: true },
  })
  plantillaId = plantilla.id

  tokenVendedor = await crearToken({ sub: usuario.id, username: usuario.username, rol: 'VENDEDOR' })
})

async function limpiar() {
  const ventas = await db.venta.findMany({ where: { tallerId: TALLER } })
  for (const v of ventas) {
    await db.movimientoInventario.deleteMany({ where: { ventaId: v.id } })
    await db.pagoVenta.deleteMany({ where: { ventaId: v.id } })
    await db.ventaItem.deleteMany({ where: { ventaId: v.id } })
    await db.venta.deleteMany({ where: { id: v.id } })
  }
  await db.plantillaTicket.deleteMany({ where: { nombre: 'Plantilla Test' } })
  const prods = await db.producto.findMany({ where: { tallerId: TALLER } })
  for (const p of prods) {
    await db.movimientoInventario.deleteMany({ where: { productoId: p.id } })
    await db.producto.delete({ where: { id: p.id } })
  }
  const u = await db.usuario.findFirst({ where: { tallerId: TALLER } })
  if (u) {
    await db.auditLog.deleteMany({ where: { usuarioId: u.id } })
    await db.usuario.delete({ where: { id: u.id } })
  }
  const op = await db.operario.findFirst({ where: { nombre: 'Técnico Test' } })
  if (op) {
    await db.operarioTaller.deleteMany({ where: { operarioId: op.id } })
    await db.operario.delete({ where: { id: op.id } })
  }
  await db.taller.deleteMany({ where: { id: TALLER } })
}

afterAll(async () => {
  await limpiar()
  await db.$disconnect()
})

describe('Flujo de venta (integración, transacción atómica)', () => {
  test('Venta exitosa: crea venta+ítems+pagos+movimiento y descuenta stock', async () => {
    const { POST } = await import('../src/app/api/ventas/route')
    const res = await POST(
      mockReq(tokenVendedor, {
        tallerId: TALLER,
        clienteId: null,
        items: [{ productoId, cantidad: 2, operarioId }],
        pagos: [{ metodo: 'EFECTIVO', moneda: 'CUP', monto: 1000 }],
      })
    )
    expect(res.status).toBe(200)
    const datos = await res.json()
    expect(datos.venta.codigo).toMatch(/^V\d{6}$/)

    const venta = await db.venta.findUnique({
      where: { id: datos.venta.id },
      include: { items: true, pagos: true },
    })
    expect(venta).not.toBeNull()
    expect(venta!.totalCUP.toString()).toBe('1000')
    expect(venta!.ventaMostrador).toBe(true)

    const item = venta!.items[0]
    expect(item.cantidad).toBe(2)
    expect(item.subtotalCUP.toString()).toBe('1000')
    expect(item.operarioId).toBe(operarioId)
    expect(item.pagoOperarioTipoSnapshot).toBe('FIJO') // snapshot
    expect(item.pagoOperarioValorSnapshot.toString()).toBe('50')
    expect(item.garantiaDiasSnapshot).toBe(30)

    const pago = venta!.pagos[0]
    expect(pago.metodo).toBe('EFECTIVO')
    expect(pago.montoCUP.toString()).toBe('1000')

    const mov = await db.movimientoInventario.findFirst({ where: { ventaId: venta!.id } })
    expect(mov?.tipo).toBe('VENTA')
    expect(mov?.cantidad).toBe(2)
    expect(mov?.costoUnitario.toString()).toBe('100')

    const producto = await db.producto.findUnique({ where: { id: productoId } })
    expect(producto?.cantidad).toBe(8) // 10 - 2

    const log = await db.auditLog.findFirst({ where: { entidad: 'Venta', entidadId: venta!.id } })
    expect(log?.resultado).toBe('OK')
  })

  test('Pago insuficiente: rechazada y SIN estado parcial (atómica)', async () => {
    const { POST } = await import('../src/app/api/ventas/route')
    const stockAntes = await db.producto.findUnique({ where: { id: productoId } })
    const ventasAntes = await db.venta.count({ where: { tallerId: TALLER } })
    const movsAntes = await db.movimientoInventario.count({ where: { productoId } })

    const res = await POST(
      mockReq(tokenVendedor, {
        tallerId: TALLER,
        items: [{ productoId, cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', moneda: 'CUP', monto: 100 }], // insuficiente (500)
      })
    )
    expect(res.status).toBe(400)

    // Nada cambió: sin venta nueva, sin movimientos, stock intacto
    expect(await db.venta.count({ where: { tallerId: TALLER } })).toBe(ventasAntes)
    expect(await db.movimientoInventario.count({ where: { productoId } })).toBe(movsAntes)
    const stockDespues = await db.producto.findUnique({ where: { id: productoId } })
    expect(stockDespues?.cantidad).toBe(stockAntes?.cantidad)
  })

  test('Stock insuficiente: rechazada sin movimiento ni venta', async () => {
    const { POST } = await import('../src/app/api/ventas/route')
    const res = await POST(
      mockReq(tokenVendedor, {
        tallerId: TALLER,
        items: [{ productoId, cantidad: 999 }],
        pagos: [{ metodo: 'EFECTIVO', moneda: 'CUP', monto: 999 * 500 }],
      })
    )
    expect(res.status).toBe(400)
    const cuerpo = await res.json()
    expect(cuerpo.error).toContain('Stock insuficiente')
    const producto = await db.producto.findUnique({ where: { id: productoId } })
    expect(producto?.cantidad).toBe(8) // sin cambios
  })

  test('Zelle sin referencia o fuera de USD: rechazada', async () => {
    const { POST } = await import('../src/app/api/ventas/route')
    const r1 = await POST(
      mockReq(tokenVendedor, {
        tallerId: TALLER,
        items: [{ productoId, cantidad: 1 }],
        pagos: [{ metodo: 'ZELLE', moneda: 'USD', monto: 2 }],
      })
    )
    expect(r1.status).toBe(400)
    const cuerpo = await r1.json()
    expect(cuerpo.error).toContain('referencia')

    const r2 = await POST(
      mockReq(tokenVendedor, {
        tallerId: TALLER,
        items: [{ productoId, cantidad: 1 }],
        pagos: [{ metodo: 'ZELLE', moneda: 'CUP', monto: 500, referencia: 'x' }],
      })
    )
    expect(r2.status).toBe(400)
    expect((await r2.json()).error).toContain('Zelle solo')
  })

  test('Sin sesión válida → 401 (verificación en servidor)', async () => {
    const { POST } = await import('../src/app/api/ventas/route')
    const res = await POST(mockReq('token-invalido', { tallerId: TALLER, items: [], pagos: [] }))
    expect(res.status).toBe(401)
  })

  test('Rol sin permisos (VENDEDOR creando taller) → 403 y registro DENEGADO en auditoría', async () => {
    const { POST } = await import('../src/app/api/talleres/route')
    const logsAntes = await db.auditLog.count({ where: { usuarioId, resultado: 'DENEGADO' } })
    const res = await POST(mockReq(tokenVendedor, { nombre: 'Taller Hackeado', direccion: '', telefono: '' }))
    expect(res.status).toBe(403)
    const logsDespues = await db.auditLog.count({ where: { usuarioId, resultado: 'DENEGADO' } })
    expect(logsDespues).toBe(logsAntes + 1)
  })

  test('Costo interno + nota de línea + plantilla: se persisten y NO cambian el total', async () => {
    const { POST } = await import('../src/app/api/ventas/route')
    const res = await POST(
      mockReq(tokenVendedor, {
        tallerId: TALLER,
        plantillaId,
        items: [{ productoId, cantidad: 1, operarioId, costoAdicional: 250.5, descripcionAdicional: 'IMEI 123 · bordes negros' }],
        pagos: [{ metodo: 'EFECTIVO', moneda: 'CUP', monto: 500 }],
      })
    )
    expect(res.status).toBe(200)
    const datos = await res.json()

    const venta = await db.venta.findUnique({
      where: { id: datos.venta.id },
      include: { items: true },
    })
    expect(venta).not.toBeNull()
    expect(venta!.totalCUP.toString()).toBe('500') // el costo interno NO suma al total
    expect(venta!.plantillaId).toBe(plantillaId)

    const item = venta!.items[0]
    expect(item.costoAdicional?.toString()).toBe('250.5')
    expect(item.descripcionAdicional).toBe('IMEI 123 · bordes negros')

    // Auditoría: plantilla usada para imprimir la venta (§7)
    const logPlantilla = await db.auditLog.findFirst({
      where: { accion: 'SELECCIONAR_PLANTILLA', entidadId: venta!.id },
    })
    expect(logPlantilla?.resultado).toBe('OK')
  })

  test('Costo interno mayor que el precio de venta: la venta SE PERMITE (pérdida asumida)', async () => {
    const { POST } = await import('../src/app/api/ventas/route')
    const res = await POST(
      mockReq(tokenVendedor, {
        tallerId: TALLER,
        items: [{ productoId, cantidad: 1, operarioId, costoAdicional: 999 }],
        pagos: [{ metodo: 'EFECTIVO', moneda: 'CUP', monto: 500 }],
      })
    )
    expect(res.status).toBe(200)
    const venta = await db.venta.findUnique({
      where: { id: (await res.json()).venta.id },
      include: { items: true },
    })
    expect(venta!.totalCUP.toString()).toBe('500') // total intacto pese al costo excesivo
    expect(venta!.items[0].costoAdicional?.toString()).toBe('999')
  })

  test('Plantilla inválida o desactivada: venta rechazada (atómica)', async () => {
    const { POST } = await import('../src/app/api/ventas/route')
    const desactivada = await db.plantillaTicket.create({
      data: { nombre: 'Plantilla Test Off', contenido: 'x', activo: false },
    })
    const ventasAntes = await db.venta.count({ where: { tallerId: TALLER } })
    const res = await POST(
      mockReq(tokenVendedor, {
        tallerId: TALLER,
        plantillaId: desactivada.id,
        items: [{ productoId, cantidad: 1, operarioId }],
        pagos: [{ metodo: 'EFECTIVO', moneda: 'CUP', monto: 500 }],
      })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Plantilla')
    expect(await db.venta.count({ where: { tallerId: TALLER } })).toBe(ventasAntes)
    await db.plantillaTicket.delete({ where: { id: desactivada.id } })
  })
})
