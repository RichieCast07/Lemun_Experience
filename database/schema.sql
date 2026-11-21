-- =============================================================
-- LUMEN — Esquema PostgreSQL
-- Idempotente: se puede ejecutar varias veces sin romper nada.
-- Uso:  npm run db:init   (desde /backend)
-- =============================================================

-- ── Tipos ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE rol_usuario AS ENUM ('ADMIN', 'RP', 'MANAGER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE estado_boleto AS ENUM ('ACTIVO', 'USADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Usuarios (ADMIN / RP / MANAGER) ──────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre_completo     VARCHAR(120)  NOT NULL,
  telefono            VARCHAR(20)   NOT NULL DEFAULT '',
  username            VARCHAR(60)   NOT NULL,
  password_hash       VARCHAR(255)  NOT NULL,
  rol                 rol_usuario   NOT NULL,
  comision_porcentaje NUMERIC(5,2)  NOT NULL DEFAULT 10.00
                      CHECK (comision_porcentaje >= 0 AND comision_porcentaje <= 100),
  activo              BOOLEAN       NOT NULL DEFAULT TRUE,
  creado_en           TIMESTAMPTZ   NOT NULL DEFAULT now()
);
-- Seguridad de acceso: bloqueo temporal tras fallos seguidos y corte de sesiones al cambiar la contraseña.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sesiones_validas_desde TIMESTAMPTZ NOT NULL DEFAULT 'epoch';
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_username ON usuarios (lower(username));
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios (rol);

-- ── Eventos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eventos (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre        VARCHAR(120)  NOT NULL,
  codigo_evento VARCHAR(32)   NOT NULL UNIQUE,
  descripcion   TEXT,
  fecha_evento  TIMESTAMPTZ   NOT NULL,
  lugar         VARCHAR(200)  NOT NULL,
  maps_url      VARCHAR(500),
  activo        BOOLEAN       NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos (fecha_evento);

-- ── Fases de venta (preventa, general, última hora…) ─────────
CREATE TABLE IF NOT EXISTS fases (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evento_id    INTEGER        NOT NULL REFERENCES eventos (id) ON DELETE CASCADE,
  nombre       VARCHAR(80)    NOT NULL,
  precio       NUMERIC(10,2)  NOT NULL CHECK (precio >= 0),   -- precio base de la fase
  fecha_inicio TIMESTAMPTZ    NOT NULL,
  fecha_fin    TIMESTAMPTZ    NOT NULL,
  activa       BOOLEAN        NOT NULL DEFAULT TRUE,
  CHECK (fecha_fin > fecha_inicio)
);
CREATE INDEX IF NOT EXISTS idx_fases_evento ON fases (evento_id);

-- ── Tipos de boleto por evento (GENERAL, VIP…) ───────────────
CREATE TABLE IF NOT EXISTS tipos_boleto (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evento_id INTEGER      NOT NULL REFERENCES eventos (id) ON DELETE CASCADE,
  nombre    VARCHAR(50)  NOT NULL,
  activo    BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (evento_id, nombre)
);

-- ── Precio específico de un tipo de boleto dentro de una fase ─
-- Si no existe fila, aplica fases.precio.
CREATE TABLE IF NOT EXISTS precios_fase (
  fase_id        INTEGER       NOT NULL REFERENCES fases (id) ON DELETE CASCADE,
  tipo_boleto_id INTEGER       NOT NULL REFERENCES tipos_boleto (id) ON DELETE CASCADE,
  precio         NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  PRIMARY KEY (fase_id, tipo_boleto_id)
);

-- ── Clientes (compradores) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre_completo VARCHAR(120) NOT NULL,
  telefono        VARCHAR(20)  NOT NULL UNIQUE,
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Boletos ──────────────────────────────────────────────────
-- codigo        : valor que viaja en el QR
-- token_publico : enlace público para que el cliente vea su boleto sin login
CREATE TABLE IF NOT EXISTS boletos (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo        VARCHAR(60)    NOT NULL UNIQUE,
  token_publico VARCHAR(40)    NOT NULL UNIQUE,
  cliente_id    INTEGER        NOT NULL REFERENCES clientes (id),
  rp_id         INTEGER        NOT NULL REFERENCES usuarios (id),
  evento_id     INTEGER        NOT NULL REFERENCES eventos (id),
  fase_id       INTEGER        NOT NULL REFERENCES fases (id),
  tipo_boleto   VARCHAR(50)    NOT NULL DEFAULT 'GENERAL',
  precio        NUMERIC(10,2)  NOT NULL CHECK (precio >= 0),
  comision_rp   NUMERIC(10,2)  NOT NULL DEFAULT 0 CHECK (comision_rp >= 0),
  estado        estado_boleto  NOT NULL DEFAULT 'ACTIVO',
  vendido_en    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  usado_en      TIMESTAMPTZ,
  usado_por     INTEGER        REFERENCES usuarios (id),
  UNIQUE (cliente_id, evento_id)          -- un boleto por cliente y evento
);
CREATE INDEX IF NOT EXISTS idx_boletos_evento ON boletos (evento_id);
CREATE INDEX IF NOT EXISTS idx_boletos_rp     ON boletos (rp_id);
CREATE INDEX IF NOT EXISTS idx_boletos_fase   ON boletos (fase_id);
CREATE INDEX IF NOT EXISTS idx_boletos_vendido ON boletos (vendido_en);
