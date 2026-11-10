import { describe, test, expect } from 'bun:test'
import { calcularPagoLinea } from '../src/lib/pagos'
import { D } from '../src/lib/money'

describe('Cálculo del pago al operario por línea', () => {
  test('FIJO: valor CUP × cantidad de unidades', () => {
    const pago = calcularPagoLinea({
      tipo: 'FIJO',
      valor: D(200),
      cantidad: 3,
      subtotalCUP: D(7800),
      operarioAsignado: true,
    })
    expect(pago.toString()).toBe('600')
  })

  test('PORCENTAJE: subtotalCUP × valor / 100', () => {
    const pago = calcularPagoLinea({
      tipo: 'PORCENTAJE',
      valor: D(10),
      cantidad: 1,
      subtotalCUP: D(5000),
      operarioAsignado: true,
    })
    expect(pago.toString()).toBe('500')
  })

  test('PORCENTAJE con decimales redondea a 2', () => {
    const pago = calcularPagoLinea({
      tipo: 'PORCENTAJE',
      valor: D('12.5'),
      cantidad: 1,
      subtotalCUP: D('3333.33'),
      operarioAsignado: true,
    })
    expect(pago.toString()).toBe('416.67') // 416.66625 → 416.67
  })

  test('Sin operario asignado no genera pago', () => {
    const pago = calcularPagoLinea({
      tipo: 'FIJO',
      valor: D(200),
      cantidad: 2,
      subtotalCUP: D(5000),
      operarioAsignado: false,
    })
    expect(pago.toNumber()).toBe(0)
  })

  test('Valor 0 genera pago 0', () => {
    expect(
      calcularPagoLinea({ tipo: 'FIJO', valor: D(0), cantidad: 5, subtotalCUP: D(100), operarioAsignado: true }).toNumber()
    ).toBe(0)
    expect(
      calcularPagoLinea({ tipo: 'PORCENTAJE', valor: D(0), cantidad: 1, subtotalCUP: D(100), operarioAsignado: true }).toNumber()
    ).toBe(0)
  })
})
