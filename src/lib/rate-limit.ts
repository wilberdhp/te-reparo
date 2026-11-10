// Rate limiting en memoria para el login (5 intentos / 15 min por IP+username).
// En despliegue multi-instancia mover a Redis; para el taller piloto es suficiente.
const VENTANA_MS = 15 * 60 * 1000
const MAX_INTENTOS = 5

interface Entrada {
  intentos: number
  expira: number
}

const intentos = new Map<string, Entrada>()

export function demasiadoIntentos(clave: string): boolean {
  const e = intentos.get(clave)
  if (!e) return false
  if (Date.now() > e.expira) {
    intentos.delete(clave)
    return false
  }
  return e.intentos >= MAX_INTENTOS
}

export function registrarFallo(clave: string): void {
  const e = intentos.get(clave)
  if (!e || Date.now() > e.expira) {
    intentos.set(clave, { intentos: 1, expira: Date.now() + VENTANA_MS })
  } else {
    e.intentos += 1
  }
}

export function limpiarIntentos(clave: string): void {
  intentos.delete(clave)
}

/** Limpieza periódica para no acumular memoria. */
if (typeof setInterval === 'function') {
  const t = setInterval(() => {
    const ahora = Date.now()
    for (const [k, v] of intentos) {
      if (ahora > v.expira) intentos.delete(k)
    }
  }, VENTANA_MS)
  // no bloquear el cierre del proceso en Node/Bun
  ;(t as unknown as { unref?: () => void }).unref?.()
}
