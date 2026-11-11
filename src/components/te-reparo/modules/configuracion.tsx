'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Plus, Pencil, KeyRound, Download, Save, FileText, Eye } from 'lucide-react'
import { api, descargar } from '@/lib/api-client'
import { useApp } from '@/lib/store'
import { fmt, fmtFechaHora, ROL_LABEL, RAMA_LABEL } from '@/lib/formato'
import { VARIABLES_PLANTILLA, CONTEXTO_MOCK, variablesUsadas } from '@/lib/plantillas'
import { useGuardarConCtrlS } from '@/hooks/use-ctrl-s'
import { usePaginacion } from '@/hooks/use-paginacion'
import { TablePagination, FilasEsqueleto } from '../table-pagination'
import { Kbd } from '../kbd'
import { TicketPlantilla } from '../ticket'

interface Taller { id: string; nombre: string; direccion: string; telefono: string; activo: boolean }
interface Usuario {
  id: string
  nombre: string
  username: string
  rol: string
  tallerId: string | null
  operarioId: string | null
  activo: boolean
}
interface Operario {
  id: string
  nombre: string
  rama: string
  activo: boolean
  talleres: Array<{ tallerId: string }>
}
interface Tasa { id: string; moneda: string; valorCUP: number; fechaVigencia: string; usuario: { username: string } | null }
interface Plantilla {
  id: string
  nombre: string
  contenido: string
  activo: boolean
  usos: number
  createdAt: string
  updatedAt: string
}

const ROLES = ['ADMIN', 'VENDEDOR', 'VENDEDOR_ONLINE']
const RAMAS = ['VENDEDOR', 'INFORMATICO', 'ELECTRONICO', 'ADMIN']

