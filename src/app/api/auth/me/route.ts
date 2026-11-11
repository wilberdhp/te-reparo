import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route } from '@/lib/http'
import { usuarioActual } from '@/lib/auth'
import { tasasVigentes, obtenerAjustesMap } from '@/lib/ajustes'
import { serializar } from '@/lib/money'

/** Sesión actual + talleres visibles + tasas vigentes + ajustes de ticket. */
export const GET = route(async (req: NextRequest) => {
  const usuario = await usuarioActual(req)
  if (!usuario) return NextResponse.json({ autenticado: false })

  let talleres: Array<{ id: string; nombre: string; activo: boolean }> = []
  if (usuario.rol === 'ADMIN' || usuario.rol === 'VENDEDOR_ONLINE') {
    talleres = await db.taller.findMany({
      where: usuario.rol === 'VENDEDOR_ONLINE' ? { activo: true } : undefined,
      select: { id: true, nombre: true, activo: true },
      orderBy: { nombre: 'asc' },
      take: 100,
    })
  } else if (usuario.tallerId) {
    talleres = await db.taller.findMany({
      where: { id: usuario.tallerId },
      select: { id: true, nombre: true, activo: true },
      take: 1,
    })
  }

  const [tasas, ajustes] = await Promise.all([tasasVigentes(), obtenerAjustesMap()])

  return NextResponse.json(
    serializar({
      autenticado: true,
      usuario,
      talleres,
      tasas: { USD: tasas.USD, EUR: tasas.EUR },
      ajustes,
    })
  )
})
