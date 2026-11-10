'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Search, Plus, Minus, Trash2, UserPlus, User, CreditCard, Printer, X, Package, Wrench,
  Loader2, Volume2, VolumeX, ScanLine,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/lib/store'
import { fmt, fmtCUP, aCUP, esServicio, METODO_PAGO_LABEL } from '@/lib/formato'
import { sonidoExito, sonidoError, sonidoVenta, sonidosActivos, alternarSonidos } from '@/lib/sonidos'
import { useDebounce } from '@/hooks/use-debounce'
import { Kbd } from '../kbd'
import { TicketVenta } from '../ticket'

interface Producto {
  id: string
  nombre: string
  categoria: string
  tipo: string
  cantidad: number
  precio: number
  monedaPrecio: string
  codigoInterno: string
  codigoBarras: string
  activo: boolean
}

interface Operario {
  id: string
  nombre: string
  rama: string
  activo: boolean
  talleres: Array<{ tallerId: string }>
}

interface Cliente {
  id: string
  nombre: string
  telefono: string | null
  ci: string | null
}

interface Pago {
  metodo: string
  moneda: string
  monto: string
  referencia: string
}

interface VentaDetalle {
  venta: {
    codigo: string
    fecha: string
    totalCUP: number
    taller: { nombre: string; direccion: string; telefono: string }
    cliente: { nombre: string } | null
    vendedor: { nombre: string }
    items: Array<{
      cantidad: number
      precioUnitario: number
      monedaPrecio: string
      subtotalCUP: number
      producto: { nombre: string }
      operario: { nombre: string } | null
    }>
    pagos: Array<{ metodo: string; moneda: string; monto: number; montoCUP: number; referencia: string | null }>
  }
  ajustes: Record<string, string>
}

const MONEDAS = ['CUP', 'USD', 'EUR']
const METODOS = ['EFECTIVO', 'TRANSFERENCIA', 'ZELLE']

/** ¿El foco está en un campo de texto? (los atajos de líneas no deben interferir) */
function focoEnCampo(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).getAttribute('role') === 'option'
}

