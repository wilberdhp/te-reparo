# Guía de despliegue — Te Reparo

## 1. Opción recomendada: Railway (PostgreSQL gestionado)

1. Cree un proyecto en [Railway](https://railway.app) y añada un **plugin PostgreSQL**.
2. Variables de entorno del servicio web:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al plugin) |
   | `AUTH_SECRET` | `openssl rand -hex 32` |
   | `TZ` | `America/Havana` |
   | `NODE_ENV` | `production` |

3. Comandos:
   - Build: `bun install && bun run db:push` (o `prisma migrate deploy` con migraciones)
   - Start: `bun run start`
   - Post-deploy (una sola vez): `bun run db:seed`
4. Railway realiza **backups diarios automáticos** del PostgreSQL del plugin. Añada
   además el export manual (Configuración → Exportar respaldo) a su rutina.

## 2. Opción VPS (Ubuntu + PostgreSQL)

```bash
# 1) Dependencias
sudo apt update && sudo apt install -y postgresql nginx
curl -fsSL https://bun.sh/install | bash
sudo npm i -g pm2

# 2) Base de datos
sudo -u postgres psql -c "CREATE USER tereparo WITH PASSWORD 'CAMBIAR';"
sudo -u postgres psql -c "CREATE DATABASE tereparo OWNER tereparo;"

# 3) Aplicación
git clone <su-repo> /opt/te-reparo && cd /opt/te-reparo
bun install
cat > .env <<EOF
DATABASE_URL=postgresql://tereparo:CAMBIAR@localhost:5432/tereparo
AUTH_SECRET=$(openssl rand -hex 32)
TZ=America/Havana
NODE_ENV=production
EOF

# 4) Esquema + seed
bun run db:push        # o: bunx prisma migrate deploy
bun run db:seed        # admin / taller piloto / tasas / ajustes

# 5) Build + arranque con PM2
bun run build
pm2 start "bun .next/standalone/server.js" --name te-reparo
pm2 save && pm2 startup

# 6) Nginx como proxy inverso (80/443)
sudo tee /etc/nginx/sites-available/te-reparo <<EOF
server {
  listen 80;
  server_name su-dominio.cu;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;  # IP real para auditoría
    proxy_set_header X-Real-IP \$remote_addr;
  }
}
EOF
sudo ln -s /etc/nginx/sites-available/te-reparo /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# HTTPS: certbot --nginx
```

## 3. Migración de datos desde un SQLite antiguo

Desde la v0.7.0 el proyecto usa **PostgreSQL también en desarrollo** (embebido,
sin root: `bun run db:init`; el esquema ya está en `provider = "postgresql"`).
Las conversiones a tipos nativos siguen siendo opcionales (el código valida todo
con Zod, funciona igual sin convertirlas):

- Los campos `String` de enums (`Rol`, `Rama`, `TipoProducto`, …) pueden convertirse a
  `enum` nativos de Prisma con los valores del PRD (ver comentario superior del schema).
- `datosAntes/datosDespues` (AuditLog) y `detalle` (LiquidacionLinea) pueden pasarse de
  `String` a `Json`.
- Puede añadir precisión a los Decimal: `@db.Decimal(14, 2)`.

Si conserva una base SQLite de la etapa anterior (p. ej. `db/custom.db`), el
script oficial de migración copia todas las tablas conservando ids y contadores:

```bash
bun run db:init                       # PostgreSQL embebido arrancado y BD vacía
bun run db:push                       # esquema creado
bun run db:migrar-sqlite              # scripts/migrar-sqlite-a-postgres.ts
# (o: bun run db:migrar-sqlite ruta/a/otra.db)
```

El script exige la BD destino vacía, copia en una única transacción con orden
topológico de FKs y verifica conteos tabla por tabla antes de dar por buena la
migración.

> Nota: el código fuente NO depende de valores de enum a nivel de base de datos —
> toda la validación de dominio está en `src/lib/validaciones.ts` (Zod, servidor).

## 4. Backups

- **Automáticos diarios:** Railway (plugin Postgres) o `pg_dump` en cron en VPS:

  ```cron
  0 2 * * * pg_dump -U tereparo tereparo | gzip > /var/backups/te-reparo-$(date +\%F).sql.gz
  ```

- **Export manual desde la app:** Configuración → "Exportar respaldo (JSON)" genera un
  volcado completo de todas las tablas (`/api/backup`, solo ADMIN, queda en auditoría).
- Los **logs de auditoría** son permanentes: no se borran ni editan desde la app.

## 5. Taller piloto — checklist de arranque

1. Entrar con `admin` / `TeReparo2026!` y **cambiar la contraseña** (Configuración → Usuarios).
2. Actualizar las **tasas** USD/EUR (POS o Configuración → Tasas).
3. Crear los **operarios reales** con su rama y talleres asignados (N:M).
4. Crear los **usuarios vendedores** (VENDEDOR requiere taller + operario vinculado;
   VENDEDOR_ONLINE sin taller fijo, también vinculado a su operario).
5. Cargar el inventario (productos con stock inicial → genera movimiento ENTRADA).
6. Definir `porcentajeAdmin` y el formato del ticket (58/80 mm, encabezado/pie).
7. Probar una venta, la impresión del ticket y el cierre de la liquidación del día.

## 6. Operación diaria

- **Apertura:** no se requiere acción — la liquidación del día se abre al consultarla.
- **Cierre (ADMIN):** Liquidaciones → elegir fecha → "Cerrar liquidación" → se generan
  los comprobantes de pago por operario (imprimibles). Después del cierre no se
  recalcula; las devoluciones posteriores generan ajustes al día siguiente.
- **Impresión:** ticket 58/80 mm con `window.print()` (seleccione la impresora térmica
  y márgenes "ninguno" en el diálogo del navegador). El lector de barras HID funciona
  como teclado: enfoque el campo "Código de barras" del POS y dispare el lector.
