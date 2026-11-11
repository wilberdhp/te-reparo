# Te Reparo — Gestión de talleres y punto de venta

Aplicación web de punto de venta y gestión para un negocio de taller de telefonía
móvil con múltiples talleres: inventario por taller, POS con pagos multimoneda
(CUP/USD/EUR), clientes globales, garantías, devoluciones, liquidación diaria de
pagos a operarios, configuración y auditoría completa.

## Novedades v0.4.0 — Costos internos, notas por línea y plantillas de tickets

- **`VentaItem.costoAdicional`** (moneda del ítem): costo interno del repuesto/servicio.
  NO suma al total que paga el cliente; se usa para la ganancia y para descontar la
  base del pago PORCENTAJE del operario. VENDEDOR y ADMIN pueden editarlo en el POS y
  **cada cambio queda en auditoría** (`MODIFICAR_COSTO_ITEM` con valor anterior/nuevo).
  Si el ítem está en USD/EUR, se convierte a CUP con la tasa *snapshot* de la venta
  para el cálculo de pagos. Un costo mayor que el precio de venta solo muestra
  **advertencia roja** (la venta se permite: pérdida asumida por el taller).
- **`VentaItem.descripcionAdicional`**: nota por línea (IMEI, falla, color…) editable
  en el POS con el botón 📝 o `Ctrl+N`; se imprime bajo el nombre del producto
  (fuente menor) y se audita (`AGREGAR_NOTA_ITEM`).
- **Pago PORCENTAJE (nueva fórmula):** `(subtotalCUP − costoAdicionalEnCUP) × valor / 100`,
  con base mínima 0 (jamás se pagan montos negativos). FIJO sigue sin verse afectado.
- **`PlantillaTicket` + `Venta.plantillaId`:** plantillas de texto administradas en
  **Configuración → Plantillas de Tickets** (solo ADMIN: crear, editar, activar/desactivar,
  vista previa con datos de prueba) con variables dinámicas
  (`{{taller_*}}`, `{{cliente_*}}`, `{{venta_*}}`, `{{vendedor_nombre}}`,
  `{{items_detalle}}`, `{{garantias_texto}}`). En el POS, el vendedor elige la plantilla
  junto a «Cobrar» (por defecto: diseño del sistema). Al imprimir se reemplazan las
  variables con los datos reales de la venta, se respetan los saltos de línea del
  administrador y `{{items_detalle}}` imprime la tabla con las notas de línea a 8 pt.
  Auditoría: `PLANTILLA_CREADA/EDITADA/ACTIVADA/DESACTIVADA` y `SELECCIONAR_PLANTILLA`
  por venta.
- **Atajos nuevos en el POS:** `Ctrl+N` (nota de la línea seleccionada) y `Ctrl+C`
  (costo interno de la línea seleccionada — solo si NO hay texto seleccionado).


## Stack

- **Next.js 16 (App Router) + TypeScript**
- **Prisma ORM** (SQLite en desarrollo; PostgreSQL en producción — ver `docs/DEPLOY.md`)
- **Autenticación:** JWT en cookie `httpOnly` (`secure` en producción, `sameSite=lax`), contraseñas con **bcrypt**
- **Validación:** Zod en servidor (todos los endpoints)
- **Dinero:** `Decimal` en TODOS los cálculos (nunca `float`)
- **Transacciones Prisma** para ventas, devoluciones, transferencias y liquidaciones
- **Ticket:** HTML imprimible 58/80 mm configurable vía `window.print()`
- **UI:** Tailwind CSS 4 + shadcn/ui + Lucide · Identidad visual del logotipo (rojo/blanco/negro)
  · Inter · modo claro/oscuro · atajos de teclado · optimizada para lector de barras HID
- **Atajos:** `react-hotkeys-hook` (globales Alt+1…7, POS con F2/F4/F8/F9, Ctrl+S, Ctrl+N (nota) y Ctrl+C (costo interno), tablas con flechas)
- **Feedback:** `sonner` (toasts), sonidos Web Audio en el POS, confirmación peligrosa en dos pasos

## Variables de entorno (`.env`)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión Prisma | `file:./db/custom.db` (dev) o `postgresql://...` (prod) |
| `AUTH_SECRET` | Secreto para firmar el JWT de sesión (generar con `openssl rand -hex 32`) | hex aleatorio |
| `TZ` | Zona horaria del servidor (define el "día" de liquidación) | `America/Havana` |

## Puesta en marcha (desarrollo)

```bash
bun install
bun run db:push          # crea el esquema en la base de datos
bun run db:seed          # admin + taller piloto + tasas + ajustes + demo
bun run dev              # http://localhost:3000
bun test                 # tests de moneda, pagos, liquidación y flujo de venta
```

**Credenciales del seed:** usuario `admin` / contraseña `TeReparo2026!`
(cámbiela desde Configuración → Usuarios en el primer arranque).

