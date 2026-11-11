'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Plus, PackagePlus, Trash2, History, ArrowLeftRight, Pencil, Search, Tag, Printer } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/lib/store'
import { fmt, fmtCUP, esServicio, TIPO_PRODUCTO_LABEL, MOVIMIENTO_LABEL, fmtFechaHora } from '@/lib/formato'
import { code128Svg } from '@/lib/barcode'
import { useGuardarConCtrlS } from '@/hooks/use-ctrl-s'
import { useTablaTeclado } from '@/hooks/use-tabla-teclado'
import { usePaginacion } from '@/hooks/use-paginacion'
import { ConfirmarPeligroso } from '../confirmar-peligroso'
import { Kbd } from '../kbd'
import { TablePagination, FilasEsqueleto } from '../table-pagination'

interface Producto {
  id: string
  nombre: string
  categoria: string
  tipo: string
  cantidad: number
  costo?: number
  unidad: string
  stockMinimo?: number
  precio: number
  monedaPrecio: string
  pagoOperarioTipo?: string
  pagoOperarioValor?: number
  garantiaDias?: number
  codigoInterno: string
  codigoBarras: string
  activo: boolean
}

interface Movimiento {
  id: string
  tipo: string
  cantidad: number
  costoUnitario: number
  nota: string | null
  fecha: string
  usuario: { nombre: string } | null
  producto: { nombre: string; codigoInterno: string }
}

interface Taller { id: string; nombre: string; activo: boolean }

const TIPOS = ['VENTA', 'SERVICIO_ELECTRONICA', 'SERVICIO_INFORMATICA']
const MONEDAS = ['CUP', 'USD', 'EUR']

const FORM_VACIO = {
  nombre: '',
  categoria: '',
  tipo: 'VENTA',
  precio: '',
  monedaPrecio: 'CUP',
  unidad: 'u',
  cantidadInicial: '0',
  costo: '0',
  stockMinimo: '0',
  pagoOperarioTipo: 'FIJO',
  pagoOperarioValor: '0',
  garantiaDias: '0',
}