export function Configuracion() {
  const setAjustesGlobal = useApp((s) => s.setAjustes)
  const ajustesGlobal = useApp((s) => s.ajustes)

  const [tab, setTab] = useState('talleres')
  const [talleres, setTalleres] = useState<Taller[]>([])
  // Operarios de referencia (lista completa con tope) para los selects de
  // formularios; la tabla usa su copia paginada (ver abajo).
  const [operarios, setOperarios] = useState<Operario[]>([])
  const [tasas, setTasas] = useState<Tasa[]>([])
  const [tasasVigentes, setTasasVigentes] = useState({ USD: 0, EUR: 0 })
  const [formAjustes, setFormAjustes] = useState({
    ticketAncho: ajustesGlobal.ticketAncho ?? '58',
    ticketEncabezado: ajustesGlobal.ticketEncabezado ?? '',
    ticketPie: ajustesGlobal.ticketPie ?? '',
    porcentajeAdmin: ajustesGlobal.porcentajeAdmin ?? '0',
  })

  const [modalTaller, setModalTaller] = useState(false)
  const [tallerEdit, setTallerEdit] = useState<{ id: string | null; datos: { nombre: string; direccion: string; telefono: string; activo: boolean } }>({ id: null, datos: { nombre: '', direccion: '', telefono: '', activo: true } })

  const [modalUsuario, setModalUsuario] = useState(false)
  const [usuarioEdit, setUsuarioEdit] = useState<{
    id: string | null
    datos: { nombre: string; username: string; password: string; rol: string; tallerId: string; operarioId: string; activo: boolean }
  }>({ id: null, datos: { nombre: '', username: '', password: '', rol: 'VENDEDOR', tallerId: '', operarioId: '', activo: true } })

  const [modalOperario, setModalOperario] = useState(false)
  const [operarioEdit, setOperarioEdit] = useState<{ id: string | null; datos: { nombre: string; rama: string; activo: boolean; tallerIds: string[] } }>({ id: null, datos: { nombre: '', rama: 'VENDEDOR', activo: true, tallerIds: [] } })

  const [formTasas, setFormTasas] = useState({ USD: '', EUR: '' })
  const [modalPassword, setModalPassword] = useState(false)
  const [formPassword, setFormPassword] = useState({ usuarioId: '', username: '', password: '' })

  // ---------- Plantillas de Tickets (PROMPT DE ACTUALIZACIÓN §4) ----------
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [modalPlantilla, setModalPlantilla] = useState(false)
  const [modalPreview, setModalPreview] = useState(false)
  const [plantillaEdit, setPlantillaEdit] = useState<{
    id: string | null
    datos: { nombre: string; contenido: string; activo: boolean }
  }>({ id: null, datos: { nombre: '', contenido: '', activo: true } })
  const contenidoRef = useRef<HTMLTextAreaElement>(null)

  // ---------- Paginación de las tablas Usuarios / Operarios (§6.5) ----------
  // El listado de la tabla se pagina en el servidor (?page=&limit=); los
  // selects de los formularios siguen usando listas de referencia completas.
  const pagU = usePaginacion('cfgu')
  const { params: pagUParams, fijarMeta: fijarMetaU } = pagU
  const [usuariosPag, setUsuariosPag] = useState<Usuario[]>([])
  const [cargandoUsuarios, setCargandoUsuarios] = useState(true)

  const pagO = usePaginacion('cfgo')
  const { params: pagOParams, fijarMeta: fijarMetaO } = pagO
  const [operariosPag, setOperariosPag] = useState<Operario[]>([])
  const [cargandoOperarios, setCargandoOperarios] = useState(true)

  const cargarUsuariosPag = useCallback(async () => {
    setCargandoUsuarios(true)
    try {
      const params = new URLSearchParams()
      params.set('page', pagUParams.get('page') ?? '1')
      params.set('limit', pagUParams.get('limit') ?? '25')
      const res = await api.get<{ usuarios: Usuario[]; total: number; totalPages: number }>(`/api/usuarios?${params}`)
      setUsuariosPag(res.usuarios)
      fijarMetaU(res.total)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar usuarios')
    } finally {
      setCargandoUsuarios(false)
    }
  }, [pagUParams, fijarMetaU])

  const cargarOperariosPag = useCallback(async () => {
    setCargandoOperarios(true)
    try {
      const params = new URLSearchParams()
      params.set('page', pagOParams.get('page') ?? '1')
      params.set('limit', pagOParams.get('limit') ?? '25')
      const res = await api.get<{ operarios: Operario[]; total: number; totalPages: number }>(`/api/operarios?${params}`)
      setOperariosPag(res.operarios)
      fijarMetaO(res.total)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar operarios')
    } finally {
      setCargandoOperarios(false)
    }
  }, [pagOParams, fijarMetaO])

  useEffect(() => {
    cargarUsuariosPag()
  }, [cargarUsuariosPag])

  useEffect(() => {
    cargarOperariosPag()
  }, [cargarOperariosPag])

  const cargarTodo = useCallback(async () => {
    try {
      const [rTalleres, rOperarios, rTasas, rPlantillas] = await Promise.all([
        api.get<{ talleres: Taller[] }>('/api/talleres'),
        api.get<{ operarios: Operario[] }>('/api/operarios'),
        api.get<{ tasas: { USD: number; EUR: number }; historial: Tasa[] }>('/api/tasas'),
        api.get<{ plantillas: Plantilla[] }>('/api/plantillas?todas=true'),
      ])
      setTalleres(rTalleres.talleres)
      setOperarios(rOperarios.operarios)
      setTasas(rTasas.historial)
      setTasasVigentes(rTasas.tasas)
      setFormTasas({ USD: String(rTasas.tasas.USD), EUR: String(rTasas.tasas.EUR) })
      setPlantillas(rPlantillas.plantillas)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar configuración')
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      await cargarTodo()
    })()
  }, [cargarTodo])

  // ---------- Talleres ----------
  async function guardarTaller() {
    const d = tallerEdit.datos
    if (d.nombre.trim().length < 2) return toast.error('Nombre muy corto')
    try {
      if (tallerEdit.id) {
        await api.patch(`/api/talleres?id=${tallerEdit.id}`, d)
        toast.success('Taller actualizado')
      } else {
        await api.post('/api/talleres', d)
        toast.success('Taller creado')
      }
      setModalTaller(false)
      cargarTodo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  // ---------- Usuarios ----------
  async function guardarUsuario() {
    const d = usuarioEdit.datos
    if (d.nombre.trim().length < 2 || d.username.trim().length < 3) return toast.error('Complete nombre y usuario')
    if (!usuarioEdit.id && d.password.length < 6) return toast.error('Contraseña: mínimo 6 caracteres')
    if (d.rol === 'VENDEDOR' && !d.tallerId) return toast.error('Un VENDEDOR necesita taller asignado')
    if (d.rol === 'VENDEDOR' && !d.operarioId) return toast.error('Un VENDEDOR debe estar vinculado a un operario')
    try {
      const cuerpo: Record<string, unknown> = {
        nombre: d.nombre.trim(),
        username: d.username.trim(),
        rol: d.rol,
        tallerId: d.rol === 'VENDEDOR' ? d.tallerId : null,
        operarioId: d.operarioId || null,
        activo: d.activo,
      }
      if (usuarioEdit.id) {
        if (d.password) cuerpo.password = d.password
        await api.patch(`/api/usuarios?id=${usuarioEdit.id}`, cuerpo)
        toast.success('Usuario actualizado')
      } else {
        cuerpo.password = d.password
        await api.post('/api/usuarios', cuerpo)
        toast.success('Usuario creado')
      }
      setModalUsuario(false)
      cargarUsuariosPag() // refresca la tabla SIN volver a la página 1 (§5)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  function abrirResetPassword(u: Usuario) {
    setFormPassword({ usuarioId: u.id, username: u.username, password: '' })
    setModalPassword(true)
  }

  async function confirmarResetPassword() {
    if (formPassword.password.length < 6) return toast.error('Mínimo 6 caracteres')
    try {
      await api.post('/api/auth/cambiar-password', { usuarioId: formPassword.usuarioId, passwordNueva: formPassword.password })
      toast.success('Contraseña actualizada')
      setModalPassword(false)
      setFormPassword({ usuarioId: '', username: '', password: '' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  // ---------- Operarios ----------
  async function guardarOperario() {
    const d = operarioEdit.datos
    if (d.nombre.trim().length < 2) return toast.error('Nombre muy corto')
    try {
      const cuerpo = { nombre: d.nombre.trim(), rama: d.rama, activo: d.activo, tallerIds: d.tallerIds }
      if (operarioEdit.id) {
        await api.patch(`/api/operarios?id=${operarioEdit.id}`, cuerpo)
        toast.success('Operario actualizado')
      } else {
        await api.post('/api/operarios', cuerpo)
        toast.success('Operario creado')
      }
      setModalOperario(false)
      cargarOperariosPag() // refresca la tabla SIN volver a la página 1 (§5)
      cargarTodo() // refresca la lista de referencia de los selects
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  // ---------- Tasas ----------
  async function actualizarTasa(moneda: 'USD' | 'EUR') {
    const v = parseFloat(formTasas[moneda])
    if (!isFinite(v) || v <= 0) return toast.error('Tasa inválida')
    try {
      await api.post('/api/tasas', { moneda, valorCUP: v })
      toast.success(`Tasa ${moneda} actualizada`)
      cargarTodo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  // ---------- Ajustes ----------
  async function guardarAjustes() {
    try {
      await api.patch('/api/ajustes', {
        ticketAncho: formAjustes.ticketAncho as '58' | '80',
        ticketEncabezado: formAjustes.ticketEncabezado,
        ticketPie: formAjustes.ticketPie,
        porcentajeAdmin: parseFloat(formAjustes.porcentajeAdmin || '0'),
      })
      const r = await api.get<{ ajustes: Record<string, string> }>('/api/ajustes')
      setAjustesGlobal(r.ajustes)
      toast.success('Ajustes guardados')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  // ---------- Plantillas de Tickets ----------
  async function guardarPlantilla() {
    const d = plantillaEdit.datos
    if (d.nombre.trim().length < 2) return toast.error('Nombre muy corto')
    if (d.contenido.trim().length < 3) return toast.error('Escriba el contenido de la plantilla')
    try {
      if (plantillaEdit.id) {
        await api.patch(`/api/plantillas?id=${plantillaEdit.id}`, {
          nombre: d.nombre.trim(),
          contenido: d.contenido,
          activo: d.activo,
        })
        toast.success('Plantilla actualizada')
      } else {
        await api.post('/api/plantillas', {
          nombre: d.nombre.trim(),
          contenido: d.contenido,
          activo: d.activo,
        })
        toast.success('Plantilla creada')
      }
      setModalPlantilla(false)
      cargarTodo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  /** Inserta una variable {{...}} en el cursor del textarea (o al final). */
  function insertarVariable(variable: string) {
    const el = contenidoRef.current
    const contenido = plantillaEdit.datos.contenido
    if (!el) {
      setPlantillaEdit((p) => ({ ...p, datos: { ...p.datos, contenido: p.datos.contenido + variable } }))
      return
    }
    const ini = el.selectionStart ?? contenido.length
    const fin = el.selectionEnd ?? ini
    const nuevo = contenido.slice(0, ini) + variable + contenido.slice(fin)
    setPlantillaEdit((p) => ({ ...p, datos: { ...p.datos, contenido: nuevo } }))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(ini + variable.length, ini + variable.length)
    })
  }

  /** Activa/desactiva una plantilla (los VENTA ya impresos guardan su copia). */
  async function alternarPlantilla(p: Plantilla) {
    try {
      await api.patch(`/api/plantillas?id=${p.id}`, { activo: !p.activo })
      setPlantillas((ps) => ps.map((x) => (x.id === p.id ? { ...x, activo: !x.activo } : x)))
      toast.success(!p.activo ? 'Plantilla activada' : 'Plantilla desactivada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  // Ctrl+S guarda el formulario/modal abierto (o la pestaña de ajustes)
  useGuardarConCtrlS(
    () => {
      if (modalTaller) guardarTaller()
      else if (modalUsuario) guardarUsuario()
      else if (modalOperario) guardarOperario()
      else if (modalPassword) confirmarResetPassword()
      else if (modalPlantilla) guardarPlantilla()
      else if (tab === 'ajustes') guardarAjustes()
    },
    modalTaller || modalUsuario || modalOperario || modalPassword || modalPlantilla || tab === 'ajustes'
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">Configuración</h1>
        <Button
          variant="outline"
          onClick={() => descargar('/api/backup', `te-reparo-backup-${new Date().toISOString().slice(0, 10)}.json`).catch((e) => toast.error(e.message))}
        >
          <Download className="h-4 w-4 mr-1" /> Exportar respaldo (JSON)
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="talleres">Talleres</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="operarios">Operarios</TabsTrigger>
          <TabsTrigger value="tasas">Tasas de cambio</TabsTrigger>
          <TabsTrigger value="plantillas">Plantillas de Tickets</TabsTrigger>
          <TabsTrigger value="ajustes">Ticket y ajustes</TabsTrigger>
        </TabsList>

        {/* ============ TALLERES ============ */}
        <TabsContent value="talleres" className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                setTallerEdit({ id: null, datos: { nombre: '', direccion: '', telefono: '', activo: true } })
                setModalTaller(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Nuevo taller
            </Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Dirección</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {talleres.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.nombre}</TableCell>
                      <TableCell className="text-sm">{t.direccion || '—'}</TableCell>
                      <TableCell className="text-sm">{t.telefono || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={t.activo ? 'default' : 'destructive'} className="text-xs">
                          {t.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setTallerEdit({
                              id: t.id,
                              datos: { nombre: t.nombre, direccion: t.direccion, telefono: t.telefono, activo: t.activo },
                            })
                            setModalTaller(true)
                          }}
                          aria-label={`Editar ${t.nombre}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ USUARIOS ============ */}
        <TabsContent value="usuarios" className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                setUsuarioEdit({
                  id: null,
                  datos: { nombre: '', username: '', password: '', rol: 'VENDEDOR', tallerId: talleres[0]?.id ?? '', operarioId: '', activo: true },
                })
                setModalUsuario(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Nuevo usuario
            </Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Taller</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cargandoUsuarios && <FilasEsqueleto columnas={6} />}
                  {!cargandoUsuarios && usuariosPag.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono font-medium">{u.username}</TableCell>
                      <TableCell>{u.nombre}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{ROL_LABEL[u.rol] ?? u.rol}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{talleres.find((t) => t.id === u.tallerId)?.nombre ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={u.activo ? 'default' : 'destructive'} className="text-xs">
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Restablecer contraseña (solo ADMIN)" onClick={() => abrirResetPassword(u)} aria-label={`Contraseña de ${u.username}`}>
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setUsuarioEdit({
                                id: u.id,
                                datos: {
                                  nombre: u.nombre,
                                  username: u.username,
                                  password: '',
                                  rol: u.rol,
                                  tallerId: u.tallerId ?? '',
                                  operarioId: u.operarioId ?? '',
                                  activo: u.activo,
                                },
                              })
                              setModalUsuario(true)
                            }}
                            aria-label={`Editar ${u.username}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!cargandoUsuarios && usuariosPag.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin usuarios.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
            <div className="border-t">
              <TablePagination
                pagina={pagU.pagina}
                totalPaginas={pagU.totalPaginas}
                total={pagU.total}
                limite={pagU.limite}
                cargando={cargandoUsuarios}
                onCambiarPagina={pagU.cambiarPagina}
                onCambiarLimite={pagU.cambiarLimite}
              />
            </div>
          </Card>
        </TabsContent>

        {/* ============ OPERARIOS ============ */}
        <TabsContent value="operarios" className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                setOperarioEdit({ id: null, datos: { nombre: '', rama: 'VENDEDOR', activo: true, tallerIds: [] } })
                setModalOperario(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Nuevo operario
            </Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Rama</TableHead>
                    <TableHead>Talleres asignados</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cargandoOperarios && <FilasEsqueleto columnas={5} />}
                  {!cargandoOperarios &&
                    operariosPag.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.nombre}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{RAMA_LABEL[o.rama] ?? o.rama}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {o.talleres.map((t) => talleres.find((x) => x.id === t.tallerId)?.nombre ?? t.tallerId).join(', ') || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={o.activo ? 'default' : 'destructive'} className="text-xs">
                          {o.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setOperarioEdit({
                              id: o.id,
                              datos: { nombre: o.nombre, rama: o.rama, activo: o.activo, tallerIds: o.talleres.map((t) => t.tallerId) },
                            })
                            setModalOperario(true)
                          }}
                          aria-label={`Editar ${o.nombre}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!cargandoOperarios && operariosPag.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin operarios.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
            <div className="border-t">
              <TablePagination
                pagina={pagO.pagina}
                totalPaginas={pagO.totalPaginas}
                total={pagO.total}
                limite={pagO.limite}
                cargando={cargandoOperarios}
                onCambiarPagina={pagO.cambiarPagina}
                onCambiarLimite={pagO.cambiarLimite}
              />
            </div>
          </Card>
        </TabsContent>

        {/* ============ TASAS ============ */}
        <TabsContent value="tasas" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tasas vigentes (hacia CUP)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 items-end">
              <div>
                <Label htmlFor="tasa-usd">USD → CUP (vigente: {fmt(tasasVigentes.USD)})</Label>
                <div className="flex gap-2">
                  <Input id="tasa-usd" className="w-32" inputMode="decimal" value={formTasas.USD} onChange={(e) => setFormTasas((f) => ({ ...f, USD: e.target.value }))} />
                  <Button size="sm" variant="outline" onClick={() => actualizarTasa('USD')}>Actualizar</Button>
                </div>
              </div>
              <div>
                <Label htmlFor="tasa-eur">EUR → CUP (vigente: {fmt(tasasVigentes.EUR)})</Label>
                <div className="flex gap-2">
                  <Input id="tasa-eur" className="w-32" inputMode="decimal" value={formTasas.EUR} onChange={(e) => setFormTasas((f) => ({ ...f, EUR: e.target.value }))} />
                  <Button size="sm" variant="outline" onClick={() => actualizarTasa('EUR')}>Actualizar</Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Historial</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Moneda</TableHead>
                    <TableHead className="text-right">Valor CUP</TableHead>
                    <TableHead>Vigencia</TableHead>
                    <TableHead>Actualizado por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasas.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.moneda}</TableCell>
                      <TableCell className="text-right">{fmt(t.valorCUP)}</TableCell>
                      <TableCell className="text-xs">{fmtFechaHora(t.fechaVigencia)}</TableCell>
                      <TableCell className="text-xs">{t.usuario?.username ?? 'sistema'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ PLANTILLAS DE TICKETS ============ */}
        <TabsContent value="plantillas" className="space-y-3">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <p className="text-sm text-muted-foreground max-w-xl">
              Texto de los tickets con variables <code className="text-xs">{'{{...}}'}</code> que se reemplazan al
              imprimir con los datos reales de la venta. Si el vendedor no elige ninguna, se usa el diseño por
              defecto del sistema.
            </p>
            <Button
              size="sm"
              onClick={() => {
                setPlantillaEdit({ id: null, datos: { nombre: '', contenido: '', activo: true } })
                setModalPlantilla(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Nueva plantilla
            </Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Variables</TableHead>
                    <TableHead className="text-right">Usos (ventas)</TableHead>
                    <TableHead>Actualizada</TableHead>
                    <TableHead>Activa</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plantillas.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-brand-red shrink-0" aria-hidden />
                          {p.nombre}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {variablesUsadas(p.contenido).length} usadas
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right num-tabular">{p.usos}</TableCell>
                      <TableCell className="text-xs">{fmtFechaHora(p.updatedAt)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={p.activo}
                          onCheckedChange={() => alternarPlantilla(p)}
                          aria-label={`Activar o desactivar ${p.nombre}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Vista previa con datos de prueba"
                            onClick={() => {
                              setPlantillaEdit({ id: p.id, datos: { nombre: p.nombre, contenido: p.contenido, activo: p.activo } })
                              setModalPreview(true)
                            }}
                            aria-label={`Vista previa de ${p.nombre}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setPlantillaEdit({ id: p.id, datos: { nombre: p.nombre, contenido: p.contenido, activo: p.activo } })
                              setModalPlantilla(true)
                            }}
                            aria-label={`Editar ${p.nombre}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {plantillas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Sin plantillas. Cree la primera («Recepción de Equipo», «Venta de Accesorio»…).
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ AJUSTES ============ */}
        <TabsContent value="ajustes" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ticket de venta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-w-md">
              <div>
                <Label htmlFor="aj-ancho">Ancho del ticket</Label>
                <Select value={formAjustes.ticketAncho} onValueChange={(v) => setFormAjustes((f) => ({ ...f, ticketAncho: v }))}>
                  <SelectTrigger id="aj-ancho">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58">58 mm</SelectItem>
                    <SelectItem value="80">80 mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="aj-enc">Encabezado (opcional)</Label>
                <Input id="aj-enc" value={formAjustes.ticketEncabezado} onChange={(e) => setFormAjustes((f) => ({ ...f, ticketEncabezado: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="aj-pie">Pie (opcional)</Label>
                <Input id="aj-pie" value={formAjustes.ticketPie} onChange={(e) => setFormAjustes((f) => ({ ...f, ticketPie: e.target.value }))} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Porcentaje del admin</CardTitle>
            </CardHeader>
            <CardContent className="max-w-md space-y-2">
              <div>
                <Label htmlFor="aj-pct">porcentajeAdmin (%) — pago = % × total vendido del taller</Label>
                <Input id="aj-pct" inputMode="decimal" value={formAjustes.porcentajeAdmin} onChange={(e) => setFormAjustes((f) => ({ ...f, porcentajeAdmin: e.target.value }))} />
              </div>
              <p className="text-xs text-muted-foreground">
                El admin se registra como operario de rama ADMIN; su línea aparece en la liquidación diaria.
              </p>
            </CardContent>
          </Card>
          <Button onClick={guardarAjustes} className="bg-brand-red hover:bg-brand-red-hover">
            <Save className="h-4 w-4 mr-1" /> Guardar ajustes <Kbd className="ml-2 border-white/40 bg-white/15 text-white">Ctrl</Kbd>+<Kbd className="border-white/40 bg-white/15 text-white">S</Kbd>
          </Button>
        </TabsContent>
      </Tabs>

      {/* ============ Modales ============ */}
      <Dialog open={modalTaller} onOpenChange={setModalTaller}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tallerEdit.id ? 'Editar taller' : 'Nuevo taller'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="t-nombre">Nombre</Label>
              <Input id="t-nombre" value={tallerEdit.datos.nombre} onChange={(e) => setTallerEdit((t) => ({ ...t, datos: { ...t.datos, nombre: e.target.value } }))} />
            </div>
            <div>
              <Label htmlFor="t-dir">Dirección</Label>
              <Input id="t-dir" value={tallerEdit.datos.direccion} onChange={(e) => setTallerEdit((t) => ({ ...t, datos: { ...t.datos, direccion: e.target.value } }))} />
            </div>
            <div>
              <Label htmlFor="t-tel">Teléfono</Label>
              <Input id="t-tel" value={tallerEdit.datos.telefono} onChange={(e) => setTallerEdit((t) => ({ ...t, datos: { ...t.datos, telefono: e.target.value } }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="t-activo"
                checked={tallerEdit.datos.activo}
                onCheckedChange={(v) => setTallerEdit((t) => ({ ...t, datos: { ...t.datos, activo: v } }))}
              />
              <Label htmlFor="t-activo">Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalTaller(false)}>Cancelar</Button>
            <Button onClick={guardarTaller} className="bg-brand-red hover:bg-brand-red-hover">
              Guardar <Kbd className="ml-2 border-white/40 bg-white/15 text-white">Ctrl</Kbd>+<Kbd className="border-white/40 bg-white/15 text-white">S</Kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalUsuario} onOpenChange={setModalUsuario}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{usuarioEdit.id ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="u-nombre">Nombre completo</Label>
              <Input id="u-nombre" value={usuarioEdit.datos.nombre} onChange={(e) => setUsuarioEdit((u) => ({ ...u, datos: { ...u.datos, nombre: e.target.value } }))} />
            </div>
            <div>
              <Label htmlFor="u-username">Usuario (acceso)</Label>
              <Input id="u-username" value={usuarioEdit.datos.username} onChange={(e) => setUsuarioEdit((u) => ({ ...u, datos: { ...u.datos, username: e.target.value } }))} />
            </div>
            <div>
              <Label htmlFor="u-pass">{usuarioEdit.id ? 'Contraseña (dejar vacía para no cambiar)' : 'Contraseña'}</Label>
              <Input id="u-pass" type="password" value={usuarioEdit.datos.password} onChange={(e) => setUsuarioEdit((u) => ({ ...u, datos: { ...u.datos, password: e.target.value } }))} />
            </div>
            <div>
              <Label htmlFor="u-rol">Rol</Label>
              <Select value={usuarioEdit.datos.rol} onValueChange={(v) => setUsuarioEdit((u) => ({ ...u, datos: { ...u.datos, rol: v } }))}>
                <SelectTrigger id="u-rol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROL_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {usuarioEdit.datos.rol === 'VENDEDOR' && (
              <>
                <div>
                  <Label htmlFor="u-taller">Taller asignado</Label>
                  <Select value={usuarioEdit.datos.tallerId} onValueChange={(v) => setUsuarioEdit((u) => ({ ...u, datos: { ...u.datos, tallerId: v } }))}>
                    <SelectTrigger id="u-taller">
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                    <SelectContent>
                      {talleres.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="u-operario">Operario vinculado</Label>
                  <Select value={usuarioEdit.datos.operarioId} onValueChange={(v) => setUsuarioEdit((u) => ({ ...u, datos: { ...u.datos, operarioId: v } }))}>
                    <SelectTrigger id="u-operario">
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                    <SelectContent>
                      {operarios.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.nombre} ({RAMA_LABEL[o.rama] ?? o.rama})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="u-activo"
                checked={usuarioEdit.datos.activo}
                onCheckedChange={(v) => setUsuarioEdit((u) => ({ ...u, datos: { ...u.datos, activo: v } }))}
              />
              <Label htmlFor="u-activo">Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalUsuario(false)}>Cancelar</Button>
            <Button onClick={guardarUsuario} className="bg-brand-red hover:bg-brand-red-hover">
              Guardar <Kbd className="ml-2 border-white/40 bg-white/15 text-white">Ctrl</Kbd>+<Kbd className="border-white/40 bg-white/15 text-white">S</Kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalOperario} onOpenChange={setModalOperario}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{operarioEdit.id ? 'Editar operario' : 'Nuevo operario'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="o-nombre">Nombre</Label>
              <Input id="o-nombre" value={operarioEdit.datos.nombre} onChange={(e) => setOperarioEdit((o) => ({ ...o, datos: { ...o.datos, nombre: e.target.value } }))} />
            </div>
            <div>
              <Label htmlFor="o-rama">Rama</Label>
              <Select value={operarioEdit.datos.rama} onValueChange={(v) => setOperarioEdit((o) => ({ ...o, datos: { ...o.datos, rama: v } }))}>
                <SelectTrigger id="o-rama">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RAMAS.map((r) => (
                    <SelectItem key={r} value={r}>{RAMA_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Talleres asignados (rotación N:M)</Label>
              <div className="space-y-1.5 border rounded-lg p-2 max-h-40 overflow-y-auto">
                {talleres.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={operarioEdit.datos.tallerIds.includes(t.id)}
                      onChange={(e) =>
                        setOperarioEdit((o) => ({
                          ...o,
                          datos: {
                            ...o.datos,
                            tallerIds: e.target.checked
                              ? [...o.datos.tallerIds, t.id]
                              : o.datos.tallerIds.filter((x) => x !== t.id),
                          },
                        }))
                      }
                    />
                    {t.nombre}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="o-activo"
                checked={operarioEdit.datos.activo}
                onCheckedChange={(v) => setOperarioEdit((o) => ({ ...o, datos: { ...o.datos, activo: v } }))}
              />
              <Label htmlFor="o-activo">Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOperario(false)}>Cancelar</Button>
            <Button onClick={guardarOperario} className="bg-brand-red hover:bg-brand-red-hover">
              Guardar <Kbd className="ml-2 border-white/40 bg-white/15 text-white">Ctrl</Kbd>+<Kbd className="border-white/40 bg-white/15 text-white">S</Kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Modal restablecer contraseña ============ */}
      <Dialog open={modalPassword} onOpenChange={setModalPassword}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Restablecer contraseña</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              confirmarResetPassword()
            }}
            className="space-y-3"
          >
            <p className="text-sm text-muted-foreground">
              Usuario: <strong className="text-foreground font-mono">{formPassword.username}</strong>
            </p>
            <div>
              <Label htmlFor="rp-pass">Nueva contraseña (mínimo 6 caracteres)</Label>
              <Input
                id="rp-pass"
                type="password"
                value={formPassword.password}
                onChange={(e) => setFormPassword((f) => ({ ...f, password: e.target.value }))}
                minLength={6}
                autoFocus
                autoComplete="new-password"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalPassword(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-brand-red hover:bg-brand-red-hover">
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============ Modal plantilla de ticket (editor) ============ */}
      <Dialog open={modalPlantilla} onOpenChange={setModalPlantilla}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{plantillaEdit.id ? 'Editar plantilla de ticket' : 'Nueva plantilla de ticket'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="pl-nombre">Nombre (ej: «Recepción de Equipo»)</Label>
              <Input
                id="pl-nombre"
                value={plantillaEdit.datos.nombre}
                onChange={(e) => setPlantillaEdit((p) => ({ ...p, datos: { ...p.datos, nombre: e.target.value } }))}
                maxLength={120}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="pl-contenido">Contenido (los saltos de línea se respetan al imprimir)</Label>
                <span className="text-xs text-muted-foreground num-tabular">
                  {plantillaEdit.datos.contenido.length}/5000
                </span>
              </div>
              <Textarea
                id="pl-contenido"
                ref={contenidoRef}
                className="font-mono text-xs min-h-[220px]"
                maxLength={5000}
                value={plantillaEdit.datos.contenido}
                onChange={(e) => setPlantillaEdit((p) => ({ ...p, datos: { ...p.datos, contenido: e.target.value } }))}
                aria-label="Contenido de la plantilla"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Insertar variable en el cursor:</p>
              {Object.entries(
                VARIABLES_PLANTILLA.reduce<Record<string, typeof VARIABLES_PLANTILLA>>((acc, v) => {
                  acc[v.grupo] = [...(acc[v.grupo] ?? []), v]
                  return acc
                }, {})
              ).map(([grupo, vars]) => (
                <div key={grupo} className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase text-muted-foreground w-14 shrink-0">{grupo}</span>
                  {vars.map((v) => (
                    <button
                      key={v.variable}
                      type="button"
                      onClick={() => insertarVariable(v.variable)}
                      title={v.descripcion}
                      className="text-[11px] font-mono px-1.5 py-0.5 rounded border bg-card hover:border-brand-red hover:text-brand-red transition-colors"
                    >
                      {v.variable}
                    </button>
                  ))}
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Las variables se reemplazan al imprimir. En venta de mostrador, {'{{cliente_nombre}}'} imprime
                «Consumidor Final». Desconocidas se dejan tal cual.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="pl-activo"
                checked={plantillaEdit.datos.activo}
                onCheckedChange={(v) => setPlantillaEdit((p) => ({ ...p, datos: { ...p.datos, activo: v } }))}
              />
              <Label htmlFor="pl-activo">Activa (visible en el selector del POS)</Label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setModalPreview(true)} disabled={plantillaEdit.datos.contenido.trim().length < 3}>
              <Eye className="h-4 w-4 mr-1" /> Vista previa
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setModalPlantilla(false)}>
                Cancelar
              </Button>
              <Button onClick={guardarPlantilla} className="bg-brand-red hover:bg-brand-red-hover">
                Guardar <Kbd className="ml-2 border-white/40 bg-white/15 text-white">Ctrl</Kbd>+<Kbd className="border-white/40 bg-white/15 text-white">S</Kbd>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Modal vista previa (datos de prueba) ============ */}
      <Dialog open={modalPreview} onOpenChange={setModalPreview}>
        <DialogContent className="max-w-fit p-0 overflow-auto bg-muted border-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Vista previa del ticket</DialogTitle>
          </DialogHeader>
          <div className="p-4 max-h-[80vh] overflow-auto">
            <div className="bg-white shadow-lg rounded-sm text-black" style={{ width: `${ajustesGlobal.ticketAncho ?? '58'}mm` }}>
              <TicketPlantilla
                contenido={plantillaEdit.datos.contenido}
                contexto={CONTEXTO_MOCK}
                ancho={ajustesGlobal.ticketAncho ?? '58'}
              />
            </div>
          </div>
          <div className="flex justify-center p-3 bg-card border-t">
            <Button variant="outline" onClick={() => setModalPreview(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
