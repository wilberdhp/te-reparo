// Migración única de datos: SQLite (db/custom.db) → PostgreSQL (tereparo).
// Lee las tablas en crudo con bun:sqlite y las inserta con el cliente Prisma
// (ya regenerado para postgresql) respetando el orden topológico de las FKs,
// dentro de una única transacción. Idempotente en el sentido de que exige la
// BD destino vacía: si ya hay filas, aborta sin tocar nada.
//
// Uso: bun scripts/migrar-sqlite-a-postgres.ts [ruta-sqlite]
import { Database } from 'bun:sqlite'
import { Prisma, PrismaClient } from '@prisma/client'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SQLITE = process.argv[2] ?? path.join(RAIZ, 'db', 'custom.db')
const LOTE = 500 // filas por createMany (límite de parámetros de PG: 65535)

if (!existsSync(SQLITE)) throw new Error(`No existe ${SQLITE}`)

const origen = new Database(SQLITE, { readonly: true })
const destino = new PrismaClient()

// Orden topológico: cada modelo solo referencia a modelos anteriores.
const ORDEN = [
  'Taller',
  'Operario',
  'Usuario',
  'OperarioTaller',
  'Producto',
  'Cliente',
  'PlantillaTicket',
  'Ajuste',
  'TasaCambio',
  'Venta',
  'VentaItem',
  'PagoVenta',
  'Devolucion',
  'DevolucionItem',
  'Transferencia',
  'MovimientoInventario',
  'Garantia',
  'LiquidacionOperario',
  'LiquidacionLinea',
  'PagoLiquidacion',
  'AjusteLiquidacion',
  'AuditLog',
]

/** SQLite (epoch-ms, "YYYY-MM-DD HH:MM:SS.sss +00:00") → Date */
function aFecha(v: unknown): Date {
  if (typeof v === 'number') return new Date(v)
  const s = String(v)
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:\s*([+-]\d{2}:?\d{2}|Z))?$/.exec(s)
  if (m) {
    const off = m[3] ? (m[3] === 'Z' ? 'Z' : m[3].replace(/(\d{2})(\d{2})$/, '$1:$2')) : 'Z'
    return new Date(`${m[1]}T${m[2]}${off}`)
  }
  return new Date(s)
}

// Tipos de campo por modelo según el DMMF del esquema (motor-agnóstico)
const campos = new Map<string, Map<string, { tipo: string; nullable: boolean }>>()
for (const m of Prisma.dmmf.datamodel.models) {
  const mapa = new Map<string, { tipo: string; nullable: boolean }>()
  for (const f of m.fields) if (!f.relationName) mapa.set(f.name, { tipo: f.type, nullable: !f.isRequired })
  campos.set(m.name, mapa)
}

/** Fila SQLite cruda → objeto apto para createMany de Prisma */
function convertir(modelo: string, fila: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [campo, { tipo, nullable }] of campos.get(modelo)!) {
    const v = fila[campo]
    if (v === null || v === undefined) {
      if (!nullable && tipo === 'String') {
        throw new Error(`${modelo}.${campo} es NOT NULL en el esquema pero llegó null`)
      }
      out[campo] = null
      continue
    }
    switch (tipo) {
      case 'Boolean':
        out[campo] = Boolean(v)
        break
      case 'DateTime':
        out[campo] = aFecha(v)
        break
      case 'Decimal': // como string: Prisma respeta la precisión exacta
        out[campo] = typeof v === 'string' ? v : String(v)
        break
      case 'Int':
        out[campo] = Number(v)
        break
      default: // String
        out[campo] = String(v)
    }
  }
  return out
}

async function main() {
  // Seguridad: la BD destino debe estar vacía (solo la estructura de db push)
  const t = await destino.taller.count()
  if (t > 0) throw new Error(`PostgreSQL ya tiene ${t} talleres — vuelque la BD (drop schema) antes de migrar`)

  const planes: Array<Promise<{ count: number }>> = []
  const resumen: Array<{ modelo: string; filas: number }> = []

  for (const modelo of ORDEN) {
    const filas = origen.query(`SELECT * FROM "${modelo}"`).all() as Array<Record<string, unknown>>
    if (filas.length === 0) continue
    const datos = filas.map((f) => convertir(modelo, f))
    const delegado = (destino as unknown as Record<string, { createMany: (a: { data: unknown[] }) => Promise<{ count: number }> }>)[
      modelo[0].toLowerCase() + modelo.slice(1)
    ]
    for (let i = 0; i < datos.length; i += LOTE) {
      planes.push(delegado.createMany({ data: datos.slice(i, i + LOTE) }))
    }
    resumen.push({ modelo, filas: filas.length })
  }

  console.log(`Migrando ${resumen.reduce((a, r) => a + r.filas, 0)} filas (${resumen.length} tablas)…`)
  await destino.$transaction(planes)

  // Verificación: conteos idénticos tabla por tabla
  let ok = true
  for (const { modelo, filas } of resumen) {
    const enPG = await (
      (destino as unknown as Record<string, { count: () => Promise<number> }>)[modelo[0].toLowerCase() + modelo.slice(1)]
    ).count()
    const marca = enPG === filas ? '✓' : '✗'
    if (enPG !== filas) ok = false
    console.log(`${marca} ${modelo.padEnd(24)} sqlite ${String(filas).padStart(5)} · pg ${String(enPG).padStart(5)}`)
  }

  // Muestras conocidas (sesiones QA): mica stock 6 tras V000030, usuarios 7
  const mica = await destino.producto.findFirst({ where: { codigoInterno: 'REP-000431' }, select: { cantidad: true } })
  const usuarios = await destino.usuario.count()
  console.log(`✓ muestra: mica REP-000431 cantidad=${mica?.cantidad} · usuarios=${usuarios}`)
  if (!ok || mica?.cantidad !== 6 || usuarios !== 7) throw new Error('Verificación post-migración fallida')
  console.log('✓ Migración completa y verificada')
}

main()
  .catch((e) => {
    console.error('✗', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => destino.$disconnect())
