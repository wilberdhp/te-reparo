import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { route, ApiError, requireAuth, requireTaller, csv, respuestaCsv } from '@/lib/http'
import { registrarLog } from '@/lib/audit'
import { ventaSchema } from '@/lib/validaciones'
import { tasasVigentes } from '@/lib/ajustes'
import { serializar, D, d2, convertirACUP, tasaAplicada } from '@/lib/money'
import { esServicio } from '@/lib/constantes'
import { siguienteSecuencia, codigoVenta } from '@/lib/codigos'
import { calcularPagoLinea } from '@/lib/pagos'
import { paginacionDesde, metaPaginacion } from '@/lib/paginacion'
import { ventanaDia } from '@/lib/fecha'

/**
 * GET /api/ventas — historial con filtros (taller ADMIN, vendedor, cliente,
 * fecha desde/hasta, estado, método de pago). ?id= detalle completo.
 * ?export=csv → exportación CSV.
 */
export const GET = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (id) {
    const venta = await db.venta.findUnique({
      where: { id },
      include: {
        taller: true,
        cliente: true,
        vendedor: { select: { nombre: true, username: true, rol: true } },
        items: {
          include: {
            producto: { select: { nombre: true, codigoInterno: true, tipo: true } },
            operario: { select: { nombre: true, rama: true } },
            garantias: true,
            devolucionItems: { include: { devolucion: { select: { codigo: true } } } },
          },
        },
        pagos: true,
        devoluciones: { include: { items: true } },
      },
    })
    if (!venta) throw new ApiError(404, 'Venta no encontrada')
    await requireTaller(req, usuario, venta.tallerId, { permitirInactivo: true })
    const ajustes = await db.ajuste.findMany()
    const plantillas = await db.plantillaTicket.findMany({
      where: { ventas: { some: { id: venta.id } } },
      select: { id: true, nombre: true, contenido: true },
    })
    return NextResponse.json(
      serializar({
        venta,
        // plantilla usada al imprimir esta venta (null → diseño por defecto)
        plantilla: plantillas[0] ?? null,
        ajustes: Object.fromEntries(ajustes.map((a) => [a.clave, a.valor])),
      })
    )
  }

  const tallerId = url.searchParams.get('tallerId')
  const vendedorUsuarioId = url.searchParams.get('vendedorUsuarioId')
  const clienteId = url.searchParams.get('clienteId')
  const estado = url.searchParams.get('estado')
  const metodo = url.searchParams.get('metodo')
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')
  const q = url.searchParams.get('q')
  const exportar = url.searchParams.get('export')
  const pag = paginacionDesde(req)

  const taller = await requireTaller(req, usuario, tallerId, { permitirInactivo: true })

  // Filtros por fecha civil en la zona del negocio (no la del servidor)
  const dDesde = desde ? ventanaDia(desde).inicio : null
  const dHasta = hasta ? ventanaDia(hasta).fin : null

  const where = {
    tallerId: taller.id,
    ...(vendedorUsuarioId ? { vendedorUsuarioId } : {}),
    ...(clienteId ? { clienteId } : {}),
    ...(estado ? { estado } : {}),
    ...(dDesde || dHasta ? { fecha: { ...(dDesde ? { gte: dDesde } : {}), ...(dHasta ? { lt: dHasta } : {}) } } : {}),
    ...(metodo ? { pagos: { some: { metodo } } } : {}),
    // La búsqueda por código/cliente ahora se resuelve en el servidor para que
    // funcione junto con la paginación (antes filtraba la página en el cliente).
    ...(q ? { OR: [{ codigo: { contains: q } }, { cliente: { nombre: { contains: q } } }] } : {}),
  }

  const include = {
    cliente: { select: { nombre: true } },
    vendedor: { select: { nombre: true, username: true } },
    _count: { select: { items: true, pagos: true, devoluciones: true } },
  }

  // Exportación CSV (§5): consulta TODOS los registros que coinciden con los
  // filtros vigentes, sin take/skip — ya no exporta "lo que hay en pantalla".
  if (exportar === 'csv') {
    const ventas = await db.venta.findMany({ where, include, orderBy: { fecha: 'desc' } })
    const filas = ventas.map((v) => ({
      codigo: v.codigo,
      fecha: v.fecha.toISOString(),
      taller: taller.nombre,
      cliente: v.cliente?.nombre ?? 'Consumidor final',
      vendedor: v.vendedor?.nombre ?? '',
      estado: v.estado,
      totalCUP: d2(D(v.totalCUP)).toFixed(2),
      items: v._count.items,
    }))
    return respuestaCsv(csv(filas), 'ventas.csv')
  }

  // Paginación del lado del servidor (§2): datos + total con los mismos filtros.
  if (pag) {
    const [ventas, total] = await Promise.all([
      db.venta.findMany({ where, include, orderBy: { fecha: 'desc' }, take: pag.limit, skip: pag.skip }),
      db.venta.count({ where }),
    ])
    return NextResponse.json(
      serializar({ ventas, taller, page: pag.page, limit: pag.limit, ...metaPaginacion(total, pag.limit) })
    )
  }

  // Modo legado sin ?page= (compatibilidad): tope anterior.
  const ventas = await db.venta.findMany({ where, include, orderBy: { fecha: 'desc' }, take: 300 })
  return NextResponse.json(serializar({ ventas, taller }))
})

