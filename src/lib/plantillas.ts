// Motor de plantillas de tickets — funciones PURAS (testeables) e isomorfas:
// se usan en el POS (impresión), en el historial (reimpresión) y en la vista
// previa de Configuración. Nunca usa `window`; puede correr en servidor.
//
// Variables soportadas (PROMPT DE ACTUALIZACIÓN §4.3):
//   {{taller_nombre}} {{taller_direccion}} {{taller_telefono}}
//   {{cliente_nombre}} {{cliente_ci}} {{cliente_telefono}}
//   {{venta_codigo}}   {{venta_fecha}}     {{venta_total_cup}}
//   {{items_detalle}}  {{garantias_texto}} {{vendedor_nombre}}
//
// Reglas:
//  - El resto del texto se escapa como HTML (seguro ante <script> etc.).
//  - Los saltos de línea escritos por el administrador se convierten en <br>
//    y se respetan tal cual al imprimir.
//  - `{{items_detalle}}` genera una tabla tabular con Producto, Cantidad,
//    Precio y Subtotal; la descripciónAdicional se muestra justo debajo del
//    nombre del producto en fuente de 8pt.
//  - Variables desconocidas (p. ej. {{foo}}) se dejan tal cual, sin romper.
import { fmt, fmtFechaHora } from './formato'

export interface ItemPlantilla {
  nombre: string
  cantidad: number
  /** Precio unitario en la moneda del ítem. */
  precio: number
  moneda: string
  subtotalCUP: number
  /** Nota de línea (IMEI, falla, color…) impresa bajo el nombre. */
  descripcionAdicional?: string | null
}

export interface GarantiaPlantilla {
  nombre: string
  dias: number
}

export interface ContextoPlantilla {
  taller: { nombre: string; direccion: string; telefono: string }
  /** null → venta de mostrador: se imprime «Consumidor Final». */
  cliente: { nombre: string; ci: string | null; telefono: string | null } | null
  venta: {
    codigo: string
    fecha: string
    totalCUP: number
    vendedorNombre: string
  }
  items: ItemPlantilla[]
  garantias: GarantiaPlantilla[]
}

/** Catálogo de variables para el editor de Configuración (con descripción). */
export const VARIABLES_PLANTILLA: Array<{ variable: string; descripcion: string; grupo: string }> = [
  { variable: '{{taller_nombre}}', descripcion: 'Nombre del taller de la venta', grupo: 'Taller' },
  { variable: '{{taller_direccion}}', descripcion: 'Dirección del taller', grupo: 'Taller' },
  { variable: '{{taller_telefono}}', descripcion: 'Teléfono del taller', grupo: 'Taller' },
  { variable: '{{cliente_nombre}}', descripcion: 'Cliente (venta de mostrador → «Consumidor Final»)', grupo: 'Cliente' },
  { variable: '{{cliente_ci}}', descripcion: 'CI del cliente (vacío en mostrador)', grupo: 'Cliente' },
  { variable: '{{cliente_telefono}}', descripcion: 'Teléfono del cliente (vacío en mostrador)', grupo: 'Cliente' },
  { variable: '{{venta_codigo}}', descripcion: 'Código único de la venta', grupo: 'Venta' },
  { variable: '{{venta_fecha}}', descripcion: 'Fecha y hora de la venta', grupo: 'Venta' },
  { variable: '{{venta_total_cup}}', descripcion: 'Total pagado en CUP', grupo: 'Venta' },
  { variable: '{{vendedor_nombre}}', descripcion: 'Vendedor que registró la venta', grupo: 'Venta' },
  { variable: '{{items_detalle}}', descripcion: 'Tabla de ítems: producto, cantidad, precio y notas de línea', grupo: 'Bloques' },
  { variable: '{{garantias_texto}}', descripcion: 'Listado de días de garantía por producto vendido', grupo: 'Bloques' },
]

/** Datos de prueba para la vista previa del editor de plantillas. */
export const CONTEXTO_MOCK: ContextoPlantilla = {
  taller: {
    nombre: 'Te Reparo — Taller Piloto',
    direccion: 'Calle Ejemplo No. 1, La Habana',
    telefono: '+53 5 000 0000',
  },
  cliente: { nombre: 'María Fernández Ruiz', ci: '91021156788', telefono: '+53 5 555 1234' },
  venta: {
    codigo: 'V000123',
    fecha: new Date().toISOString(),
    totalCUP: 4300,
    vendedorNombre: 'Yunier González',
  },
  items: [
    {
      nombre: 'Cambio de pantalla (manodeobra)',
      cantidad: 1,
      precio: 800,
      moneda: 'CUP',
      subtotalCUP: 800,
      descripcionAdicional: 'IMEI: 356938035643809 · Xiaomi Redmi 9C · color negro',
    },
    {
      nombre: 'Protector de vidrio templado universal',
      cantidad: 2,
      precio: 400,
      moneda: 'CUP',
      subtotalCUP: 800,
      descripcionAdicional: null,
    },
    {
      nombre: 'Batería Samsung A12 (5000 mAh)',
      cantidad: 1,
      precio: 1500,
      moneda: 'CUP',
      subtotalCUP: 1500,
      descripcionAdicional: 'Instalada en sitio · cliente espera aviso de carga',
    },
    {
      nombre: 'Instalación de software / flasheo',
      cantidad: 1,
      precio: 1200,
      moneda: 'CUP',
      subtotalCUP: 1200,
      descripcionAdicional: 'Se respaldaron contactos antes del flasheo',
    },
  ],
  garantias: [
    { nombre: 'Cambio de pantalla (manodeobra)', dias: 30 },
    { nombre: 'Batería Samsung A12 (5000 mAh)', dias: 60 },
    { nombre: 'Instalación de software / flasheo', dias: 15 },
  ],
}

