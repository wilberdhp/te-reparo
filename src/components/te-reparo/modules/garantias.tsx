'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Search, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/lib/store'
import { fmtCUP, fmtFechaHora, esServicio } from '@/lib/formato'

interface VentaBusqueda {
  id: string
  codigo: string
  fecha: string
  totalCUP: number
  estado: string
  cliente: { nombre: string } | null
}

interface VentaItemDetalle {
  id: string
  cantidad: number
  cantidadDevuelta: number
  garantiaDiasSnapshot: number
  subtotalCUP: number
  producto: { nombre: string; tipo: string; id: string }
  operario: { nombre: string } | null
  garantias: Array<{ id: string; tipo: string; fechaReclamo: string; descripcion: string }>
}

interface Producto {
  id: string
  nombre: string
  tipo: string
  cantidad: number
  precio: number
  monedaPrecio: string
}

interface GarantiaLista {
  id: string
  fechaReclamo: string
  descripcion: string
  tipo: string
  vence: string | null
  vigente: boolean
  ventaItem: {
    producto: { nombre: string }
    operario: { nombre: string } | null
    venta: { codigo: string; cliente: { nombre: string } | null; taller: { nombre: string } }
  }
  movimiento: { tipo: string; cantidad: number; nota: string } | null
}

/** Garantía otorgada por una venta (ítem vendido con días de garantía > 0). */
interface GarantiaVenta {
  id: string
  cantidad: number
  cantidadDevuelta: number
  garantiaDias: number
  subtotalCUP: number
  producto: { id: string; nombre: string; tipo: string }
  operario: { nombre: string; rama: string } | null
  venta: { codigo: string; fecha: string; cliente: { id: string; nombre: string } | null }
  vence: string | null
  vigente: boolean
  reclamos: number
}

