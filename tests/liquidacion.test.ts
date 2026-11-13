import { describe, test, expect } from 'bun:test'
import { calcularLiquidacion } from '../src/lib/liquidacion'
import { D } from '../src/lib/money'

function venta(
  id: string,
  total: string,
  vendedorUsuarioId: string,
  items: Array<[string | null, number, string, string, string, string?]>
) {
  return {
    id,
    codigo: id,
    totalCUP: D(total),
    vendedorUsuarioId,
    items: items.map(([operarioId, cantidad, subtotal, tipo, valor, costoAdicional]) => ({
      operarioId,
      cantidad,
      subtotalCUP: D(subtotal),
      costoAdicionalCUP: D(costoAdicional ?? 0),
      pagoOperarioTipoSnapshot: tipo,
      pagoOperarioValorSnapshot: D(valor),
    })),
  }
}

const operarios = [
  { id: 'op-v1', nombre: 'Vendedor Uno', rama: 'VENDEDOR', esOnline: false, usuarioId: null },
  { id: 'op-v2', nombre: 'Vendedor Dos (vendió 0)', rama: 'VENDEDOR', esOnline: false, usuarioId: null },
  { id: 'op-inf', nombre: 'Informático', rama: 'INFORMATICO', esOnline: false, usuarioId: null },
  { id: 'op-elec', nombre: 'Electrónico', rama: 'ELECTRONICO', esOnline: false, usuarioId: null },
  { id: 'op-online', nombre: 'Vendedor En Línea', rama: 'VENDEDOR', esOnline: true, usuarioId: 'usr-online' },
  { id: 'op-admin', nombre: 'Admin', rama: 'ADMIN', esOnline: false, usuarioId: null },
]

