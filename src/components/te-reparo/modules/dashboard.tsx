'use client'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Store, ShoppingCart, TrendingUp, AlertTriangle, Wallet, Download } from 'lucide-react'
import { api, descargar } from '@/lib/api-client'
import { useApp } from '@/lib/store'
import { fmt, fmtCUP, RAMA_LABEL, METODO_PAGO_LABEL } from '@/lib/formato'

interface DashboardData {
  fecha: string
  taller: { id: string; nombre: string }
  ventasDia: { cantidad: number; totalCUP: number }
  ventasPorTaller: Array<{ taller: string; totalCUP: number; cantidad: number }>
  masVendidos: Array<{ nombre: string; unidades: number; importe: number }>
  stockBajo: Array<{ id: string; nombre: string; cantidad: number; stockMinimo: number }>
  porMetodoMoneda: Record<string, number>
  pagosPorOperario: Array<{
    operarioId: string
    operarioNombre: string
    rama: string
    tipo: string
    montoCUP: number
  }>
  totalPagosOperario: number
}

export function Dashboard() {
  const usuario = useApp((s) => s.usuario)
  const tallerActivoId = useApp((s) => s.tallerActivoId)
  const talleres = useApp((s) => s.talleres)
  const tallerId = usuario?.rol === 'VENDEDOR' ? usuario.tallerId : tallerActivoId ?? talleres[0]?.id

  const [datos, setDatos] = useState<DashboardData | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    if (!tallerId) return
    setCargando(true)
    try {
      const res = await api.get<DashboardData>(`/api/dashboard?tallerId=${tallerId}`)
      setDatos(res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar el panel')
    } finally {
      setCargando(false)
    }
  }, [tallerId])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (cargando || !datos) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  const puedeVerTodos = usuario?.rol === 'ADMIN' || usuario?.rol === 'VENDEDOR_ONLINE'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Panel del día</h1>
          <p className="text-sm text-muted-foreground">
            {datos.taller.nombre} · {datos.fecha}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => cargar()}>
            Actualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              descargar(`/api/dashboard?tallerId=${tallerId}&export=csv`, `dashboard-${datos.fecha}.csv`).catch((e) =>
                toast.error(e.message)
              )
            }
          >
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" aria-hidden /> Ventas del día
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtCUP(datos.ventasDia.totalCUP)}</div>
            <p className="text-xs text-muted-foreground">{datos.ventasDia.cantidad} ventas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" aria-hidden /> Pagos a operarios (hoy)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtCUP(datos.totalPagosOperario)}</div>
            <p className="text-xs text-muted-foreground">{datos.pagosPorOperario.length} operarios</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" aria-hidden /> Stock bajo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{datos.stockBajo.length}</div>
            <p className="text-xs text-muted-foreground">productos en mínimo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" aria-hidden /> Más vendido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold truncate">{datos.masVendidos[0]?.nombre ?? '—'}</div>
            <p className="text-xs text-muted-foreground">
              {datos.masVendidos[0] ? `${datos.masVendidos[0].unidades} u · ${fmtCUP(datos.masVendidos[0].importe)}` : 'sin ventas hoy'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Ventas por taller */}
        {puedeVerTodos && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Store className="h-4 w-4" aria-hidden /> Ventas por taller (hoy)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {datos.ventasPorTaller.map((t) => (
                <div key={t.taller} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                  <span className="truncate">{t.taller}</span>
                  <span className="font-semibold">
                    {fmtCUP(t.totalCUP)} <span className="text-muted-foreground font-normal">({t.cantidad})</span>
                  </span>
                </div>
              ))}
              {datos.ventasPorTaller.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin ventas hoy en ningún taller.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Ventas por método y moneda */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ventas por método y moneda (hoy)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(datos.porMetodoMoneda).map(([clave, monto]) => {
              const [metodo, moneda] = clave.split('-')
              return (
                <div key={clave} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                  <span>
                    <Badge variant="secondary" className="mr-2">
                      {METODO_PAGO_LABEL[metodo] ?? metodo}
                    </Badge>
                    {moneda}
                  </span>
                  <span className="font-semibold">{fmtCUP(monto)}</span>
                </div>
              )
            })}
            {Object.keys(datos.porMetodoMoneda).length === 0 && (
              <p className="text-sm text-muted-foreground">Sin pagos registrados hoy.</p>
            )}
          </CardContent>
        </Card>

        {/* Productos más vendidos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Productos más vendidos (hoy)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {datos.masVendidos.map((p, i) => (
              <div key={p.nombre} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded bg-muted text-xs flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="truncate flex-1">{p.nombre}</span>
                <span className="text-muted-foreground text-xs">{p.unidades} u</span>
                <span className="font-semibold">{fmt(p.importe)}</span>
              </div>
            ))}
            {datos.masVendidos.length === 0 && <p className="text-sm text-muted-foreground">Sin ventas hoy.</p>}
          </CardContent>
        </Card>

        {/* Stock bajo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> Productos con stock bajo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-64 overflow-y-auto">
            {datos.stockBajo.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{p.nombre}</span>
                <Badge variant={p.cantidad <= 0 ? 'destructive' : 'outline'} className="text-xs">
                  {p.cantidad} / mín {p.stockMinimo}
                </Badge>
              </div>
            ))}
            {datos.stockBajo.length === 0 && <p className="text-sm text-muted-foreground">Todo el stock está sobre el mínimo.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Pagos del día por operario */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pagos del día por operario (liquidación en curso)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Operario</th>
                  <th className="py-2 pr-4 font-medium">Rama</th>
                  <th className="py-2 pr-4 font-medium">Regla</th>
                  <th className="py-2 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {datos.pagosPorOperario.map((l) => (
                  <tr key={l.operarioId} className="border-b last:border-0">
                    <td className="py-2 pr-4">{l.operarioNombre}</td>
                    <td className="py-2 pr-4">{RAMA_LABEL[l.rama] ?? l.rama}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{l.tipo}</td>
                    <td className="py-2 text-right font-semibold">{fmtCUP(l.montoCUP)}</td>
                  </tr>
                ))}
                {datos.pagosPorOperario.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted-foreground">
                      Sin operarios activos en este taller.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
