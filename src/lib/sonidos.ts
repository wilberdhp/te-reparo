'use client'
// Sonidos de retroalimentación del POS (Web Audio API, sin archivos).
// Beep corto y agudo al agregar producto con el escáner; tono grave al error.

let ctx: AudioContext | null = null

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tono(freq: number, duracion: number, tipo: OscillatorType, volumen: number) {
  const ac = contexto()
  if (!ac) return
  try {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = tipo
    osc.frequency.value = freq
    gain.gain.setValueAtTime(volumen, ac.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duracion)
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start()
    osc.stop(ac.currentTime + duracion)
  } catch {
    /* sin sonido — la app sigue funcionando */
  }
}

/** ¿Están los sonidos activados? (preferencia en localStorage, activados por defecto) */
export function sonidosActivos(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('tr_sonido') !== 'off'
  } catch {
    return true
  }
}

export function alternarSonidos(): boolean {
  const nuevo = !sonidosActivos()
  try {
    window.localStorage.setItem('tr_sonido', nuevo ? 'on' : 'off')
  } catch {
    /* ignorar */
  }
  return nuevo
}

/** Beep corto y agudo: producto agregado / venta completada */
export function sonidoExito() {
  if (!sonidosActivos()) return
  tono(1175, 0.09, 'square', 0.04)
}

/** Beep doble de confirmación de venta */
export function sonidoVenta() {
  if (!sonidosActivos()) return
  tono(880, 0.08, 'square', 0.05)
  setTimeout(() => tono(1318, 0.12, 'square', 0.05), 90)
}

/** Tono grave: error (producto no encontrado, stock insuficiente…) */
export function sonidoError() {
  if (!sonidosActivos()) return
  tono(196, 0.22, 'sawtooth', 0.05)
}
