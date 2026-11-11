'use client'
// Estado global: sesión en memoria (la autenticación vive en la cookie httpOnly)
// y carritos del POS persistidos en localStorage (PRD §5.4).
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UsuarioActual {
  id: string
  nombre: string
  username: string
  rol: 'ADMIN' | 'VENDEDOR' | 'VENDEDOR_ONLINE'
  tallerId: string | null
  operarioId: string | null
}

export interface TallerInfo {
  id: string
  nombre: string
  activo: boolean
}

export interface ItemCarrito {
  productoId: string
  nombre: string
  tipo: string
  cantidad: number
  precio: number
  precioOriginal: number
  moneda: string
  operarioId: string | null
  stock: number
  /** Costo interno del repuesto/servicio (moneda del ítem) — NO suma al total. */
  costoAdicional?: number
  /** Nota de línea (IMEI, falla, color…) impresa bajo el nombre en el ticket. */
  descripcionAdicional?: string
}

export interface Carrito {
  id: string
  nombre: string
  tallerId: string
  items: ItemCarrito[]
  clienteId: string | null
  clienteNombre: string | null
  creadoEn: string
}

interface EstadoApp {
  usuario: UsuarioActual | null
  talleres: TallerInfo[]
  tasas: { USD: number; EUR: number }
  ajustes: Record<string, string>
  tallerActivoId: string | null
  vista: string
  carritos: Carrito[]
  carritoActivo: string | null

  setSesion: (s: {
    usuario: UsuarioActual | null
    talleres: TallerInfo[]
    tasas: { USD: number; EUR: number }
    ajustes: Record<string, string>
  }) => void
  setTasas: (tasas: { USD: number; EUR: number }) => void
  setAjustes: (ajustes: Record<string, string>) => void
  setTallerActivo: (id: string | null) => void
  setVista: (vista: string) => void

  carritosDeTaller: (tallerId: string) => Carrito[]
  nuevoCarrito: (tallerId: string) => string
  cerrarCarrito: (id: string) => void
  setCarritoActivo: (id: string) => void
  renombrarCarrito: (id: string, nombre: string) => void
  agregarItem: (tallerId: string, item: ItemCarrito) => void
  quitarItem: (carritoId: string, productoId: string) => void
  cambiarCantidad: (carritoId: string, productoId: string, cantidad: number) => void
  cambiarPrecio: (carritoId: string, productoId: string, precio: number) => void
  cambiarCosto: (carritoId: string, productoId: string, costo: number) => void
  cambiarNota: (carritoId: string, productoId: string, nota: string) => void
  asignarOperario: (carritoId: string, productoId: string, operarioId: string | null) => void
  setCliente: (carritoId: string, cliente: { id: string; nombre: string } | null) => void
  vaciarCarrito: (carritoId: string) => void
}