/**
 * POST /api/ventas — POS: transacción ATÓMICA completa:
 * validar stock → crear venta → ítems (con snapshots) → pagos (multimoneda, tasa
 * vigente) → movimientos de inventario → logs → devolver código para el ticket.
 */
export const POST = route(async (req: NextRequest) => {
  const usuario = await requireAuth(req)
  const datos = ventaSchema.parse(await req.json())
  const taller = await requireTaller(req, usuario, datos.tallerId)

  // Cliente opcional: sin cliente → ventaMostrador
  let cliente: { id: string; nombre: string } | null = null
  if (datos.clienteId) {
    cliente = await db.cliente.findUnique({
      where: { id: datos.clienteId },
      select: { id: true, nombre: true },
    })
    if (!cliente) throw new ApiError(404, 'Cliente no encontrado')
  }

  const tasas = await tasasVigentes()
  if (tasas.USD.lte(0) || tasas.EUR.lte(0)) {
    throw new ApiError(400, 'Debe configurar las tasas de cambio antes de vender')
  }

  // Plantilla de ticket seleccionada en el POS (opcional)
  let plantilla: { id: string; nombre: string } | null = null
  if (datos.plantillaId) {
    const p = await db.plantillaTicket.findUnique({
      where: { id: datos.plantillaId },
      select: { id: true, nombre: true, activo: true },
    })
    if (!p || !p.activo) throw new ApiError(400, 'Plantilla de ticket inválida o desactivada')
    plantilla = { id: p.id, nombre: p.nombre }
  }

  const venta = await db.$transaction(async (tx) => {
    // ---------- 1. Validar ítems y stock ----------
    const itemsPreparados: Array<{
      producto: { id: string; nombre: string; tipo: string; precio: import('decimal.js').Decimal; monedaPrecio: string; costo: import('decimal.js').Decimal; cantidad: number; activo: boolean; tallerId: string; garantiaDias: number; pagoOperarioTipo: string; pagoOperarioValor: import('decimal.js').Decimal }
      cantidad: number
      operarioId: string | null
      precioUnitario: import('decimal.js').Decimal
      precioOriginal: import('decimal.js').Decimal | null
      precioEditado: boolean
      costoAdicional: import('decimal.js').Decimal | null
      descripcionAdicional: string | null
    }> = []
    const ediciones: Array<{ nombre: string; moneda: string; precioOriginal: string; precioFinal: string }> = []

    for (const item of datos.items) {
      const producto = await tx.producto.findUnique({ where: { id: item.productoId } })
      if (!producto) throw new ApiError(404, `Producto no encontrado (${item.productoId})`)
      if (!producto.activo) throw new ApiError(400, `Producto inactivo: ${producto.nombre}`)
      if (producto.tallerId !== taller.id) {
        throw new ApiError(400, `El producto ${producto.nombre} no pertenece a ${taller.nombre}`)
      }

      if (esServicio(producto.tipo)) {
        if (item.cantidad !== 1) throw new ApiError(400, `El servicio ${producto.nombre} se vende de a 1`)
        if (!item.operarioId) {
          throw new ApiError(400, `El servicio ${producto.nombre} requiere operario asignado`)
        }
      } else if (producto.cantidad < item.cantidad) {
        throw new ApiError(400, `Stock insuficiente de ${producto.nombre}: disponible ${producto.cantidad}`)
      }

      let operarioId: string | null = null
      if (item.operarioId) {
        const operario = await tx.operario.findUnique({ where: { id: item.operarioId } })
        if (!operario || !operario.activo) throw new ApiError(400, 'Operario inválido o inactivo')
        operarioId = operario.id
      }

      const precioOriginal = D(producto.precio)
      let precioUnitario = precioOriginal
      let precioEditado = false
      if (item.precioUnitario !== undefined && item.precioUnitario !== null && !D(item.precioUnitario).eq(precioOriginal)) {
        precioUnitario = D(item.precioUnitario)
        precioEditado = true
      }

      // Costo interno (moneda del ítem): NO afecta el total del cliente; se usa
      // para ganancia y para descontar la base del pago PORCENTAJE. Puede superar
      // el precio de venta (pérdida asumida) — se admite con advertencia visual en POS.
      const costoAdicional =
        item.costoAdicional === undefined || item.costoAdicional === null ? null : d2(item.costoAdicional)
      const descripcionAdicional = item.descripcionAdicional?.trim() || null

      itemsPreparados.push({
        producto: {
          id: producto.id, nombre: producto.nombre, tipo: producto.tipo,
          precio: D(producto.precio), monedaPrecio: producto.monedaPrecio,
          costo: D(producto.costo), cantidad: producto.cantidad, activo: producto.activo,
          tallerId: producto.tallerId, garantiaDias: producto.garantiaDias,
          pagoOperarioTipo: producto.pagoOperarioTipo, pagoOperarioValor: D(producto.pagoOperarioValor),
        },
        cantidad: item.cantidad,
        operarioId,
        precioUnitario,
        precioOriginal,
        precioEditado,
        costoAdicional,
        descripcionAdicional,
      })
    }

    // ---------- 2. Totales ----------
    let totalCUP = D(0)
    for (const it of itemsPreparados) {
      const precioUnitarioCUP = convertirACUP(it.precioUnitario, it.producto.monedaPrecio, tasas)
      totalCUP = totalCUP.plus(precioUnitarioCUP.times(it.cantidad))
    }
    totalCUP = d2(totalCUP)

    // ---------- 3. Pagos multimoneda ----------
    let cubierto = D(0)
    for (const pago of datos.pagos) {
      if (pago.metodo === 'ZELLE') {
        if (pago.moneda !== 'USD') throw new ApiError(400, 'Zelle solo se acepta en USD')
        if (!pago.referencia || !pago.referencia.trim()) {
          throw new ApiError(400, 'Zelle requiere referencia obligatoria')
        }
      }
      cubierto = cubierto.plus(convertirACUP(pago.monto, pago.moneda, tasas))
    }
    if (cubierto.lt(totalCUP)) {
      throw new ApiError(400, `Los pagos (${d2(cubierto).toFixed(2)} CUP) no cubren el total (${totalCUP.toFixed(2)} CUP)`)
    }

    // ---------- 4. Crear venta + ítems + pagos + movimientos ----------
    const seq = await siguienteSecuencia(tx, 'venta')
    const codigo = codigoVenta(seq)

    const ventaCreada = await tx.venta.create({
      data: {
        codigo,
        tallerId: taller.id,
        clienteId: cliente?.id ?? null,
        vendedorUsuarioId: usuario.id,
        estado: 'COMPLETADA',
        totalCUP,
        tasaUSDSnapshot: tasas.USD,
        tasaEURSnapshot: tasas.EUR,
        ventaMostrador: !cliente,
        plantillaId: plantilla?.id ?? null,
      },
    })

    for (const it of itemsPreparados) {
      const precioUnitarioCUP = convertirACUP(it.precioUnitario, it.producto.monedaPrecio, tasas)
      const subtotalCUP = d2(precioUnitarioCUP.times(it.cantidad))
      await tx.ventaItem.create({
        data: {
          ventaId: ventaCreada.id,
          productoId: it.producto.id,
          cantidad: it.cantidad,
          precioUnitario: it.precioUnitario,
          monedaPrecio: it.producto.monedaPrecio,
          precioUnitarioCUP,
          subtotalCUP,
          operarioId: it.operarioId,
          pagoOperarioTipoSnapshot: it.producto.pagoOperarioTipo,
          pagoOperarioValorSnapshot: it.producto.pagoOperarioValor,
          garantiaDiasSnapshot: it.producto.garantiaDias,
          cantidadDevuelta: 0,
          precioOriginal: it.precioEditado ? it.precioOriginal : null,
          precioEditado: it.precioEditado,
          costoAdicional: it.costoAdicional,
          descripcionAdicional: it.descripcionAdicional,
        },
      })
      // Movimiento de inventario (solo productos; servicios no manejan stock)
      if (!esServicio(it.producto.tipo)) {
        await tx.movimientoInventario.create({
          data: {
            productoId: it.producto.id,
            tipo: 'VENTA',
            cantidad: it.cantidad,
            costoUnitario: it.producto.costo,
            usuarioId: usuario.id,
            ventaId: ventaCreada.id,
            nota: `Venta ${codigo}`,
          },
        })
        await tx.producto.update({
          where: { id: it.producto.id },
          data: { cantidad: { decrement: it.cantidad } },
        })
      }
    }

    for (const pago of datos.pagos) {
      await tx.pagoVenta.create({
        data: {
          ventaId: ventaCreada.id,
          metodo: pago.metodo,
          moneda: pago.moneda,
          monto: pago.monto,
          tasaAplicada: tasaAplicada(pago.moneda, tasas),
          montoCUP: convertirACUP(pago.monto, pago.moneda, tasas),
          referencia: pago.referencia?.trim() || null,
        },
      })
    }

    for (const it of itemsPreparados) {
      if (it.precioEditado && it.precioOriginal) {
        ediciones.push({
          nombre: it.producto.nombre,
          moneda: it.producto.monedaPrecio,
          precioOriginal: it.precioOriginal.toFixed(2),
          precioFinal: it.precioUnitario.toFixed(2),
        })
      }
    }

    return { id: ventaCreada.id, codigo, totalCUP, items: itemsPreparados.length, ediciones, conCostoInterno: itemsPreparados.filter((i) => i.costoAdicional && i.costoAdicional.gt(0)).length, conNotas: itemsPreparados.filter((i) => i.descripcionAdicional).length }
  })

  await registrarLog({
    req,
    usuarioId: usuario.id,
    tallerId: taller.id,
    accion: 'CREAR',
    entidad: 'Venta',
    entidadId: venta.id,
    resultado: 'OK',
    despues: { codigo: venta.codigo, totalCUP: venta.totalCUP.toFixed(2), items: venta.items, cliente: cliente?.nombre ?? 'Consumidor final', plantilla: plantilla?.nombre ?? null, lineasConCostoInterno: venta.conCostoInterno, lineasConNota: venta.conNotas },
  })

  // Plantilla usada para imprimir esta venta (§7 SELECCIONAR_PLANTILLA)
  if (plantilla) {
    await registrarLog({
      req,
      usuarioId: usuario.id,
      tallerId: taller.id,
      accion: 'SELECCIONAR_PLANTILLA',
      entidad: 'Venta',
      entidadId: venta.id,
      resultado: 'OK',
      despues: { plantilla: plantilla.nombre, plantillaId: plantilla.id, venta: venta.codigo },
    })
  }

  // Log de precios editados (PRD §4.2)
  for (const ed of venta.ediciones) {
    await registrarLog({
      req,
      usuarioId: usuario.id,
      tallerId: taller.id,
      accion: 'EDICION_PRECIO',
      entidad: 'VentaItem',
      entidadId: venta.id,
      resultado: 'OK',
      antes: { producto: ed.nombre, precio: ed.precioOriginal, moneda: ed.moneda },
      despues: { producto: ed.nombre, precio: ed.precioFinal, moneda: ed.moneda, venta: venta.codigo },
    })
  }

  return NextResponse.json(serializar({ venta }))
})
