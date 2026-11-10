// Ajustes globales (tabla Ajuste) y tasas de cambio vigentes.
import { db } from '@/lib/db'
import { D, type Tasas } from '@/lib/money'

export async function obtenerAjustesMap(): Promise<Record<string, string>> {
  const filas = await db.ajuste.findMany()
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]))
}

export async function ajusteValor(clave: string, defecto: string): Promise<string> {
  const fila = await db.ajuste.findUnique({ where: { clave } })
  return fila?.valor ?? defecto
}

/** Tasas vigentes (última TasaCambio por moneda). USD y EUR hacia CUP. */
export async function tasasVigentes(): Promise<Tasas> {
  const [usd, eur] = await Promise.all([
    db.tasaCambio.findFirst({ where: { moneda: 'USD' }, orderBy: { fechaVigencia: 'desc' } }),
    db.tasaCambio.findFirst({ where: { moneda: 'EUR' }, orderBy: { fechaVigencia: 'desc' } }),
  ])
  return { USD: D(usd?.valorCUP), EUR: D(eur?.valorCUP) }
}
