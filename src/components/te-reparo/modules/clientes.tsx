'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Search, Plus, Eye, Pencil } from 'lucide-react'
import { api } from '@/lib/api-client'
import { fmtCUP, fmtFechaHora, ESTADO_VENTA_LABEL } from '@/lib/formato'
import { useGuardarConCtrlS } from '@/hooks/use-ctrl-s'
import { useTablaTeclado } from '@/hooks/use-tabla-teclado'
import { usePaginacion } from '@/hooks/use-paginacion'
import { TablePagination, FilasEsqueleto } from '../table-pagination'
import { Kbd } from '../kbd'

interface Cliente {
  id: string
  nombre: string
  telefono: string | null
  ci: string | null
  fechaRegistro: string
  _count: { ventas: number }
}

interface ClienteDetalle {
  cliente: Cliente & {
    ventas: Array<{
      id: string
      codigo: string
      fecha: string
      totalCUP: number
      estado: string
      taller: { nombre: string }
      vendedor: { nombre: string }
      items: Array<{
        producto: { nombre: string }
        operario: { nombre: string } | null
        garantias: Array<{ tipo: string }>
        garantiaDiasSnapshot: number
      }>
    }>
  }
  garantiasVigentes: Array<{ ventaCodigo: string; producto: string; vence: string | null; dias: number }>
  garantiasVencidas: Array<{ ventaCodigo: string; producto: string; vence: string | null; dias: number }>
  totalComprado: number
}

const FORM_VACIO = { nombre: '', telefono: '', ci: '' }

