'use client'
// Tickets HTML imprimibles (58/80 mm configurables) vía window.print().
// La clase `solo-impresion` se imprime únicamente con @media print (globals.css).
import { fmt, fmtFechaHora } from '@/lib/formato'
import { renderizarPlantilla, type ContextoPlantilla } from '@/lib/plantillas'

/**
 * Ticket renderizado desde una PlantillaTicket (PROMPT DE ACTUALIZACIÓN §5):
 * el motor de variables (src/lib/plantillas.ts) reemplaza {{...}} con los datos
 * reales de la venta, respeta los saltos de línea del administrador e imprime
 * {{items_detalle}} como tabla con la descripcionAdicional bajo el nombre (8pt).
 * El HTML del motor está ESCAPADO (solo inserta la tabla/lista que él genera).
 */
export function TicketPlantilla({
  contenido,
  contexto,
  ancho,
}: {
  contenido: string
  contexto: ContextoPlantilla
  ancho: string
}) {
  const html = renderizarPlantilla(contenido, contexto)
  return (
    <div
      className="solo-impresion bg-white text-black mx-auto p-2 font-mono"
      style={{ width: `${ancho}mm`, fontSize: ancho === '58' ? '9px' : '10.5px', lineHeight: 1.4 }}
      // HTML generado por el motor: todo el texto del admin viene escapado.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Convierte un detalle de venta (API /api/ventas?id=) al contexto del motor. */
export function contextoDesdeVentaDetalle(detalle: {
  venta: {
    taller: { nombre: string; direccion: string; telefono: string }
    cliente: { nombre: string; ci?: string | null; telefono?: string | null } | null
    vendedor: { nombre: string } | null
    codigo: string
    fecha: string
    totalCUP: number
    items: Array<{
      producto: { nombre: string }
      cantidad: number
      precioUnitario: number
      monedaPrecio: string
      subtotalCUP: number
      descripcionAdicional?: string | null
      garantiaDiasSnapshot?: number
    }>
  }
}): ContextoPlantilla {
  const v = detalle.venta
  return {
    taller: v.taller,
    cliente: v.cliente
      ? { nombre: v.cliente.nombre, ci: v.cliente.ci ?? null, telefono: v.cliente.telefono ?? null }
      : null, // venta de mostrador → «Consumidor Final»
    venta: {
      codigo: v.codigo,
      fecha: v.fecha,
      totalCUP: v.totalCUP,
      vendedorNombre: v.vendedor?.nombre ?? '',
    },
    items: v.items.map((i) => ({
      nombre: i.producto.nombre,
      cantidad: i.cantidad,
      precio: i.precioUnitario,
      moneda: i.monedaPrecio,
      subtotalCUP: i.subtotalCUP,
      descripcionAdicional: i.descripcionAdicional ?? null,
    })),
    // Días de garantía por producto vendido (snapshot de cada línea)
    garantias: v.items.map((i) => ({ nombre: i.producto.nombre, dias: i.garantiaDiasSnapshot ?? 0 })),
  }
}

export interface TicketVentaData {
  codigo: string
  fecha: string
  taller: { nombre: string; direccion: string; telefono: string }
  cliente: string | null
  vendedor: string
  items: Array<{
    nombre: string
    cantidad: number
    precio: number
    moneda: string
    subtotalCUP: number
    operario?: string | null
    /** Nota de línea (IMEI, falla…) impresa bajo el nombre en fuente menor. */
    descripcionAdicional?: string | null
  }>
  totalCUP: number
  pagos: Array<{ metodo: string; moneda: string; monto: number; montoCUP: number; referencia?: string | null }>
  encabezado?: string
  pie?: string
  ancho: string // '58' | '80'
}

function Encabezado({ ancho, titulo }: { ancho: string; titulo: string }) {
  return (
    <div className="text-center border-b border-dashed border-black pb-1 mb-1">
      <div className="font-bold text-[11px] uppercase tracking-wide">{titulo}</div>
      <div className="text-[9px] opacity-70">ancho {ancho} mm</div>
    </div>
  )
}

export function TicketVenta({ data }: { data: TicketVentaData }) {
  const recibido = data.pagos.reduce((a, p) => a + (parseFloat(String(p.montoCUP)) || 0), 0)
  const cambio = Math.round((recibido - parseFloat(String(data.totalCUP))) * 100) / 100
  return (
    <div className="solo-impresion bg-white text-black mx-auto p-2 font-mono" style={{ width: `${data.ancho}mm`, fontSize: data.ancho === '58' ? '9px' : '10.5px' }}>
      <div className="text-center font-bold">{data.encabezado || data.taller.nombre}</div>
      <div className="text-center text-[9px]">{data.taller.nombre}</div>
      <div className="text-center text-[9px]">{data.taller.direccion}</div>
      <div className="text-center text-[9px]">Tel: {data.taller.telefono}</div>
      <Encabezado ancho={data.ancho} titulo="Venta" />
      <div className="flex justify-between">
        <span>{data.codigo}</span>
        <span>{fmtFechaHora(data.fecha)}</span>
      </div>
      <div>Cliente: {data.cliente ?? 'Consumidor final'}</div>
      <div>Atendió: {data.vendedor}</div>
      <div className="border-t border-dashed border-black my-1" />
      {data.items.map((it, i) => (
        <div key={i} className="mb-0.5">
          <div className="flex justify-between gap-1">
            <span className="truncate">
              {it.cantidad}× {it.nombre}
            </span>
          </div>
          {it.descripcionAdicional && (
            <div style={{ fontSize: '0.82em' }} className="opacity-80 leading-tight break-words">
              {it.descripcionAdicional}
            </div>
          )}
          <div className="flex justify-between text-[9px] opacity-80">
            <span>
              {fmt(it.precio)} {it.moneda}
              {it.operario ? ` · ${it.operario}` : ''}
            </span>
            <span>{fmt(it.subtotalCUP)}</span>
          </div>
        </div>
      ))}
      <div className="border-t border-dashed border-black my-1" />
      <div className="flex justify-between font-bold text-[12px]">
        <span>TOTAL</span>
        <span>{fmt(data.totalCUP)} CUP</span>
      </div>
      <div className="border-t border-dashed border-black my-1" />
      {data.pagos.map((p, i) => (
        <div key={i} className="flex justify-between text-[9px]">
          <span>
            {p.metodo} {p.moneda}
            {p.referencia ? ` ref:${p.referencia}` : ''}
          </span>
          <span>
            {fmt(p.monto)} {p.moneda} ({fmt(p.montoCUP)} CUP)
          </span>
        </div>
      ))}
      {cambio > 0 && (
        <div className="flex justify-between text-[9px]">
          <span>Recibido</span>
          <span>{fmt(recibido)} CUP</span>
        </div>
      )}
      {cambio > 0 && (
        <div className="flex justify-between">
          <span>Cambio</span>
          <span>{fmt(cambio)} CUP</span>
        </div>
      )}
      <div className="text-center text-[9px] mt-2 pt-1 border-t border-dashed border-black">
        {data.pie || '¡Gracias por su compra!'}
      </div>
    </div>
  )
}

export interface TicketDevolucionData {
  codigo: string
  fecha: string
  ventaCodigo: string
  taller: { nombre: string }
  usuario: string
  motivo: string
  items: Array<{ nombre: string; cantidad: number; subtotalCUP: number }>
  totalCUP: number
  ancho: string
}

export function TicketDevolucion({ data }: { data: TicketDevolucionData }) {
  return (
    <div className="solo-impresion bg-white text-black mx-auto p-2 font-mono" style={{ width: `${data.ancho}mm`, fontSize: data.ancho === '58' ? '9px' : '10.5px' }}>
      <div className="text-center font-bold">{data.taller.nombre}</div>
      <Encabezado ancho={data.ancho} titulo="Devolución" />
      <div className="flex justify-between">
        <span>{data.codigo}</span>
        <span>{fmtFechaHora(data.fecha)}</span>
      </div>
      <div>Venta: {data.ventaCodigo}</div>
      <div>Atendió: {data.usuario}</div>
      <div className="border-t border-dashed border-black my-1" />
      {data.items.map((it, i) => (
        <div key={i} className="flex justify-between text-[9px]">
          <span className="truncate">
            {it.cantidad}× {it.nombre}
          </span>
          <span>{fmt(it.subtotalCUP)}</span>
        </div>
      ))}
      <div className="border-t border-dashed border-black my-1" />
      <div className="flex justify-between font-bold text-[12px]">
        <span>A DEVOLVER</span>
        <span>{fmt(data.totalCUP)} CUP</span>
      </div>
      <div className="text-[9px] mt-1">Motivo: {data.motivo}</div>
      <div className="text-center text-[9px] mt-1">Producto recibido como DEFECTUOSO</div>
    </div>
  )
}

export interface ComprobanteData {
  codigo: string
  fechaPago: string
  fechaLiquidacion: string
  operarioNombre: string
  ramaLabel: string
  taller: { nombre: string; direccion: string; telefono: string }
  tipoLinea: string | null
  montoCUP: number
  base: string | null
  formula: string | null
  repartoEquitativo: string | null
  ventasPropias: Array<{ codigo: string; totalCUP: string }>
  ajustes: Array<{ motivo: string; montoCUP: number; devolucion: string | null }>
}

export function TicketComprobante({ data }: { data: ComprobanteData }) {
  const esTecnico = data.repartoEquitativo !== null
  return (
    <div className="solo-impresion bg-white text-black mx-auto p-2 font-mono" style={{ width: '80mm', fontSize: '10.5px' }}>
      <div className="text-center font-bold">{data.taller.nombre}</div>
      <div className="text-center text-[9px]">{data.taller.direccion}</div>
      <Encabezado ancho="80" titulo="Comprobante de pago" />
      <div className="flex justify-between">
        <span>{data.codigo}</span>
        <span>{fmtFechaHora(data.fechaPago)}</span>
      </div>
      <div>Liquidación del día: {data.fechaLiquidacion}</div>
      <div className="border-t border-dashed border-black my-1" />
      <div className="font-bold">{data.operarioNombre}</div>
      <div className="text-[9px]">{data.ramaLabel}</div>
      <div className="border-t border-dashed border-black my-1" />
      {data.base && (
        <div className="flex justify-between text-[9px]">
          <span>Base</span>
          <span>{fmt(data.base)} CUP</span>
        </div>
      )}
      {data.formula && <div className="text-[9px] mb-1">{data.formula}</div>}
      {data.ventasPropias.length > 0 && (
        <div className="text-[9px]">
          <div className="font-bold">Ventas propias:</div>
          {data.ventasPropias.map((v, i) => (
            <div key={i} className="flex justify-between">
              <span>{v.codigo}</span>
              <span>{fmt(v.totalCUP)} CUP</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between font-bold text-[12px] mt-1">
        <span>MONTO A PAGAR</span>
        <span>{fmt(data.montoCUP)} CUP</span>
      </div>
      {data.ajustes.length > 0 && (
        <div className="text-[9px] mt-1">
          <div className="font-bold">Ajustes:</div>
          {data.ajustes.map((a, i) => (
            <div key={i} className="flex justify-between">
              <span className="truncate max-w-[70%]">
                {a.devolucion ? `${a.devolucion}: ` : ''}
                {a.motivo}
              </span>
              <span>{fmt(a.montoCUP)}</span>
            </div>
          ))}
        </div>
      )}
      {esTecnico && (
        <div className="text-[8px] mt-2 pt-1 border-t border-dashed border-black italic">
          Referencia (no afecta el monto pagado): reparto equitativo del día ={' '}
          {fmt(data.repartoEquitativo ?? '0')} CUP por técnico.
        </div>
      )}
      <div className="text-center text-[9px] mt-2 pt-1 border-t border-dashed border-black">
        Firma operario: ____________________
      </div>
    </div>
  )
}
