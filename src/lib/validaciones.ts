// Validación Zod de servidor para todos los endpoints.
import { z } from 'zod'
import { Decimal } from '@/lib/money'
import { ROLES, RAMAS, TIPOS_PRODUCTO, MONEDAS, TIPOS_PAGO_OPERARIO, METODOS_PAGO, TIPOS_GARANTIA } from '@/lib/constantes'

/** Decimal aceptando number|string (nunca float en cálculos: se convierte a Decimal). */
export const zDecimal = z
  .union([z.number(), z.string()])
  .refine((v) => {
    try {
      return new Decimal(v).isFinite()
    } catch {
      return false
    }
  }, 'Monto inválido')
  .transform((v) => new Decimal(v))

export const zDecimalNoNeg = zDecimal.refine((v) => v.gte(0), 'No puede ser negativo')
export const zDecimalPositivo = zDecimal.refine((v) => v.gt(0), 'Debe ser mayor que 0')

export const loginSchema = z.object({
  username: z.string().min(1, 'Usuario requerido').max(60),
  password: z.string().min(1, 'Contraseña requerida').max(200),
})

export const tallerSchema = z.object({
  nombre: z.string().min(2, 'Nombre muy corto').max(120),
  direccion: z.string().max(200).default(''),
  telefono: z.string().max(40).default(''),
  logoUrl: z.string().max(500).nullable().optional(),
  activo: z.boolean().optional(),
})

export const usuarioSchema = z.object({
  nombre: z.string().min(2).max(120),
  username: z.string().min(3, 'Usuario muy corto').max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras, números, . _ -'),
  password: z.string().min(6, 'Mínimo 6 caracteres').max(200),
  rol: z.enum(ROLES),
  tallerId: z.string().nullable().optional(),
  operarioId: z.string().nullable().optional(),
  activo: z.boolean().optional(),
})

export const usuarioUpdateSchema = usuarioSchema.partial().extend({
  password: z.string().min(6).max(200).optional(),
})

export const operarioSchema = z.object({
  nombre: z.string().min(2).max(120),
  rama: z.enum(RAMAS),
  activo: z.boolean().optional(),
  tallerIds: z.array(z.string()).optional(),
})

export const operarioUpdateSchema = operarioSchema.partial()

export const productoSchema = z.object({
  tallerId: z.string(),
  codigoInterno: z.string().trim().max(40).optional(),
  codigoBarras: z.string().trim().max(40).optional(),
  categoria: z.string().min(1, 'Categoría requerida').max(60),
  nombre: z.string().min(2, 'Nombre muy corto').max(160),
  tipo: z.enum(TIPOS_PRODUCTO),
  cantidad: z.number().int().min(0).optional(), // solo lectura inicial; el stock cambia por movimientos
  costo: zDecimalNoNeg.optional(),
  unidad: z.string().max(20).default('u'),
  stockMinimo: z.number().int().min(0).optional(),
  precio: zDecimalNoNeg,
  monedaPrecio: z.enum(MONEDAS),
  pagoOperarioTipo: z.enum(TIPOS_PAGO_OPERARIO).optional(),
  pagoOperarioValor: zDecimalNoNeg.optional(),
  garantiaDias: z.number().int().min(0).max(3650).optional(),
  activo: z.boolean().optional(),
})

export const productoUpdateSchema = productoSchema.partial().omit({ tallerId: true, cantidad: true })

export const entradaInventarioSchema = z.object({
  productoId: z.string(),
  cantidad: z.number().int().positive('Cantidad debe ser > 0'),
  costoUnitario: zDecimalNoNeg.optional(),
  nota: z.string().max(300).optional(),
})

export const bajaDefectuosoSchema = z.object({
  productoId: z.string(),
  cantidad: z.number().int().positive('Cantidad debe ser > 0'),
  motivo: z.string().min(3, 'Motivo requerido').max(300),
})

