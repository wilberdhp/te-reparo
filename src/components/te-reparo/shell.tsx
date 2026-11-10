'use client'
import { useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { useHotkeys } from 'react-hotkeys-hook'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  Users,
  Undo2,
  ShieldCheck,
  Calculator,
  Settings,
  ScrollText,
  Wrench,
  LogOut,
  Sun,
  Moon,
  Keyboard,
} from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/lib/store'
import { ROL_LABEL, fmt } from '@/lib/formato'
import { VISTA_POR_ALT } from '@/lib/atajos'
import { Kbd } from './kbd'
import { AtajosModal } from './atajos-modal'

import { Dashboard } from './modules/dashboard'
import { Pos } from './modules/pos'
import { Inventario } from './modules/inventario'
import { Ventas } from './modules/ventas'
import { Clientes } from './modules/clientes'
import { Devoluciones } from './modules/devoluciones'
import { Garantias } from './modules/garantias'
import { Liquidaciones } from './modules/liquidaciones'
import { Configuracion } from './modules/configuracion'
import { Logs } from './modules/logs'

interface ItemNav {
  id: string
  etiqueta: string
  icono: React.ReactNode
  roles: Array<'ADMIN' | 'VENDEDOR' | 'VENDEDOR_ONLINE'>
  alt?: string
}

const NAV: ItemNav[] = [
  { id: 'dashboard', etiqueta: 'Panel', icono: <LayoutDashboard className="h-4 w-4" />, roles: ['ADMIN', 'VENDEDOR', 'VENDEDOR_ONLINE'], alt: '1' },
  { id: 'pos', etiqueta: 'Punto de venta', icono: <ShoppingCart className="h-4 w-4" />, roles: ['ADMIN', 'VENDEDOR', 'VENDEDOR_ONLINE'], alt: '2' },
  { id: 'inventario', etiqueta: 'Inventario', icono: <Package className="h-4 w-4" />, roles: ['ADMIN', 'VENDEDOR', 'VENDEDOR_ONLINE'], alt: '3' },
  { id: 'ventas', etiqueta: 'Ventas', icono: <Receipt className="h-4 w-4" />, roles: ['ADMIN', 'VENDEDOR', 'VENDEDOR_ONLINE'], alt: '4' },
  { id: 'clientes', etiqueta: 'Clientes', icono: <Users className="h-4 w-4" />, roles: ['ADMIN', 'VENDEDOR', 'VENDEDOR_ONLINE'], alt: '5' },
  { id: 'devoluciones', etiqueta: 'Devoluciones', icono: <Undo2 className="h-4 w-4" />, roles: ['ADMIN', 'VENDEDOR', 'VENDEDOR_ONLINE'] },
  { id: 'garantias', etiqueta: 'Garantías', icono: <ShieldCheck className="h-4 w-4" />, roles: ['ADMIN', 'VENDEDOR', 'VENDEDOR_ONLINE'] },
  { id: 'liquidaciones', etiqueta: 'Liquidaciones', icono: <Calculator className="h-4 w-4" />, roles: ['ADMIN', 'VENDEDOR', 'VENDEDOR_ONLINE'], alt: '6' },
  { id: 'configuracion', etiqueta: 'Configuración', icono: <Settings className="h-4 w-4" />, roles: ['ADMIN'], alt: '7' },
  { id: 'logs', etiqueta: 'Auditoría', icono: <ScrollText className="h-4 w-4" />, roles: ['ADMIN'] },
]

