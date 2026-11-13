import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const db = new PrismaClient()

// Seed de "Te Reparo": dos talleres reales (República y La Caridad), operarios,
// usuarios y el inventario del taller República cargado desde
// prisma/productos-republica.json (generado a partir de
// "inventario republica organizado.xlsx" — ver scripts/generar-json-inventario.py).
// Ejecutar con: bun run db:seed
//
// Notas de liquidación (PRD §4.6):
//  - Los vendedores presenciales (Javier, Ivan, Andrew) cobran por regla grupal
//    (total vendido del taller) → se enlazan SOLO a su taller.
//  - Lili (vendedora en línea) cobra por sus propias ventas del taller donde se
//    facturen → enlazada a ambos talleres; su usuario VendedorEnLinea
//    (rol VENDEDOR_ONLINE) DEBE estar enlazado a su operario para que la regla
//    ONLINE la detecte.
//  - Ranset/Ransei/Raydel (rama ADMIN) cobran porcentajeAdmin × total del día +
//    sus líneas asignadas → enlazados a ambos talleres. OJO: si porcentajeAdmin
//    se configura > 0, CADA operario ADMIN del taller recibe el porcentaje
//    completo (quedará 3× el % si los tres siguen enlazados).

interface ProductoSeed {
  codigoInterno: string
  codigoBarras: string
  categoria: string
  nombre: string
  tipo: string // VENTA | SERVICIO_ELECTRONICA | SERVICIO_INFORMATICA
  cantidad: number
  costo: number
  unidad: string
  stockMinimo: number
  precio: number
  monedaPrecio: string // CUP | USD | EUR
  pagoOperarioTipo: string // FIJO | PORCENTAJE
  pagoOperarioValor: number
  garantiaDias: number
}

