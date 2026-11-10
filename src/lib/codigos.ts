// Generación de códigos únicos visibles en tickets: V000123 (venta),
// D000045 (devolución), C000007 (comprobante de pago).
// Usa contadores atómicos en la tabla Ajuste DENTRO de la transacción de cada
// operación, por lo que son únicos y sin huecos por reinicio de app.

import { Prisma } from '@prisma/client'

/** Reserva el siguiente número de secuencia para `prefijo` (llamar dentro de la tx). */
export async function siguienteSecuencia(
  tx: Prisma.TransactionClient,
  contador: string
): Promise<number> {
  const clave = `seq_${contador}`
  const actual = await tx.ajuste.findUnique({ where: { clave } })
  const n = actual ? Number(actual.valor) + 1 : 1
  if (actual) {
    await tx.ajuste.update({ where: { clave }, data: { valor: String(n) } })
  } else {
    await tx.ajuste.create({ data: { clave, valor: String(n) } })
  }
  return n
}

export function codigoVenta(n: number): string {
  return `V${String(n).padStart(6, '0')}`
}

export function codigoDevolucion(n: number): string {
  return `D${String(n).padStart(6, '0')}`
}

export function codigoComprobante(n: number): string {
  return `C${String(n).padStart(6, '0')}`
}

/**
 * Código interno sugerido para productos: T{tallerNum}-{secuencial de 6 dígitos}
 * (el PRD sugiere T{tallerId}-{secuencial}; se usa el número de taller para brevedad).
 */
export function codigoInternoSugerido(tallerNum: number, secuencial: number): string {
  return `T${tallerNum}-${String(secuencial).padStart(6, '0')}`
}

/** Número corto de taller a partir de su id (estable, solo dígitos). */
export function numeroTaller(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 100000
  return h % 900 + 1
}
