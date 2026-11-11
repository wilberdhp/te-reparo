import { describe, test, expect } from 'bun:test'
import { paginacionDeParams, metaPaginacion, LIMITES_PAGINA, LIMITE_DEFECTO } from '../src/lib/paginacion'

function sp(qs: string) {
  return new URLSearchParams(qs)
}

describe('Paginación del lado del servidor (prompt de actualización §1/§2)', () => {
  test('Sin ?page= no se pagina (modo legado: POS y buscadores)', () => {
    expect(paginacionDeParams(sp(''))).toBeNull()
    expect(paginacionDeParams(sp('q=abc&tallerId=t1'))).toBeNull()
    expect(paginacionDeParams(sp('limit=50'))).toBeNull()
  })

  test('?page=1&limit=25 → skip 0 (página por defecto 25)', () => {
    const p = paginacionDeParams(sp('page=1&limit=25'))
    expect(p).not.toBeNull()
    expect(p!.page).toBe(1)
    expect(p!.limit).toBe(25)
    expect(p!.skip).toBe(0)
  })

  test('?page=3&limit=50 → skip 100', () => {
    const p = paginacionDeParams(sp('page=3&limit=50'))
    expect(p!.page).toBe(3)
    expect(p!.limit).toBe(50)
    expect(p!.skip).toBe(100)
  })

  test('Límite fuera de la lista permitida cae en el defecto', () => {
    expect(paginacionDeParams(sp('page=2&limit=37'))!.limit).toBe(LIMITE_DEFECTO)
    expect(paginacionDeParams(sp('page=2&limit=abc'))!.limit).toBe(LIMITE_DEFECTO)
    expect(paginacionDeParams(sp('page=2'))!.limit).toBe(LIMITE_DEFECTO)
  })

  test('Valores inválidos/negativos de página se sanean a 1', () => {
    expect(paginacionDeParams(sp('page=abc'))!.page).toBe(1)
    expect(paginacionDeParams(sp('page=0'))!.page).toBe(1)
    expect(paginacionDeParams(sp('page=-4'))!.page).toBe(1)
    expect(paginacionDeParams(sp('page=2.9'))!.page).toBe(2) // se trunca
  })

  test('Solo se admiten 10/25/50/100 registros por página', () => {
    expect([...LIMITES_PAGINA]).toEqual([10, 25, 50, 100])
    for (const l of [10, 25, 50, 100]) {
      expect(paginacionDeParams(sp(`page=1&limit=${l}`))!.limit).toBe(l)
    }
  })

  test('metaPaginacion calcula el total de páginas (mínimo 1)', () => {
    expect(metaPaginacion(0, 25)).toEqual({ total: 0, totalPages: 1 })
    expect(metaPaginacion(1, 25)).toEqual({ total: 1, totalPages: 1 })
    expect(metaPaginacion(25, 25)).toEqual({ total: 25, totalPages: 1 })
    expect(metaPaginacion(26, 25)).toEqual({ total: 26, totalPages: 2 })
    expect(metaPaginacion(5432, 25).totalPages).toBe(218) // 5.432 / 25 = 217,28 → 218
    expect(metaPaginacion(5000, 100).totalPages).toBe(50)
  })

  test('La consulta del listado siempre lleva take (regla de oro §1)', () => {
    // Todo ?page= produce un take > 0: el contrato del helper lo garantiza
    // para las 5 vistas paginadas (inventario, ventas, clientes, logs, config).
    for (const l of LIMITES_PAGINA) {
      const p = paginacionDeParams(sp(`page=7&limit=${l}`))
      expect(p!.limit).toBe(l)
      expect(p!.skip).toBe(6 * l)
    }
  })
})