async function main() {
  // ---------- Talleres ----------
  const republica = await db.taller.upsert({
    where: { id: 'taller-republica' },
    update: {},
    create: {
      id: 'taller-republica',
      nombre: 'Te Reparo - República',
      direccion: 'Por configurar',
      telefono: 'Por configurar',
      activo: true,
    },
  })
  const laCaridad = await db.taller.upsert({
    where: { id: 'taller-lacaridad' },
    update: {},
    create: {
      id: 'taller-lacaridad',
      nombre: 'Te Reparo - La Caridad',
      direccion: 'Por configurar',
      telefono: 'Por configurar',
      activo: true,
    },
  })

  // ---------- Operarios ----------
  // [id, nombre, rama, talleres a los que pertenece]
  const operarios: Array<[string, string, string, string[]]> = [
    ['operario-juan', 'Juan', 'INFORMATICO', [republica.id]],
    ['operario-wilber', 'Wilber', 'INFORMATICO', [republica.id]],
    ['operario-milton', 'Milton', 'ELECTRONICO', [republica.id]],
    ['operario-raul', 'Raul', 'ELECTRONICO', [laCaridad.id]],
    ['operario-danilo', 'Danilo', 'INFORMATICO', [laCaridad.id]],
    ['operario-ivan', 'Ivan', 'VENDEDOR', [laCaridad.id]],
    ['operario-andrew', 'Andrew', 'VENDEDOR', [laCaridad.id]],
    ['operario-javier', 'Javier', 'VENDEDOR', [republica.id]],
    ['operario-lili', 'Lili', 'VENDEDOR', [republica.id, laCaridad.id]],
    ['operario-ranset', 'Ranset', 'ADMIN', [republica.id, laCaridad.id]],
    ['operario-ransei', 'Ransei', 'ADMIN', [republica.id, laCaridad.id]],
    ['operario-raydel', 'Raydel', 'ADMIN', [republica.id, laCaridad.id]],
  ]
  for (const [id, nombre, rama, talleres] of operarios) {
    await db.operario.upsert({
      where: { id },
      update: {},
      create: { id, nombre, rama, activo: true },
    })
    for (const tallerId of talleres) {
      await db.operarioTaller.upsert({
        where: { operarioId_tallerId: { operarioId: id, tallerId } },
        update: {},
        create: { operarioId: id, tallerId },
      })
    }
  }

  // ---------- Usuarios ----------
  const passAdmin = bcrypt.hashSync('Admin.2026*', 10)
  const passVendedor = bcrypt.hashSync('Vendedor.2026*', 10)
  // [username, nombre, rol, passwordHash, tallerId, operarioId]
  // Nota: la app exige vincular usuarios VENDEDOR a un operario (/api/usuarios).
  const usuarios: Array<[string, string, string, string, string | null, string | null]> = [
    ['Ranset', 'Ranset', 'ADMIN', passAdmin, null, 'operario-ranset'],
    ['Raydel', 'Raydel', 'ADMIN', passAdmin, null, 'operario-raydel'],
    ['Ransei', 'Ransei', 'ADMIN', passAdmin, null, 'operario-ransei'],
    ['VendedorRepublica', 'Vendedor República', 'VENDEDOR', passVendedor, republica.id, 'operario-javier'],
    ['VendedorLaCaridad', 'Vendedor La Caridad', 'VENDEDOR', passVendedor, laCaridad.id, 'operario-ivan'],
    ['VendedorEnLinea', 'Vendedor en Línea', 'VENDEDOR_ONLINE', passVendedor, null, 'operario-lili'],
  ]
  for (const [username, nombre, rol, passwordHash, tallerId, operarioId] of usuarios) {
    await db.usuario.upsert({
      where: { username },
      update: {},
      create: { username, nombre, passwordHash, rol, tallerId, operarioId, activo: true },
    })
  }

  // ---------- Inventario del taller República (desde el JSON) ----------
  const rutaJson = path.join(path.dirname(fileURLToPath(import.meta.url)), 'productos-republica.json')
  const { taller: tallerJson, productos } = JSON.parse(readFileSync(rutaJson, 'utf-8')) as {
    taller: string
    productos: ProductoSeed[]
  }
  if (tallerJson !== republica.nombre) {
    throw new Error(`El JSON de productos pertenece a "${tallerJson}", pero el seed esperaba "${republica.nombre}"`)
  }
  const existentes = new Set(
    (
      await db.producto.findMany({
        where: { tallerId: republica.id, codigoInterno: { in: productos.map((p) => p.codigoInterno) } },
        select: { codigoInterno: true },
      })
    ).map((p) => p.codigoInterno)
  )
  let creados = 0
  for (const p of productos) {
    if (existentes.has(p.codigoInterno)) continue // re-ejecución: no sobrescribir ediciones
    const producto = await db.producto.create({
      data: { ...p, tallerId: republica.id, activo: true },
    })
    creados++
    if (p.cantidad > 0) {
      await db.movimientoInventario.create({
        data: {
          productoId: producto.id,
          tipo: 'ENTRADA',
          cantidad: p.cantidad,
          costoUnitario: p.costo,
          nota: 'Carga inicial de inventario (seed)',
        },
      })
    }
  }

  // ---------- Tasas de cambio iniciales (actualizables desde la app) ----------
  for (const [moneda, valor] of [
    ['USD', 440],
    ['EUR', 470],
  ] as const) {
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

  console.log('Seed completado:')
  console.log(`  Talleres:    ${republica.nombre} · ${laCaridad.nombre}`)
  console.log('  Operarios:   12 (3 informáticos, 2 electrónicos, 4 vendedores, 1 en línea, 3 admin)')
  console.log('  Usuarios:')
  console.log('    Ranset / Raydel / Ransei                Administrador        Admin.2026*')
  console.log('    VendedorRepublica / VendedorLaCaridad  Vendedor             Vendedor.2026*')
  console.log('    VendedorEnLinea                        Vendedor en línea    Vendedor.2026*')
  console.log(`  Productos:   ${creados} creados en ${republica.nombre} (JSON: ${productos.length})`)
  console.log('  Tasas:       USD=440 CUP, EUR=470 CUP (editables desde la app)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