export function Inventario() {
  const usuario = useApp((s) => s.usuario)
  const tallerActivoId = useApp((s) => s.tallerActivoId)
  const talleres = useApp((s) => s.talleres)
  const esAdmin = usuario?.rol === 'ADMIN'
  const tallerId = usuario?.rol === 'VENDEDOR' ? usuario.tallerId : tallerActivoId ?? talleres[0]?.id

  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [filtros, setFiltros] = useState({ q: '', categoria: '', tipo: '', stockBajo: '', activo: 'true' })
  const [cargando, setCargando] = useState(true)
  // Paginación del lado del servidor (prompt de actualización): ?inv_page=&inv_limit=
  const pag = usePaginacion('inv')
  const { params: pagParams, fijarMeta: fijarMetaPag, reiniciar: reiniciarPag } = pag

  const [modalProducto, setModalProducto] = useState(false)
  const [productoEdit, setProductoEdit] = useState<{ id: string | null; datos: typeof FORM_VACIO }>({ id: null, datos: FORM_VACIO })

  const [modalEntrada, setModalEntrada] = useState(false)
  const [modalBaja, setModalBaja] = useState(false)
  const [modalTransfer, setModalTransfer] = useState(false)
  const [productoAccion, setProductoAccion] = useState<Producto | null>(null)
  const [formEntrada, setFormEntrada] = useState({ cantidad: '', costoUnitario: '', nota: '' })
  const [formBaja, setFormBaja] = useState({ cantidad: '', motivo: '' })
  const [formTransfer, setFormTransfer] = useState({ tallerDestinoId: '', cantidad: '', nota: '' })
  const [listaTalleres, setListaTalleres] = useState<Taller[]>([])
  const [modalHistorial, setModalHistorial] = useState(false)
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [modalEtiqueta, setModalEtiqueta] = useState(false)

  const cargar = useCallback(async () => {
    if (!tallerId) return
    setCargando(true)
    try {
      const params = new URLSearchParams({ tallerId })
      params.set('page', pagParams.get('page') ?? '1')
      params.set('limit', pagParams.get('limit') ?? '25')
      if (filtros.q) params.set('q', filtros.q)
      if (filtros.categoria) params.set('categoria', filtros.categoria)
      if (filtros.tipo) params.set('tipo', filtros.tipo)
      if (filtros.stockBajo) params.set('stockBajo', filtros.stockBajo)
      if (filtros.activo) params.set('activo', filtros.activo)
      const res = await api.get<{ productos: Producto[]; categorias: string[]; total: number; totalPages: number }>(`/api/productos?${params}`)
      setProductos(res.productos)
      setCategorias(res.categorias)
      fijarMetaPag(res.total)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar inventario')
    } finally {
      setCargando(false)
    }
  }, [tallerId, filtros, pagParams, fijarMetaPag])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Al cambiar de taller se vuelve a la página 1 (nuevo conjunto de datos).
  const tallerPrevio = useRef(tallerId)
  useEffect(() => {
    if (tallerPrevio.current !== tallerId) {
      tallerPrevio.current = tallerId
      reiniciarPag()
    }
  }, [tallerId, reiniciarPag])

  /** Cambio de filtro: reinicia la paginación a la página 1 (§1). */
  function cambiarFiltro<K extends keyof typeof filtros>(campo: K, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }))
    reiniciarPag()
  }

  useEffect(() => {
    if (esAdmin) {
      api.get<{ talleres: Taller[] }>('/api/talleres').then((r) => setListaTalleres(r.talleres)).catch(() => {})
    }
  }, [esAdmin])

  async function abrirHistorial(p: Producto) {
    setProductoAccion(p)
    setModalHistorial(true)
    try {
      const res = await api.get<{ movimientos: Movimiento[] }>(`/api/movimientos?productoId=${p.id}`)
      setMovimientos(res.movimientos)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar movimientos')
    }
  }

  function abrirNuevo() {
    setProductoEdit({ id: null, datos: { ...FORM_VACIO } })
    setModalProducto(true)
  }

  function abrirEditar(p: Producto) {
    setProductoEdit({
      id: p.id,
      datos: {
        nombre: p.nombre,
        categoria: p.categoria,
        tipo: p.tipo,
        precio: String(p.precio),
        monedaPrecio: p.monedaPrecio,
        unidad: p.unidad,
        cantidadInicial: String(p.cantidad),
        costo: String(p.costo ?? 0),
        stockMinimo: String(p.stockMinimo ?? 0),
        pagoOperarioTipo: p.pagoOperarioTipo ?? 'FIJO',
        pagoOperarioValor: String(p.pagoOperarioValor ?? 0),
        garantiaDias: String(p.garantiaDias ?? 0),
      },
    })
    setModalProducto(true)
  }

  async function guardarProducto() {
    const d = productoEdit.datos
    if (d.nombre.trim().length < 2 || !d.categoria.trim() || !d.precio) {
      toast.error('Complete nombre, categoría y precio')
      return
    }
    try {
      const cuerpo: Record<string, unknown> = {
        nombre: d.nombre.trim(),
        categoria: d.categoria.trim(),
        tipo: d.tipo,
        precio: parseFloat(d.precio),
        monedaPrecio: d.monedaPrecio,
        unidad: d.unidad,
      }
      if (esAdmin) {
        cuerpo.costo = parseFloat(d.costo || '0')
        cuerpo.stockMinimo = parseInt(d.stockMinimo || '0', 10)
        cuerpo.pagoOperarioTipo = d.pagoOperarioTipo
        cuerpo.pagoOperarioValor = parseFloat(d.pagoOperarioValor || '0')
        cuerpo.garantiaDias = parseInt(d.garantiaDias || '0', 10)
      }
      if (!productoEdit.id) {
        await api.post(`/api/productos`, { ...cuerpo, tallerId, cantidad: esAdmin ? parseInt(d.cantidadInicial || '0', 10) : 0 })
        toast.success('Producto creado')
      } else {
        await api.patch(`/api/productos?id=${productoEdit.id}`, cuerpo)
        toast.success('Producto actualizado')
      }
      setModalProducto(false)
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar producto')
    }
  }

  async function toggleActivo(p: Producto) {
    try {
      await api.patch(`/api/productos?id=${p.id}`, { activo: !p.activo })
      toast.success(p.activo ? 'Producto desactivado' : 'Producto activado')
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  async function registrarEntrada() {
    if (!productoAccion) return
    try {
      await api.post('/api/movimientos', {
        tipo: 'ENTRADA',
        productoId: productoAccion.id,
        cantidad: parseInt(formEntrada.cantidad, 10),
        ...(formEntrada.costoUnitario ? { costoUnitario: parseFloat(formEntrada.costoUnitario) } : {}),
        nota: formEntrada.nota || undefined,
      })
      toast.success('Entrada registrada')
      setModalEntrada(false)
      setFormEntrada({ cantidad: '', costoUnitario: '', nota: '' })
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar entrada')
    }
  }

  async function registrarBaja() {
    if (!productoAccion) return
    try {
      await api.post('/api/movimientos', {
        tipo: 'BAJA_DEFECTUOSO',
        productoId: productoAccion.id,
        cantidad: parseInt(formBaja.cantidad, 10),
        motivo: formBaja.motivo,
      })
      toast.success('Baja por defectuoso registrada')
      setModalBaja(false)
      setFormBaja({ cantidad: '', motivo: '' })
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar baja')
    }
  }

  async function registrarTransferencia() {
    if (!productoAccion) return
    try {
      await api.post('/api/transferencias', {
        productoId: productoAccion.id,
        tallerDestinoId: formTransfer.tallerDestinoId,
        cantidad: parseInt(formTransfer.cantidad, 10),
        nota: formTransfer.nota || undefined,
      })
      toast.success('Transferencia realizada')
      setModalTransfer(false)
      setFormTransfer({ tallerDestinoId: '', cantidad: '', nota: '' })
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al transferir')
    }
  }

  const productosVisibles = useMemo(() => productos, [productos])

  // ---- Ctrl+S guarda el formulario/modal abierto ----
  useGuardarConCtrlS(
    () => {
      if (modalProducto) guardarProducto()
      else if (modalEntrada) registrarEntrada()
      else if (modalBaja) registrarBaja()
      else if (modalTransfer) registrarTransferencia()
    },
    modalProducto || modalEntrada || modalBaja || modalTransfer
  )

  // ---- Navegación por teclado en la tabla (↑↓ Enter Supr) ----
  const suprArmado = useRef<{ i: number; t: number } | null>(null)
  function suprFila(i: number) {
    if (!esAdmin) return
    const p = productosVisibles[i]
    if (!p) return
    if (!p.activo) {
      toast.info('El producto ya está inactivo')
      return
    }
    const ahora = Date.now()
    if (suprArmado.current?.i === i && ahora - suprArmado.current.t < 4000) {
      suprArmado.current = null
      toggleActivo(p)
    } else {
      suprArmado.current = { i, t: ahora }
      toast.warning(`Pulse Supr de nuevo para desactivar «${p.nombre}»`, { duration: 4000 })
    }
  }
  const { propsFila, indice: filaSel } = useTablaTeclado({
    total: productosVisibles.length,
    onAbrir: (i) => abrirEditar(productosVisibles[i]),
    onEliminar: suprFila,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">Inventario</h1>
        <Button onClick={abrirNuevo}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo producto
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={filtros.q}
              onChange={(e) => cambiarFiltro('q', e.target.value)}
              placeholder="Buscar por nombre o código…"
              className="pl-8"
              aria-label="Buscar producto"
            />
          </div>
          <Select value={filtros.categoria} onValueChange={(v) => cambiarFiltro('categoria', v === '__todos__' ? '' : v)}>
            <SelectTrigger className="w-[160px]" aria-label="Categoría">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todas</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtros.tipo} onValueChange={(v) => cambiarFiltro('tipo', v === '__todos__' ? '' : v)}>
            <SelectTrigger className="w-[170px]" aria-label="Tipo">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todos</SelectItem>
              {TIPOS.map((t) => (
                <SelectItem key={t} value={t}>{TIPO_PRODUCTO_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtros.stockBajo} onValueChange={(v) => cambiarFiltro('stockBajo', v === '__todos__' ? '' : v)}>
            <SelectTrigger className="w-[150px]" aria-label="Stock bajo">
              <SelectValue placeholder="Stock" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todo el stock</SelectItem>
              <SelectItem value="true">Solo stock bajo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtros.activo} onValueChange={(v) => cambiarFiltro('activo', v === '__todos__' ? '' : v)}>
            <SelectTrigger className="w-[140px]" aria-label="Estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Activos</SelectItem>
              <SelectItem value="false">Inactivos</SelectItem>
              <SelectItem value="__todos__">Todos</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                {esAdmin && <TableHead className="text-right">Costo</TableHead>}
                {esAdmin && <TableHead className="text-right">Pago operario</TableHead>}
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-tabla="filas">
              {cargando && <FilasEsqueleto columnas={esAdmin ? 8 : 6} />}
              {!cargando &&
                productosVisibles.map((p, i) => (
                <TableRow
                  key={p.id}
                  className={`${!p.activo ? 'opacity-60' : ''} ${i === filaSel ? 'ring-2 ring-ring/60 ring-inset' : ''}`}
                  {...propsFila(i)}
                >
                  <TableCell>
                    <div className="font-medium">{p.nombre}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {p.codigoInterno} · {p.categoria}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={esServicio(p.tipo) ? 'outline' : 'secondary'} className="text-xs">
                      {esServicio(p.tipo) ? 'Servicio' : 'Producto'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right num-tabular">
                    {esServicio(p.tipo) ? '—' : (
                      <span className={p.cantidad <= (p.stockMinimo ?? 0) ? 'text-warning font-semibold' : ''}>
                        {p.cantidad} {p.unidad}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold num-tabular">
                    {fmt(p.precio)} {p.monedaPrecio}
                  </TableCell>
                  {esAdmin && <TableCell className="text-right text-muted-foreground num-tabular">{fmt(p.costo ?? 0)}</TableCell>}
                  {esAdmin && (
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {p.pagoOperarioTipo === 'PORCENTAJE' ? `${fmt(p.pagoOperarioValor ?? 0)}%` : `${fmt(p.pagoOperarioValor ?? 0)} CUP`}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant={p.activo ? 'default' : 'destructive'} className="text-xs">
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {!esServicio(p.tipo) && p.activo && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Entrada de inventario"
                            onClick={() => {
                              setProductoAccion(p)
                              setModalEntrada(true)
                            }}
                            aria-label={`Entrada de ${p.nombre}`}
                          >
                            <PackagePlus className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Baja por defectuoso"
                            onClick={() => {
                              setProductoAccion(p)
                              setModalBaja(true)
                            }}
                            aria-label={`Baja de ${p.nombre}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {esAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Transferir a otro taller"
                              onClick={() => {
                                setProductoAccion(p)
                                setModalTransfer(true)
                              }}
                              aria-label={`Transferir ${p.nombre}`}
                            >
                              <ArrowLeftRight className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Historial de movimientos"
                        onClick={() => abrirHistorial(p)}
                        aria-label={`Historial de ${p.nombre}`}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Imprimir etiqueta con código de barras (CODE128)"
                        onClick={() => {
                          setProductoAccion(p)
                          setModalEtiqueta(true)
                        }}
                        aria-label={`Etiqueta de ${p.nombre}`}
                      >
                        <Tag className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Editar" onClick={() => abrirEditar(p)} aria-label={`Editar ${p.nombre}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {esAdmin && p.activo && (
                        <ConfirmarPeligroso
                          etiqueta="Desactivar"
                          etiquetaConfirmar="Confirmar"
                          onConfirmar={() => toggleActivo(p)}
                          aviso={`Pulse de nuevo para desactivar «${p.nombre}»`}
                        />
                      )}
                      {esAdmin && !p.activo && (
                        <Button size="sm" variant="outline" onClick={() => toggleActivo(p)} aria-label={`Activar ${p.nombre}`}>
                          Activar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!cargando && productosVisibles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={esAdmin ? 8 : 6} className="text-center py-8 text-muted-foreground">
                    No hay productos con esos filtros.
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

      {/* ============ Modal producto (crear/editar) ============ */}
      <Dialog open={modalProducto} onOpenChange={setModalProducto}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{productoEdit.id ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="prod-nombre">Nombre</Label>
              <Input id="prod-nombre" value={productoEdit.datos.nombre} onChange={(e) => setProductoEdit((p) => ({ ...p, datos: { ...p.datos, nombre: e.target.value } }))} />
            </div>
            <div>
              <Label htmlFor="prod-cat">Categoría</Label>
              <Input id="prod-cat" value={productoEdit.datos.categoria} onChange={(e) => setProductoEdit((p) => ({ ...p, datos: { ...p.datos, categoria: e.target.value } }))} />
            </div>
            <div>
              <Label htmlFor="prod-tipo">Tipo</Label>
              <Select value={productoEdit.datos.tipo} onValueChange={(v) => setProductoEdit((p) => ({ ...p, datos: { ...p.datos, tipo: v } }))}>
                <SelectTrigger id="prod-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>{TIPO_PRODUCTO_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="prod-precio">Precio</Label>
              <Input id="prod-precio" inputMode="decimal" value={productoEdit.datos.precio} onChange={(e) => setProductoEdit((p) => ({ ...p, datos: { ...p.datos, precio: e.target.value } }))} />
            </div>
            <div>
              <Label htmlFor="prod-moneda">Moneda del precio</Label>
              <Select value={productoEdit.datos.monedaPrecio} onValueChange={(v) => setProductoEdit((p) => ({ ...p, datos: { ...p.datos, monedaPrecio: v } }))}>
                <SelectTrigger id="prod-moneda">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONEDAS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!esServicio(productoEdit.datos.tipo) && (
              <div>
                <Label htmlFor="prod-unidad">Unidad</Label>
                <Input id="prod-unidad" value={productoEdit.datos.unidad} onChange={(e) => setProductoEdit((p) => ({ ...p, datos: { ...p.datos, unidad: e.target.value } }))} />
              </div>
            )}
            {esAdmin && !productoEdit.id && !esServicio(productoEdit.datos.tipo) && (
              <div>
                <Label htmlFor="prod-cant">Stock inicial (crea movimiento ENTRADA)</Label>
                <Input id="prod-cant" inputMode="numeric" value={productoEdit.datos.cantidadInicial} onChange={(e) => setProductoEdit((p) => ({ ...p, datos: { ...p.datos, cantidadInicial: e.target.value } }))} />
              </div>
            )}
            {esAdmin && (
              <>
                <div className="col-span-2 text-sm font-medium pt-2 border-t mt-1">
                  Campos sensibles (solo ADMIN)
                </div>
                <div>
                  <Label htmlFor="prod-costo">Costo (CUP)</Label>
                  <Input id="prod-costo" inputMode="decimal" value={productoEdit.datos.costo} onChange={(e) => setProductoEdit((p) => ({ ...p, datos: { ...p.datos, costo: e.target.value } }))} />
                </div>
                {!esServicio(productoEdit.datos.tipo) && (
                  <div>
                    <Label htmlFor="prod-min">Stock mínimo</Label>
                    <Input id="prod-min" inputMode="numeric" value={productoEdit.datos.stockMinimo} onChange={(e) => setProductoEdit((p) => ({ ...p, datos: { ...p.datos, stockMinimo: e.target.value } }))} />
                  </div>
                )}
                <div>
                  <Label htmlFor="prod-pago-tipo">Pago al operario</Label>
                  <Select value={productoEdit.datos.pagoOperarioTipo} onValueChange={(v) => setProductoEdit((p) => ({ ...p, datos: { ...p.datos, pagoOperarioTipo: v } }))}>
                    <SelectTrigger id="prod-pago-tipo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIJO">FIJO (CUP × unidad)</SelectItem>
                      <SelectItem value="PORCENTAJE">PORCENTAJE (% del subtotal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="prod-pago-valor">
                    {productoEdit.datos.pagoOperarioTipo === 'PORCENTAJE' ? 'Valor (%)' : 'Valor (CUP)'}
                  </Label>
                  <Input id="prod-pago-valor" inputMode="decimal" value={productoEdit.datos.pagoOperarioValor} onChange={(e) => setProductoEdit((p) => ({ ...p, datos: { ...p.datos, pagoOperarioValor: e.target.value } }))} />
                </div>
                <div>
                  <Label htmlFor="prod-gar">Garantía (días)</Label>
                  <Input id="prod-gar" inputMode="numeric" value={productoEdit.datos.garantiaDias} onChange={(e) => setProductoEdit((p) => ({ ...p, datos: { ...p.datos, garantiaDias: e.target.value } }))} />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalProducto(false)}>Cancelar</Button>
            <Button onClick={guardarProducto} className="bg-brand-red hover:bg-brand-red-hover">
              Guardar <Kbd className="ml-2 border-white/40 bg-white/15 text-white">Ctrl</Kbd>+<Kbd className="border-white/40 bg-white/15 text-white">S</Kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Modal etiqueta (CODE128) ============ */}
      <Dialog open={modalEtiqueta} onOpenChange={setModalEtiqueta}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Etiqueta · {productoAccion?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="solo-impresion bg-white text-black rounded-lg border p-4 mx-auto w-fit">
            <div className="text-sm font-semibold text-center leading-tight max-w-[64mm]">{productoAccion?.nombre}</div>
            <div
              className="my-2 flex justify-center"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: code128Svg(productoAccion?.codigoBarras || productoAccion?.codigoInterno || '') }}
            />
            <div className="text-center text-xs font-mono">{productoAccion?.codigoBarras}</div>
            <div className="text-center text-sm font-bold mt-1 num-tabular">
              {fmt(productoAccion?.precio ?? 0)} {productoAccion?.monedaPrecio}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEtiqueta(false)}>Cerrar</Button>
            <Button onClick={() => window.print()} className="bg-brand-red hover:bg-brand-red-hover">
              <Printer className="h-4 w-4 mr-2" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Modal entrada ============ */}
      <Dialog open={modalEntrada} onOpenChange={setModalEntrada}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Entrada de inventario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{productoAccion?.nombre}</p>
            <div>
              <Label htmlFor="ent-cant">Cantidad</Label>
              <Input id="ent-cant" inputMode="numeric" value={formEntrada.cantidad} onChange={(e) => setFormEntrada((f) => ({ ...f, cantidad: e.target.value }))} />
            </div>
            {esAdmin && (
              <div>
                <Label htmlFor="ent-costo">Costo unitario (opcional)</Label>
                <Input id="ent-costo" inputMode="decimal" value={formEntrada.costoUnitario} onChange={(e) => setFormEntrada((f) => ({ ...f, costoUnitario: e.target.value }))} />
              </div>
            )}
            <div>
              <Label htmlFor="ent-nota">Nota (opcional)</Label>
              <Input id="ent-nota" value={formEntrada.nota} onChange={(e) => setFormEntrada((f) => ({ ...f, nota: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEntrada(false)}>Cancelar</Button>
            <Button onClick={registrarEntrada}>Registrar entrada</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Modal baja ============ */}
      <Dialog open={modalBaja} onOpenChange={setModalBaja}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Baja por defectuoso</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {productoAccion?.nombre} · stock {productoAccion?.cantidad}
            </p>
            <div>
              <Label htmlFor="baja-cant">Cantidad</Label>
              <Input id="baja-cant" inputMode="numeric" value={formBaja.cantidad} onChange={(e) => setFormBaja((f) => ({ ...f, cantidad: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="baja-motivo">Motivo (obligatorio)</Label>
              <Input id="baja-motivo" value={formBaja.motivo} onChange={(e) => setFormBaja((f) => ({ ...f, motivo: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground">Se registra el costo unitario y el motivo. El stock baja de inmediato.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalBaja(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={registrarBaja}>
              Registrar baja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Modal transferencia ============ */}
      <Dialog open={modalTransfer} onOpenChange={setModalTransfer}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transferir entre talleres (ADMIN)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {productoAccion?.nombre} · stock {productoAccion?.cantidad}
            </p>
            <div>
              <Label htmlFor="tr-destino">Taller destino</Label>
              <Select value={formTransfer.tallerDestinoId} onValueChange={(v) => setFormTransfer((f) => ({ ...f, tallerDestinoId: v }))}>
                <SelectTrigger id="tr-destino">
                  <SelectValue placeholder="Seleccione taller" />
                </SelectTrigger>
                <SelectContent>
                  {listaTalleres
                    .filter((t) => t.id !== productoAccion?.id && t.activo && t.id !== tallerId)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tr-cant">Cantidad</Label>
              <Input id="tr-cant" inputMode="numeric" value={formTransfer.cantidad} onChange={(e) => setFormTransfer((f) => ({ ...f, cantidad: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="tr-nota">Nota (opcional)</Label>
              <Input id="tr-nota" value={formTransfer.nota} onChange={(e) => setFormTransfer((f) => ({ ...f, nota: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground">
              Genera TRANSFERENCIA_SALIDA en origen y TRANSFERENCIA_ENTRADA en destino con el mismo costo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalTransfer(false)}>Cancelar</Button>
            <Button onClick={registrarTransferencia} disabled={!formTransfer.tallerDestinoId || !formTransfer.cantidad}>
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Modal historial ============ */}
      <Dialog open={modalHistorial} onOpenChange={setModalHistorial}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Movimientos · {productoAccion?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead>Usuario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtFechaHora(m.fecha)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={m.tipo === 'ENTRADA' || m.tipo === 'TRANSFERENCIA_ENTRADA' ? 'default' : m.tipo === 'VENTA' ? 'secondary' : 'destructive'}
                        className="text-xs"
                      >
                        {MOVIMIENTO_LABEL[m.tipo] ?? m.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {m.tipo === 'AJUSTE' ? m.cantidad : m.tipo === 'ENTRADA' || m.tipo === 'TRANSFERENCIA_ENTRADA' ? `+${m.cantidad}` : `−${m.cantidad}`}
                    </TableCell>
                    <TableCell className="text-right text-xs">{fmt(m.costoUnitario)}</TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate" title={m.nota ?? ''}>{m.nota ?? '—'}</TableCell>
                    <TableCell className="text-xs">{m.usuario?.nombre ?? '—'}</TableCell>
                  </TableRow>
                ))}
                {movimientos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin movimientos.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
