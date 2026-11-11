// Paginación del lado del servidor (prompt de actualización §1/§2):
// ninguna consulta de listado se ejecuta sin `take`; el estado vive en la URL
// (?page=1&limit=25) y las vistas envían esos parámetros a la API.
import type { NextRequest } from 'next/server'

export const LIMITES_PAGINA = [10, 25, 50, 100] as const
export const LIMITE_DEFECTO = 25

export interface Paginacion {
  page: number
  limit: number
  skip: number
}

function esLimiteValido(v: number): v is (typeof LIMITES_PAGINA)[number] {
  return Number.isFinite(v) && (LIMITES_PAGINA as readonly number[]).includes(v)
}

/**
 * Lee ?page=&limit= de los searchParams de la petición.
 * Regla de compatibilidad: si no llega `page` (p. ej. el POS pidiendo el
 * listado completo de productos/clientes/operarios), devuelve null → la
 * consulta entra en "modo legado" con tope de seguridad, sin paginar.
 */
export function paginacionDesde(req: NextRequest, limiteDefecto: number = LIMITE_DEFECTO): Paginacion | null {
  return paginacionDeParams(new URL(req.url).searchParams, limiteDefecto)
}

/** Igual que paginacionDesde pero sobre URLSearchParams (testeable). */
export function paginacionDeParams(
  params: URLSearchParams,
  limiteDefecto: number = LIMITE_DEFECTO
): Paginacion | null {
  if (!params.get('page')) return null
  const bruto = Number(params.get('page'))
  const page = Number.isFinite(bruto) && bruto >= 1 ? Math.floor(bruto) : 1
  let limit = Number(params.get('limit'))
  if (!esLimiteValido(limit)) limit = limiteDefecto
  return { page, limit, skip: (page - 1) * limit }
}

/** { total, totalPages } para la respuesta JSON de las vistas paginadas. */
export function metaPaginacion(total: number, limit: number) {
  return { total, totalPages: Math.max(1, Math.ceil(total / limit)) }
}
