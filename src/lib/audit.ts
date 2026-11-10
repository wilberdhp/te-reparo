// Auditoría: registra todo cambio (create/update/delete/desactivar) y accesos
// denegados. No se registran lecturas GET normales. No editable ni borrable
// desde la app. Exportable por ADMIN (CSV/JSON).
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export interface EntradaLog {
  req?: NextRequest
  usuarioId?: string | null
  tallerId?: string | null
  accion: string
  entidad: string
  entidadId?: string | null
  antes?: Record<string, unknown> | null
  despues?: Record<string, unknown> | null
  resultado: 'OK' | 'DENEGADO'
}

/** Registra una entrada de auditoría; nunca lanza (no rompe el flujo principal). */
export async function registrarLog(entrada: EntradaLog): Promise<void> {
  try {
    const ip =
      entrada.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      entrada.req?.headers.get('x-real-ip') ||
      null
    const userAgent = entrada.req?.headers.get('user-agent') || null
    await db.auditLog.create({
      data: {
        usuarioId: entrada.usuarioId ?? null,
        tallerId: entrada.tallerId ?? null,
        accion: entrada.accion,
        entidad: entrada.entidad,
        entidadId: entrada.entidadId ?? null,
        datosAntes: entrada.antes ? JSON.stringify(entrada.antes) : null,
        datosDespues: entrada.despues ? JSON.stringify(entrada.despues) : null,
        ip,
        userAgent,
        resultado: entrada.resultado,
      },
    })
  } catch (e) {
    console.error('No se pudo registrar en auditoría:', e)
  }
}