export function Shell({ alSalir }: { alSalir: () => void }) {
  const usuario = useApp((s) => s.usuario)
  const talleres = useApp((s) => s.talleres)
  const tasas = useApp((s) => s.tasas)
  const vista = useApp((s) => s.vista)
  const setVista = useApp((s) => s.setVista)
  const tallerActivoId = useApp((s) => s.tallerActivoId)
  const setTallerActivo = useApp((s) => s.setTallerActivo)

  const { theme, setTheme } = useTheme()

  const items = useMemo(() => NAV.filter((n) => usuario && n.roles.includes(usuario.rol)), [usuario])
  const puedeCambiarTaller = usuario?.rol === 'ADMIN' || usuario?.rol === 'VENDEDOR_ONLINE'
  const tallerActual = talleres.find((t) => t.id === tallerActivoId) ?? talleres[0]

  // ---- Atajos globales (Alt+1..7) + ayuda (Shift+? / F1) ----
  useHotkeys(
    'alt+1, alt+2, alt+3, alt+4, alt+5, alt+6, alt+7',
    (e) => {
      const destino = VISTA_POR_ALT[e.key]
      if (!destino) return
      if (destino === 'configuracion' && usuario?.rol !== 'ADMIN') {
        toast.error('Configuración es exclusiva del rol ADMIN')
        return
      }
      setVista(destino)
    },
    { enableOnFormTags: true, preventDefault: true }
  )
  const [modalAtajos, setModalAtajos] = useState(false)
  useHotkeys(['shift+?', '?', 'f1'], () => setModalAtajos(true), { enableOnFormTags: true })

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Skip link: visible solo al tabular desde el inicio de la página */}
      <a href="#contenido-principal" className="saltar-enlace">
        Saltar al contenido principal
      </a>

      <header className="bg-card border-b sticky top-0 z-40">
        <div className="mx-auto max-w-[1600px] px-3 sm:px-4 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-brand-red flex items-center justify-center shrink-0 shadow-sm">
              <Wrench className="h-4 w-4 text-white" aria-hidden />
            </div>
            <span className="font-bold text-lg tracking-tight hidden sm:block">
              Te<span className="text-brand-red">Reparo</span>
            </span>
          </div>

          {puedeCambiarTaller && talleres.length > 0 && (
            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs text-muted-foreground hidden md:block">Taller activo:</span>
              <Select value={tallerActual?.id} onValueChange={setTallerActivo}>
                <SelectTrigger className="w-[180px] sm:w-[240px] h-9" aria-label="Taller activo">
                  <SelectValue placeholder="Taller" />
                </SelectTrigger>
                <SelectContent>
                  {talleres.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre}
                      {!t.activo ? ' (inactivo)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!puedeCambiarTaller && tallerActual && (
            <span className="ml-2 text-sm text-muted-foreground truncate">{tallerActual.nombre}</span>
          )}

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <div className="hidden lg:block text-right leading-tight">
              <div className="text-sm font-medium">{usuario?.nombre}</div>
              <div className="text-xs text-muted-foreground">{ROL_LABEL[usuario?.rol ?? ''] ?? usuario?.rol}</div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-2 py-1 num-tabular">
              <span>USD {fmt(tasas.USD)}</span>
              <span>EUR {fmt(tasas.EUR)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setModalAtajos(true)}
              aria-label="Atajos de teclado (Shift + ?)"
              title="Atajos de teclado (Shift + ?)"
            >
              <Keyboard className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
              title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            >
              <Sun className="h-4 w-4 dark:hidden" aria-hidden />
              <Moon className="hidden h-4 w-4 dark:block" aria-hidden />
            </Button>
            <Button variant="outline" size="sm" onClick={alSalir} aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
        {/* Navegación horizontal (tablet-friendly) */}
        <nav className="mx-auto max-w-[1600px] px-3 sm:px-4 pb-2 flex gap-1 overflow-x-auto" aria-label="Módulos">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => setVista(n.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 h-9 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                vista === n.id
                  ? 'bg-brand-red text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
              aria-current={vista === n.id ? 'page' : undefined}
            >
              {n.icono}
              <span className="hidden sm:inline">{n.etiqueta}</span>
              {n.alt && <Kbd className={vista === n.id ? 'border-white/40 bg-white/15 text-white' : 'hidden lg:inline-flex'}>{n.alt}</Kbd>}
            </button>
          ))}
        </nav>
      </header>

      <main id="contenido-principal" tabIndex={-1} className="flex-1 mx-auto w-full max-w-[1600px] px-3 sm:px-4 py-4 sm:py-6 outline-none">
        {vista === 'dashboard' && <Dashboard />}
        {vista === 'pos' && <Pos />}
        {vista === 'inventario' && <Inventario />}
        {vista === 'ventas' && <Ventas />}
        {vista === 'clientes' && <Clientes />}
        {vista === 'devoluciones' && <Devoluciones />}
        {vista === 'garantias' && <Garantias />}
        {vista === 'liquidaciones' && <Liquidaciones />}
        {vista === 'configuracion' && <Configuracion />}
        {vista === 'logs' && <Logs />}
      </main>

      <footer className="mt-auto border-t bg-card py-3 text-center text-xs text-muted-foreground">
        Te Reparo — Gestión de talleres · {new Date().getFullYear()} · <Kbd className="ml-1">Shift</Kbd> +{' '}
        <Kbd>?</Kbd> atajos
      </footer>

      <AtajosModal abierto={modalAtajos} onAbrirCambio={setModalAtajos} />
    </div>
  )
}