/** Escapa texto plano para incrustarlo de forma segura como HTML. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Mapa de variables escalares (todo se escapa; los bloques se manejan aparte). */
function mapaEscalar(ctx: ContextoPlantilla): Record<string, string> {
  return {
    taller_nombre: ctx.taller.nombre,
    taller_direccion: ctx.taller.direccion,
    taller_telefono: ctx.taller.telefono,
    cliente_nombre: ctx.cliente?.nombre ?? 'Consumidor Final',
    cliente_ci: ctx.cliente?.ci ?? '',
    cliente_telefono: ctx.cliente?.telefono ?? '',
    venta_codigo: ctx.venta.codigo,
    venta_fecha: fmtFechaHora(ctx.venta.fecha),
    venta_total_cup: `${fmt(ctx.venta.totalCUP)} CUP`,
    vendedor_nombre: ctx.venta.vendedorNombre,
  }
}

/** Bloque {{items_detalle}}: tabla tabular + nota de línea bajo el nombre (8pt). */
export function htmlItemsDetalle(items: ItemPlantilla[]): string {
  if (items.length === 0) return esc('(sin ítems)')
  const filas = items
    .map(
      (it) => `    <tr>
      <td>${esc(it.nombre)}${
        it.descripcionAdicional
          ? `\n      <div style="font-size:8pt;line-height:1.25;opacity:.85">${esc(it.descripcionAdicional)}</div>`
          : ''
      }</td>
      <td style="text-align:center">${it.cantidad}</td>
      <td style="text-align:right;white-space:nowrap">${esc(fmt(it.precio))} ${esc(it.moneda)}</td>
      <td style="text-align:right;white-space:nowrap">${esc(fmt(it.subtotalCUP))}</td>
    </tr>`
    )
    .join('\n')
  return `  <table style="width:100%;border-collapse:collapse;margin:2px 0">
    <thead>
      <tr style="border-top:1px dashed #000;border-bottom:1px dashed #000">
        <th style="text-align:left;font-weight:600">Producto</th>
        <th style="text-align:center;font-weight:600">Cant.</th>
        <th style="text-align:right;font-weight:600">Precio</th>
        <th style="text-align:right;font-weight:600">Subtotal</th>
      </tr>
    </thead>
    <tbody>
${filas}
    </tbody>
  </table>`
}

/** Bloque {{garantias_texto}}: listado de días de garantía por producto. */
export function htmlGarantiasTexto(garantias: GarantiaPlantilla[]): string {
  const conDias = garantias.filter((g) => g.dias > 0)
  if (conDias.length === 0) return esc('(esta venta no incluye garantía)')
  return conDias
    .map((g) => `  <div>· ${esc(g.nombre)} — <b>${g.dias} días</b></div>`)
    .join('\n')
}

/**
 * Renderiza el contenido de una plantilla a HTML listo para imprimir:
 * reemplaza las variables {{...}} con los datos reales de la venta, convierte
 * los saltos de línea del administrador en <br> y escapa todo el texto plano.
 */
export function renderizarPlantilla(contenido: string, ctx: ContextoPlantilla): string {
  const mapa = mapaEscalar(ctx)
  // Separar primero los bloques; el resto se procesa como texto + variables escalares.
  const partes = contenido.split(/(\{\{items_detalle\}\}|\{\{garantias_texto\}\})/)
  return partes
    .map((parte) => {
      if (parte === '{{items_detalle}}') return htmlItemsDetalle(ctx.items)
      if (parte === '{{garantias_texto}}') return htmlGarantiasTexto(ctx.garantias)
      return esc(parte)
        .replace(/\{\{(\w+)\}\}/g, (m, clave: string) => (clave in mapa ? esc(mapa[clave]) : m))
        .replace(/\r\n|\r|\n/g, '<br>')
    })
    .join('')
}

/** Variables {{...}} realmente usadas en un contenido (para el editor). */
export function variablesUsadas(contenido: string): string[] {
  const encontradas = contenido.match(/\{\{\w+\}\}/g) ?? []
  return [...new Set(encontradas)]
}