export function Garantias() {
  const usuario = useApp((s) => s.usuario)
  const tallerActivoId = useApp((s) => s.tallerActivoId)
  const talleres = useApp((s) => s.talleres)
  const tallerId = usuario?.rol === 'VENDEDOR' ? usuario.tallerId : tallerActivoId ?? talleres[0]?.id

  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<VentaBusqueda[]>([])
  const [items, setItems] = useState<VentaItemDetalle[]>([])
  const [ventaAbierta, setVentaAbierta] = useState<{ id: string; codigo: string; fecha: string } | null>(null)
  const [itemSel, setItemSel] = useState<VentaItemDetalle | null>(null)
  const [form, setForm] = useState({ descripcion: '', tipo: 'REPARACION', productoReemplazoId: '', cantidadReemplazo: '1' })
  const [productos, setProductos] = useState<Producto[]>([])
  const [garantias, setGarantias] = useState<GarantiaLista[]>([])
  const [garantiasVentas, setGarantiasVentas] = useState<GarantiaVenta[]>([])
  const [procesando, setProcesando] = useState(false)
  // Fecha de la venta del ítem en reclamo (para calcular el vencimiento) — puede
  // venir del diálogo de venta buscada o directamente de la tabla de garantías.
  const [ventaFechaSel, setVentaFechaSel] = useState<string | null>(null)

  const cargarGarantias = useCallback(async () => {
    if (!tallerId) return
    try {
      const res = await api.get<{ garantias: GarantiaLista[]; garantiasVentas: GarantiaVenta[] }>(
        `/api/garantias?tallerId=${tallerId}`
      )
      setGarantias(res.garantias)
      setGarantiasVentas(res.garantiasVentas ?? [])
    } catch {
      setGarantias([])
      setGarantiasVentas([])
    }
  }, [tallerId])

  useEffect(() => {
    cargarGarantias()
  }, [cargarGarantias])

  const buscar = useCallback(async () => {
    if (!tallerId || !q.trim()) return setResultados([])
    try {
      const res = await api.get<{ ventas: VentaBusqueda[] }>(`/api/ventas?tallerId=${tallerId}`)
      const t = q.trim().toLowerCase()
      setResultados(res.ventas.filter((v) => v.codigo.toLowerCase().includes(t)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al buscar')
    }
  }, [tallerId, q])

  useEffect(() => {
    const t = setTimeout(buscar, 300)
    return () => clearTimeout(t)
  }, [buscar])

  async function abrirVenta(id: string) {
    try {
      const res = await api.get<{ venta: { id: string; codigo: string; fecha: string; items: VentaItemDetalle[] } }>(`/api/ventas?id=${id}`)
      setItems(res.venta.items)
      setVentaAbierta({ id: res.venta.id, codigo: res.venta.codigo, fecha: res.venta.fecha })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  async function abrirReclamo(item: VentaItemDetalle, ventaFecha: string) {
    setItemSel(item)
    setVentaFechaSel(ventaFecha)
    setForm({ descripcion: '', tipo: 'REPARACION', productoReemplazoId: '', cantidadReemplazo: '1' })
    if (tallerId) {
      const res = await api.get<{ productos: Producto[] }>(`/api/productos?tallerId=${tallerId}&activo=true`)
      setProductos(res.productos.filter((p) => !esServicio(p.tipo)))
    }
  }

  // Reclamar directamente desde la tabla de garantías de ventas (sin buscar el
  // código de la venta a mano).
  function reclamarGarantiaVenta(g: GarantiaVenta) {
    abrirReclamo(
      {
        id: g.id,
        cantidad: g.cantidad,
        cantidadDevuelta: g.cantidadDevuelta,
        garantiaDiasSnapshot: g.garantiaDias,
        subtotalCUP: g.subtotalCUP,
        producto: { id: g.producto.id, nombre: g.producto.nombre, tipo: g.producto.tipo },
        operario: g.operario,
        garantias: [],
      },
      g.venta.fecha
    )
  }

  const vence = itemSel
    ? itemSel.garantiaDiasSnapshot > 0
      ? new Date(new Date(ventaFechaSel ?? '').getTime() + itemSel.garantiaDiasSnapshot * 86400000)
      : null
    : null
  const vigente = vence ? vence >= new Date() : false

  async function registrar() {
    if (!itemSel) return
    if (form.descripcion.trim().length < 3) return toast.error('Describa el reclamo')
    if (form.tipo === 'REEMPLAZO' && !form.productoReemplazoId) return toast.error('Seleccione el producto de reemplazo')
    setProcesando(true)
    try {
      await api.post('/api/garantias', {
        ventaItemId: itemSel.id,
        descripcion: form.descripcion.trim(),
        tipo: form.tipo,
        productoReemplazoId: form.tipo === 'REEMPLAZO' ? form.productoReemplazoId : null,
        cantidadReemplazo: form.tipo === 'REEMPLAZO' ? parseInt(form.cantidadReemplazo, 10) : undefined,
      })
      toast.success('Garantía registrada')
      setItemSel(null)
      setVentaAbierta(null)
      setQ('')
      setResultados([])
      cargarGarantias()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar garantía')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Garantías</h1>

      {/* Garantías otorgadas por ventas del taller */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="px-3 pt-3 pb-2 text-sm text-muted-foreground">
            Garantías otorgadas por ventas: cada ítem vendido con días de garantía aparece aquí
            (puede registrar un reclamo directamente desde la fila).
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venta</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Garantía</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Reclamos</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {garantiasVentas.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-mono text-xs">{g.venta.codigo}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmtFechaHora(g.venta.fecha)}</TableCell>
                  <TableCell className="text-sm font-medium">{g.producto.nombre}</TableCell>
                  <TableCell className="text-xs">{g.venta.cliente?.nombre ?? 'Consumidor final'}</TableCell>
                  <TableCell className="text-xs num-tabular">{g.garantiaDias} días</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{g.vence ? fmtFechaHora(g.vence).slice(0, 10) : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={g.vigente ? 'default' : 'destructive'} className="text-xs">
                      {g.vigente ? 'Vigente' : 'Vencida'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs num-tabular text-center">{g.reclamos}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => reclamarGarantiaVenta(g)} disabled={g.cantidadDevuelta >= g.cantidad}>
                      <ShieldCheck className="h-4 w-4 mr-1" /> Reclamar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {garantiasVentas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Sin garantías otorgadas por ventas aún.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            ¿No aparece en la tabla? Busque la venta por código y registre el reclamo sobre el ítem correspondiente (REPARACIÓN o REEMPLAZO).
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Código de venta (ej. V000001)…"
              className="pl-8"
              aria-label="Buscar venta para garantía"
            />
          </div>
          <div className="divide-y rounded-lg border max-h-52 overflow-y-auto">
            {resultados.map((v) => (
              <button
                key={v.id}
                onClick={() => abrirVenta(v.id)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent text-sm"
              >
                <span className="font-mono">{v.codigo}</span>
                <span className="text-xs text-muted-foreground">{fmtFechaHora(v.fecha)}</span>
                <span className="font-semibold">{fmtCUP(v.totalCUP)}</span>
              </button>
            ))}
            {resultados.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">Escriba el código de la venta.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ítems de la venta */}
      <Dialog open={!!ventaAbierta} onOpenChange={(o) => !o && setVentaAbierta(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ítems · Venta {ventaAbierta?.codigo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="rounded-lg border p-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{it.producto.nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtFechaHora(ventaAbierta?.fecha ?? '')} · garantía {it.garantiaDiasSnapshot}d
                    {it.garantias.length > 0 && <span className="text-warning"> · {it.garantias.length} reclamo(s)</span>}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => abrirReclamo(it, ventaAbierta?.fecha ?? '')} disabled={it.cantidadDevuelta >= it.cantidad}>
                  <ShieldCheck className="h-4 w-4 mr-1" /> Reclamar
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Formulario de reclamo */}
      <Dialog open={!!itemSel} onOpenChange={(o) => !o && setItemSel(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reclamo de garantía</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">
              <span className="font-medium">{itemSel?.producto.nombre}</span>
              <span className="text-muted-foreground"> · {itemSel?.garantiaDiasSnapshot} días</span>
              {vence && (
                <Badge variant={vigente ? 'default' : 'destructive'} className="ml-2 text-xs">
                  {vigente ? 'Vigente' : 'Vencida'} · hasta {fmtFechaHora(vence).slice(0, 10)}
                </Badge>
              )}
            </div>
            <div>
              <Label htmlFor="gar-tipo">Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger id="gar-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REPARACION">REPARACIÓN (solo registro)</SelectItem>
                  <SelectItem value="REEMPLAZO">REEMPLAZO (salida de producto + baja del defectuoso)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.tipo === 'REEMPLAZO' && (
              <>
                <div>
                  <Label htmlFor="gar-reemplazo">Producto de reemplazo</Label>
                  <Select value={form.productoReemplazoId} onValueChange={(v) => setForm((f) => ({ ...f, productoReemplazoId: v }))}>
                    <SelectTrigger id="gar-reemplazo">
                      <SelectValue placeholder="Seleccione producto" />
                    </SelectTrigger>
                    <SelectContent>
                      {productos.map((p) => (
                        <SelectItem key={p.id} value={p.id} disabled={p.cantidad <= 0}>
                          {p.nombre} (stock {p.cantidad})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="gar-cant">Cantidad a entregar</Label>
                  <Input
                    id="gar-cant"
                    inputMode="numeric"
                    value={form.cantidadReemplazo}
                    onChange={(e) => setForm((f) => ({ ...f, cantidadReemplazo: e.target.value }))}
                  />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="gar-desc">Descripción del reclamo</Label>
              <Input
                id="gar-desc"
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                placeholder="Falla reportada por el cliente…"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              La garantía no genera pago al operario ni venta a precio 0.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemSel(null)}>Cancelar</Button>
            <Button onClick={registrar} disabled={procesando}>
              {procesando ? 'Registrando…' : 'Registrar garantía'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Historial de reclamos */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha reclamo</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Venta</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Garantía</TableHead>
                <TableHead>Descripción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {garantias.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="text-xs whitespace-nowrap">{fmtFechaHora(g.fechaReclamo)}</TableCell>
                  <TableCell className="text-sm font-medium">{g.ventaItem.producto.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{g.ventaItem.venta.codigo}</TableCell>
                  <TableCell className="text-xs">{g.ventaItem.venta.cliente?.nombre ?? 'Consumidor final'}</TableCell>
                  <TableCell>
                    <Badge variant={g.tipo === 'REEMPLAZO' ? 'outline' : 'secondary'} className="text-xs">
                      {g.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.vigente ? 'default' : 'destructive'} className="text-xs">
                      {g.vigente ? 'Vigente' : g.vence ? 'Vencida' : 'Sin plazo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[240px] truncate" title={g.descripcion}>{g.descripcion}</TableCell>
                </TableRow>
              ))}
              {garantias.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Sin reclamos de garantía registrados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
