'use client'
// Mapa central de atajos de teclado de "Te Reparo" (documento vivo).
// Se usa en el modal de ayuda (Shift + ?) y como referencia de implementación.

export type AmbitoAtajo = 'global' | 'pos' | 'formularios' | 'tablas'

export interface DefAtajo {
  teclas: string
  descripcion: string
  ambito: AmbitoAtajo
}

export const ATAJOS_GLOBAL: DefAtajo[] = [
  { teclas: 'Alt + 1', descripcion: 'Ir al Panel (Dashboard)', ambito: 'global' },
  { teclas: 'Alt + 2', descripcion: 'Ir al Punto de Venta (POS)', ambito: 'global' },
  { teclas: 'Alt + 3', descripcion: 'Ir a Inventario', ambito: 'global' },
  { teclas: 'Alt + 4', descripcion: 'Ir al Historial de Ventas', ambito: 'global' },
  { teclas: 'Alt + 5', descripcion: 'Ir a Clientes', ambito: 'global' },
  { teclas: 'Alt + 6', descripcion: 'Ir a Liquidaciones (pagos a operarios)', ambito: 'global' },
  { teclas: 'Alt + 7', descripcion: 'Ir a Configuración (solo ADMIN)', ambito: 'global' },
  { teclas: 'Shift + ?', descripcion: 'Mostrar esta lista de atajos', ambito: 'global' },
  { teclas: 'Esc', descripcion: 'Cerrar modales, dropdowns o limpiar la búsqueda actual', ambito: 'global' },
]

export const ATAJOS_POS: DefAtajo[] = [
  { teclas: 'F2', descripcion: 'Enfocar el buscador de productos', ambito: 'pos' },
  { teclas: 'F4', descripcion: 'Crear un nuevo carrito (pestaña)', ambito: 'pos' },
  { teclas: 'Ctrl + Tab', descripcion: 'Cambiar al siguiente carrito abierto', ambito: 'pos' },
  { teclas: 'Ctrl + Shift + Tab', descripcion: 'Cambiar al carrito anterior', ambito: 'pos' },
  { teclas: 'Enter', descripcion: 'En el buscador: agrega el primer producto (o el código exacto del lector)', ambito: 'pos' },
  { teclas: 'F8', descripcion: 'Asignar o buscar cliente', ambito: 'pos' },
  { teclas: 'F9', descripcion: 'Abrir el panel de cobro (pagos)', ambito: 'pos' },
  { teclas: 'Enter', descripcion: 'En el panel de cobro: confirma la venta (si el monto cubre el total)', ambito: 'pos' },
  { teclas: '↑ / ↓', descripcion: 'Navegar entre las líneas del carrito', ambito: 'pos' },
  { teclas: '+ / −', descripcion: 'Aumentar o disminuir la cantidad de la línea seleccionada', ambito: 'pos' },
  { teclas: 'Ctrl + Supr', descripcion: 'Eliminar la línea seleccionada del carrito', ambito: 'pos' },
  { teclas: 'Ctrl + E', descripcion: 'Editar el precio de la línea seleccionada', ambito: 'pos' },
  { teclas: 'Ctrl + N', descripcion: 'Abrir y enfocar la nota adicional de la línea seleccionada', ambito: 'pos' },
  { teclas: 'Ctrl + C', descripcion: 'Enfocar el costo interno de la línea seleccionada (si no hay texto seleccionado; si lo hay, copia normal)', ambito: 'pos' },
]

export const ATAJOS_FORMULARIOS: DefAtajo[] = [
  { teclas: 'Ctrl + S', descripcion: 'Guardar el formulario actual', ambito: 'formularios' },
  { teclas: 'Esc', descripcion: 'Cancelar la edición o cerrar el formulario sin guardar', ambito: 'formularios' },
]

export const ATAJOS_TABLAS: DefAtajo[] = [
  { teclas: '↑ / ↓', descripcion: 'Navegar entre filas de una tabla', ambito: 'tablas' },
  { teclas: 'Enter', descripcion: 'Abrir el detalle o editar la fila seleccionada', ambito: 'tablas' },
  { teclas: 'Supr', descripcion: 'Eliminar o desactivar el registro seleccionado (con confirmación)', ambito: 'tablas' },
]

export const NOTA_CTRL_TAB =
  'Nota: algunos navegadores reservan Ctrl + Tab para cambiar de pestaña. Si su navegador no lo permite, use los botones de pestaña del carrito o F4 para crear uno nuevo.'

export const NOTA_CTRL_N =
  'Nota: Chrome/Edge reservan Ctrl + N para abrir una ventana nueva; en modo quiosco o PWA (instalado) el atajo llega a la app. Como alternativa, use el botón 📝 de la línea del carrito.'

export const NOTA_CTRL_C =
  'Nota: Ctrl + C solo enfoca el costo interno si NO hay texto seleccionado; si seleccionó texto, el navegador copia con normalidad.'

/** Módulo destino de cada Alt+N (usado por los atajos globales del Shell). */
export const VISTA_POR_ALT: Record<string, string> = {
  '1': 'dashboard',
  '2': 'pos',
  '3': 'inventario',
  '4': 'ventas',
  '5': 'clientes',
  '6': 'liquidaciones',
  '7': 'configuracion',
}

export const TITULO_AMBITO: Record<AmbitoAtajo, string> = {
  global: 'Navegación global',
  pos: 'Punto de venta (POS)',
  formularios: 'Formularios',
  tablas: 'Tablas',
}
