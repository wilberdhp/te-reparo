// Gestor del PostgreSQL embebido de desarrollo (binarios oficiales linux-x64
// del paquete npm `embedded-postgres`, sin root). El sandbox no permite
// instalar paquetes del sistema, así que el servidor corre como el usuario
// corriente escuchando SOLO en localhost:5432 con auth=trust.
//
// Uso:
//   bun scripts/pg.ts init    # primera vez: initdb + arranque + BD tereparo
//   bun scripts/pg.ts start   # arranca si no está corriendo (idempotente)
//   bun scripts/pg.ts stop    # parada rápida (modo fast)
//   bun scripts/pg.ts status  # estado del servidor y de la BD
//
// Los datos viven en db/postgres/ (PGDATA); el log del servidor en
// db/postgres.log. `bun run dev` arranca el servidor automáticamente (script
// "dev" del package.json → pg start idempotente antes de next dev).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Client } from 'pg'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NATIVE = path.join(RAIZ, 'node_modules', '@embedded-postgres', 'linux-x64', 'native')
const PGDATA = path.join(RAIZ, 'db', 'postgres')
const LOG = path.join(RAIZ, 'db', 'postgres.log')
const USUARIO = 'tereparo'
const PUERTO = 5432
const BD = 'tereparo'
const URL = `postgresql://${USUARIO}@localhost:${PUERTO}/${BD}?schema=public`

const ENV = { ...process.env, LD_LIBRARY_PATH: path.join(NATIVE, 'lib') }

/** Corre un binario de PostgreSQL y devuelve stdout; lanza si falla. */
function correr(bin: string, args: string[]): string {
  const r = spawnSync(path.join(NATIVE, 'bin', bin), args, { env: ENV, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${bin} ${args.join(' ')} → código ${r.status}\n${r.stderr || r.stdout}`)
  return (r.stdout ?? '') + (r.stderr ?? '')
}

const corriendo = () => spawnSync(path.join(NATIVE, 'bin', 'pg_ctl'), ['-D', PGDATA, 'status'], { env: ENV }).status === 0

async function conPostgres(sql: string): Promise<unknown> {
  const c = new Client({ connectionString: `postgresql://${USUARIO}@localhost:${PUERTO}/postgres` })
  await c.connect()
  try {
    return await c.query(sql)
  } finally {
    await c.end()
  }
}

async function asegurarBD() {
  const hay = await conPostgres(`SELECT 1 FROM pg_database WHERE datname = '${BD}'`)
  if ((hay as { rowCount: number }).rowCount === 0) await conPostgres(`CREATE DATABASE ${BD}`)
}

async function init() {
  mkdirSync(path.join(RAIZ, 'db'), { recursive: true })
  if (!existsSync(path.join(PGDATA, 'PG_VERSION'))) {
    console.log('→ initdb (primera vez)…')
    // locale C + UTF8: determinista y sin dependencias de locales del SO
    correr('initdb', ['-D', PGDATA, `--username=${USUARIO}`, '--auth=trust', '--encoding=UTF8', '--locale=C'])
  }
  await start()
  await asegurarBD()
  console.log(`✓ BD lista → ${URL}`)
}

async function start() {
  if (!existsSync(path.join(PGDATA, 'PG_VERSION'))) {
    throw new Error(`PGDATA no existe (${PGDATA}). Ejecute primero: bun scripts/pg.ts init`)
  }
  if (corriendo()) {
    console.log('✓ PostgreSQL ya está corriendo en localhost:' + PUERTO)
    return
  }
  correr('pg_ctl', ['-D', PGDATA, '-l', LOG, '-w', 'start'])
  console.log('✓ PostgreSQL arrancado en localhost:' + PUERTO)
  await asegurarBD()
}

async function stop() {
  if (!corriendo()) return console.log('• PostgreSQL ya estaba parado')
  correr('pg_ctl', ['-D', PGDATA, '-m', 'fast', '-w', 'stop'])
  console.log('✓ PostgreSQL parado')
}

async function status() {
  if (!existsSync(path.join(PGDATA, 'PG_VERSION'))) {
    console.log('✗ Sin PGDATA — falta: bun scripts/pg.ts init')
    process.exitCode = 1
    return
  }
  if (!corriendo()) {
    console.log('✗ PostgreSQL parado — arranque con: bun scripts/pg.ts start')
    process.exitCode = 1
    return
  }
  try {
    await asegurarBD()
    const c = new Client({ connectionString: URL })
    await c.connect()
    const v = await c.query('SELECT version()')
    console.log(`✓ Corriendo — ${BD} accesible\n  ${v.rows[0].version.split(',')[0]}\n  ${URL}`)
    await c.end()
  } catch (e) {
    console.log(`✗ Servidor arriba pero la BD falla: ${e instanceof Error ? e.message : e}`)
    process.exitCode = 1
  }
}

const cmd = process.argv[2]
if (cmd === 'init') await init()
else if (cmd === 'start') await start()
else if (cmd === 'stop') await stop()
else if (cmd === 'status') await status()
else {
  console.log('Uso: bun scripts/pg.ts init|start|stop|status')
  process.exitCode = 1
}