export function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [q, setQ] = useState('')
  const [cargando, setCargando] = useState(true)
  // Paginación del lado del servidor (búsqueda por nombre/teléfono): ?cli_page=
  const pag = usePaginacion('cli')
  const { params: pagParams, fijarMeta: fijarMetaPag, reiniciar: reiniciarPag } = pag
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [detalle, setDetalle] = useState<ClienteDetalle | null>(null)

  // Ctrl+S guarda el formulario del modal abierto
  useGuardarConCtrlS(guardar, modal)

  // Navegación por teclado en la tabla (↑↓ Enter abre el detalle)
  const { propsFila, indice: filaSel } = useTablaTeclado({
    total: clientes.length,
    onAbrir: (i) => clientes[i] && verDetalle(clientes[i].id),
  })

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      params.set('page', pagParams.get('page') ?? '1')
      params.set('limit', pagParams.get('limit') ?? '25')
      const res = await api.get<{ clientes: Cliente[]; total: number; totalPages: number }>(`/api/clientes?${params}`)
      setClientes(res.clientes)
      fijarMetaPag(res.total)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar clientes')
    } finally {
      setCargando(false)
    }
  }, [q, pagParams, fijarMetaPag])

  useEffect(() => {
    const t = setTimeout(cargar, 300) // debounce de la búsqueda (300 ms)
    return () => clearTimeout(t)
  }, [cargar])

  async function guardar() {
    if (form.nombre.trim().length < 2) return toast.error('Nombre muy corto')
    try {
      if (editId) {
        await api.patch(`/api/clientes?id=${editId}`, {
          nombre: form.nombre.trim(),
          telefono: form.telefono || null,
          ci: form.ci || null,
        })
        toast.success('Cliente actualizado')
      } else {
        await api.post('/api/clientes', {
          nombre: form.nombre.trim(),
          telefono: form.telefono || null,
          ci: form.ci || null,
        })
        toast.success('Cliente creado')
      }
      setModal(false)
      setForm(FORM_VACIO)
      setEditId(null)
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  async function verDetalle(id: string) {
    try {
      const res = await api.get<ClienteDetalle>(`/api/clientes?id=${id}`)
      setDetalle(res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar el cliente')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">Clientes (globales)</h1>
        <Button
          onClick={() => {
            setEditId(null)
            setForm(FORM_VACIO)
            setModal(true)
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Nuevo cliente
        </Button>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                reiniciarPag() // nueva búsqueda → página 1 (§1)
              }}
              placeholder="Buscar por nombre, teléfono o CI… (homónimos permitidos)"
              className="pl-8"
              aria-label="Buscar cliente"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>CI</TableHead>
                <TableHead className="text-right">Compras</TableHead>
                <TableHead>Registrado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-tabla="filas">
              {cargando && <FilasEsqueleto columnas={6} />}
              {!cargando &&
                clientes.map((c, i) => (
                <TableRow key={c.id} className={i === filaSel ? 'ring-2 ring-ring/60 ring-inset' : ''} {...propsFila(i)}>
                  <TableCell className="font-medium">{c.nombre}</TableCell>
                  <TableCell>{c.telefono ?? '—'}</TableCell>
                  <TableCell>{c.ci ?? '—'}</TableCell>
                  <TableCell className="text-right num-tabular">{c._count.ventas}</TableCell>
                  <TableCell className="text-xs">{fmtFechaHora(c.fechaRegistro)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => verDetalle(c.id)} aria-label={`Ver ${c.nombre}`}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditId(c.id)
                          setForm({ nombre: c.nombre, telefono: c.telefono ?? '', ci: c.ci ?? '' })
                          setModal(true)
                        }}
                        aria-label={`Editar ${c.nombre}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!cargando && clientes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Sin resultados.
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

      {/* Modal crear/editar */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cl-nombre">Nombre</Label>
              <Input id="cl-nombre" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cl-tel">Teléfono</Label>
              <Input id="cl-tel" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cl-ci">CI</Label>
              <Input id="cl-ci" value={form.ci} onChange={(e) => setForm((f) => ({ ...f, ci: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={guardar} className="bg-brand-red hover:bg-brand-red-hover">
              Guardar <Kbd className="ml-2 border-white/40 bg-white/15 text-white">Ctrl</Kbd>+<Kbd className="border-white/40 bg-white/15 text-white">S</Kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalle */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle>{detalle.cliente.nombre}</DialogTitle>
              </DialogHeader>
              <div className="text-sm space-y-4">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                  <span>Tel: {detalle.cliente.telefono ?? '—'}</span>
                  <span>CI: {detalle.cliente.ci ?? '—'}</span>
                  <span>Total comprado: <strong className="text-foreground">{fmtCUP(detalle.totalComprado)}</strong></span>
                </div>

                <div>
                  <p className="font-medium mb-1">Garantías vigentes</p>
                  <div className="space-y-1">
                    {detalle.garantiasVigentes.map((g, i) => (
                      <div key={i} className="flex justify-between text-xs border-b last:border-0 pb-1">
                        <span>{g.producto} <span className="text-muted-foreground">({g.ventaCodigo})</span></span>
                        <Badge variant="default" className="text-[10px]">hasta {g.vence ? fmtFechaHora(g.vence).slice(0, 10) : '—'}</Badge>
                      </div>
                    ))}
                    {detalle.garantiasVigentes.length === 0 && <p className="text-xs text-muted-foreground">Ninguna.</p>}
                  </div>
                </div>

                <div>
                  <p className="font-medium mb-1">Garantías vencidas</p>
                  <div className="space-y-1">
                    {detalle.garantiasVencidas.map((g, i) => (
                      <div key={i} className="flex justify-between text-xs border-b last:border-0 pb-1">
                        <span>{g.producto} <span className="text-muted-foreground">({g.ventaCodigo})</span></span>
                        <Badge variant="outline" className="text-[10px]">vencida {g.vence ? fmtFechaHora(g.vence).slice(0, 10) : ''}</Badge>
                      </div>
                    ))}
                    {detalle.garantiasVencidas.length === 0 && <p className="text-xs text-muted-foreground">Ninguna.</p>}
                  </div>
                </div>

                <div>
                  <p className="font-medium mb-1">Historial de compras</p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Taller</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detalle.cliente.ventas.map((v) => (
                          <TableRow key={v.id}>
                            <TableCell className="font-mono text-xs">{v.codigo}</TableCell>
                            <TableCell className="text-xs">{fmtFechaHora(v.fecha)}</TableCell>
                            <TableCell className="text-xs">{v.taller.nombre}</TableCell>
                            <TableCell>
                              <Badge variant={v.estado === 'COMPLETADA' ? 'default' : 'outline'} className="text-[10px]">
                                {ESTADO_VENTA_LABEL[v.estado]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold num-tabular">{fmtCUP(v.totalCUP)}</TableCell>
                          </TableRow>
                        ))}
                        {detalle.cliente.ventas.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-4 text-muted-foreground text-xs">Sin compras.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
