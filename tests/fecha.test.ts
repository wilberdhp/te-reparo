import { describe, test, expect } from 'bun:test'
import {
  fechaCorta,
  etiquetaDeClave,
  parseFechaCorta,
  ventanaDia,
  claveHoy,
  claveDiaSiguiente,
  inicioDia,
  finDia,
} from '../src/lib/fecha'

// El entorno de pruebas corre en UTC: los tests verifican que el día civil se
// resuelva SIEMPRE en la zona del negocio (America/Havana), sin importar la
// zona del servidor. En noviembre La Habana está en UTC-5 (horario estándar).

describe('Día civil en la zona del negocio (America/Havana)', () => {
  test('Una venta de la tarde/noche de Cuba pertenece a SU día civil (bug: 00:11 UTC caía al día siguiente)', () => {
    // 2026-11-13 00:11 UTC = 2026-11-12 19:11 en La Habana
    const venta = new Date('2026-11-13T00:11:00Z')
    expect(fechaCorta(venta)).toBe('2026-11-12')
    // y entra en la ventana del 12/11 (no en la del 13/11)
    const dia12 = ventanaDia('2026-11-12')
    const dia13 = ventanaDia('2026-11-13')
    expect(venta >= dia12.inicio && venta < dia12.fin).toBe(true)
    expect(venta >= dia13.inicio && venta < dia13.fin).toBe(false)
  })

  test('Ventana del día: medianoche civil de La Habana (UTC-5 en noviembre)', () => {
    const { inicio, fin } = ventanaDia('2026-11-12')
    expect(inicio.toISOString()).toBe('2026-11-12T05:00:00.000Z')
    expect(fin.toISOString()).toBe('2026-11-13T05:00:00.000Z')
  })

  test('La venta de la mañana de Cuba (ej. 13:00 local = 18:00 UTC) queda en su mismo día', () => {
    const venta = new Date('2026-11-12T18:00:00Z') // 13:00 en La Habana
    const { inicio, fin } = ventanaDia('2026-11-12')
    expect(venta >= inicio && venta < fin).toBe(true)
  })

  test('Fin de mes: la ventana del 30/11 termina el 1/12', () => {
    const { inicio, fin } = ventanaDia('2026-11-30')
    expect(inicio.toISOString()).toBe('2026-11-30T05:00:00.000Z')
    expect(fin.toISOString()).toBe('2026-12-01T05:00:00.000Z')
  })
})

describe('Claves de día estables en BD (medianoche UTC de la etiqueta)', () => {
  test('parseFechaCorta → medianoche UTC, ida y vuelta con etiquetaDeClave', () => {
    const clave = parseFechaCorta('2026-11-12')!
    expect(clave.toISOString()).toBe('2026-11-12T00:00:00.000Z')
    expect(etiquetaDeClave(clave)).toBe('2026-11-12')
  })

  test('claveDiaSiguiente cruza fin de mes', () => {
    expect(claveDiaSiguiente(parseFechaCorta('2026-11-30')!).toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(claveDiaSiguiente(parseFechaCorta('2026-12-31')!).toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })

  test('parseFechaCorta rechaza etiquetas inválidas o normalizadas', () => {
    expect(parseFechaCorta(null)).toBeNull()
    expect(parseFechaCorta('12/11/2026')).toBeNull()
    expect(parseFechaCorta('2026-13-01')).toBeNull() // mes 13
    expect(parseFechaCorta('2026-11-32')).toBeNull() // día 32
  })

  test('claveHoy / inicioDia / finDia coherentes con la ventana de hoy', () => {
    expect(etiquetaDeClave(claveHoy())).toBe(fechaCorta())
    const { inicio, fin } = ventanaDia(fechaCorta())
    expect(inicioDia().getTime()).toBe(inicio.getTime())
    expect(finDia().getTime()).toBe(fin.getTime())
  })
})
