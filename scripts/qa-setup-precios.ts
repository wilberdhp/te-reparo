// Preparación de datos para QA: asigna precios/pagos a productos existentes
// del taller República vía la API (PATCH /api/productos?id=), como haría un
// administrador desde la interfaz.
const BASE = 'http://localhost:3000'

async function main() {
  // Login como Ranset (ADMIN)
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Ranset', password: 'Admin.2026*' }),
  })
  const cookie = login.headers.get('set-cookie')!.split(';')[0]
  console.log('login Ranset:', login.status)

  const buscar = async (q: string) => {
    const r = await fetch(
      `${BASE}/api/productos?tallerId=taller-republica&q=${encodeURIComponent(q)}&activo=true`,
      { headers: { Cookie: cookie } }
    )
    const data = await r.json()
    return data.productos as Array<Record<string, unknown>>
  }

  const patch = async (id: string, cambios: object, nombre: string) => {
    const r = await fetch(`${BASE}/api/productos?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(cambios),
    })
    console.log(`PATCH ${nombre}:`, r.status, r.status === 200 ? 'OK' : await r.text())
  }

  // 1) Servicio de electrónica (Milton, FIJO) — venta mostrador del admin
  const cambioPantalla = (await buscar('SERVICIO DE CAMBIO DE PANTALLA GAMA ALTA'))[0]
  await patch(cambioPantalla.id as string, { precio: 5000, monedaPrecio: 'CUP', pagoOperarioTipo: 'FIJO', pagoOperarioValor: 2000 }, cambioPantalla.nombre as string)

  // 2) Servicio de informática (Juan, PORCENTAJE) — venta del VendedorRepublica
  const desbloqueo = (await buscar('DESBLOQUEO GAMA ALTA CON CREDITOS'))[0]
  await patch(desbloqueo.id as string, { precio: 10, monedaPrecio: 'USD', pagoOperarioTipo: 'PORCENTAJE', pagoOperarioValor: 50 }, desbloqueo.nombre as string)

  // 3) Servicio para Lili (online, PORCENTAJE)
  const frp = (await buscar('FRP GAMA ALTA CON CREDITOS'))[0]
  await patch(frp.id as string, { precio: 2500, monedaPrecio: 'CUP', pagoOperarioTipo: 'PORCENTAJE', pagoOperarioValor: 40 }, frp.nombre as string)

  // 4) Servicio para la venta con devolución total
  const desbBaja = (await buscar('DESBLOQUEO GAMA BAJA CON CREDITOS'))[0]
  await patch(desbBaja.id as string, { precio: 2000, monedaPrecio: 'CUP', pagoOperarioTipo: 'PORCENTAJE', pagoOperarioValor: 50 }, desbBaja.nombre as string)

  // 5) Cover con stock >= 2 (venta con cliente + devolución parcial)
  const covers = await buscar('COVER XIAOMI')
  const cover = covers.find((c) => (c.cantidad as number) >= 2)
  await patch(cover.id as string, { precio: 500, monedaPrecio: 'CUP' }, cover.nombre as string)
  console.log('COVER elegido:', cover.nombre, '| stock:', cover.cantidad, '| id:', cover.id)

  // 6) Producto con stock >= 3 para la transferencia a La Caridad
  const micas = await buscar('MICA')
  const mica = micas.find((c) => (c.cantidad as number) >= 3)
  if (!mica) throw new Error('Ninguna mica con stock >= 3: ' + JSON.stringify(micas.map((m) => [m.nombre, m.cantidad])))
  await patch(mica.id as string, { precio: 600, monedaPrecio: 'CUP' }, mica.nombre as string)
  console.log('Producto para transferir:', mica.nombre, '| stock:', mica.cantidad, '| id:', mica.id)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
