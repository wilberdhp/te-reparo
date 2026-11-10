// Constantes de dominio "Te Reparo" — enums del PRD (almacenados como String en SQLite,
// validados con Zod en servidor). En PostgreSQL pueden convertirse a enums nativos.

export const ROLES = ['ADMIN', 'VENDEDOR', 'VENDEDOR_ONLINE'] as const
export type Rol = (typeof ROLES)[number]

export const RAMAS = ['VENDEDOR', 'INFORMATICO', 'ELECTRONICO', 'ADMIN'] as const
export type Rama = (typeof RAMAS)[number]

export const TIPOS_PRODUCTO = ['VENTA', 'SERVICIO_ELECTRONICA', 'SERVICIO_INFORMATICA'] as const
export type TipoProducto = (typeof TIPOS_PRODUCTO)[number]

export const MONEDAS = ['CUP', 'USD', 'EUR'] as const
export type Moneda = (typeof MONEDAS)[number]

export const TIPOS_PAGO_OPERARIO = ['FIJO', 'PORCENTAJE'] as const
export type TipoPagoOperario = (typeof TIPOS_PAGO_OPERARIO)[number]

export const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'ZELLE'] as const
export type MetodoPago = (typeof METODOS_PAGO)[number]

export const ESTADOS_VENTA = ['COMPLETADA', 'DEVUELTA_PARCIAL', 'DEVUELTA_TOTAL'] as const
export type EstadoVenta = (typeof ESTADOS_VENTA)[number]

export const TIPOS_MOVIMIENTO = [
  'ENTRADA',
  'VENTA',
  'DEVOLUCION_DEFECTUOSO',
  'BAJA_DEFECTUOSO',
  'AJUSTE',
  'TRANSFERENCIA_SALIDA',
  'TRANSFERENCIA_ENTRADA',
] as const
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number]

export const ESTADOS_LIQUIDACION = ['ABIERTA', 'CERRADA'] as const
export type EstadoLiquidacion = (typeof ESTADOS_LIQUIDACION)[number]

export const TIPOS_GARANTIA = ['REPARACION', 'REEMPLAZO'] as const
export type TipoGarantia = (typeof TIPOS_GARANTIA)[number]

export const RESULTADOS_LOG = ['OK', 'DENEGADO'] as const
export type ResultadoLog = (typeof RESULTADOS_LOG)[number]

export const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  VENDEDOR: 'Vendedor',
  VENDEDOR_ONLINE: 'Vendedor en línea',
}

export const RAMA_LABEL: Record<string, string> = {
  VENDEDOR: 'Vendedor',
  INFORMATICO: 'Informático',
  ELECTRONICO: 'Electrónico',
  ADMIN: 'Administración',
}

export const TIPO_PRODUCTO_LABEL: Record<string, string> = {
  VENTA: 'Producto',
  SERVICIO_ELECTRONICA: 'Servicio (electrónica)',
  SERVICIO_INFORMATICA: 'Servicio (informática)',
}

export const METODO_PAGO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  ZELLE: 'Zelle',
}

export const MOVIMIENTO_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada',
  VENTA: 'Venta',
  DEVOLUCION_DEFECTUOSO: 'Devolución (defectuoso)',
  BAJA_DEFECTUOSO: 'Baja por defectuoso',
  AJUSTE: 'Ajuste',
  TRANSFERENCIA_SALIDA: 'Transferencia (salida)',
  TRANSFERENCIA_ENTRADA: 'Transferencia (entrada)',
}

export const ESTADO_VENTA_LABEL: Record<string, string> = {
  COMPLETADA: 'Completada',
  DEVUELTA_PARCIAL: 'Devuelta parcial',
  DEVUELTA_TOTAL: 'Devuelta total',
}

export function esServicio(tipo: string): boolean {
  return tipo === 'SERVICIO_ELECTRONICA' || tipo === 'SERVICIO_INFORMATICA'
}

export function esRol(v: string): v is Rol {
  return (ROLES as readonly string[]).includes(v)
}

export function esRama(v: string): v is Rama {
  return (RAMAS as readonly string[]).includes(v)
}
