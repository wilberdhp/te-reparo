// QA final: permisos por rol, usuario inactivo, CSV, respaldo, auditoría, plantillas.
import { PrismaClient } from '@prisma/client'
const BASE = 'http://localhost:3000'
const db = new PrismaClient()

async function login(u: string, p: string) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })
  return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0] ?? '' }
}
const get = async (cookie: string, ruta: string) => {
  const r = await fetch(`${BASE}${ruta}`, { headers: { Cookie: cookie } })
  const ct = r.headers.get('content-type') ?? ''
  return { status: r.status, ct, body: await r.text() }
}

async function main() {
  const admin = await login('Ranset', 'Admin.2026*')
  const vRep = await login('VendedorRepublica', 'Vendedor.2026*')
  const vOnl = await login('VendedorEnLinea', 'Vendedor.2026*')
  console.log('logins:', { admin: admin.status, vRep: vRep.status, vOnl: vOnl.status })

  // 1) VENDEDOR pide productos de OTRO taller → requireTaller lo fuerza a su taller
  const cross = await get(vRep.cookie, '/api/productos?tallerId=taller-lacaridad&activo=true')
  let n = 0
  try { n = JSON.parse(cross.body).productos.length } catch { /* csv u otro formato */ }
  console.log('1. VENDEDOR pide taller ajeno →', cross.status, '| productos recibidos:', n, '(>1000 = su propio taller, no el ajeno con 1)')

  // 2) VENDEDOR intenta crear usuario → 403
  const r403 = await fetch(`${BASE}/api/usuarios`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: vRep.cookie }, body: JSON.stringify({ nombre: 'x', username: 'hack', password: 'x', rol: 'ADMIN' }) })
  console.log('2. VENDEDOR crea usuario →', r403.status, '(esperado 403/400)')

  // 3) VENDEDOR lee auditoría → debe estar denegado
  const logs = await get(vRep.cookie, '/api/logs?page=1&limit=5')
  console.log('3. VENDEDOR lee /api/logs →', logs.status, '(esperado 403)')

  // 4) VENDEDOR_ONLINE sí puede operar en otro taller
  const onl = await get(vOnl.cookie, '/api/productos?tallerId=taller-lacaridad&activo=true')
  let nOnl = 0
  try { nOnl = JSON.parse(onl.body).productos.length } catch { /* - */ }
  console.log('4. VENDEDOR_ONLINE en La Caridad →', onl.status, '| productos:', nOnl, '(1 = mica transferida)')

  // 5) Desactivar QATest (BD) y verificar login bloqueado
  const qa = await db.usuario.findUnique({ where: { username: 'QATest' } })
  if (qa) {
    await db.usuario.update({ where: { id: qa.id }, data: { activo: false } })
    const inactivo = await login('QATest', 'Temporal.2026*')
    console.log('5. Login de usuario INACTIVO →', inactivo.status, '(esperado 401/403)')
  } else {
    console.log('5. QATest no existe (omitido)')
  }

  // 6) Auditoría (admin): hay registros de las acciones de hoy
  const logsAdmin = await get(admin.cookie, '/api/logs?page=1&limit=5')
  let totalLogs = '?'
  try { totalLogs = JSON.parse(logsAdmin.body).total ?? JSON.parse(logsAdmin.body).logs?.length ?? '?' } catch { /* - */ }
  console.log('6. Auditoría admin →', logsAdmin.status, '| total registros:', totalLogs)

  // 7) Export CSV de ventas (admin)
  const csv = await get(admin.cookie, '/api/ventas?tallerId=taller-republica&formato=csv')
  const csvOk = csv.ct.includes('csv') || csv.body.startsWith('\uFEFF')
  console.log('7. CSV ventas →', csv.status, '| content-type:', csv.ct, '| pareceCSV:', csvOk)

  // 8) Respaldo JSON (admin)
  const bk = await get(admin.cookie, '/api/backup')
  let bkOk = false
  try { bkOk = JSON.parse(bk.body).talleres?.length === 2 } catch { /* - */ }
  console.log('8. Respaldo JSON →', bk.status, '| talleres incluidos:', bkOk ? 2 : 'no')

  // 9) Plantillas y tasas
  const pl = await get(admin.cookie, '/api/plantillas')
  const ts = await get(admin.cookie, '/api/tasas')
  let nPl = 0, usd = '?'
  try { nPl = JSON.parse(pl.body).plantillas.length } catch { /* - */ }
  try { usd = JSON.parse(ts.body).tasas.find((t: { moneda: string }) => t.moneda === 'USD').valorCUP } catch { /* - */ }
  console.log('9. Plantillas:', pl.status, `(${nPl})`, '| Tasa USD:', ts.status, `(${usd})`)

  await db.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
