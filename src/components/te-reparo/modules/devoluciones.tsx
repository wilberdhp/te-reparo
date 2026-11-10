'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Search, Printer, Undo2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/lib/store'
import { fmt, fmtCUP, fmtFechaHora, esServicio } from '@/lib/formato'
import { TicketDevolucion } from '../ticket'

interface VentaBusqueda {
  id: string
  codigo: string
  fecha: string
  totalCUP: number
  estado: string
  cliente: { nombre: string } | null
}

interface VentaDetalle {
  venta: {
    id: string
    codigo: string
    fecha: string
    estado: string
    totalCUP: number
    taller: { nombre: string }
    cliente: { nombre: string } | null
    items: Array<{
      id: string
      cantidad: number
      cantidadDevuelta: number
      subtotalCUP: number
      producto: { nombre: string; tipo: string }
      operario: { nombre: string } | null
    }>
  }
}

interface DevolucionCreada {
  devolucion: { id: string; codigo: string; fecha: string; totalCUP: number; motivo: string }
  codigo: string
}

export function Devoluciones() {
  const usuario = useApp((s) => s.usuario)
  const tallerActivoId = useApp((s) => s.tallerActivoId)
  const talleres = useApp((s) => s.talleres)
  const ajustes = useApp((s) => s.ajustes)
  const tallerId = usuario?.rol === 'VENDEDOR' ? usuario.tallerId : tallerActivoId ?? talleres[0]?.id

  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<VentaBusqueda[]>([])
  const [ventaSel, setVentaSel] = useState<VentaDetalle | null>(null)
  const [seleccion, setSeleccion] = useState<Record<string, { cantidad: string; motivo: string }>>({})
  const [motivoGeneral, setMotivoGeneral] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [ticket, setTicket] = useState<DevolucionCreada | null>(null)
  const [ticketItems, setTicketItems] = useState<Array<{ nombre: string; cantidad: number; subtotalCUP: number }>>([])
  const [ticketVenta, setTicketVenta] = useState<{ codigo: string; tallerNombre: string }>({ codigo: '', tallerNombre: '' })

  const buscar = useCallback(async () => {
    if (!tallerId || !q.trim()) return setResultados([])
    try {
      const res = await api.get<{ ventas: VentaBusqueda[] }>(`/api/ventas?tallerId=${tallerId}`)
      const t = q.trim().toLowerCase()
      setResultados(res.ventas.filter((v) => v.codigo.toLowerCase().includes(t)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al buscar ventas')
    }
  }, [tallerId, q])

  useEffect(() => {
    const t = setTimeout(buscar, 300)
    return () => clearTimeout(t)
  }, [buscar])

  async function abrirVenta(id: string) {
    try {
      const res = await api.get<VentaDetalle>(`/api/ventas?id=${id}`)
      if (res.venta.estado === 'DEVUELTA_TOTAL') {
        toast.info('Esta venta ya fue devuelta en su totalidad')
      }
      setVentaSel(res)
      const inicial: Record<string, { cantidad: string; motivo: string }> = {}
      for (const it of res.venta.items) {
        inicial[it.id] = { cantidad: '', motivo: '' }
      }
      setSeleccion(inicial)
      setMotivoGeneral('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al abrir la venta')
    }
  }

  const totalDevolucion = ventaSel
    ? ventaSel.venta.items.reduce((acc, it) => {
        const sel = seleccion[it.id]
        const cant = parseInt(sel?.cantidad || '0', 10) || 0
        if (cant <= 0) return acc
        const porUnidad = it.subtotalCUP / it.cantidad
        return acc + porUnidad * cant
      }, 0)
    : 0

  async function confirmar() {
    if (!ventaSel) return
    const items = ventaSel.venta.items
      .map((it) => ({ it, sel: seleccion[it.id] }))
      .filter(({ sel }) => (parseInt(sel?.cantidad || '0', 10) || 0) > 0)
    if (items.length === 0) return toast.error('Seleccione al menos un ítem con cantidad')
    if (motivoGeneral.trim().length < 3) return toast.error('Escriba el motivo general de la devolución')
    for (const { it, sel } of items) {
      if ((sel.motivo ?? '').trim().length < 3) {
        return toast.error(`Falta el motivo del ítem "${it.producto.nombre}"`)
      }
    }
    setProcesando(true)
    try {
      const res = await api.post<DevolucionCreada>('/api/devoluciones', {
        ventaId: ventaSel.venta.id,
        motivo: motivoGeneral.trim(),
        items: items.map(({ it, sel }) => ({
          ventaItemId: it.id,
          cantidad: parseInt(sel.cantidad, 10),
          motivo: sel.motivo.trim(),
        })),
      })
      // Detalle completo para el ticket
      const det = await api.get<{ devoluciones: Array<{
        codigo: string
        fecha: string
        totalCUP: number
        motivo: string
        venta: { codigo: string; taller: { nombre: string } }
        items: Array<{ cantidad: number; ventaItem: { producto: { nombre: string }; subtotalCUP: number; cantidad: number } }>
      }> }>(`/api/devoluciones?id=${res.devolucion.id}`)
      const d = det.devoluciones[0]
      setTicket(res)
      setTicketItems(
        d.items.map((i) => ({
          nombre: i.ventaItem.producto.nombre,
          cantidad: i.cantidad,
          subtotalCUP: Math.round((i.ventaItem.subtotalCUP / i.ventaItem.cantidad) * i.cantidad * 100) / 100,
        }))
      )
      setTicketVenta({ codigo: d.venta.codigo, tallerNombre: d.venta.taller.nombre })
      toast.success(`Devolución ${res.codigo} registrada`)
      setVentaSel(null)
      setResultados([])
      setQ('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar la devolución')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Devoluciones</h1>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar venta por código (ej. V000001)…"
              className="pl-8"
              aria-label="Buscar venta por código"
            />
          </div>
          <div className="divide-y rounded-lg border max-h-64 overflow-y-auto">
            {resultados.map((v) => (
              <button
                key={v.id}
                onClick={() => abrirVenta(v.id)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent text-sm"
              >
                <span className="font-mono">{v.codigo}</span>
                <span className="text-xs text-muted-foreground">{fmtFechaHora(v.fecha)} · {v.cliente?.nombre ?? 'Consumidor final'}</span>
                <span className="font-semibold">{fmtCUP(v.totalCUP)}</span>
              </button>
            ))}
            {resultados.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                Escriba el código de la venta a devolver.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Selección de ítems */}
      <Dialog open={!!ventaSel} onOpenChange={(o) => !o && setVentaSel(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {ventaSel && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Devolver · Venta {ventaSel.venta.codigo}
                  <span className="block text-sm font-normal text-muted-foreground">
                    {fmtFechaHora(ventaSel.venta.fecha)} · {ventaSel.venta.cliente?.nombre ?? 'Consumidor final'}
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  {ventaSel.venta.items.map((it) => {
                    const devolvible = it.cantidad - it.cantidadDevuelta
                    return (
                      <div key={it.id} className={`rounded-lg border p-2 space-y-1.5 ${devolvible <= 0 ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{it.producto.nombre}</span>
                          <span className="text-xs text-muted-foreground">
                            comprado {it.cantidad}{it.cantidadDevuelta > 0 && ` · ya devuelto ${it.cantidadDevuelta}`}
                          </span>
                        </div>
                        <div className="grid grid-cols-[90px_1fr] gap-2">
                          <div>
                            <Label className="text-xs">Cant. a devolver</Label>
                            <Input
                              inputMode="numeric"
                              className="h-8"
                              value={seleccion[it.id]?.cantidad ?? ''}
                              disabled={devolvible <= 0}
                              max={devolvible}
                              onChange={(e) => {
                                const v = Math.min(parseInt(e.target.value || '0', 10) || 0, devolvible)
                                setSeleccion((s) => ({ ...s, [it.id]: { ...(s[it.id] ?? { motivo: '' }), cantidad: String(v) } }))
                              }}
                              aria-label={`Cantidad a devolver de ${it.producto.nombre}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Motivo del ítem</Label>
                            <Input
                              className="h-8"
                              value={seleccion[it.id]?.motivo ?? ''}
                              disabled={devolvible <= 0}
                              onChange={(e) =>
                                setSeleccion((s) => ({ ...s, [it.id]: { ...(s[it.id] ?? { cantidad: '' }), motivo: e.target.value } }))
                              }
                              aria-label={`Motivo de ${it.producto.nombre}`}
                            />
                          </div>
                        </div>
                        {esServicio(it.producto.tipo) && (
                          <p className="text-xs text-muted-foreground">Servicio: la devolución ajusta el pago del operario asignado.</p>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div>
                  <Label htmlFor="motivo-general">Motivo general de la devolución</Label>
                  <Input id="motivo-general" value={motivoGeneral} onChange={(e) => setMotivoGeneral(e.target.value)} />
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium">A devolver</span>
                  <span className="text-lg font-bold">{fmtCUP(totalDevolucion)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Los productos físicos entran como DEFECTUOSO (no vuelven al stock vendible). El pago del operario
                  se ajusta en la liquidación del día (o del día siguiente si ya está cerrada).
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setVentaSel(null)}>Cancelar</Button>
                <Button variant="destructive" onClick={confirmar} disabled={procesando}>
                  <Undo2 className="h-4 w-4 mr-1" /> {procesando ? 'Procesando…' : 'Confirmar devolución'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Ticket de devolución */}
      <Dialog open={!!ticket} onOpenChange={(o) => !o && setTicket(null)}>
        <DialogContent className="max-w-fit p-0 bg-muted border-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Ticket de devolución</DialogTitle>
          </DialogHeader>
          <div className="p-4 max-h-[70vh] overflow-auto">
            {ticket && (
              <div className="bg-white text-black shadow-lg rounded-sm" style={{ width: `${ajustes.ticketAncho ?? '58'}mm` }}>
                <TicketDevolucion
                  data={{
                    codigo: ticket.codigo,
                    fecha: ticket.devolucion.fecha,
                    ventaCodigo: ticketVenta.codigo,
                    taller: { nombre: ticketVenta.tallerNombre },
                    usuario: usuario?.nombre ?? '',
                    motivo: ticket.devolucion.motivo,
                    items: ticketItems,
                    totalCUP: ticket.devolucion.totalCUP,
                    ancho: ajustes.ticketAncho ?? '58',
                  }}
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-center p-3 bg-card border-t">
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir
            </Button>
            <Button variant="outline" onClick={() => setTicket(null)}>Cerrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
