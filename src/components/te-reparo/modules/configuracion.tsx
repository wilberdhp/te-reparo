'use client'
import { useCallback, useEffect, useState } from 'react'
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
import { toast } from 'sonner'
import { Plus, Pencil, KeyRound, Download, Save } from 'lucide-react'
import { api, descargar } from '@/lib/api-client'
import { useApp } from '@/lib/store'
import { fmt, fmtFechaHora, ROL_LABEL, RAMA_LABEL } from '@/lib/formato'
import { useGuardarConCtrlS } from '@/hooks/use-ctrl-s'
import { Kbd } from '../kbd'

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

const ROLES = ['ADMIN', 'VENDEDOR', 'VENDEDOR_ONLINE']
const RAMAS = ['VENDEDOR', 'INFORMATICO', 'ELECTRONICO', 'ADMIN']

export function Configuracion() {
  const setAjustesGlobal = useApp((s) => s.setAjustes)
  const ajustesGlobal = useApp((s) => s.ajustes)

  const [tab, setTab] = useState('talleres')
  const [talleres, setTalleres] = useState<Taller[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
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

  const cargarTodo = useCallback(async () => {
    try {
      const [rTalleres, rUsuarios, rOperarios, rTasas] = await Promise.all([
        api.get<{ talleres: Taller[] }>('/api/talleres'),
        api.get<{ usuarios: Usuario[] }>('/api/usuarios'),
        api.get<{ operarios: Operario[] }>('/api/operarios'),
        api.get<{ tasas: { USD: number; EUR: number }; historial: Tasa[] }>('/api/tasas'),
      ])
      setTalleres(rTalleres.talleres)
      setUsuarios(rUsuarios.usuarios)
      setOperarios(rOperarios.operarios)
      setTasas(rTasas.historial)
      setTasasVigentes(rTasas.tasas)
      setFormTasas({ USD: String(rTasas.tasas.USD), EUR: String(rTasas.tasas.EUR) })
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
      cargarTodo()
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
      cargarTodo()
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

  // Ctrl+S guarda el formulario/modal abierto (o la pestaña de ajustes)
  useGuardarConCtrlS(
    () => {
      if (modalTaller) guardarTaller()
      else if (modalUsuario) guardarUsuario()
      else if (modalOperario) guardarOperario()
      else if (modalPassword) confirmarResetPassword()
      else if (tab === 'ajustes') guardarAjustes()
    },
    modalTaller || modalUsuario || modalOperario || modalPassword || tab === 'ajustes'
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
                  {usuarios.map((u) => (
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
                </TableBody>
              </Table>
            </CardContent>
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
                  {operarios.map((o) => (
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
                </TableBody>
              </Table>
            </CardContent>
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
    </div>
  )
}
