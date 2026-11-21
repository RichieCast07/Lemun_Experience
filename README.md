# Lumen — *Light refined*

Plataforma de gestión de eventos y venta de boletos con tres roles:

| Rol | Qué hace |
|---|---|
| **Administrador** | Crea eventos, fases de venta y tipos de boleto con precios; gestiona el equipo; ve métricas, clientes y boletos; exporta la cartera a CSV. |
| **RP** (relaciones públicas) | Ve los eventos vigentes, genera boletos con QR para sus clientes, comparte el enlace por WhatsApp y consulta sus ventas y comisión. |
| **Manager** | Escanea los QR en la puerta (cámara o código manual) y ve la asistencia en tiempo real. No ve precios, comisiones ni teléfonos. |

El cliente recibe un **enlace público** (`/t/<token>`) con su boleto y QR, sin necesidad de iniciar sesión.

## Stack

- **Base de datos:** PostgreSQL (`database/schema.sql`, idempotente)
- **Backend:** Node.js 20+ · Express 5 · TypeScript · `pg` · Zod · JWT · bcrypt · helmet · rate-limit
- **Frontend:** React 19 · TypeScript · Vite · React Router (CSS propio, sin librería de UI)

```
Lumen/
├── database/schema.sql        Esquema completo
├── backend/                   API REST  (/api/...)
│   ├── src/modules/           auth · users · events (+fases, tipos) · clients · tickets · metrics
│   └── scripts/               db-init.ts · seed.ts
├── frontend/                  SPA React
│   └── src/{core,components,features,routes,styles}
└── docker-compose.yml         Postgres opcional
```

## Puesta en marcha

Requisitos: Node 20+ y un PostgreSQL accesible.

```bash
# 1) Backend
cd backend
npm install
cp .env.example .env        # (ya existe uno generado) → ajusta DATABASE_URL con tu contraseña
npm run db:init             # crea la base "lumen_db" (si falta) y aplica el esquema
npm run db:seed             # crea el administrador con ADMIN_USERNAME / ADMIN_PASSWORD del .env
npm run dev                 # API en http://localhost:4000

# 2) Frontend (otra terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173  (proxy de /api → :4000)
```

Para probar con datos de ejemplo (RPs, manager y un evento con boletos): `npm run db:seed:demo`
(usuarios `valeria`, `diego` y `marcos`, contraseña `Lumen2026!`; **solo para desarrollo**).

> `db:init` conecta a la base `postgres` para crear `lumen_db`; el usuario de `DATABASE_URL` necesita permiso `CREATEDB`. Si prefieres crearla a mano, hazlo y vuelve a correr `db:init`.

### Producción

```bash
cd backend  && npm run build && npm start      # NODE_ENV=production, JWT_SECRET fuerte, CORS_ORIGIN real
cd frontend && npm run build                   # sirve frontend/dist con cualquier servidor estático
```
Configura `VITE_API_URL` (p. ej. `https://api.midominio.com/api`) al construir el frontend si la API vive en otro dominio, y `PUBLIC_APP_URL` / `CORS_ORIGIN` en el backend.

## Reglas de negocio

- **Fase vigente:** una fase está *activa* y la fecha actual cae dentro de su rango. Si hay traslape gana la que empezó más recientemente. **Sin fase vigente no se puede vender.**
- **Precio:** el precio base de la fase, salvo que el tipo de boleto tenga un precio propio en esa fase.
- **Comisión:** `precio × % del RP`. Las ventas hechas por un administrador no generan comisión.
- **Un boleto por cliente y evento.** El cliente se identifica por teléfono (10–15 dígitos).
- **Validación de acceso atómica:** dos escaneos simultáneos del mismo QR → solo uno entra. El escáner además rechaza boletos de otro evento sin consumirlos.
- Los RPs dejan de ver (y vender) un evento 12 h después de su inicio.
- Usuarios y eventos **se desactivan, no se borran** (hay historial que depende de ellos).

## API (resumen)

Todas bajo `/api`, con `Authorization: Bearer <token>` salvo login y boleto público.

| | |
|---|---|
| `POST /auth/login` · `GET /auth/me` | Sesión |
| `GET/POST/PUT /users` · `PATCH /users/:id/toggle` | Equipo (ADMIN) |
| `GET/POST/PUT /events` · `PATCH /events/:id/toggle` · `GET /events/:id/sale-options` | Eventos |
| `…/events/:id/ticket-types` · `…/events/:id/phases` · `PUT/DELETE …/phases/:fid/prices/:tid` | Tipos, fases y precios |
| `GET /clients` · `GET /clients/search?telefono=` · `GET /clients/export/csv` | Clientes |
| `POST /tickets` · `GET /tickets` · `GET /tickets/mine` · `GET /tickets/public/:token` | Boletos |
| `GET /tickets/code/:codigo` · `PATCH /tickets/code/:codigo/use` · `GET /tickets/access/:eventId` | Control de acceso |
| `GET /metrics/summary · /rps · /events/:id · /sales-by-day · /me` | Métricas |

## Diseño

Estilo limpio y estructurado: lienzo casi blanco (`#f7f7f4`), tarjetas suaves, **bloques negros** (`#141516`) de contraste para lo importante (eventos, métrica principal), navegación superior en píldoras y secciones numeradas. Sin colores de acento: blanco, negro y grises neutros (solo los estados usan verde/rojo apagados). Login y boleto público van sobre fondo oscuro con panel blanco. Tipografía: **Inter** para la interfaz y **Cinzel** solo en el logotipo. Los tokens viven en `frontend/src/styles/tokens.css` (la clase `.on-ink` convierte cualquier bloque en versión negra).

## Notas

- El escáner por cámara requiere **HTTPS** (o `localhost`). Con `BarcodeDetector` usa el detector nativo; si no existe, cae a `jsQR`.
- `docker-compose.yml` es opcional y no se ha probado en esta máquina (el demonio de Docker estaba apagado).
- El envío automático por WhatsApp no está integrado: el RP comparte el enlace con el botón *Enviar por WhatsApp* (abre `wa.me`). El prefijo de país por defecto (`52`) está en `frontend/src/features/tickets/TicketModal.tsx`.
