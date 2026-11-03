-- Kindra PWA – Módulo 1. Esquema PostgreSQL.
-- Aplicar una vez: psql "$DATABASE_URL" -f server/sql/schema.sql  (o npm run db:schema -w server)

CREATE TABLE IF NOT EXISTS documents (
  collection  TEXT NOT NULL,
  id          TEXT NOT NULL,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);

CREATE TABLE IF NOT EXISTS events (
  seq                 BIGINT PRIMARY KEY,
  id                  TEXT UNIQUE NOT NULL,
  type                TEXT NOT NULL,
  object_type         TEXT NOT NULL,
  object_id           TEXT NOT NULL,
  chain_id            TEXT NOT NULL,
  actor_id            TEXT,
  actor_role          TEXT,
  entity_id           TEXT,
  device_time         TIMESTAMPTZ,
  server_time         TIMESTAMPTZ NOT NULL,
  data                JSONB NOT NULL,
  corrected_event_id  TEXT,
  prev_hash           TEXT NOT NULL,
  content_hash        TEXT NOT NULL,
  hash                TEXT NOT NULL,
  inconsistent_time   BOOLEAN NOT NULL DEFAULT false,
  full_event          JSONB NOT NULL,
  inserted_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_chain_idx ON events (chain_id, seq);
CREATE INDEX IF NOT EXISTS events_type_idx ON events (type);
CREATE INDEX IF NOT EXISTS events_object_idx ON events (object_type, object_id);

-- La bitácora es solo de anexado (3.1): ni la aplicación ni el administrador pueden
-- actualizar o borrar eventos a través de la interfaz. Este trigger lo refuerza en la base.
CREATE OR REPLACE FUNCTION kindra_events_append_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('kindra.allow_reset', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'La bitácora de eventos es solo de anexado: no se permite % en events', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_no_update ON events;
CREATE TRIGGER events_no_update BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION kindra_events_append_only();

-- Reinicio de datos de demostración (19.5). Único camino para vaciar la bitácora.
CREATE OR REPLACE FUNCTION kindra_reset_demo() RETURNS void AS $$
BEGIN
  PERFORM set_config('kindra.allow_reset', 'on', true);
  DELETE FROM events;
  DELETE FROM documents;
  PERFORM set_config('kindra.allow_reset', 'off', true);
END;
$$ LANGUAGE plpgsql;
