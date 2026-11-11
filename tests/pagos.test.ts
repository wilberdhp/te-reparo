import { describe, test, expect } from 'bun:test'
import { calcularPagoLinea, costoAdicionalEnCUP } from '../src/lib/pagos'
import { D } from '../src/lib/money'

describe('Cálculo del pago al operario por línea (con costo interno)', () => {
  test('FIJO: valor CUP × cantidad de unidades — el costo interno NO afecta', () => {
    const pago = calcularPagoLinea({
      tipo: 'FIJO',
      valor: D(200),
      cantidad: 3,
      subtotalCUP: D(7800),
      costoAdicionalCUP: D(1500),
      operarioAsignado: true,
    })
    expect(pago.toString()).toBe('600')
  })

  test('PORCENTAJE sin costo: subtotalCUP × valor / 100 (compatibilidad)', () => {
    const pago = calcularPagoLinea({
      tipo: 'PORCENTAJE',
      valor: D(10),
      cantidad: 1,
      subtotalCUP: D(5000),
      costoAdicionalCUP: null,
      operarioAsignado: true,
    })
    expect(pago.toString()).toBe('500')
  })

  test('PORCENTAJE con costo: (subtotalCUP − costoAdicionalCUP) × valor / 100', () => {
    const pago = calcularPagoLinea({
      tipo: 'PORCENTAJE',
      valor: D(10),
      cantidad: 1,
      subtotalCUP: D(5000),
      costoAdicionalCUP: D(1000),
      operarioAsignado: true,
    })
    expect(pago.toString()).toBe('400') // (5000 − 1000) × 10%
  })

  test('PORCENTAJE: costo mayor que el subtotal → pago 0 (no se pagan montos negativos)', () => {
    const pago = calcularPagoLinea({
      tipo: 'PORCENTAJE',
      valor: D(50),
      cantidad: 1,
      subtotalCUP: D(800),
      costoAdicionalCUP: D(1200),
      operarioAsignado: true,
    })
    expect(pago.toNumber()).toBe(0)
  })

  test('PORCENTAJE: costo igual al subtotal → base 0 → pago 0', () => {
    const pago = calcularPagoLinea({
      tipo: 'PORCENTAJE',
      valor: D(50),
      cantidad: 1,
      subtotalCUP: D(800),
      costoAdicionalCUP: D(800),
      operarioAsignado: true,
    })
    expect(pago.toNumber()).toBe(0)
  })

  test('PORCENTAJE con decimales redondea a 2', () => {
    const pago = calcularPagoLinea({
      tipo: 'PORCENTAJE',
      valor: D('12.5'),
      cantidad: 1,
      subtotalCUP: D('3333.33'),
      costoAdicionalCUP: D('333.33'),
      operarioAsignado: true,
    })
    expect(pago.toString()).toBe('375') // (3333.33 − 333.33) × 12.5% = 3000 × 0.125
  })

  test('Sin operario asignado no genera pago (con o sin costo)', () => {
    const pago = calcularPagoLinea({
      tipo: 'FIJO',
      valor: D(200),
      cantidad: 2,
      subtotalCUP: D(5000),
      costoAdicionalCUP: D(100),
      operarioAsignado: false,
    })
    expect(pago.toNumber()).toBe(0)
  })

  test('Valor 0 genera pago 0', () => {
    expect(
      calcularPagoLinea({ tipo: 'FIJO', valor: D(0), cantidad: 5, subtotalCUP: D(100), operarioAsignado: true }).toNumber()
    ).toBe(0)
    expect(
      calcularPagoLinea({ tipo: 'PORCENTAJE', valor: D(0), cantidad: 1, subtotalCUP: D(100), costoAdicionalCUP: D(40), operarioAsignado: true }).toNumber()
    ).toBe(0)
  })

  test('costoAdicionalEnCUP: convierte usando las tasas (USD/EUR/CUP)', () => {
    const tasas = { USD: D(440), EUR: D(470) }
    // Ítem en USD: costo 2 USD → 880 CUP
    expect(costoAdicionalEnCUP(D(2), 'USD', tasas).toString()).toBe('880')
    // Ítem en EUR: costo 1 EUR → 470 CUP
    expect(costoAdicionalEnCUP(D(1), 'EUR', tasas).toString()).toBe('470')
    // Ítem en CUP: costo 500 → 500 CUP (1:1)
    expect(costoAdicionalEnCUP(D(500), 'CUP', tasas).toString()).toBe('500')
    // Sin costo (null) → 0
    expect(costoAdicionalEnCUP(null, 'USD', tasas).toNumber()).toBe(0)
  })
})