export const ajusteInventarioSchema = z.object({
  productoId: z.string(),
  cantidad: z.number().int().refine((v) => v !== 0, 'Cantidad no puede ser 0'),
  motivo: z.string().min(3, 'Motivo requerido').max(300),
})

export const transferenciaSchema = z.object({
  productoId: z.string(),
  tallerDestinoId: z.string(),
  cantidad: z.number().int().positive('Cantidad debe ser > 0'),
  nota: z.string().max(300).optional(),
})

export const clienteSchema = z.object({
  nombre: z.string().min(2, 'Nombre muy corto').max(120),
  telefono: z.string().max(30).nullable().optional(),
  ci: z.string().max(20).nullable().optional(),
})

export const ventaSchema = z.object({
  tallerId: z.string(),
  clienteId: z.string().nullable().optional(),
  plantillaId: z.string().nullable().optional(), // plantilla de ticket elegida en el POS
  items: z
    .array(
      z.object({
        productoId: z.string(),
        cantidad: z.number().int().positive(),
        precioUnitario: zDecimalPositivo.nullable().optional(), // edición de precio
        operarioId: z.string().nullable().optional(),
        // Costo interno (moneda del ítem): NO suma al total del cliente; sirve para
        // ganancia y para descontar la base del pago PORCENTAJE. Se admite costo
        // mayor que el precio de venta (pérdida asumida por el taller).
        costoAdicional: zDecimalNoNeg.nullable().optional(),
        descripcionAdicional: z.string().max(500, 'La nota de línea admite hasta 500 caracteres').nullable().optional(),
      })
    )
    .min(1, 'La venta necesita al menos una línea'),
  pagos: z
    .array(
      z.object({
        metodo: z.enum(METODOS_PAGO),
        moneda: z.enum(MONEDAS),
        monto: zDecimalPositivo,
        referencia: z.string().max(100).nullable().optional(),
      })
    )
    .min(1, 'Registre al menos un pago'),
})

export const devolucionSchema = z.object({
  ventaId: z.string(),
  motivo: z.string().min(3, 'Motivo requerido').max(300),
  items: z
    .array(
      z.object({
        ventaItemId: z.string(),
        cantidad: z.number().int().positive(),
        motivo: z.string().min(3, 'Motivo del ítem requerido').max(300),
      })
    )
    .min(1, 'Seleccione al menos un ítem'),
})

export const garantiaSchema = z.object({
  ventaItemId: z.string(),
  descripcion: z.string().min(3, 'Descripción requerida').max(500),
  tipo: z.enum(TIPOS_GARANTIA),
  productoReemplazoId: z.string().nullable().optional(), // obligatorio si REEMPLAZO
  cantidadReemplazo: z.number().int().positive().optional(),
})

export const tasaSchema = z.object({
  moneda: z.enum(['USD', 'EUR']),
  valorCUP: zDecimalPositivo,
})

export const ajustesSchema = z.object({
  ticketAncho: z.enum(['58', '80']).optional(),
  ticketEncabezado: z.string().max(200).optional(),
  ticketPie: z.string().max(200).optional(),
  porcentajeAdmin: zDecimalNoNeg.refine((v) => v.lte(100), 'Máximo 100').optional(),
})

export const cerrarLiquidacionSchema = z.object({
  tallerId: z.string(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
})

export const plantillaSchema = z.object({
  nombre: z.string().min(2, 'Nombre muy corto').max(120),
  contenido: z.string().min(3, 'La plantilla necesita contenido').max(5000),
  activo: z.boolean().optional(),
})

export const plantillaUpdateSchema = plantillaSchema.partial()

/** Auditoría de acciones del POS en el carrito (antes de confirmar la venta). */
export const logPosSchema = z.object({
  accion: z.enum(['MODIFICAR_COSTO_ITEM', 'AGREGAR_NOTA_ITEM']),
  productoId: z.string(),
  productoNombre: z.string().min(1).max(160),
  tallerId: z.string().nullable().optional(),
  antes: z.record(z.string(), z.unknown()).nullable().optional(),
  despues: z.record(z.string(), z.unknown()).nullable().optional(),
})
