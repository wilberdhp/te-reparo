'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Confirmación peligrosa en DOS PASOS (§5 del prompt de UI/UX):
 * el primer clic arma el botón (se vuelve rojo y cambia el texto);
 * el segundo clic, dentro de 4 segundos, ejecuta la acción.
 */
export function ConfirmarPeligroso({
  etiqueta,
  etiquetaConfirmar,
  onConfirmar,
  disabled,
  size = 'sm',
  className,
  aviso,
}: {
  etiqueta: string
  etiquetaConfirmar?: string
  onConfirmar: () => void | Promise<void>
  disabled?: boolean
  size?: 'sm' | 'default' | 'lg'
  className?: string
  aviso?: string
}) {
  const [armado, setArmado] = useState(false)
  const [ejecutando, setEjecutando] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function armar() {
    setArmado(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setArmado(false), 4000)
  }

  async function clic() {
    if (disabled || ejecutando) return
    if (!armado) {
      armar()
      toast.warning(aviso ?? 'Pulse de nuevo para confirmar la acción', { duration: 4000 })
      return
    }
    if (timer.current) clearTimeout(timer.current)
    setArmado(false)
    setEjecutando(true)
    try {
      await onConfirmar()
    } finally {
      setEjecutando(false)
    }
  }

  return (
    <Button
      type="button"
      variant={armado ? 'destructive' : 'outline'}
      size={size}
      disabled={disabled || ejecutando}
      onClick={clic}
      aria-live="polite"
      className={className}
    >
      {ejecutando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {ejecutando ? 'Ejecutando…' : armado ? etiquetaConfirmar ?? 'Confirmar eliminación' : etiqueta}
    </Button>
  )
}
