'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Printer, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/lib/store'
import { fechaCorta } from '@/lib/fecha'
import { fmt, fmtCUP, fmtFechaHora, RAMA_LABEL } from '@/lib/formato'
import { ConfirmarPeligroso } from '../confirmar-peligroso'
import { TicketComprobante } from '../ticket'

interface Linea {
  operarioId: string
  operarioNombre: string
  rama: string
  tipo: string
  montoCUP: number
  detalle: {
    tipo?: string
    base?: string
    formula?: string
    lineas?: number
    ventas?: number
    repartoEquitativo?: string
    ajustes?: Array<{ motivo: string; monto: string }>
  }
}

interface LiquidacionData {
  liquidacion: {
    id: string
    fecha: string
    estado: string
    totalCUP: number
    fechaCierre: string | null
  }
  calculo: { totalVentasDia: number; totalLiquidacion: number; lineas: Linea[] }
  ajustes: Array<{
    id: string
    motivo: string
    montoCUP: number
    operario: { nombre: string; rama: string }
    devolucion: { codigo: string } | null
  }>
  pagos: Array<{
    id: string
    comprobanteCodigo: string
    montoCUP: number
    operario: { id: string; nombre: string; rama: string }
  }>
  resumenVentas: { cantidad: number; total: number }
  fecha: string
  taller: { id: string; nombre: string }
  porcentajeAdmin: number
}

