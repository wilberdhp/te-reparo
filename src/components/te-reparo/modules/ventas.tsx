'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Printer, Download, Eye, Search, FileText } from 'lucide-react'
import { api, descargar } from '@/lib/api-client'
import { useApp } from '@/lib/store'
import { fmt, fmtCUP, fmtFechaHora, ESTADO_VENTA_LABEL, METODO_PAGO_LABEL, RAMA_LABEL } from '@/lib/formato'
import { useTablaTeclado } from '@/hooks/use-tabla-teclado'
import { usePaginacion } from '@/hooks/use-paginacion'
import { TablePagination, FilasEsqueleto } from '../table-pagination'
import { TicketVenta, TicketPlantilla, contextoDesdeVentaDetalle } from '../ticket'

interface VentaResumen {
  id: string
  codigo: string
  fecha: string
  totalCUP: number
  estado: string
  ventaMostrador: boolean
  cliente: { nombre: string } | null
  vendedor: { nombre: string } | null
  _count: { items: number; pagos: number; devoluciones: number }
}

interface VentaDetalle {
  venta: {
    id: string
    codigo: string
    fecha: string
    totalCUP: number
    estado: string
    ventaMostrador: boolean
    tasaUSDSnapshot: number
    tasaEURSnapshot: number
    taller: { nombre: string; direccion: string; telefono: string }
    cliente: { nombre: string; telefono: string | null; ci?: string | null } | null
    vendedor: { nombre: string; username: string } | null
    items: Array<{
      id: string
      cantidad: number
      cantidadDevuelta: number
      precioUnitario: number
      precioOriginal: number | null
      precioEditado: boolean
      monedaPrecio: string
      subtotalCUP: number
      garantiaDiasSnapshot: number
      costoAdicional?: number | null
      descripcionAdicional?: string | null
      producto: { nombre: string; tipo: string }
      operario: { nombre: string; rama: string } | null
      garantias: Array<{ tipo: string; fechaReclamo: string }>
      devolucionItems: Array<{ cantidad: number; devolucion: { codigo: string } }>
    }>
    pagos: Array<{ metodo: string; moneda: string; monto: number; montoCUP: number; tasaAplicada: number; referencia: string | null }>
    devoluciones: Array<{ codigo: string; fecha: string; totalCUP: number; motivo: string }>
  }
  // plantilla usada al imprimir esta venta (null → diseño por defecto)
  plantilla: { id: string; nombre: string; contenido: string } | null
  ajustes: Record<string, string>
}

const METODOS = ['EFECTIVO', 'TRANSFERENCIA', 'ZELLE']
const ESTADOS = ['COMPLETADA', 'DEVUELTA_PARCIAL', 'DEVUELTA_TOTAL']