El seed crea: taller piloto, usuario admin, operario ADMIN, tasas (USD=440,
EUR=470 — **actualícelas**), ajustes de ticket (58 mm) y `porcentajeAdmin=0`,
más 5 productos/servicios de demo y 2 plantillas de
ticket («Recepción de Equipo» y «Venta de Accesorio»).

## Estructura

```
prisma/schema.prisma        # Modelo de datos completo (entidades del PRD)
prisma/seed.ts              # Seed inicial
src/lib/                    # Dominio: money (Decimal), pagos, liquidación (puras),
                            # auth (JWT), audit, rate-limit, códigos, barcode CODE128,
                            # validaciones Zod, http (verificación rol/taller en servidor),
                            # plantillas (motor de variables de tickets)
src/app/api/                # API REST (auth, productos, movimientos, transferencias,
                            # ventas, devoluciones, garantías, liquidaciones, talleres,
                            # usuarios, operarios, tasas, ajustes, logs, backup, dashboard,
                            # plantillas de tickets)
src/app/page.tsx            # SPA (única ruta visible) con navegación por módulos
src/components/te-reparo/   # Login, shell, POS, inventario, ventas, clientes,
                            # devoluciones, garantías, liquidaciones, configuración,
                            # logs, tickets imprimibles
tests/                      # money / pagos / liquidación / plantillas (unitarios)
                            # + venta (integración)
```

## Reglas de negocio implementadas (§4 del PRD)

- **Inventario:** el stock SOLO cambia mediante `MovimientoInventario` (nunca edición
  directa). Servicios sin stock (siempre ×1). Bajas y entradas para admin y vendedor;
  transferencias y ajustes solo admin (misma transacción, mismo costo en origen/destino).
  Campos sensibles (costo, pagoOperario, stockMinimo, garantiaDias) solo ADMIN.
- **Ventas:** transacción atómica (valida stock → venta → ítems con snapshot → pagos →
  movimientos → logs). VENDEDOR solo su taller; VENDEDOR_ONLINE elige taller (verificado
  en servidor). Cliente opcional (ventaMostrador). Servicios con operario obligatorio.
  Precio editable (guarda original + log). N pagos mezclando métodos/monedas con tasa
  vigente y snapshot; Zelle siempre USD con referencia obligatoria; la suma debe cubrir
  el total (el excedente se muestra como cambio en el ticket).
- **Devoluciones:** totales/parciales; el producto entra como DEFECTUOSO
  (movimiento `DEVOLUCION_DEFECTUOSO`, NO vuelve al stock vendible). Ticket con código
  único. Si la liquidación del día está ABIERTA el ajuste entra en ella; si está CERRADA,
  se crea ajuste negativo en la liquidación del día siguiente. Solo los ítems con
  operario generan ajuste (eran los que generaban pago).
- **Garantías (Opción C):** REPARACIÓN solo registra; REEMPLAZO genera salida del
  producto de reemplazo (AJUSTE) + baja del defectuoso. Sin pago al operario ni venta a
  precio 0. Vencimiento visible en el historial del cliente.
- **Tasas:** globales con historial completo; cualquier rol que vende puede actualizar;
  snapshot en cada venta y pago; el total se muestra en CUP y USD; el ticket solo en CUP.
- **Liquidación diaria por taller/día** (`@@unique([tallerId, fecha])`):
  - *VENDEDOR presencial:* regla grupal — el **total vendido del taller ese día** se paga
    ÍNTEGRO a cada operario vendedor activo del taller, incluido el que vendió 0.
  - *INFORMÁTICO/ELECTRÓNICO:* acumulado individual por snapshot (FIJO×cant o %×(subtotal−costo interno), base mínima 0).
    El reparto equitativo se muestra como nota al pie de referencia (no afecta el monto).
  - *VENDEDOR_ONLINE:* individual por sus propias ventas del día en ese taller.
  - *ADMIN:* `porcentajeAdmin` × total vendido del día (línea en la liquidación).
  - Al cerrar: se bloquea (no se recalcula) y se generan comprobantes de pago únicos por
    operario con el contenido definido por rama.
- **Auditoría:** todo cambio y todo acceso denegado queda en `AuditLog` con datos
  antes/después; no editable ni borrable desde la app; exportable CSV/JSON.

### Decisiones documentadas (ambigüedades del PRD)

1. Se añadió `Usuario.operarioId` (FK opcional) porque las reglas de liquidación
   requieren vincular usuario↔operario (pago individual del vendedor en línea y regla
   grupal) y el PRD exige que todo vendedor sea operario.
2. La base grupal es el total de TODAS las ventas del taller ese día.
3. En SQLite (desarrollo) los enums del PRD se guardan como `String` validados con Zod,
   y los campos JSON como texto; en PostgreSQL pueden ser enums/Json nativos
   (`docs/DEPLOY.md`).
