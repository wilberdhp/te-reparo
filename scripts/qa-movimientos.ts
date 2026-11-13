// QA movimientos por API: AJUSTE (solo ADMIN) y BAJA_DEFECTUOSO.
const BASE = 'http://localhost:3000'

async function login(username: string, password: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return { ok: r.status === 200, cookie: r.headers.get('set-cookie')!.split(';')[0] }
}

async function main() {
  const admin = await login('Ranset', 'Admin.2026*')
  const vendedor = await login('VendedorRepublica', 'Vendedor.2026*')

  // Buscar el producto QA por código
  const r = await fetch(`${BASE}/api/productos?tallerId=taller-republica&q=T91-000001`, { headers: { Cookie: admin.cookie } })
  const { productos } = await r.json()
  const prod = productos[0]
  console.log('Producto:', prod.nombre, '| stock actual:', prod.cantidad)

  // AJUSTE como vendedor → debe fallar 403
  const rAjVen = await fetch(`${BASE}/api/movimientos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: vendedor.cookie },
    body: JSON.stringify({ productoId: prod.id, tipo: 'AJUSTE', cantidad: -2, motivo: 'intento vendedor' }),
  })
  console.log('AJUSTE como VENDEDOR:', rAjVen.status, '(esperado 403)')

  // AJUSTE como admin: -2 (descuento por inventario físico)
  const rAj = await fetch(`${BASE}/api/movimientos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin.cookie },
    body: JSON.stringify({ productoId: prod.id, tipo: 'AJUSTE', cantidad: -2, motivo: 'QA: faltante físico' }),
  })
  console.log('AJUSTE -2 como ADMIN:', rAj.status, rAj.status !== 200 ? await rAj.text() : '')

  // BAJA_DEFECTUOSO como vendedor (permitido) → -1
  const rBaja = await fetch(`${BASE}/api/movimientos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: vendedor.cookie },
    body: JSON.stringify({ productoId: prod.id, tipo: 'BAJA_DEFECTUOSO', cantidad: 1, motivo: 'QA: unidad defectuosa' }),
  })
  console.log('BAJA_DEFECTUOSO 1 como VENDEDOR:', rBaja.status, rBaja.status !== 200 ? await rBaja.text() : '')

  // Verificación final de stock
  const r2 = await fetch(`${BASE}/api/productos?tallerId=taller-republica&q=T91-000001`, { headers: { Cookie: admin.cookie } })
  const { productos: p2 } = await r2.json()
  console.log('Stock final (15 - 2 ajuste - 1 baja =', 15 - 2 - 1, '):', p2[0].cantidad, p2[0].cantidad === 12 ? '✓' : '✗ ERROR')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
