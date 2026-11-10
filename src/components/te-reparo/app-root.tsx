'use client'
import { useEffect, useState } from 'react'
import { Login } from './login'
import { Shell } from './shell'
import { api } from '@/lib/api-client'
import { useApp, type UsuarioActual, type TallerInfo } from '@/lib/store'

interface RespuestaSesion {
  autenticado: boolean
  usuario?: UsuarioActual
  talleres?: TallerInfo[]
  tasas?: { USD: number; EUR: number }
  ajustes?: Record<string, string>
}

export function AppRoot() {
  const [cargando, setCargando] = useState(true)
  const [autenticado, setAutenticado] = useState(false)
  const setSesion = useApp((s) => s.setSesion)
  const setVista = useApp((s) => s.setVista)

  async function cargarSesion() {
    try {
      const res = await api.get<RespuestaSesion>('/api/auth/me')
      if (res.autenticado && res.usuario) {
        setSesion({
          usuario: res.usuario,
          talleres: res.talleres ?? [],
          tasas: res.tasas ?? { USD: 440, EUR: 470 },
          ajustes: res.ajustes ?? {},
        })
        setAutenticado(true)
      } else {
        setAutenticado(false)
      }
    } catch {
      setAutenticado(false)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargarSesion()
     
  }, [])

  async function salir() {
    await api.post('/api/auth/logout').catch(() => undefined)
    setAutenticado(false)
    setVista('dashboard')
    window.location.reload()
  }

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Cargando Te Reparo…</div>
      </div>
    )
  }

  if (!autenticado) {
    return <Login alIniciar={() => window.location.reload()} />
  }

  return <Shell alSalir={salir} />
}
