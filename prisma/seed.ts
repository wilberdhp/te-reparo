import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

// Seed inicial de "Te Reparo": admin, taller piloto, operarios, tasas y ajustes.
// Ejecutar con: bun prisma/seed.ts   (o `bun run db:seed`)
async function main() {
  // ---------- Taller piloto ----------
  const taller = await db.taller.upsert({
    where: { id: 'taller-piloto' },
    update: {},
    create: {
      id: 'taller-piloto',
      nombre: 'Taller Piloto — Te Reparo',
      direccion: 'Calle Ejemplo No. 1, La Habana',
      telefono: '+53 5 000 0000',
      activo: true,
    },
  })

  // ---------- Operario ADMIN (para el pago por porcentaje del admin) ----------
  const operarioAdmin = await db.operario.upsert({
    where: { id: 'operario-admin' },
    update: {},
    create: {
      id: 'operario-admin',
      nombre: 'Administrador',
      rama: 'ADMIN',
      activo: true,
    },
  })
  await db.operarioTaller.upsert({
    where: { operarioId_tallerId: { operarioId: operarioAdmin.id, tallerId: taller.id } },
    update: {},
    create: { operarioId: operarioAdmin.id, tallerId: taller.id },
  })

  // ---------- Usuario admin (admin / TeReparo2026!) ----------
  const passwordHash = bcrypt.hashSync('TeReparo2026!', 10)
  await db.usuario.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      nombre: 'Administrador',
      passwordHash,
      rol: 'ADMIN',
      tallerId: null,
      operarioId: operarioAdmin.id,
      activo: true,
    },
  })

  // ---------- Tasas de cambio iniciales (actualizables desde la app) ----------
  // Valores por defecto editables — verificar/actualizar al comenzar a operar.
  for (const [moneda, valor] of [['USD', 440], ['EUR', 470]] as const) {
    const existente = await db.tasaCambio.findFirst({
      where: { moneda },
      orderBy: { fechaVigencia: 'desc' },
    })
    if (!existente) {
      await db.tasaCambio.create({
        data: { moneda, valorCUP: valor, fechaVigencia: new Date(), actualizadoPor: null },
      })
    }
  }

  // ---------- Ajustes globales ----------
  const ajustes: Array<[string, string]> = [
    ['ticketAncho', '58'], // 58 | 80 (mm)
    ['ticketEncabezado', 'Te Reparo — Servicio Técnico de Telefonía'],
    ['ticketPie', '¡Gracias por su compra! Garantía según ticket.'],
    ['porcentajeAdmin', '0'], // % que cobra el admin sobre el total vendido del taller
  ]
  for (const [clave, valor] of ajustes) {
    await db.ajuste.upsert({ where: { clave }, update: {}, create: { clave, valor } })
  }

  // ---------- Plantillas de tickets (ejemplos con variables dinámicas) ----------
  const hayPlantillas = await db.plantillaTicket.count()
  if (hayPlantillas === 0) {
    const plantillas = [
      {
        nombre: 'Recepción de Equipo',
        contenido: [
          '{{taller_nombre}}',
          '{{taller_direccion}}',
          'Tel: {{taller_telefono}}',
          '================================',
          '      RECEPCIÓN DE EQUIPO',
          '================================',
          'Fecha:   {{venta_fecha}}',
          'Ticket:  {{venta_codigo}}',
          'Cliente: {{cliente_nombre}}',
          'CI:      {{cliente_ci}}',
          'Tel:     {{cliente_telefono}}',
          'Atendió: {{vendedor_nombre}}',
          '--------------------------------',
          'EQUIPO / SERVICIO RECIBIDO:',
          '{{items_detalle}}',
          '--------------------------------',
          'GARANTÍAS:',
          '{{garantias_texto}}',
          '--------------------------------',
          'TOTAL: {{venta_total_cup}}',
          'Conserve este ticket: la garantía',
          'requiere este comprobante.',
        ].join('\n'),
      },
      {
        nombre: 'Venta de Accesorio',
        contenido: [
          '{{taller_nombre}}',
          'Tel: {{taller_telefono}}',
          '--------------------------------',
          '     VENTA DE ACCESORIO',
          '--------------------------------',
          '{{venta_codigo}} · {{venta_fecha}}',
          'Cliente: {{cliente_nombre}}',
          '{{items_detalle}}',
          '--------------------------------',
          'TOTAL: {{venta_total_cup}}',
          'Atendió: {{vendedor_nombre}}',
          'Garantías:',
          '{{garantias_texto}}',
        ].join('\n'),
      },
    ]
    for (const p of plantillas) {
      await db.plantillaTicket.create({ data: { ...p, activo: true } })
    }
  }

  // ---------- Datos demo mínimos para probar el taller piloto ----------
  const hayProductos = await db.producto.count({ where: { tallerId: taller.id } })
  if (hayProductos === 0) {
    const demo = [
      {
        codigoInterno: 'T1-000001',
        codigoBarras: 'T1-000001',
        categoria: 'Pantallas',
        nombre: 'Pantalla LCD Xiaomi Redmi 9C',
        tipo: 'VENTA',
        cantidad: 10,
        costo: 1800,
        unidad: 'u',
        stockMinimo: 3,
        precio: 2600,
        monedaPrecio: 'CUP',
        pagoOperarioTipo: 'FIJO',
        pagoOperarioValor: 200,
        garantiaDias: 30,
      },
      {
        codigoInterno: 'T1-000002',
        codigoBarras: 'T1-000002',
        categoria: 'Baterías',
        nombre: 'Batería Samsung A12 (5000 mAh)',
        tipo: 'VENTA',
        cantidad: 8,
        costo: 900,
        unidad: 'u',
        stockMinimo: 2,
        precio: 1500,
        monedaPrecio: 'CUP',
        pagoOperarioTipo: 'PORCENTAJE',
        pagoOperarioValor: 10,
        garantiaDias: 60,
      },
      {
        codigoInterno: 'T1-000003',
        codigoBarras: 'T1-000003',
        categoria: 'Accesorios',
        nombre: 'Protector de vidrio templado universal',
        tipo: 'VENTA',
        cantidad: 25,
        costo: 120,
        unidad: 'u',
        stockMinimo: 5,
        precio: 400,
        monedaPrecio: 'CUP',
        pagoOperarioTipo: 'FIJO',
        pagoOperarioValor: 50,
        garantiaDias: 0,
      },
      {
        codigoInterno: 'T1-000004',
        codigoBarras: 'T1-000004',
        categoria: 'Servicios',
        nombre: 'Cambio de pantalla (manodeobra)',
        tipo: 'SERVICIO_ELECTRONICA',
        cantidad: 0,
        costo: 0,
        unidad: 'serv',
        stockMinimo: 0,
        precio: 800,
        monedaPrecio: 'CUP',
        pagoOperarioTipo: 'PORCENTAJE',
        pagoOperarioValor: 50,
        garantiaDias: 30,
      },
      {
        codigoInterno: 'T1-000005',
        codigoBarras: 'T1-000005',
        categoria: 'Servicios',
        nombre: 'Instalación de software / flasheo',
        tipo: 'SERVICIO_INFORMATICA',
        cantidad: 0,
        costo: 0,
        unidad: 'serv',
        stockMinimo: 0,
        precio: 1200,
        monedaPrecio: 'CUP',
        pagoOperarioTipo: 'PORCENTAJE',
        pagoOperarioValor: 60,
        garantiaDias: 15,
      },
    ]
    for (const p of demo) {
      await db.producto.create({ data: { ...p, tallerId: taller.id, activo: true } })
    }
    // Movimiento ENTRADA inicial para los productos con stock
    for (const p of demo.filter((d) => d.tipo === 'VENTA')) {
      await db.movimientoInventario.create({
        data: {
          productoId: (await db.producto.findFirst({
            where: { tallerId: taller.id, codigoInterno: p.codigoInterno },
          }))!.id,
          tipo: 'ENTRADA',
          cantidad: p.cantidad,
          costoUnitario: p.costo,
          nota: 'Stock inicial (seed)',
        },
      })
    }
  }

  console.log('Seed completado:')
  console.log('  Admin:      usuario "admin" / contraseña "TeReparo2026!"')
  console.log('  Taller:     ' + taller.nombre)
  console.log('  Tasas:      USD=440 CUP, EUR=470 CUP (editables desde la app)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
