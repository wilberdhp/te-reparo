import { describe, test, expect } from 'bun:test'
import { renderizarPlantilla, htmlItemsDetalle, htmlGarantiasTexto, variablesUsadas, CONTEXTO_MOCK } from '../src/lib/plantillas'

const ctx = {
  taller: { nombre: 'Te Reparo — Matriz', direccion: 'Calle 23 #45', telefono: '+53 5 123 4567' },
  cliente: { nombre: 'Ana Torres', ci: '99010112345', telefono: '+53 5 987 6543' },
  venta: { codigo: 'V000123', fecha: '2026-11-11T10:30:00.000Z', totalCUP: 4300, vendedorNombre: 'Luis Pérez' },
  items: [
    {
      nombre: 'Cambio de pantalla',
      cantidad: 1,
      precio: 800,
      moneda: 'CUP',
      subtotalCUP: 800,
      descripcionAdicional: 'IMEI: 356938035643809 · color negro',
    },
    { nombre: 'Protector templado', cantidad: 2, precio: 400, moneda: 'CUP', subtotalCUP: 800, descripcionAdicional: null },
  ],
  garantias: [
    { nombre: 'Cambio de pantalla', dias: 30 },
    { nombre: 'Protector templado', dias: 0 },
  ],
}

describe('Motor de plantillas de tickets (variables dinámicas)', () => {
  test('Reemplaza las variables escalares', () => {
    const html = renderizarPlantilla('{{taller_nombre}} / {{venta_codigo}} / {{venta_total_cup}} / {{vendedor_nombre}}', ctx)
    expect(html).toBe('Te Reparo — Matriz / V000123 / 4.300,00 CUP / Luis Pérez')
  })

  test('Venta de mostrador (cliente null) → «Consumidor Final» y CI vacío', () => {
    const html = renderizarPlantilla('{{cliente_nombre}}|{{cliente_ci}}|{{cliente_telefono}}', { ...ctx, cliente: null })
    expect(html).toBe('Consumidor Final||')
  })

  test('Los saltos de línea del administrador se respetan (<br>)', () => {
    const html = renderizarPlantilla('línea 1\nlínea 2', ctx)
    expect(html).toBe('línea 1<br>línea 2')
  })

  test('Escapa HTML del texto del admin (anti <script>)', () => {
    const html = renderizarPlantilla('<script>alert(1)</script>', ctx)
    expect(html).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  test('Variables desconocidas se dejan tal cual', () => {
    const html = renderizarPlantilla('{{no_existe}} ok', ctx)
    expect(html).toBe('{{no_existe}} ok')
  })

  test('{{items_detalle}}: tabla con producto, cantidad, precio y nota bajo el nombre (8pt)', () => {
    const html = htmlItemsDetalle(ctx.items)
    expect(html).toContain('<table')
    expect(html).toContain('Cambio de pantalla')
    expect(html).toContain('IMEI: 356938035643809 · color negro')
    expect(html).toContain('font-size:8pt')
    expect(html).toContain('text-align:right')
    // Solo la línea con nota lleva el bloque 8pt (la otra no tiene nota)
    expect(html.match(/font-size:8pt/g)?.length).toBe(1)
  })

  test('{{garantias_texto}}: solo productos con días > 0', () => {
    const html = htmlGarantiasTexto(ctx.garantias)
    expect(html).toContain('Cambio de pantalla — <b>30 días</b>')
    expect(html).not.toContain('Protector templado')
  })

  test('{{garantias_texto}} sin garantías: mensaje informativo', () => {
    expect(htmlGarantiasTexto([])).toContain('no incluye garantía')
  })

  test('{{items_detalle}} sin ítems: mensaje informativo', () => {
    expect(htmlItemsDetalle([])).toContain('sin ítems')
  })

  test('Bloques intercalados con texto: se combinan correctamente', () => {
    const html = renderizarPlantilla('VENTA {{venta_codigo}}\n{{items_detalle}}\nTOTAL {{venta_total_cup}}', ctx)
    expect(html).toContain('VENTA V000123<br>')
    expect(html).toContain('<table')
    expect(html).toContain('<br>TOTAL 4.300,00 CUP')
  })

  test('variablesUsadas: lista única de variables presentes', () => {
    expect(variablesUsadas('{{venta_codigo}} y {{venta_codigo}} y {{taller_nombre}}')).toEqual([
      '{{venta_codigo}}',
      '{{taller_nombre}}',
    ])
  })

  test('El contexto MOCK de la vista previa renderiza sin errores', () => {
    const html = renderizarPlantilla('{{taller_nombre}}\n{{items_detalle}}\n{{garantias_texto}}', CONTEXTO_MOCK)
    expect(html.length).toBeGreaterThan(100)
    expect(html).toContain('Te Reparo — Taller Piloto')
  })
})
