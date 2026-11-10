'use client'
// Cliente HTTP con manejo de errores y toasts.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  const texto = await res.text()
  const datos = texto ? JSON.parse(texto) : {}
  if (!res.ok) {
    throw new ApiError(res.status, datos.error ?? `Error ${res.status}`)
  }
  return datos as T
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
}

/** Descarga un adjunto (CSV/JSON) desde un endpoint de la API. */
export async function descargar(url: string, nombre: string): Promise<void> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const datos = await res.json().catch(() => ({ error: 'Error al exportar' }))
    throw new ApiError(res.status, datos.error ?? 'Error al exportar')
  }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}