export function Ventas() {
  const usuario = useApp((s) => s.usuario)
  const tallerActivoId = useApp((s) => s.tallerActivoId)
  const talleres = useApp((s) => s.talleres)
  const tallerId = usuario?.rol === 'VENDEDOR' ? usuario.tallerId : tallerActivoId ?? talleres[0]?.id

  const [ventas, setVentas] = useState<VentaResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtros, setFiltros] = useState({
    q: '',
    desde: '',
    hasta: '',
    estado: '',
    metodo: '',
  })
  const [detalle, setDetalle] = useState<VentaDetalle | null>(null)
  // Paginación del lado del servidor (fecha desc): ?ven_page=&ven_limit=
  const pag = usePaginacion('ven')
  const { params: pagParams, fijarMeta: fijarMetaPag, reiniciar: reiniciarPag } = pag

  /** Parámetros comunes para el listado y la exportación CSV (mismos filtros). */
  function parametrosFiltros() {
    const params = new URLSearchParams({ tallerId: tallerId ?? '' })
    if (filtros.q.trim()) params.set('q', filtros.q.trim())
    if (filtros.desde) params.set('desde', filtros.desde)
    if (filtros.hasta) params.set('hasta', filtros.hasta)
    if (filtros.estado) params.set('estado', filtros.estado)
    if (filtros.metodo) params.set('metodo', filtros.metodo)
    return params
  }

  // Navegación por teclado en la tabla (↑↓ Enter abre el detalle)
  const { propsFila, indice: filaSel } = useTablaTeclado({
    total: ventas.length,
    onAbrir: (i) => ventas[i] && verDetalle(ventas[i].id),
  })

  const cargar = useCallback(async () => {
    if (!tallerId) return
    setCargando(true)
    try {
      // Paginación por URL + filtros: la búsqueda por código/cliente se resuelve
      // en el servidor junto con la paginación (antes filtraba en el cliente).
      const params = parametrosFiltros()
      params.set('page', pagParams.get('page') ?? '1')
      params.set('limit', pagParams.get('limit') ?? '25')
      const res = await api.get<{ ventas: VentaResumen[]; total: number; totalPages: number }>(`/api/ventas?${params}`)
      setVentas(res.ventas)
      fijarMetaPag(res.total)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar ventas')
    } finally {
      setCargando(false)
    }
  }, [tallerId, filtros, pagParams, fijarMetaPag])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Al cambiar de taller se vuelve a la página 1.
  const tallerPrevio = useRef(tallerId)
  useEffect(() => {
    if (tallerPrevio.current !== tallerId) {
      tallerPrevio.current = tallerId
      reiniciarPag()
    }
  }, [tallerId, reiniciarPag])

  /** Cambio de filtro/búsqueda: la paginación vuelve a la página 1 (§1). */
  function cambiarFiltro<K extends keyof typeof filtros>(campo: K, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }))
    reiniciarPag()
  }

  async function verDetalle(id: string) {
    try {
      const res = await api.get<VentaDetalle>(`/api/ventas?id=${id}`)
      setDetalle(res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar la venta')
    }
  }

  async function reimprimir() {
    if (!detalle) return
    try {
      await api.post(`/api/ventas/reimprimir?id=${detalle.venta.id}`)
      toast.success('Reimpresión registrada en auditoría')
      window.print()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  function exportar() {
    // La exportación consulta TODOS los registros con los filtros vigentes en
    // el servidor (§5): ya no exporta solo lo visible en la página.
    const params = parametrosFiltros()
    params.set('export', 'csv')
    descargar(`/api/ventas?${params}`, 'ventas.csv').catch((e) => toast.error(e.message))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">Historial de ventas</h1>
        <Button variant="outline" onClick={exportar}>
          <Download className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-end">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={filtros.q}
              onChange={(e) => cambiarFiltro('q', e.target.value)}
              placeholder="Código de venta o cliente…"
              className="pl-8"
              aria-label="Buscar venta"
            />
          </div>
          <div>
            <Label htmlFor="v-desde" className="text-xs">Desde</Label>
            <Input id="v-desde" type="date" value={filtros.desde} onChange={(e) => cambiarFiltro('desde', e.target.value)} className="w-36" />
          </div>
          <div>
            <Label htmlFor="v-hasta" className="text-xs">Hasta</Label>
            <Input id="v-hasta" type="date" value={filtros.hasta} onChange={(e) => cambiarFiltro('hasta', e.target.value)} className="w-36" />
          </div>
          <Select value={filtros.estado} onValueChange={(v) => cambiarFiltro('estado', v === '__todos__' ? '' : v)}>
            <SelectTrigger className="w-[170px]" aria-label="Estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todos los estados</SelectItem>
              {ESTADOS.map((e) => (
                <SelectItem key={e} value={e}>{ESTADO_VENTA_LABEL[e]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtros.metodo} onValueChange={(v) => cambiarFiltro('metodo', v === '__todos__' ? '' : v)}>
            <SelectTrigger className="w-[160px]" aria-label="Método de pago">
              <SelectValue placeholder="Método de pago" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todos los métodos</SelectItem>
              {METODOS.map((m) => (
                <SelectItem key={m} value={m}>{METODO_PAGO_LABEL[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-tabla="filas">
              {cargando && <FilasEsqueleto columnas={7} />}
              {!cargando &&
                ventas.map((v, i) => (
                <TableRow key={v.id} className={i === filaSel ? 'ring-2 ring-ring/60 ring-inset' : ''} {...propsFila(i)}>
                  <TableCell className="font-mono font-medium">{v.codigo}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmtFechaHora(v.fecha)}</TableCell>
                  <TableCell>{v.cliente?.nombre ?? <span className="text-muted-foreground">Consumidor final</span>}</TableCell>
                  <TableCell className="text-sm">{v.vendedor?.nombre ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={v.estado === 'COMPLETADA' ? 'default' : v.estado === 'DEVUELTA_TOTAL' ? 'destructive' : 'outline'} className="text-xs">
                      {ESTADO_VENTA_LABEL[v.estado]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold num-tabular">{fmtCUP(v.totalCUP)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => verDetalle(v.id)} aria-label={`Ver ${v.codigo}`}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!cargando && ventas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Sin ventas para esos filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        <div className="border-t">
          <TablePagination
            pagina={pag.pagina}
            totalPaginas={pag.totalPaginas}
            total={pag.total}
            limite={pag.limite}
            cargando={cargando}
            onCambiarPagina={pag.cambiarPagina}
            onCambiarLimite={pag.cambiarLimite}
          />
        </div>
      </Card>

      {/* Detalle */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  Venta {detalle.venta.codigo}
                  <Badge variant={detalle.venta.estado === 'COMPLETADA' ? 'default' : 'outline'}>
                    {ESTADO_VENTA_LABEL[detalle.venta.estado]}
                  </Badge>
                  {detalle.plantilla && (
                    <Badge variant="outline" className="text-xs" title="Plantilla usada al imprimir este ticket">
                      <FileText className="h-3 w-3 mr-1" aria-hidden /> {detalle.plantilla.nombre}
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {fmtFechaHora(detalle.venta.fecha)} · {detalle.venta.taller.nombre} · {detalle.venta.items.length} líneas
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div><span className="text-muted-foreground">Fecha: </span>{fmtFechaHora(detalle.venta.fecha)}</div>
                  <div><span className="text-muted-foreground">Taller: </span>{detalle.venta.taller.nombre}</div>
                  <div><span className="text-muted-foreground">Cliente: </span>{detalle.venta.cliente?.nombre ?? 'Consumidor final'}</div>
                  <div><span className="text-muted-foreground">Vendedor: </span>{detalle.venta.vendedor?.nombre}</div>
                  <div><span className="text-muted-foreground">Tasa USD: </span>{fmt(detalle.venta.tasaUSDSnapshot)}</div>
                  <div><span className="text-muted-foreground">Tasa EUR: </span>{fmt(detalle.venta.tasaEURSnapshot)}</div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ítem</TableHead>
                        <TableHead className="text-right">Cant.</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead>Operario</TableHead>
                        <TableHead className="text-right">Subtotal CUP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.venta.items.map((it) => (
                        <TableRow key={it.id}>
                          <TableCell>
                            <div className="font-medium">{it.producto.nombre}</div>
                            <div className="text-xs text-muted-foreground">
                              garantía {it.garantiaDiasSnapshot}d
                              {it.precioEditado && <span className="text-warning"> · precio editado (orig. {fmt(it.precioOriginal ?? 0)})</span>}
                              {it.cantidadDevuelta > 0 && <span className="text-destructive"> · devuelto {it.cantidadDevuelta}</span>}
                              {it.garantias.length > 0 && <span className="text-warning"> · garantía reclamada</span>}
                              {(it.costoAdicional ?? 0) > 0 && (
                                <span> · costo int. {fmt(it.costoAdicional ?? 0)} {it.monedaPrecio}</span>
                              )}
                            </div>
                            {it.descripcionAdicional && (
                              <div className="text-xs text-muted-foreground italic break-words max-w-xs">📝 {it.descripcionAdicional}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right num-tabular">{it.cantidad}</TableCell>
                          <TableCell className="text-right num-tabular">{fmt(it.precioUnitario)} {it.monedaPrecio}</TableCell>
                          <TableCell className="text-xs">
                            {it.operario ? `${it.operario.nombre} (${RAMA_LABEL[it.operario.rama] ?? it.operario.rama})` : '—'}
                          </TableCell>
                          <TableCell className="text-right font-semibold num-tabular">{fmt(it.subtotalCUP)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-between items-center border-t pt-2">
                  <span className="font-medium">Total</span>
                  <span className="text-lg font-bold num-tabular">{fmtCUP(detalle.venta.totalCUP)}</span>
                </div>

                <div>
                  <p className="font-medium mb-1">Pagos</p>
                  <div className="space-y-1">
                    {detalle.venta.pagos.map((p, i) => (
                      <div key={i} className="flex justify-between text-xs border-b last:border-0 pb-1">
                        <span>
                          {METODO_PAGO_LABEL[p.metodo]} · {p.moneda}
                          {p.referencia && <span className="text-muted-foreground"> ref: {p.referencia}</span>}
                          <span className="text-muted-foreground"> (tasa {fmt(p.tasaAplicada)})</span>
                        </span>
                        <span className="num-tabular">
                          {fmt(p.monto)} {p.moneda} = {fmt(p.montoCUP)} CUP
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {detalle.venta.devoluciones.length > 0 && (
                  <div>
                    <p className="font-medium mb-1">Devoluciones</p>
                    <div className="space-y-1">
                      {detalle.venta.devoluciones.map((d) => (
                        <div key={d.codigo} className="flex justify-between text-xs">
                          <span className="font-mono">{d.codigo}</span>
                          <span>{fmtFechaHora(d.fecha)} · {fmtCUP(d.totalCUP)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={() => setDetalle(null)}>Cerrar</Button>
                  <Button onClick={reimprimir}>
                    <Printer className="h-4 w-4 mr-1" /> Reimprimir ticket
                  </Button>
                </div>
              </div>

              {/* Ticket oculto para impresión: plantilla usada en la venta o diseño por defecto */}
              <div className="hidden print:block">
                {detalle.plantilla ? (
                  <TicketPlantilla
                    contenido={detalle.plantilla.contenido}
                    contexto={contextoDesdeVentaDetalle(detalle)}
                    ancho={detalle.ajustes.ticketAncho ?? '58'}
                  />
                ) : (
                  <TicketVenta
                    data={{
                      codigo: detalle.venta.codigo,
                      fecha: detalle.venta.fecha,
                      taller: detalle.venta.taller,
                      cliente: detalle.venta.cliente?.nombre ?? null,
                      vendedor: detalle.venta.vendedor?.nombre ?? '',
                      items: detalle.venta.items.map((i) => ({
                        nombre: i.producto.nombre,
                        cantidad: i.cantidad,
                        precio: i.precioUnitario,
                        moneda: i.monedaPrecio,
                        subtotalCUP: i.subtotalCUP,
                        operario: i.operario?.nombre ?? null,
                        descripcionAdicional: i.descripcionAdicional ?? null,
                      })),
                      totalCUP: detalle.venta.totalCUP,
                      pagos: detalle.venta.pagos.map((p) => ({
                        metodo: METODO_PAGO_LABEL[p.metodo] ?? p.metodo,
                        moneda: p.moneda,
                        monto: p.monto,
                        montoCUP: p.montoCUP,
                        referencia: p.referencia,
                      })),
                      encabezado: detalle.ajustes.ticketEncabezado,
                      pie: detalle.ajustes.ticketPie,
                      ancho: detalle.ajustes.ticketAncho ?? '58',
                    }}
                  />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