4. `Ajuste` (clave/valor) guarda `ticketAncho`, `ticketEncabezado`, `ticketPie`,
   `porcentajeAdmin`, exigidos por §5.9 del PRD.

## Identidad visual y atajos de teclado

### Paleta (del logotipo: rojo, blanco y negro)

| Token | Valor | Uso |
|---|---|---|
| `brand-red` | `#E60000` | Botones primarios (Cobrar/Guardar/Confirmar), acentos, foco |
| `brand-red-hover` | `#CC0000` | Hover de acciones primarias |
| `brand-red-light` | `#FFEBEB` | Fondos de selección/alerta suave (modo claro) |
| `brand-black` / `brand-dark` | `#121212` / `#1E1E1E` | Fondo/tarjetas del modo oscuro, textos principales |
| `brand-gray` / `brand-border` | `#F5F5F5` / `#E0E0E0` | Fondo general y bordes (modo claro) |
| `success` / `warning` / `info` | `#10B981` / `#F59E0B` / `#3B82F6` | Semánticos (con moderación) |

- **Modo claro (por defecto):** fondo `brand-gray`, tarjetas blancas, texto negro. **Modo oscuro:**
  fondo negro, tarjetas `brand-dark`, texto blanco (interruptor en la barra superior).
- **Foco visible:** anillo rojo (`ring`) con offset en todos los interactivos (WCAG);
  trampa de foco y `Esc` en los modales; *skip link* "Saltar al contenido principal".
- **Números:** `tabular-nums` en POS y tablas de dinero; fuente **Inter**.
- **Toasts** (nunca `window.alert`), *skeletons*/spinners en acciones, y confirmación
  **en dos pasos** para acciones peligrosas (desactivar producto, cerrar liquidación…).

### Atajos de teclado (resumen — pulse `Shift + ?` en la app)

| Ámbito | Atajo | Acción |
|---|---|---|
| Global | `Alt + 1…7` | Panel · POS · Inventario · Ventas · Clientes · Liquidaciones · Configuración (ADMIN) |
| Global | `Shift + ?` | Modal con la lista completa de atajos |
| Global | `Esc` | Cerrar modales/dropdowns o limpiar la búsqueda |
| POS | `F2` / `F4` | Enfocar buscador / nuevo carrito |
| POS | `Ctrl + Tab` (`Ctrl + Shift + Tab`) | Siguiente (anterior) carrito — *ver nota* |
| POS | `Enter` (buscador) | Agrega el producto del código exacto o el primer resultado |
| POS | `F8` / `F9` | Cliente / panel de cobro |
| POS | `Enter` (cobro) | Confirma la venta si el monto cubre el total e imprime el ticket |
| POS | `↑ ↓` `+` `−` | Navegar líneas del carrito / cambiar cantidad |
| POS | `Ctrl + Supr` / `Ctrl + E` | Eliminar línea / editar precio |
| Formularios | `Ctrl + S` | Guardar (producto, cliente, taller, usuario, operario, ajustes) |
| Tablas | `↑ ↓` `Enter` `Supr` | Navegar filas / abrir detalle / desactivar con confirmación |

> **Nota `Ctrl + Tab`:** algunos navegadores lo reservan para cambiar de pestaña y no lo
> entregan a la página; en ese caso use los botones de pestaña del carrito o `F4`.

### Lector de código de barras (HID)

El buscador del POS está siempre listo (auto-foco al entrar y `F2`): los lectores HID actúan
como teclado (código + `Enter`). Con `Enter`: si el código existe se agrega al instante y el
campo se limpia (beep agudo); si no, toast de error manteniendo el foco (tono grave). La
búsqueda manual usa *debounce* de 300 ms. El lector se entrena con los códigos internos
`T{n}-{secuencial}` y las etiquetas CODE128 se imprimen desde Inventario → botón etiqueta.

## Módulos

Panel (ventas del día, por taller, top productos, stock bajo, pagos por operario,
método/moneda, CSV) · POS (multi-carrito persistido en el navegador, lector de barras
HID, cliente, operario por línea, edición de precio, N pagos, tasas en vivo, ticket
58/80 mm) · Inventario · Ventas (filtros, detalle, reimpresión con log, CSV) · Clientes
(globales, homónimos, historial y garantías) · Devoluciones · Garantías · Liquidaciones
(cierre y comprobantes) · Configuración (talleres, usuarios, operarios N:M, tasas,
ticket, porcentajeAdmin, backup) · Auditoría (filtros, antes/después, CSV/JSON).

## Tests

```bash
bun test   # 28 pruebas: conversión de monedas, cálculo de pagos, reglas de
           # liquidación por rama, ajustes, y flujo de venta atómico (integración)
```

## Despliegue

Ver **`docs/DEPLOY.md`** (VPS o Railway, PostgreSQL, backups diarios automáticos +
export manual, variables de entorno, migración desde SQLite).