interface ComprobanteResp {
  comprobante: {
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
}

export function Liquidaciones() {
  const usuario = useApp((s) => s.usuario)
  const tallerActivoId = useApp((s) => s.tallerActivoId)
  const talleres = useApp((s) => s.talleres)
  const esAdmin = usuario?.rol === 'ADMIN'
  const tallerId = usuario?.rol === 'VENDEDOR' ? usuario.tallerId : tallerActivoId ?? talleres[0]?.id

  // Día civil en la zona del NEGOCIO (no la del navegador): entre la medianoche
  // de Cuba y la del servidor/navegador pueden diferir, y la liquidación del día
  // debe abrirse sobre el mismo día con el que el servidor agrupa las ventas.
  const [fecha, setFecha] = useState(() => fechaCorta())
  const [datos, setDatos] = useState<LiquidacionData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [cerrando, setCerrando] = useState(false)
  const [comprobante, setComprobante] = useState<ComprobanteResp | null>(null)

  const cargar = useCallback(async () => {
    if (!tallerId) return
    setCargando(true)
    try {
      const res = await api.get<LiquidacionData>(`/api/liquidaciones?tallerId=${tallerId}&fecha=${fecha}`)
      setDatos(res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar liquidación')
    } finally {
      setCargando(false)
    }
  }, [tallerId, fecha])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function cerrar() {
    if (!tallerId || !datos) return
    if (datos.liquidacion.estado === 'CERRADA') return
    setCerrando(true)
    try {
      await api.post('/api/liquidaciones/cerrar', { tallerId, fecha })
      toast.success('Liquidación cerrada y comprobantes generados')
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cerrar')
    } finally {
      setCerrando(false)
    }
  }

  async function verComprobante(pagoId: string) {
    try {
      const res = await api.get<ComprobanteResp>(`/api/liquidaciones/comprobante?pagoId=${pagoId}`)
      setComprobante(res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar comprobante')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">Liquidación diaria de operarios</h1>
        <div className="flex gap-2 items-center">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40" aria-label="Fecha de liquidación" />
          <Button variant="outline" onClick={cargar}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {esAdmin && datos?.liquidacion.estado === 'ABIERTA' && (
            <ConfirmarPeligroso
              etiqueta="Cerrar liquidación"
              etiquetaConfirmar="Confirmar cierre"
              onConfirmar={cerrar}
              disabled={cerrando}
              size="default"
              className="bg-brand-red hover:bg-brand-red-hover"
              aviso="Al cerrar, la liquidación deja de recalcularse y se emiten los comprobantes. Pulse de nuevo para confirmar."
            />
          )}
        </div>
      </div>

      {datos && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Taller · Día</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-semibold truncate">{datos.taller.nombre}</div>
                <div className="text-xs text-muted-foreground">{datos.fecha}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ventas del día</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold num-tabular">{fmtCUP(datos.calculo.totalVentasDia)}</div>
                <p className="text-xs text-muted-foreground">{datos.resumenVentas.cantidad} ventas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total a pagar operarios</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold num-tabular">{fmtCUP(datos.calculo.totalLiquidacion)}</div>
                <p className="text-xs text-muted-foreground">{datos.calculo.lineas.length} líneas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={datos.liquidacion.estado === 'ABIERTA' ? 'secondary' : 'default'} className="text-sm">
                  {datos.liquidacion.estado === 'ABIERTA' ? 'ABIERTA (se recalcula)' : 'CERRADA'}
                </Badge>
                {datos.liquidacion.fechaCierre && (
                  <p className="text-xs text-muted-foreground mt-1">cerrada {fmtFechaHora(datos.liquidacion.fechaCierre)}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cálculo por operario (reglas por rama)</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operario</TableHead>
                    <TableHead>Rama</TableHead>
                    <TableHead>Regla</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    {datos.liquidacion.estado === 'CERRADA' && <TableHead className="text-right">Comprobante</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.calculo.lineas.map((l) => (
                    <TableRow key={l.operarioId}>
                      <TableCell className="font-medium">{l.operarioNombre}</TableCell>
                      <TableCell>{RAMA_LABEL[l.rama] ?? l.rama}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {l.tipo === 'GRUPO'
                            ? 'Regla grupal'
                            : l.tipo === 'INDIVIDUAL'
                              ? 'Acumulado individual'
                              : l.tipo === 'ONLINE'
                                ? 'Individual (en línea)'
                                : l.tipo === 'ADMIN_PCT'
                                  ? 'Porcentaje admin'
                                  : 'Ajuste'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[280px]">
                        {l.tipo === 'GRUPO' && `base del día: ${fmt(l.detalle.base ?? 0)} CUP (íntegro a cada vendedor activo)`}
                        {l.tipo === 'INDIVIDUAL' && `${l.detalle.lineas ?? 0} líneas · reparto equitativo ref.: ${fmt(l.detalle.repartoEquitativo ?? 0)}`}
                        {l.tipo === 'ONLINE' && `${l.detalle.ventas ?? 0} ventas propias · ${l.detalle.lineas ?? 0} líneas`}
                        {l.tipo === 'ADMIN_PCT' &&
                          `${datos.porcentajeAdmin}% × ${fmt(l.detalle.base ?? 0)} CUP${(l.detalle.lineas ?? 0) > 0 ? ` · + ${l.detalle.lineas} línea(s) asignada(s)` : ''}`}
                        {l.tipo === 'AJUSTE' && 'devoluciones post-cierre'}
                        {(l.detalle.ajustes?.length ?? 0) > 0 && (
                          <div className="text-destructive">
                            ajustes: {l.detalle.ajustes?.map((a) => fmt(a.monto)).join(', ')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-semibold num-tabular ${l.montoCUP < 0 ? 'text-destructive' : ''}`}>
                        {fmtCUP(l.montoCUP)}
                      </TableCell>
                      {datos.liquidacion.estado === 'CERRADA' && (
                        <TableCell className="text-right">
                          {(() => {
                            const pago = datos.pagos.find((p) => p.operario.id === l.operarioId)
                            return pago ? (
                              <Button size="sm" variant="outline" onClick={() => verComprobante(pago.id)} aria-label="Comprobante">
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                            ) : null
                          })()}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Ajustes del día (devoluciones post-cierre) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ajustes del día (devoluciones post-cierre)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {datos.ajustes.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-1">
                  <span>
                    <span className="font-medium">{a.operario.nombre}</span>
                    <span className="text-muted-foreground text-xs ml-2">
                      {a.devolucion ? `${a.devolucion.codigo}: ` : ''}
                      {a.motivo}
                    </span>
                  </span>
                  <span className="text-destructive font-semibold num-tabular">{fmt(a.montoCUP)}</span>
                </div>
              ))}
              {datos.ajustes.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin ajustes este día.</p>
              )}
            </CardContent>
          </Card>

          {/* Comprobantes emitidos */}
          {datos.liquidacion.estado === 'CERRADA' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Comprobantes de pago emitidos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {datos.pagos.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-1">
                    <span className="font-mono">{p.comprobanteCodigo}</span>
                    <span>{p.operario.nombre}</span>
                    <span className="font-semibold num-tabular">{fmtCUP(p.montoCUP)}</span>
                    <Button size="sm" variant="outline" onClick={() => verComprobante(p.id)}>
                      <Printer className="h-3.5 w-3.5 mr-1" /> Comprobante
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Modal comprobante */}
      <Dialog open={!!comprobante} onOpenChange={(o) => !o && setComprobante(null)}>
        <DialogContent className="max-w-fit p-0 bg-muted border-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Comprobante de pago</DialogTitle>
          </DialogHeader>
          <div className="p-4 max-h-[75vh] overflow-auto">
            {comprobante && (
              <div className="bg-white text-black shadow-lg rounded-sm" style={{ width: '80mm' }}>
                <TicketComprobante data={comprobante.comprobante} />
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-center p-3 bg-card border-t">
            <Button onClick={() => window.print()} className="bg-brand-red hover:bg-brand-red-hover">
              <Printer className="h-4 w-4 mr-1" /> Imprimir
            </Button>
            <Button variant="outline" onClick={() => setComprobante(null)}>Cerrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