describe('Liquidación diaria por rama (PRD §4.6)', () => {
  const ventas = [
    venta('v1', '5000', 'usr-v1', [
      ['op-inf', 1, '2000', 'PORCENTAJE', '50'], // técnico: 1000
      ['op-elec', 1, '1500', 'FIJO', '300'], // técnico: 300
      [null, 2, '1500', 'FIJO', '50'], // sin operario: sin pago individual
    ]),
    venta('v2', '3000', 'usr-online', [
      ['op-online', 3, '3000', 'FIJO', '100'], // en línea: 300
      ['op-inf', 1, '0', 'FIJO', '0'],
    ]),
  ]

  test('Vendedores de taller: regla grupal — total del día ÍNTEGRO a cada uno (incluido el que vendió 0)', () => {
    const r = calcularLiquidacion({ ventas, operarios, ajustes: [], porcentajeAdmin: D(0) })
    const v1 = r.lineas.find((l) => l.operarioId === 'op-v1')
    const v2 = r.lineas.find((l) => l.operarioId === 'op-v2')
    expect(v1?.montoCUP.toString()).toBe('8000') // 5000 + 3000
    expect(v2?.montoCUP.toString()).toBe('8000') // vendió 0 y cobra el total del taller
    expect(v1?.tipo).toBe('GRUPO')
  })

  test('Informático/Electrónico: acumulado individual según snapshot', () => {
    const r = calcularLiquidacion({ ventas, operarios, ajustes: [], porcentajeAdmin: D(0) })
    const inf = r.lineas.find((l) => l.operarioId === 'op-inf')
    const elec = r.lineas.find((l) => l.operarioId === 'op-elec')
    expect(inf?.montoCUP.toString()).toBe('1000') // 50% de 2000
    expect(elec?.montoCUP.toString()).toBe('300') // FIJO 300 × 1
    expect(inf?.tipo).toBe('INDIVIDUAL')
  })

  test('Reparto equitativo solo como referencia (no afecta el monto)', () => {
    const r = calcularLiquidacion({ ventas, operarios, ajustes: [], porcentajeAdmin: D(0) })
    const inf = r.lineas.find((l) => l.operarioId === 'op-inf')
    // referencia: 8000 / 2 técnicos = 4000
    expect(inf?.detalle.repartoEquitativo).toBe('4000.00')
    expect(inf?.montoCUP.toString()).toBe('1000') // el monto sigue siendo el individual
  })

  test('VENDEDOR_ONLINE: individual por SUS propias ventas (líneas asignadas a su operario)', () => {
    const r = calcularLiquidacion({ ventas, operarios, ajustes: [], porcentajeAdmin: D(0) })
    const online = r.lineas.find((l) => l.operarioId === 'op-online')
    expect(online?.montoCUP.toString()).toBe('300') // FIJO 100 × 3 (solo su venta v2)
    expect(online?.tipo).toBe('ONLINE')
    // la venta v1 (de otro vendedor) no le suma
  })

  test('ADMIN: porcentajeAdmin × total vendido del taller', () => {
    const r = calcularLiquidacion({ ventas, operarios, ajustes: [], porcentajeAdmin: D(5) })
    const admin = r.lineas.find((l) => l.operarioId === 'op-admin')
    expect(admin?.montoCUP.toString()).toBe('400') // 5% de 8000
    expect(admin?.tipo).toBe('ADMIN_PCT')
    expect(admin?.detalle.base).toBe('8000.00')
  })

  test('porcentajeAdmin 0 → línea ADMIN en 0 (aparece en la liquidación)', () => {
    const r = calcularLiquidacion({ ventas, operarios, ajustes: [], porcentajeAdmin: D(0) })
    const admin = r.lineas.find((l) => l.operarioId === 'op-admin')
    expect(admin?.montoCUP.toNumber()).toBe(0)
  })

  test('ADMIN con líneas asignadas cobra sus líneas ADEMÁS del porcentajeAdmin (fix: pago 5% ignorado)', () => {
    const ventasAdmin = [
      venta('v1', '1500', 'usr-v1', [
        ['op-admin', 1, '1000', 'PORCENTAJE', '5'], // 5% de 1000 = 50
        [null, 1, '500', 'FIJO', '50'], // sin operario asignado: no genera pago
      ]),
    ]
    // porcentajeAdmin 0 → el admin cobra solo sus líneas: 50
    const r1 = calcularLiquidacion({ ventas: ventasAdmin, operarios, ajustes: [], porcentajeAdmin: D(0) })
    const admin1 = r1.lineas.find((l) => l.operarioId === 'op-admin')
    expect(admin1?.montoCUP.toString()).toBe('50')
    expect(admin1?.detalle.lineas).toBe(1)

    // porcentajeAdmin 5 → líneas (50) + 5% del día (75) = 125
    const r2 = calcularLiquidacion({ ventas: ventasAdmin, operarios, ajustes: [], porcentajeAdmin: D(5) })
    const admin2 = r2.lineas.find((l) => l.operarioId === 'op-admin')
    expect(admin2?.montoCUP.toString()).toBe('125')
    expect(admin2?.tipo).toBe('ADMIN_PCT')
  })

  test('Ajustes negativos (devoluciones post-cierre) se restan de la línea del operario', () => {
    const r = calcularLiquidacion({
      ventas,
      operarios,
      ajustes: [
        { id: 'a1', operarioId: 'op-inf', montoCUP: D('-250'), motivo: 'Devolución D000001', devolucionId: 'd1' },
        { id: 'a2', operarioId: 'op-v2', montoCUP: D('-100'), motivo: 'Devolución D000002', devolucionId: 'd2' },
      ],
      porcentajeAdmin: D(0),
    })
    const inf = r.lineas.find((l) => l.operarioId === 'op-inf')
    const v2 = r.lineas.find((l) => l.operarioId === 'op-v2')
    expect(inf?.montoCUP.toString()).toBe('750') // 1000 - 250
    expect(v2?.montoCUP.toString()).toBe('7900') // 8000 - 100
    expect(inf?.detalle.ajustes?.length).toBe(1)
  })

  test('Ajuste a un operario sin línea (p. ej. de baja) crea línea de ajuste', () => {
    const r = calcularLiquidacion({
      ventas: [],
      operarios,
      ajustes: [
        { id: 'a1', operarioId: 'op-fuera', montoCUP: D('-120'), motivo: 'Devolución post-cierre', devolucionId: 'd1' },
      ],
      porcentajeAdmin: D(0),
    })
    const fuera = r.lineas.find((l) => l.operarioId === 'op-fuera')
    expect(fuera?.tipo).toBe('AJUSTE')
    expect(fuera?.montoCUP.toString()).toBe('-120')
  })

  test('Total de la liquidación = suma de líneas', () => {
    const r = calcularLiquidacion({ ventas, operarios, ajustes: [], porcentajeAdmin: D(5) })
    const suma = r.lineas.reduce((acc, l) => acc.plus(l.montoCUP), D(0))
    expect(r.totalLiquidacion.toString()).toBe(suma.toString())
    expect(r.totalVentasDia.toString()).toBe('8000')
  })

  test('Sin ventas: vendedores cobran 0 y no hay líneas de técnicos', () => {
    const r = calcularLiquidacion({ ventas: [], operarios, ajustes: [], porcentajeAdmin: D(10) })
    const v1 = r.lineas.find((l) => l.operarioId === 'op-v1')
    expect(v1?.montoCUP.toNumber()).toBe(0)
    const tec = r.lineas.filter((l) => l.operarioId === 'op-inf' || l.operarioId === 'op-elec')
    expect(tec.length).toBe(2) // siguen apareciendo con 0
  })
})

