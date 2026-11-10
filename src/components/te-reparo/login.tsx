'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Wrench, Loader2 } from 'lucide-react'
import { api } from '@/lib/api-client'

export function Login({ alIniciar }: { alIniciar: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCargando(true)
    try {
      await api.post('/api/auth/login', { username, password })
      alIniciar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-gray dark:bg-brand-black p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-brand-red flex items-center justify-center shadow-md">
            <Wrench className="h-8 w-8 text-white" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold tracking-tight">
              Te<span className="text-brand-red">Reparo</span>
            </CardTitle>
            <CardDescription className="mt-1">Gestión de talleres y punto de venta</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-4" aria-label="Iniciar sesión">
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full h-11 text-base" disabled={cargando}>
              {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
              {cargando ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
