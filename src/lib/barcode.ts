// Generador de código de barras CODE128-B → SVG (sin dependencias externas).
// El POS acepta lectores HID estándar; el SVG se usa para etiquetas/productos.

const PATRONES: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212',
  '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221',
  '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221',
  '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321',
  '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131',
  '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131',
  '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111',
  '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242',
  '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311',
  '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

const START_B = 104
const STOP = 106

/** Codifica texto ASCII en CODE128-B y devuelve un SVG string. */
export function code128Svg(texto: string, opts?: { anchoModulo?: number; alto?: number }): string {
  const modulo = opts?.anchoModulo ?? 2
  const alto = opts?.alto ?? 64
  const limpio = texto.replace(/[^\x20-\x7E]/g, '')
  if (!limpio) return ''

  const valores: number[] = [START_B]
  for (const c of limpio) valores.push(c.charCodeAt(0) - 32)
  // checksum
  let suma = START_B
  valores.slice(1).forEach((v, i) => {
    suma += v * (i + 1)
  })
  valores.push(suma % 103)
  valores.push(STOP)

  // barras: alternando barra/espacio con anchos del patrón
  let x = 10 * modulo // zona de silencio
  const rects: string[] = []
  for (const v of valores) {
    const patron = PATRONES[v]
    for (let i = 0; i < patron.length; i++) {
      const ancho = Number(patron[i]) * modulo
      if (i % 2 === 0) {
        rects.push(`<rect x="${x}" y="0" width="${ancho}" height="${alto}" fill="#000"/>`)
      }
      x += ancho
    }
  }
  const total = x + 10 * modulo
  const fontSize = Math.max(10, modulo * 7)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${alto + fontSize + 6}" viewBox="0 0 ${total} ${alto + fontSize + 6}" role="img" aria-label="Código de barras ${escapeHtml(limpio)}">` +
    rects.join('') +
    `<text x="${total / 2}" y="${alto + fontSize}" font-family="monospace" font-size="${fontSize}" text-anchor="middle" fill="#000">${escapeHtml(limpio)}</text>` +
    `</svg>`
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