describe('Liquidación con costoAdicional (PROMPT DE ACTUALIZACIÓN §2.2)', () => {
  test('PORCENTAJE: el costo interno descuenta la base del pago del técnico', () => {
    const ventas = [
      venta('v1', '5000', 'usr-v1', [
        ['op-inf', 1, '2000', 'PORCENTAJE', '50', '500'], // (2000 − 500) × 50% = 750
      ]),
    ]
    const r = calcularLiquidacion({ ventas, operarios, ajustes: [], porcentajeAdmin: D(0) })
    const inf = r.lineas.find((l) => l.operarioId === 'op-inf')
    expect(inf?.montoCUP.toString()).toBe('750')
  })

  test('PORCENTAJE: costo que provoca base negativa → pago 0 (no negativo)', () => {
    const ventas = [
      venta('v1', '5000', 'usr-v1', [
        ['op-elec', 1, '1000', 'PORCENTAJE', '40', '2500'], // (1000 − 2500) < 0 → 0
      ]),
    ]
    const r = calcularLiquidacion({ ventas, operarios, ajustes: [], porcentajeAdmin: D(0) })
    const elec = r.lineas.find((l) => l.operarioId === 'op-elec')
    expect(elec?.montoCUP.toNumber()).toBe(0)
  })

  test('FIJO: el costo interno NO afecta el pago del técnico', () => {
    const ventas = [
      venta('v1', '5000', 'usr-v1', [
        ['op-elec', 1, '1500', 'FIJO', '300', '1200'], // sigue siendo 300
      ]),
    ]
    const r = calcularLiquidacion({ ventas, operarios, ajustes: [], porcentajeAdmin: D(0) })
    const elec = r.lineas.find((l) => l.operarioId === 'op-elec')
    expect(elec?.montoCUP.toString()).toBe('300')
  })

  test('VENDEDOR_ONLINE con costo: se descuenta igual en su pago individual', () => {
    const ventas = [
      venta('v2', '3000', 'usr-online', [
        ['op-online', 3, '3000', 'PORCENTAJE', '10', '600'], // (3000 − 600) × 10% = 240
      ]),
    ]
    const r = calcularLiquidacion({ ventas, operarios, ajustes: [], porcentajeAdmin: D(0) })
    const online = r.lineas.find((l) => l.operarioId === 'op-online')
    expect(online?.montoCUP.toString()).toBe('240')
  })
})
