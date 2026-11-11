'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Download, Eye, Search } from 'lucide-react'
import { api, descargar } from '@/lib/api-client'
import { fmtFechaHora } from '@/lib/formato'
import { usePaginacion } from '@/hooks/use-paginacion'
import { TablePagination, FilasEsqueleto } from '../table-pagination'

interface Log {
  id: string
  fecha: string
  accion: string
  entidad: string
  entidadId: string | null
  datosAntes: Record<string, unknown> | null
  datosDespues: Record<string, unknown> | null
  ip: string | null
  userAgent: string | null
  resultado: string
  usuario: { nombre: string; username: string } | null
  taller: { nombre: string } | null
}

interface UsuariosLista {
  usuarios: Array<{ id: string; username: string; nombre: string }>
}

export function Logs() {
  const [logs, setLogs] = useState<Log[]>([])
  const [cargando, setCargando] = useState(true)
  const [entidades, setEntidades] = useState<string[]>([])
  const [usuariosLista, setUsuariosLista] = useState<UsuariosLista['usuarios']>([])
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', usuarioId: '', entidad: '', accion: '', resultado: '' })
  const [detalle, setDetalle] = useState<Log | null>(null)
  const [q, setQ] = useState('')
  // Paginación del lado del servidor (fecha desc): ?log_page=&log_limit=
  const pag = usePaginacion('log')
  const { params: pagParams, fijarMeta: fijarMetaPag, reiniciar: reiniciarPag } = pag

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const params = new URLSearchParams()
      params.set('page', pagParams.get('page') ?? '1')
      params.set('limit', pagParams.get('limit') ?? '25')
      if (filtros.desde) params.set('desde', filtros.desde)
      if (filtros.hasta) params.set('hasta', filtros.hasta)
      if (filtros.usuarioId) params.set('usuarioId', filtros.usuarioId)
      if (filtros.entidad) params.set('entidad', filtros.entidad)
      if (filtros.accion) params.set('accion', filtros.accion)
      if (filtros.resultado) params.set('resultado', filtros.resultado)
      const res = await api.get<{ logs: Log[]; total: number; paginas: number; entidades: string[] }>(`/api/logs?${params}`)
      setLogs(res.logs)
      fijarMetaPag(res.total)
      setEntidades(res.entidades)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar auditoría')
    } finally {
      setCargando(false)
    }
  }, [filtros, pagParams, fijarMetaPag])

  // Búsqueda libre: filtra la página actual en memoria (no recalca al servidor).
  const logsVisibles = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return logs
    return logs.filter(
      (l) =>
        l.accion.toLowerCase().includes(query) ||
        (l.usuario?.username ?? '').toLowerCase().includes(query) ||
        l.entidad.toLowerCase().includes(query)
    )
  }, [logs, q])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      await cargar()
      try {
        const r = await api.get<UsuariosLista>('/api/usuarios')
        if (vivo) setUsuariosLista(r.usuarios)
      } catch {
        /* usuarios es solo para el filtro */
      }
    })()
    return () => {
      vivo = false
    }
  }, [cargar])

  /** Cambio de filtro: la paginación vuelve a la página 1 (§1). */
  function cambiarFiltro<K extends keyof typeof filtros>(campo: K, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }))
    reiniciarPag()
  }

  function exportar(formato: 'csv' | 'json') {
    const params = new URLSearchParams({ export: formato })
    if (filtros.desde) params.set('desde', filtros.desde)
    if (filtros.hasta) params.set('hasta', filtros.hasta)
    if (filtros.usuarioId) params.set('usuarioId', filtros.usuarioId)
    if (filtros.entidad) params.set('entidad', filtros.entidad)
    if (filtros.resultado) params.set('resultado', filtros.resultado)
    descargar(`/api/logs?${params}`, `logs.${formato}`).catch((e) => toast.error(e.message))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">Auditoría ({new Intl.NumberFormat('es').format(pag.total)} registros)</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportar('csv')}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportar('json')}>
            <Download className="h-4 w-4 mr-1" /> JSON
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-end">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar en página actual…" className="pl-8" aria-label="Filtrar logs" />
          </div>
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" className="w-36" value={filtros.desde} onChange={(e) => cambiarFiltro('desde', e.target.value)} aria-label="Desde" />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" className="w-36" value={filtros.hasta} onChange={(e) => cambiarFiltro('hasta', e.target.value)} aria-label="Hasta" />
          </div>
          <Select value={filtros.usuarioId} onValueChange={(v) => cambiarFiltro('usuarioId', v === '__todos__' ? '' : v)}>
            <SelectTrigger className="w-[150px]" aria-label="Usuario">
              <SelectValue placeholder="Usuario" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todos</SelectItem>
              {usuariosLista.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtros.entidad} onValueChange={(v) => cambiarFiltro('entidad', v === '__todos__' ? '' : v)}>
            <SelectTrigger className="w-[150px]" aria-label="Entidad">
              <SelectValue placeholder="Entidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todas</SelectItem>
              {entidades.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtros.resultado} onValueChange={(v) => cambiarFiltro('resultado', v === '__todos__' ? '' : v)}>
            <SelectTrigger className="w-[130px]" aria-label="Resultado">
              <SelectValue placeholder="Resultado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todos</SelectItem>
              <SelectItem value="OK">OK</SelectItem>
              <SelectItem value="DENEGADO">DENEGADO</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>Taller</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead className="text-right">Datos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargando && <FilasEsqueleto columnas={7} />}
              {!cargando && logsVisibles.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs whitespace-nowrap">{fmtFechaHora(l.fecha)}</TableCell>
                  <TableCell className="text-sm">{l.usuario?.username ?? '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{l.accion}</TableCell>
                  <TableCell className="text-sm">
                    {l.entidad}
                    {l.entidadId && <span className="text-xs text-muted-foreground ml-1 font-mono">{l.entidadId.slice(0, 8)}…</span>}
                  </TableCell>
                  <TableCell className="text-xs">{l.taller?.nombre ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={l.resultado === 'OK' ? 'default' : 'destructive'} className="text-xs">{l.resultado}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {(l.datosAntes || l.datosDespues) && (
                      <Button size="sm" variant="ghost" onClick={() => setDetalle(l)} aria-label="Ver datos">
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {logsVisibles.length === 0 && !cargando && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin registros.</TableCell>
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

      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detalle?.accion} · {detalle?.entidad}
            </DialogTitle>
          </DialogHeader>
          {detalle && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Usuario: {detalle.usuario?.username ?? '—'}</div>
                <div>Fecha: {fmtFechaHora(detalle.fecha)}</div>
                <div>IP: {detalle.ip ?? '—'}</div>
                <div>Entidad ID: {detalle.entidadId ?? '—'}</div>
              </div>
              {detalle.datosAntes && (
                <div>
                  <p className="font-medium mb-1">Datos antes</p>
                  <pre className="text-xs bg-muted rounded-lg p-2 overflow-x-auto">
                    {JSON.stringify(detalle.datosAntes, null, 2)}
                  </pre>
                </div>
              )}
              {detalle.datosDespues && (
                <div>
                  <p className="font-medium mb-1">Datos después</p>
                  <pre className="text-xs bg-muted rounded-lg p-2 overflow-x-auto">
                    {JSON.stringify(detalle.datosDespues, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