export const useApp = create<EstadoApp>()(
  persist(
    (set, get) => ({
      usuario: null,
      talleres: [],
      tasas: { USD: 440, EUR: 470 },
      ajustes: {},
      tallerActivoId: null,
      vista: 'dashboard',
      carritos: [],
      carritoActivo: null,

      setSesion: (s) =>
        set({
          usuario: s.usuario,
          talleres: s.talleres,
          tasas: s.tasas,
          ajustes: s.ajustes,
          tallerActivoId:
            s.usuario?.rol === 'VENDEDOR'
              ? s.usuario.tallerId
              : (get().tallerActivoId && s.talleres.some((t) => t.id === get().tallerActivoId)
                  ? get().tallerActivoId
                  : s.talleres[0]?.id ?? null),
        }),
      setTasas: (tasas) => set({ tasas }),
      setAjustes: (ajustes) => set({ ajustes }),
      setTallerActivo: (id) => set({ tallerActivoId: id }),
      setVista: (vista) => set({ vista }),

      carritosDeTaller: (tallerId) => get().carritos.filter((c) => c.tallerId === tallerId),
      nuevoCarrito: (tallerId) => {
        const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
        const existentes = get().carritos.filter((c) => c.tallerId === tallerId).length
        const carrito: Carrito = {
          id,
          nombre: `Carrito ${existentes + 1}`,
          tallerId,
          items: [],
          clienteId: null,
          clienteNombre: null,
          creadoEn: new Date().toISOString(),
        }
        set((st) => ({ carritos: [...st.carritos, carrito], carritoActivo: id }))
        return id
      },
      cerrarCarrito: (id) =>
        set((st) => {
          const restantes = st.carritos.filter((c) => c.id !== id)
          return {
            carritos: restantes,
            carritoActivo:
              st.carritoActivo === id
                ? restantes.find((c) => c.tallerId === st.carritos.find((x) => x.id === id)?.tallerId)?.id ?? null
                : st.carritoActivo,
          }
        }),
      setCarritoActivo: (id) => set({ carritoActivo: id }),
      renombrarCarrito: (id, nombre) =>
        set((st) => ({ carritos: st.carritos.map((c) => (c.id === id ? { ...c, nombre } : c)) })),

      agregarItem: (tallerId, item) => {
        const st = get()
        let carritoId = st.carritoActivo
        let carrito = st.carritos.find((c) => c.id === carritoId && c.tallerId === tallerId)
        if (!carrito) {
          const delTaller = st.carritos.filter((c) => c.tallerId === tallerId)
          carrito = delTaller[delTaller.length - 1]
          if (!carrito) {
            get().nuevoCarrito(tallerId)
            carritoId = get().carritoActivo
            carrito = get().carritos.find((c) => c.id === carritoId)
          } else {
            carritoId = carrito.id
            set({ carritoActivo: carritoId })
          }
        }
        if (!carrito) return
        const existente = carrito.items.find((i) => i.productoId === item.productoId)
        set((s) => ({
          carritos: s.carritos.map((c) =>
            c.id === carritoId
              ? {
                  ...c,
                  items: existente
                    ? c.items.map((i) =>
                        i.productoId === item.productoId ? { ...i, cantidad: i.cantidad + item.cantidad } : i
                      )
                    : [...c.items, item],
                }
              : c
          ),
        }))
      },
      quitarItem: (carritoId, productoId) =>
        set((st) => ({
          carritos: st.carritos.map((c) =>
            c.id === carritoId ? { ...c, items: c.items.filter((i) => i.productoId !== productoId) } : c
          ),
        })),
      cambiarCantidad: (carritoId, productoId, cantidad) =>
        set((st) => ({
          carritos: st.carritos.map((c) =>
            c.id === carritoId
              ? {
                  ...c,
                  items:
                    cantidad <= 0
                      ? c.items.filter((i) => i.productoId !== productoId)
                      : c.items.map((i) => (i.productoId === productoId ? { ...i, cantidad } : i)),
                }
              : c
          ),
        })),
      cambiarPrecio: (carritoId, productoId, precio) =>
        set((st) => ({
          carritos: st.carritos.map((c) =>
            c.id === carritoId
              ? { ...c, items: c.items.map((i) => (i.productoId === productoId ? { ...i, precio } : i)) }
              : c
          ),
        })),
      cambiarCosto: (carritoId, productoId, costo) =>
        set((st) => ({
          carritos: st.carritos.map((c) =>
            c.id === carritoId
              ? { ...c, items: c.items.map((i) => (i.productoId === productoId ? { ...i, costoAdicional: costo } : i)) }
              : c
          ),
        })),
      cambiarNota: (carritoId, productoId, nota) =>
        set((st) => ({
          carritos: st.carritos.map((c) =>
            c.id === carritoId
              ? { ...c, items: c.items.map((i) => (i.productoId === productoId ? { ...i, descripcionAdicional: nota } : i)) }
              : c
          ),
        })),
      asignarOperario: (carritoId, productoId, operarioId) =>
        set((st) => ({
          carritos: st.carritos.map((c) =>
            c.id === carritoId
              ? { ...c, items: c.items.map((i) => (i.productoId === productoId ? { ...i, operarioId } : i)) }
              : c
          ),
        })),
      setCliente: (carritoId, cliente) =>
        set((st) => ({
          carritos: st.carritos.map((c) =>
            c.id === carritoId
              ? { ...c, clienteId: cliente?.id ?? null, clienteNombre: cliente?.nombre ?? null }
              : c
          ),
        })),
      vaciarCarrito: (carritoId) =>
        set((st) => ({
          carritos: st.carritos.map((c) =>
            c.id === carritoId ? { ...c, items: [], clienteId: null, clienteNombre: null } : c
          ),
        })),
    }),
    {
      name: 'te-reparo-pos',
      partialize: (st) => ({ carritos: st.carritos, carritoActivo: st.carritoActivo, tallerActivoId: st.tallerActivoId }),
    }
  )
)