export function Pos() {
  const usuario = useApp((s) => s.usuario)
  const tasas = useApp((s) => s.tasas)
  const setTasas = useApp((s) => s.setTasas)
  const ajustes = useApp((s) => s.ajustes)
  const tallerActivoId = useApp((s) => s.tallerActivoId)
  const talleres = useApp((s) => s.talleres)

  const carritos = useApp((s) => s.carritos)
  const carritoActivo = useApp((s) => s.carritoActivo)
  const nuevoCarrito = useApp((s) => s.nuevoCarrito)
  const cerrarCarrito = useApp((s) => s.cerrarCarrito)
  const setCarritoActivo = useApp((s) => s.setCarritoActivo)
  const agregarItem = useApp((s) => s.agregarItem)
  const quitarItem = useApp((s) => s.quitarItem)
  const cambiarCantidad = useApp((s) => s.cambiarCantidad)
  const cambiarPrecio = useApp((s) => s.cambiarPrecio)
  const asignarOperario = useApp((s) => s.asignarOperario)
  const setCliente = useApp((s) => s.setCliente)

  const tallerId = usuario?.rol === 'VENDEDOR' ? usuario.tallerId : tallerActivoId ?? talleres[0]?.id
  const taller = talleres.find((t) => t.id === tallerId)

  const [productos, setProductos] = useState<Producto[]>([])
  const [operarios, setOperarios] = useState<Operario[]>([])
  // Buscador unificado: texto manual Y lector de código de barras (HID = teclado + Enter)
  const [busqueda, setBusqueda] = useState('')
  const busquedaEfectiva = useDebounce(busqueda, 300) // filtro con debounce para búsqueda manual
  const [pagos, setPagos] = useState<Record<string, Pago[]>>({})
  const [confirmando, setConfirmando] = useState(false)
  const [ticketData, setTicketData] = useState<VentaDetalle | null>(null)
  const [modalCliente, setModalCliente] = useState(false)
  const [modalCobro, setModalCobro] = useState(false)
  const [lineaSel, setLineaSel] = useState(-1)
  const [sonido, setSonido] = useState(true)
  const [busqCliente, setBusqCliente] = useState('')
  const [resultadosCliente, setResultadosCliente] = useState<Cliente[]>([])
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', telefono: '', ci: '' })
  const [tasasEdit, setTasasEdit] = useState({ USD: String(tasas.USD), EUR: String(tasas.EUR) })
  const busquedaRef = useRef<HTMLInputElement>(null)
  const contenedorLineas = useRef<HTMLDivElement>(null)
  const preciosRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const carritosTaller = useMemo(() => carritos.filter((c) => c.tallerId === tallerId), [carritos, tallerId])
  const carrito = useMemo(
    () => carritosTaller.find((c) => c.id === carritoActivo) ?? carritosTaller[carritosTaller.length - 1] ?? null,
    [carritosTaller, carritoActivo]
  )
  const pagosActivos = carrito ? pagos[carrito.id] ?? [] : []
  const items = carrito?.items ?? []

  const cargarProductos = useCallback(async () => {
    if (!tallerId) return
    try {
      const res = await api.get<{ productos: Producto[] }>(`/api/productos?tallerId=${tallerId}&activo=true`)
      setProductos(res.productos)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar productos')
    }
  }, [tallerId])

  useEffect(() => {
    cargarProductos()
    if (tallerId) {
      api
        .get<{ operarios: Operario[] }>(`/api/operarios?tallerId=${tallerId}`)
        .then((r) => setOperarios(r.operarios.filter((o) => o.activo)))
        .catch(() => setOperarios([]))
    }
    setTasasEdit({ USD: String(tasas.USD), EUR: String(tasas.EUR) })
    setSonido(sonidosActivos())
    // El buscador queda listo para el lector de barras al entrar al POS
    busquedaRef.current?.focus()
  }, [tallerId])

  // Carrito inicial
  useEffect(() => {
    if (tallerId && carritosTaller.length === 0) nuevoCarrito(tallerId)
  }, [tallerId, carritosTaller.length])

  // Al cambiar de carrito se pierde la selección de línea
  useEffect(() => {
    setLineaSel(-1)
  }, [carrito?.id])

  const filtrarPor = useCallback(
    (q: string): Producto[] => {
      const t = q.trim().toLowerCase()
      if (!t) return productos
      return productos.filter(
        (p) =>
          p.nombre.toLowerCase().includes(t) ||
          p.codigoInterno.toLowerCase().includes(t) ||
          p.codigoBarras.toLowerCase().includes(t) ||
          p.categoria.toLowerCase().includes(t)
      )
    },
    [productos]
  )

  const productosFiltrados = useMemo(() => filtrarPor(busquedaEfectiva), [filtrarPor, busquedaEfectiva])

  const totales = useMemo(() => {
    if (!carrito) return { cup: 0, usd: 0 }
    const cup = carrito.items.reduce((acc, it) => acc + aCUP(it.precio, it.moneda, tasas) * it.cantidad, 0)
    return { cup: Math.round(cup * 100) / 100, usd: tasas.USD > 0 ? Math.round((cup / tasas.USD) * 100) / 100 : 0 }
  }, [carrito, tasas])

  const cubierto = useMemo(
    () => pagosActivos.reduce((acc, p) => acc + aCUP(parseFloat(p.monto || '0'), p.moneda, tasas), 0),
    [pagosActivos, tasas]
  )
  const faltante = Math.round((totales.cup - cubierto) * 100) / 100

  const itemsInvalidos = useMemo(() => {
    if (!carrito) return []
    return carrito.items.filter(
      (it) => (esServicio(it.tipo) && !it.operarioId) || (!esServicio(it.tipo) && it.cantidad > it.stock)
    )
  }, [carrito])

  // =============== ACCIONES ===============

  function agregarProducto(p: Producto) {
    if (!tallerId) return
    const stockDisponible = productos.find((x) => x.id === p.id)?.cantidad ?? 0
    const enCarrito = carrito?.items.find((i) => i.productoId === p.id)?.cantidad ?? 0
    if (!esServicio(p.tipo) && enCarrito >= stockDisponible) {
      toast.error(`Stock insuficiente de ${p.nombre} (disponible ${stockDisponible})`)
      sonidoError()
      return
    }
    agregarItem(tallerId, {
      productoId: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      cantidad: 1,
      precio: p.precio,
      precioOriginal: p.precio,
      moneda: p.monedaPrecio,
      operarioId: null,
      stock: stockDisponible,
    })
    sonidoExito()
  }

  /** Enter del buscador: código exacto del lector o primer resultado manual. */
  function alEnterBuscador() {
    const q = busqueda.trim()
    if (!q) return
    // 1) Coincidencia exacta de código de barras o código interno (lector HID)
    const exacto = productos.find(
      (x) => x.codigoBarras.toLowerCase() === q.toLowerCase() || x.codigoInterno.toLowerCase() === q.toLowerCase()
    )
    if (exacto) {
      agregarProducto(exacto)
      setBusqueda('')
      return
    }
    // 2) Primer resultado de la búsqueda manual
    const resultados = filtrarPor(q)
    if (resultados.length > 0) {
      agregarProducto(resultados[0])
      setBusqueda('')
      return
    }
    // 3) Sin resultados: error rápido, mantener el foco para reintentar
    toast.error(`Código no encontrado: ${q}`)
    sonidoError()
    busquedaRef.current?.select()
  }

  async function guardarTasas() {
    const usd = parseFloat(tasasEdit.USD)
    const eur = parseFloat(tasasEdit.EUR)
    if (!isFinite(usd) || usd <= 0 || !isFinite(eur) || eur <= 0) {
      toast.error('Tasas inválidas')
      return
    }
    try {
      if (usd !== tasas.USD) await api.post('/api/tasas', { moneda: 'USD', valorCUP: usd })
      if (eur !== tasas.EUR) await api.post('/api/tasas', { moneda: 'EUR', valorCUP: eur })
      setTasas({ USD: usd, EUR: eur })
      toast.success('Tasas actualizadas')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar tasas')
    }
  }

  function agregarPago() {
    if (!carrito) return
    const falt = Math.max(0, faltante)
    const defecto: Pago =
      falt > 0
        ? { metodo: 'EFECTIVO', moneda: 'CUP', monto: String(falt), referencia: '' }
        : { metodo: 'EFECTIVO', moneda: 'CUP', monto: '', referencia: '' }
    setPagos((p) => ({ ...p, [carrito.id]: [...(p[carrito.id] ?? []), defecto] }))
  }

  function actualizarPago(i: number, cambios: Partial<Pago>) {
    if (!carrito) return
    setPagos((p) => ({
      ...p,
      [carrito.id]: (p[carrito.id] ?? []).map((pg, idx) => (idx === i ? { ...pg, ...cambios } : pg)),
    }))
  }

  function quitarPago(i: number) {
    if (!carrito) return
    setPagos((p) => ({ ...p, [carrito.id]: (p[carrito.id] ?? []).filter((_, idx) => idx !== i) }))
  }

  async function buscarClientes(q: string) {
    const res = await api.get<{ clientes: Cliente[] }>(`/api/clientes?q=${encodeURIComponent(q)}`)
    setResultadosCliente(res.clientes)
  }

  async function crearCliente() {
    if (nuevoCliente.nombre.trim().length < 2) {
      toast.error('Nombre del cliente muy corto')
      return
    }
    try {
      const res = await api.post<{ cliente: Cliente }>('/api/clientes', {
        nombre: nuevoCliente.nombre.trim(),
        telefono: nuevoCliente.telefono || null,
        ci: nuevoCliente.ci || null,
      })
      if (carrito) setCliente(carrito.id, { id: res.cliente.id, nombre: res.cliente.nombre })
      setModalCliente(false)
      setNuevoCliente({ nombre: '', telefono: '', ci: '' })
      toast.success('Cliente creado y asignado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear cliente')
    }
  }

  /** Validaciones previas a confirmar la venta (devuelve mensaje de error o null). */
  function validarVenta(): string | null {
    if (!carrito || !tallerId) return 'No hay carrito o taller'
    if (carrito.items.length === 0) return 'El carrito está vacío'
    if (itemsInvalidos.length > 0) return 'Hay líneas inválidas: servicios sin operario o cantidad mayor que el stock'
    const pagosValidos = pagosActivos.filter((p) => parseFloat(p.monto) > 0)
    if (pagosValidos.length === 0) return 'Registre al menos un pago'
    for (const p of pagosValidos) {
      if (p.metodo === 'ZELLE' && (p.moneda !== 'USD' || !p.referencia.trim())) {
        return 'Zelle solo en USD y con referencia obligatoria'
      }
    }
    if (cubierto + 0.001 < totales.cup) return `Faltan ${fmtCUP(faltante)} por cubrir`
    return null
  }

  function abrirCobro() {
    if (!carrito || carrito.items.length === 0) {
      toast.error('El carrito está vacío')
      return
    }
    // Si no hay pagos, precarga uno por el monto exacto
    if ((pagos[carrito.id] ?? []).length === 0) agregarPago()
    setModalCobro(true)
  }

  async function confirmarVenta(e?: React.FormEvent) {
    e?.preventDefault()
    const error = validarVenta()
    if (error) {
      toast.error(error)
      sonidoError()
      return
    }
    if (!carrito || !tallerId) return
    setConfirmando(true)
    try {
      const pagosValidos = pagosActivos.filter((p) => parseFloat(p.monto) > 0)
      const res = await api.post<{ venta: { id: string; codigo: string } }>('/api/ventas', {
        tallerId,
        clienteId: carrito.clienteId,
        items: carrito.items.map((it) => ({
          productoId: it.productoId,
          cantidad: it.cantidad,
          precioUnitario: it.precio !== it.precioOriginal ? it.precio : undefined,
          operarioId: it.operarioId,
        })),
        pagos: pagosValidos.map((p) => ({
          metodo: p.metodo,
          moneda: p.moneda,
          monto: parseFloat(p.monto),
          referencia: p.metodo === 'ZELLE' ? p.referencia.trim() : p.referencia || undefined,
        })),
      })
      const detalle = await api.get<VentaDetalle>(`/api/ventas?id=${res.venta.id}`)
      setTicketData(detalle)
      setModalCobro(false)
      toast.success(`Venta ${res.venta.codigo} registrada`)
      sonidoVenta()
      cerrarCarrito(carrito.id)
      setPagos((p) => {
        const copia = { ...p }
        delete copia[carrito.id]
        return copia
      })
      nuevoCarrito(tallerId)
      setLineaSel(-1)
      await cargarProductos()
      // El buscador vuelve a quedar listo para el siguiente escaneo
      setTimeout(() => busquedaRef.current?.focus(), 50)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar la venta')
      sonidoError()
    } finally {
      setConfirmando(false)
    }
  }

  // =============== SELECCIÓN DE LÍNEAS DEL CARRITO ===============

  const seleccionarLinea = useCallback(
    (i: number) => {
      if (items.length === 0) return
      const destino = Math.max(0, Math.min(i, items.length - 1))
      setLineaSel(destino)
      const el = contenedorLineas.current?.querySelector<HTMLElement>(`[data-indice="${destino}"]`)
      el?.focus()
      el?.scrollIntoView({ block: 'nearest' })
    },
    [items.length]
  )

  const cambiarCantidadSel = useCallback(
    (delta: number) => {
      if (!carrito || lineaSel < 0) return
      const it = carrito.items[lineaSel]
      if (!it) return
      if (esServicio(it.tipo)) {
        toast.info('Los servicios se cobran ×1')
        return
      }
      const nueva = it.cantidad + delta
      if (nueva < 1) return
      if (nueva > it.stock) {
        toast.error(`Stock máximo: ${it.stock}`)
        return
      }
      cambiarCantidad(carrito.id, it.productoId, nueva)
    },
    [carrito, lineaSel, cambiarCantidad]
  )

  // =============== ATAJOS DE TECLADO DEL POS (§3.2) ===============

  useHotkeys('f2', (e) => {
    e.preventDefault()
    busquedaRef.current?.focus()
    busquedaRef.current?.select()
  }, { enableOnFormTags: true })

  useHotkeys('f4', (e) => {
    e.preventDefault()
    if (tallerId) nuevoCarrito(tallerId)
  }, { enableOnFormTags: true })

  useHotkeys(
    ['ctrl+tab', 'ctrl+shift+tab'],
    (e) => {
      e.preventDefault()
      if (carritosTaller.length < 2) return
      const actual = carritosTaller.findIndex((c) => c.id === carrito?.id)
      const dir = e.key === 'Tab' && e.shiftKey ? -1 : 1
      const siguiente = (actual + dir + carritosTaller.length) % carritosTaller.length
      setCarritoActivo(carritosTaller[siguiente].id)
    },
    { enableOnFormTags: true }
  )

  useHotkeys('f8', (e) => {
    e.preventDefault()
    setModalCliente(true)
  }, { enableOnFormTags: true })

  useHotkeys('f9', (e) => {
    e.preventDefault()
    if (!modalCobro) abrirCobro()
  }, { enableOnFormTags: true })

  useHotkeys(
    ['up', 'down'],
    (e) => {
      e.preventDefault()
      seleccionarLinea(lineaSel + (e.key === 'ArrowDown' ? 1 : -1))
    },
    { enabled: () => !focoEnCampo() && !modalCliente && !modalCobro && !ticketData }
  )

  useHotkeys(
    ['+', '=', '-'],
    (e) => {
      e.preventDefault()
      cambiarCantidadSel(e.key === '-' ? -1 : 1)
    },
    { enabled: () => !focoEnCampo() && !modalCliente && !modalCobro && !ticketData }
  )

  useHotkeys(
    ['ctrl+delete', 'ctrl+del'],
    (e) => {
      e.preventDefault()
      if (!carrito || lineaSel < 0) return
      const it = carrito.items[lineaSel]
      if (!it) return
      quitarItem(carrito.id, it.productoId)
      setLineaSel((i) => Math.min(i, carrito.items.length - 2))
    },
    { enabled: () => !focoEnCampo() && !modalCliente && !modalCobro && !ticketData }
  )

  useHotkeys(
    'ctrl+e',
    (e) => {
      e.preventDefault()
      if (!carrito || carrito.items.length === 0) return
      const i = lineaSel < 0 ? 0 : lineaSel
      setLineaSel(i)
      const it = carrito.items[i]
      const ref = preciosRefs.current[it.productoId]
      ref?.focus()
      ref?.select()
    },
    { enabled: () => !modalCliente && !modalCobro && !ticketData }
  )

  // Esc en el buscador: limpiar la búsqueda actual
  useHotkeys(
    'esc',
    () => {
      setBusqueda('')
    },
    { enabled: () => document.activeElement === busquedaRef.current }
  )

  if (!tallerId || !taller) {
    return <p className="text-muted-foreground">No hay taller disponible para vender.</p>
  }

  const cambio = Math.round((cubierto - totales.cup) * 100) / 100

  return (
    <div className="grid lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_460px] gap-4 items-start">
      {/* ==================== IZQUIERDA: BUSCADOR + PRODUCTOS ==================== */}
      <div className="space-y-3 min-w-0">
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <ScanLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-red" aria-hidden />
                <Input
                  ref={busquedaRef}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      alEnterBuscador()
                    }
                  }}
                  placeholder="Escanee el código de barras o busque por nombre…"
                  className="pl-8 h-11 font-mono"
                  aria-label="Buscar producto o escanear código de barras (F2)"
                  autoFocus
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                onClick={() => setSonido(alternarSonidos())}
                aria-label={sonido ? 'Desactivar sonidos del POS' : 'Activar sonidos del POS'}
                title={sonido ? 'Sonidos activados' : 'Sonidos desactivados'}
              >
                {sonido ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
            {/* Pista de atajos del POS */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Kbd>F2</Kbd> buscar</span>
              <span className="flex items-center gap-1"><Kbd>F4</Kbd> carrito</span>
              <span className="flex items-center gap-1"><Kbd>F8</Kbd> cliente</span>
              <span className="flex items-center gap-1"><Kbd>F9</Kbd> cobrar</span>
              <span className="flex items-center gap-1"><Kbd>↑↓</Kbd> líneas · <Kbd>+</Kbd>/<Kbd>−</Kbd> cant. · <Kbd>Ctrl</Kbd>+<Kbd>E</Kbd> precio · <Kbd>Ctrl</Kbd>+<Kbd>Supr</Kbd> quitar</span>
              <span className="flex items-center gap-1"><Kbd>Shift</Kbd>+<Kbd>?</Kbd> todos los atajos</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Tasas (USD/EUR → CUP):</span>
              <Input
                className="w-24 h-8 num-tabular"
                value={tasasEdit.USD}
                onChange={(e) => setTasasEdit((t) => ({ ...t, USD: e.target.value }))}
                aria-label="Tasa USD"
                inputMode="decimal"
              />
              <Input
                className="w-24 h-8 num-tabular"
                value={tasasEdit.EUR}
                onChange={(e) => setTasasEdit((t) => ({ ...t, EUR: e.target.value }))}
                aria-label="Tasa EUR"
                inputMode="decimal"
              />
              <Button size="sm" variant="outline" onClick={guardarTasas}>
                Actualizar tasas
              </Button>
            </div>
          </CardContent>
        </Card>

        <div data-tabla="filas" className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[calc(100vh-330px)] overflow-y-auto pr-1">
          {productosFiltrados.map((p) => {
            const precioCUP = aCUP(p.precio, p.monedaPrecio, tasas)
            const sinStock = !esServicio(p.tipo) && p.cantidad <= 0
            return (
              <button
                key={p.id}
                onClick={() => agregarProducto(p)}
                disabled={sinStock}
                className="text-left rounded-xl border bg-card p-3 hover:border-brand-red hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm leading-tight line-clamp-2">{p.nombre}</span>
                  {esServicio(p.tipo) ? (
                    <Wrench className="h-4 w-4 text-warning shrink-0" aria-label="Servicio" />
                  ) : (
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground truncate">{p.categoria}</span>
                  {!esServicio(p.tipo) && (
                    <Badge variant={p.cantidad > 0 ? 'secondary' : 'destructive'} className="text-[10px] num-tabular">
                      stock {p.cantidad}
                    </Badge>
                  )}
                </div>
                <div className="mt-1.5 font-bold text-brand-red num-tabular">
                  {fmt(p.precio)} {p.monedaPrecio}
                  {p.monedaPrecio !== 'CUP' && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground num-tabular">≈ {fmt(precioCUP)} CUP</span>
                  )}
                </div>
              </button>
            )
          })}
          {productosFiltrados.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground py-8 text-center">
              No se encontraron productos{busqueda ? ' para esa búsqueda' : ' en este taller'}.
            </p>
          )}
        </div>
      </div>

      {/* ==================== DERECHA: CARRITO ==================== */}
      <Card className="lg:sticky lg:top-32">
        <CardHeader className="p-3 pb-0 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Carrito</CardTitle>
            <div className="flex gap-1 flex-wrap items-center">
              {carritosTaller.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCarritoActivo(c.id)}
                  className={`px-2.5 h-7 rounded-md text-xs font-medium border transition-colors num-tabular ${
                    carrito?.id === c.id
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-card hover:bg-accent'
                  }`}
                  aria-pressed={carrito?.id === c.id}
                >
                  {c.nombre} {c.items.length > 0 && `(${c.items.length})`}
                </button>
              ))}
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => nuevoCarrito(tallerId)} aria-label="Nuevo carrito (F4)" title="Nuevo carrito (F4)">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {/* Cliente */}
          <div className="flex items-center gap-2">
            {carrito?.clienteId ? (
              <>
                <User className="h-4 w-4 text-brand-red shrink-0" aria-hidden />
                <span className="text-sm truncate flex-1">{carrito.clienteNombre}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => carrito && setCliente(carrito.id, null)}
                  aria-label="Quitar cliente"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                <span className="text-sm text-muted-foreground flex-1">Consumidor final</span>
                <Button size="sm" variant="outline" onClick={() => setModalCliente(true)} aria-label="Asignar cliente (F8)" title="Asignar cliente (F8)">
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Cliente <Kbd className="ml-1.5 hidden md:inline-flex">F8</Kbd>
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          {/* Líneas */}
          <div ref={contenedorLineas} className="max-h-[38vh] overflow-y-auto space-y-2 pr-1" role="listbox" aria-label="Líneas del carrito">
            {items.map((it, i) => {
              const subtotal = aCUP(it.precio, it.moneda, tasas) * it.cantidad
              const faltaOperario = esServicio(it.tipo) && !it.operarioId
              const seleccionada = i === lineaSel
              return (
                <div
                  key={it.productoId}
                  data-indice={i}
                  role="option"
                  tabIndex={0}
                  aria-selected={seleccionada}
                  onClick={() => setLineaSel(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Delete' && carrito) {
                      e.preventDefault()
                      quitarItem(carrito.id, it.productoId)
                    }
                  }}
                  className={`rounded-lg border p-2 space-y-1.5 cursor-pointer outline-none transition-colors ${
                    seleccionada
                      ? 'border-brand-red ring-2 ring-ring/60 bg-accent/60'
                      : faltaOperario
                        ? 'border-destructive'
                        : 'bg-muted/50'
                  } ${faltaOperario && seleccionada ? 'border-destructive' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-tight">{it.nombre}</span>
                    <Button
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => carrito && quitarItem(carrito.id, it.productoId)}
                      aria-label={`Quitar ${it.nombre}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!esServicio(it.tipo) ? (
                      <div className="flex items-center border rounded-md h-8 bg-card">
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => carrito && cambiarCantidad(carrito.id, it.productoId, it.cantidad - 1)}
                          aria-label="Restar"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm num-tabular">{it.cantidad}</span>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          disabled={it.cantidad >= it.stock}
                          onClick={() => carrito && cambiarCantidad(carrito.id, it.productoId, it.cantidad + 1)}
                          aria-label="Sumar"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">servicio ×1</Badge>
                    )}
                    <div className="flex items-center gap-1">
                      <Input
                        ref={(el) => {
                          preciosRefs.current[it.productoId] = el
                        }}
                        className="w-24 h-8 text-sm num-tabular"
                        value={it.precio}
                        inputMode="decimal"
                        onChange={(e) => {
                          const v = parseFloat(e.target.value)
                          if (isFinite(v) && v >= 0 && carrito) cambiarPrecio(carrito.id, it.productoId, v)
                        }}
                        onFocus={() => setLineaSel(i)}
                        aria-label={`Precio de ${it.nombre} (Ctrl+E)`}
                      />
                      <span className="text-xs text-muted-foreground">{it.moneda}</span>
                    </div>
                    <span className="ml-auto text-sm font-semibold num-tabular">{fmt(subtotal)} CUP</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={it.operarioId ?? ''}
                      onValueChange={(v) =>
                        carrito && asignarOperario(carrito.id, it.productoId, v === '__ninguno__' ? null : v)
                      }
                    >
                      <SelectTrigger
                        className={`h-8 text-xs flex-1 ${faltaOperario ? 'border-destructive text-destructive' : ''}`}
                        aria-label={`Operario de ${it.nombre}`}
                      >
                        <SelectValue placeholder={faltaOperario ? 'Operario (obligatorio)' : 'Operario…'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__ninguno__">— Sin operario —</SelectItem>
                        {operarios.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {it.precio !== it.precioOriginal && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-warning border-warning/50"
                        title={`Precio original: ${it.precioOriginal}`}
                      >
                        precio editado
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Toque un producto o escanee su código de barras.
              </p>
            )}
          </div>

          {/* Totales */}
          <div className="rounded-lg border bg-card p-2.5 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-lg num-tabular">{fmtCUP(totales.cup)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground num-tabular">
              <span>Equivalente</span>
              <span>{fmt(totales.usd)} USD</span>
            </div>
          </div>

          <Button
            className="w-full h-12 text-base font-semibold bg-brand-red hover:bg-brand-red-hover"
            onClick={abrirCobro}
            disabled={!carrito || items.length === 0}
            aria-label="Cobrar (F9)"
          >
            <CreditCard className="h-5 w-5 mr-2" />
            Cobrar · {fmtCUP(totales.cup)}
            <Kbd className="ml-2 border-white/40 bg-white/15 text-white">F9</Kbd>
          </Button>
        </CardContent>
      </Card>

      {/* ==================== MODAL CLIENTE (F8) ==================== */}
      <Dialog open={modalCliente} onOpenChange={setModalCliente}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar cliente</DialogTitle>
            <DialogDescription>Busque por nombre, teléfono o CI, o cree uno nuevo (se permiten homónimos).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Buscar por nombre, teléfono o CI…"
                value={busqCliente}
                onChange={(e) => setBusqCliente(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    buscarClientes(busqCliente)
                  }
                }}
                aria-label="Buscar cliente"
              />
              <Button variant="outline" onClick={() => buscarClientes(busqCliente)}>
                Buscar
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
              {resultadosCliente.map((c) => (
                <button
                  key={c.id}
                  className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                  onClick={() => {
                    if (carrito) setCliente(carrito.id, { id: c.id, nombre: c.nombre })
                    setModalCliente(false)
                  }}
                >
                  <span className="font-medium">{c.nombre}</span>
                  <span className="text-muted-foreground text-xs ml-2">
                    {c.telefono ?? ''} {c.ci ? `· CI ${c.ci}` : ''}
                  </span>
                </button>
              ))}
              {resultadosCliente.length === 0 && (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                  Sin resultados. Puede crear el cliente abajo (los homónimos están permitidos).
                </p>
              )}
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">Crear nuevo cliente</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label htmlFor="cli-nombre">Nombre</Label>
                  <Input
                    id="cli-nombre"
                    value={nuevoCliente.nombre}
                    onChange={(e) => setNuevoCliente((c) => ({ ...c, nombre: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="cli-tel">Teléfono</Label>
                  <Input
                    id="cli-tel"
                    value={nuevoCliente.telefono}
                    onChange={(e) => setNuevoCliente((c) => ({ ...c, telefono: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="cli-ci">CI</Label>
                  <Input id="cli-ci" value={nuevoCliente.ci} onChange={(e) => setNuevoCliente((c) => ({ ...c, ci: e.target.value }))} />
                </div>
              </div>
              <Button className="w-full bg-brand-red hover:bg-brand-red-hover" onClick={crearCliente}>
                Crear y asignar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL DE COBRO (F9 / Enter confirma) ==================== */}
      <Dialog open={modalCobro} onOpenChange={setModalCobro}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cobrar venta</DialogTitle>
            <DialogDescription>
              Puede registrar varios pagos mezclando métodos y monedas. <Kbd>Enter</Kbd> confirma la venta.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmarVenta} className="space-y-3">
            {/* Resumen */}
            <div className="rounded-lg border bg-muted/50 p-3 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {items.length} {items.length === 1 ? 'línea' : 'líneas'}
                {carrito?.clienteNombre ? ` · ${carrito.clienteNombre}` : ' · Consumidor final'}
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-brand-red num-tabular leading-none">{fmtCUP(totales.cup)}</div>
                <div className="text-xs text-muted-foreground num-tabular">≈ {fmt(totales.usd)} USD</div>
              </div>
            </div>

            {/* Pagos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-1">
                  <CreditCard className="h-4 w-4" aria-hidden /> Pagos
                </span>
                <Button type="button" size="sm" variant="outline" onClick={agregarPago}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Pago
                </Button>
              </div>
              {pagosActivos.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-center">
                  <Select
                    value={p.metodo}
                    onValueChange={(v) => actualizarPago(i, { metodo: v, ...(v === 'ZELLE' ? { moneda: 'USD' } : {}) })}
                  >
                    <SelectTrigger className="h-8 text-xs" aria-label="Método de pago">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METODOS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {METODO_PAGO_LABEL[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={p.moneda} onValueChange={(v) => actualizarPago(i, { moneda: v })} disabled={p.metodo === 'ZELLE'}>
                    <SelectTrigger className="h-8 text-xs" aria-label="Moneda del pago">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONEDAS.map((m) => (
                        <SelectItem key={m} value={m} disabled={p.metodo === 'ZELLE' && m !== 'USD'}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 text-xs num-tabular"
                    inputMode="decimal"
                    value={p.monto}
                    placeholder="Monto"
                    onChange={(e) => actualizarPago(i, { monto: e.target.value })}
                    aria-label="Monto del pago"
                    required={i === 0}
                    autoFocus={i === 0}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => quitarPago(i)}
                    aria-label="Quitar pago"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  {p.metodo === 'ZELLE' && (
                    <Input
                      className="h-8 text-xs col-span-4"
                      value={p.referencia}
                      placeholder="Referencia Zelle (obligatoria)"
                      onChange={(e) => actualizarPago(i, { referencia: e.target.value })}
                      aria-label="Referencia Zelle"
                    />
                  )}
                </div>
              ))}
              {pagosActivos.length > 0 && (
                <div className="flex justify-between text-sm border-t pt-1.5 num-tabular">
                  <span className="text-muted-foreground">Cubierto</span>
                  <span className={faltante > 0.001 ? 'text-destructive font-semibold' : 'text-success font-semibold'}>
                    {fmt(cubierto)} CUP {faltante > 0.001 ? `(faltan ${fmt(faltante)})` : cambio > 0.001 ? `· cambio ${fmt(cambio)}` : '✓'}
                  </span>
                </div>
              )}
              {itemsInvalidos.length > 0 && (
                <p className="text-xs text-destructive">
                  Hay líneas inválidas: servicios sin operario o cantidad mayor que el stock.
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setModalCobro(false)} disabled={confirmando}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="h-10 px-6 font-semibold bg-brand-red hover:bg-brand-red-hover"
                disabled={confirmando || items.length === 0}
              >
                {confirmando && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirmando ? 'Registrando…' : 'Confirmar venta'}
                <Kbd className="ml-2 border-white/40 bg-white/15 text-white">Enter</Kbd>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL TICKET ==================== */}
      <Dialog open={!!ticketData} onOpenChange={(o) => !o && setTicketData(null)}>
        <DialogContent className="max-w-fit p-0 overflow-auto bg-muted border-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Ticket de venta</DialogTitle>
            <DialogDescription>Vista previa imprimible del ticket de la venta registrada.</DialogDescription>
          </DialogHeader>
          <div className="p-4 max-h-[80vh] overflow-auto">
            {ticketData && (
              <div className="bg-white shadow-lg rounded-sm text-black" style={{ width: `${ticketData.ajustes.ticketAncho ?? '58'}mm` }}>
                <TicketVenta
                  data={{
                    codigo: ticketData.venta.codigo,
                    fecha: ticketData.venta.fecha,
                    taller: ticketData.venta.taller,
                    cliente: ticketData.venta.cliente?.nombre ?? null,
                    vendedor: ticketData.venta.vendedor.nombre,
                    items: ticketData.venta.items.map((i) => ({
                      nombre: i.producto.nombre,
                      cantidad: i.cantidad,
                      precio: i.precioUnitario,
                      moneda: i.monedaPrecio,
                      subtotalCUP: i.subtotalCUP,
                      operario: i.operario?.nombre ?? null,
                    })),
                    totalCUP: ticketData.venta.totalCUP,
                    pagos: ticketData.venta.pagos.map((p) => ({
                      metodo: METODO_PAGO_LABEL[p.metodo] ?? p.metodo,
                      moneda: p.moneda,
                      monto: p.monto,
                      montoCUP: p.montoCUP,
                      referencia: p.referencia,
                    })),
                    encabezado: ticketData.ajustes.ticketEncabezado,
                    pie: ticketData.ajustes.ticketPie,
                    ancho: ticketData.ajustes.ticketAncho ?? '58',
                  }}
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-center p-3 bg-card border-t">
            <Button onClick={() => window.print()} autoFocus className="bg-brand-red hover:bg-brand-red-hover">
              <Printer className="h-4 w-4 mr-2" /> Imprimir ticket <Kbd className="ml-2 border-white/40 bg-white/15 text-white">Enter</Kbd>
            </Button>
            <Button variant="outline" onClick={() => setTicketData(null)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
