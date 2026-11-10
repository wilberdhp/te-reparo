import { describe, test, expect } from 'bun:test'
import { Decimal, D, d2, convertirACUP, tasaAplicada, formatoNumero } from '../src/lib/money'

describe('Conversión de monedas (siempre Decimal, nunca float)', () => {
  const tasas = { USD: D(440), EUR: D(470) }

  test('USD → CUP multiplica por la tasa', () => {
    const r = convertirACUP(D(10), 'USD', tasas)
    expect(r.toString()).toBe('4400')
    expect(r instanceof Decimal).toBe(true)
  })

  test('EUR → CUP multiplica por la tasa', () => {
    const r = convertirACUP(D(5), 'EUR', tasas)
    expect(r.toString()).toBe('2350')
  })

  test('CUP pasa directo (1:1)', () => {
    const r = convertirACUP(D('123.45'), 'CUP', tasas)
    expect(r.toString()).toBe('123.45')
  })

  test('Redondeo a 2 decimales HALF_UP', () => {
    expect(convertirACUP(D('10.005'), 'CUP', tasas).toString()).toBe('10.01')
    expect(convertirACUP(D('10.004'), 'CUP', tasas).toString()).toBe('10')
    expect(d2(D('2.675')).toString()).toBe('2.68')
  })

  test('Precisión decimal sin errores de float', () => {
    // 0.1 + 0.2 en float daría 0.30000000000000004; con Decimal es exacto
    const suma = D('0.1').plus(D('0.2'))
    expect(suma.toString()).toBe('0.3')
    // 100 USD con tasa 440.5 → 44050 exacto
    expect(convertirACUP(D(100), 'USD', { USD: D('440.5'), EUR: D(0) }).toString()).toBe('44050')
  })

  test('Tasa aplicada por moneda', () => {
    expect(tasaAplicada('USD', tasas).toString()).toBe('440')
    expect(tasaAplicada('EUR', tasas).toString()).toBe('470')
    expect(tasaAplicada('CUP', tasas).toString()).toBe('1')
  })

  test('Formato cubano 12.345,67', () => {
    expect(formatoNumero(1234.5)).toBe('1.234,50')
    expect(formatoNumero('1234567.891')).toBe('1.234.567,89')
    expect(formatoNumero(-9876.5)).toBe('-9.876,50')
  })
})
