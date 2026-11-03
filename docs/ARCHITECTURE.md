# Kindra PWA – Módulo 1: Trazabilidad Circular de Escombros

Diseño técnico completo (arquitectura, base de datos, API y pantallas).
Las referencias entre paréntesis apuntan a las secciones de la especificación funcional (Nov 1, 2026).

---

## 1. Visión general

```
client/   PWA React + Vite + Tailwind (español, accesible, cola offline básica)
  - Entrada · Avisar (PWA) · AURA (chat) · Consultar · Mis reportes · Ficha
  - Aprende · Perfil · Notificaciones · Ajustes de accesibilidad
  - Paneles por rol: coordinador, retiro, centro, evaluador, destino, supervisor
  - Panel de administración
  - Páginas públicas: tablero, lote, obra, ficha pública, certificado, QR imprimible
          |  HTTP JSON (/api/**)  +  SSE (/api/public/stream)
server/   Node 24 + Express 5 + TypeScript
  - routes/          REST por dominio, validación zod, control de acceso en servidor
  - services/        reglas de negocio 7.1–7.16, cierres, puntos, AURA, tablero
  - core/events      bitácora append-only + sello de integridad SHA-256 (3.1–3.2)
  - core/transitions tabla de estados configurable (3.3, 6)
  - core/projections reductores: evento -> estado actual de cada objeto
  - core/db          estado en memoria (write-through) + persistencia enchufable
  - persistence/     memory (archivo JSON opcional) · postgres (pg)
  - realtime/        SSE broadcast (12.6)
  - jobs/            escalamientos y plazos (7.13, 6.2)
  - seed/            datos simulados (19) + reset (19.5)
shared/   tipos, constantes (roles, estados, tipos de evento), utilidades comunes
```

Monorepo con npm workspaces: `shared`, `server`, `client`.

## 2. Principios implementados (sección 3)

| Principio | Implementación |
|---|---|
| 3.1 Bitácora append-only | Toda mutación es un evento. No existe endpoint de edición ni borrado. Las correcciones son eventos `correction` que referencian al original y exigen motivo. Los objetos (origen, viaje, lote, obra…) son **proyecciones** calculadas aplicando reductores sobre los eventos. Al arrancar, el servidor reconstruye todas las proyecciones reproduciendo la bitácora. |
| 3.2 Sello de integridad | Cada evento guarda `contentHash = SHA-256(contenido canónico)`, `prevHash` (hash final del evento anterior de la misma cadena, o `GENESIS`) y `hash = SHA-256(contentHash + prevHash)`. `verifyChain(chainId)` recalcula y devuelve `intacto` / `alterado` nombrando el evento donde se rompe. Expuesto en `/api/public/verificar/:chainId`. La palabra "blockchain" no aparece en ningún texto. |
| 3.3 Estados configurables | `config.transitions` (tabla editable desde admin): `{object, action, from[], to, roles[], conditions[]}`. `assertTransition()` corre en el servidor antes de cada evento que cambia estado. La interfaz solo muestra los botones permitidos. |
| 3.4 Doble marca de tiempo | Cada evento guarda `deviceTime` y `serverTime`. Si difieren más del umbral (30 min provisional) y el evento no llegó marcado como enviado tras pérdida de conexión (`offlineQueuedAt`), se marca `inconsistentTime=true`, visible para coordinador y supervisor. |
| 3.5 Control de acceso | Middleware `requireRole` + comprobaciones por servicio (entidad propietaria, centro asignado, no auto-validación/recepción). |
| 3.6 Reutilización | Cuenta única con roles activables, verificación por selfie, pantalla de progreso de verificación, foto con ubicación, notificaciones, niveles, identidad visual, navegación y modos de accesibilidad. |
| 3.7 Co-branding | `config.branding` (nombre, logo) + línea fija "con tecnología Kindra" en pie, pantalla de entrada y páginas públicas. |
| 3.8 AURA | Sin base propia: `services/aura` invoca los mismos servicios que las rutas de la PWA. |

## 3. Modelo de datos (sección 5)

Colecciones de **referencia/configuración** (editables desde admin, no derivadas de eventos):
`entities`, `users`, `sectors`, `centers`, `vehicleTypes`, `vehicles`, `lessons`, `auraTexts`, `config`, `photos`, `preregistrationCodes`, `notifications`, `auraSessions`.

Colecciones **derivadas de eventos** (proyecciones, reconstruibles en cualquier momento):
`origins`, `trips`, `receptions`, `batches`, `hazardDecisions`, `qualityVerifications`, `works`, `dispatches`, `closures`, `dailySummaries`, `jobs`, `observations`, `monitorRequests`, `lessonCompletions`, `onSiteVerifications`, `beforeAfterPhotos`, `alerts`.

Bitácora: `events` (secuencia global, cadena, hashes).

### 3.1 Tipos principales (`shared/src/types.ts`)

- **Entity** (5.1): nombre, tipo, descripción pública, logo, política de publicación por tipo de dato, activa.
- **User** (5.2): nombre, teléfono, alias, roles, entidad, centro asignado, sector de residencia, estado de verificación. Puntos, nivel y rechazos consecutivos se **calculan** desde eventos (`services/points`).
- **Sector** (5.3): nombre, polígono, parroquia, `authorized` (autorización de zona).
- **Origin** (5.4): código legible `LG-4821` (alfabeto sin O, I, L, 0, 1), tipo, sector derivado por punto-en-polígono, ubicación o calle+referencia, fecha, fotos, subcategoría, tamaño, urgencia, nota de voz, `zoneAuthorized`, reportante/anónimo, prioridad, `state`, reportes vinculados, campos institucionales. Marcas: `validatedAt, removedAt, inBatchAt, inWorkAt, closedAt`.
- **Vehicle** (5.5) + **VehicleType** (capacidad nominal provisional 6/12/20 m³), QR generado `KV-<id>`.
- **Trip** (5.6): vehículo, orígenes, centro, salida/llegada con doble hora, foto, ubicación, nivel de llenado, `estimatedVolumeM3` (7.8), estado, `noArrivalAt`, `discrepancyResolvedAt`.
- **Center** (5.7), **Reception** (5.8), **Batch** (5.9), **HazardDecision** (5.10), **QualityVerification** (5.11), **Work** (5.12, QR `KO-<code>`), **Dispatch** (5.13), **Closure** (5.14), **DailySummary** (5.15), **Jobs** (5.16), **Observation** (5.17), **Lesson** (5.18), **Event** (5.19).

### 3.2 Base de datos

El servidor mantiene el estado completo en memoria y lo escribe a través de la interfaz `Persistence`:

```ts
interface Persistence {
  load(): Promise<{ documents: Record<string, Record<string, unknown>>; events: KEvent[] }>;
  saveDocument(collection: string, id: string, doc: unknown): Promise<void>;
  deleteDocument(collection: string, id: string): Promise<void>;
  appendEvent(event: KEvent): Promise<void>; // solo INSERT; nunca UPDATE/DELETE
  clearAll(): Promise<void>;                 // solo para reset demo
}
```

- `DB_DRIVER=memory` (por defecto): opcionalmente vuelca a `server/data/db.json` (`PERSIST_FILE=true`).
- `DB_DRIVER=postgres`: `persistence/postgres.ts` con `pg`. Esquema en `server/sql/schema.sql` (tabla `documents` por colección en JSONB y tabla `events` con columnas propias, índice por cadena y triggers que impiden UPDATE/DELETE en `events`).

Cambiar de memoria a Postgres = solo variables de entorno (`DB_DRIVER`, `DATABASE_URL`) y ejecutar el esquema. Sin cambios de código (2.3).

## 4. Eventos y cadenas (5.20, 3.2)

Tipos mínimos: `origin_registered, origin_validated, origin_rejected, origin_marked_duplicate, zone_authorized, zone_unauthorized, priority_set, trip_departure, trip_arrival, trip_no_arrival, origin_removed, removal_closure_sent, removal_confirmed, removal_disputed, dispute_resolved, reception_classified, batch_opened, batch_closed, batch_held, hazard_decided, batch_processed, outputs_recorded, quality_verified, dispatch_created, dispatch_received, dispatch_discrepancy, work_registered, use_recorded, final_closure_sent, satisfaction_answered, observation_recorded, before_after_photo, daily_summary_entered, jobs_recorded, correction`.

Auxiliares: `batch_released, origin_in_batch, origin_in_work, origin_verified_on_site, lesson_completed, monitor_requested, monitor_request_decided, photo_retake_requested, escalation_alert, trip_arrival_late`.

Cadena por objeto principal: `origin:<id>`, `trip:<id>`, `batch:<id>`, `work:<id>`, `user:<id>` (hechos de reconocimiento), `center:<id>` (resumen diario, empleos). La ficha de un origen verifica su cadena y las de sus viajes, lotes y obras vinculados.

## 5. Estados (sección 6) y reglas (sección 7)

Tabla en `server/src/config/transitions.ts` (copiada a `config.transitions`, editable). Cada fila: objeto, acción (tipo de evento), estados de partida, estado destino, roles, condiciones nombradas (`zoneAuthorized`, `notOwnReport`, `notAnonymous`, `isReporter`, `allHazardDecided`, `qualityApproved`, `sameCenter`, `hasEvidence`, `notHeld`). El orden de etapas de un origen es `registered < validated < under_removal < removed < in_batch < in_work < closed`; `disputed` es lateral y recuerda el estado previo; `rejected` y `duplicate` son finales; `pending_authorization` es el estado efectivo mientras `zoneAuthorized=false`.

Reglas 7.1–7.16 viven en `services/*` con mensajes de error en español (HTTP 409/403). Las compuertas 7.2, 7.3, 7.4 y la prohibición de auto-validación/recepción (21.4) tienen pruebas en `server/test`.

## 6. API REST (prefijo `/api`)

Autenticación: `Authorization: Bearer <JWT>` (lleva `userId` y `activeRole`). Cabecera `X-Device-Time` en cada mutación; `X-Offline-Queued-At` cuando el envío viene de la cola offline.

### Público (sin cuenta)
| Método | Ruta | Descripción |
|---|---|---|
| GET | /public/config | branding, etiqueta de datos simulados, sectores, centros, modo demo |
| GET | /public/dashboard?sector=ID | cifras de 12.3 con fuente y fecha (12.4) |
| GET | /public/stream | SSE: resumen de cada evento |
| GET | /public/lotes/:code | página de lote (13.1) |
| GET | /public/obras/:code | página de obra (13.2) |
| GET | /public/ficha/:originCode | versión pública de la ficha (11.6) |
| GET | /public/verificar/:chainId | `{status: intacto|alterado, brokenAt, checked}` |
| GET | /public/certificados/:code | verificación del certificado (9.7) |
| GET | /public/lecciones | lecciones (10) |
| GET | /public/qr/:kind/:code | QR en SVG (13.3) |
| GET | /public/sectores/:id/progreso | progreso del sector |

### Ciudadano / cuenta
`POST /auth/login · /auth/register · /auth/prereg · /auth/demo-switch · GET /auth/me · POST /auth/active-role · POST /auth/selfie`
`POST /origins` (reporte) · `GET /origins/:code` (ficha) · `GET /origins/:code/status` · `GET /origins/:code/export?format=csv|json` · `POST /origins/lookup`
`GET /me/origins · /me/profile · /me/notifications · POST /me/notifications/:id/read · POST /me/notifications/read-all`
`POST /origins/:code/closure/:type/respond` (confirmar/disputar; satisfacción) · `POST /origins/:code/photo-retake`
`GET /lessons · POST /lessons/:id/complete` · `POST /monitor/request · POST /origins/:code/on-site · POST /origins/:code/after-photo`
`POST /photos` (subida) · `POST /aura/message` · `GET /aura/session/:id`

### Coordinación
`GET /coord/overview` · `POST /origins/institutional` · `POST /origins/:id/validate | reject | duplicate | priority | removed | zone | resolve-dispute | unreadable-photo` · `POST /sectors/:id/authorization` · `POST /monitor/requests/:id/decide` · `GET /coord/alerts`.

### Retiro
`GET /removal/overview` · `GET /vehicles` · `GET /vehicles/qr/:qr` · `POST /trips` · `POST /origins/:id/before-after`.

### Centro
`GET /center/overview` · `POST /trips/:id/arrive` · `POST /receptions/:id/classify` · `GET /batches/:id` · `POST /batches/:id/close | outputs | dispatch` · `POST /center/daily-summary` · `POST /center/jobs`.

### Evaluador
`GET /eval/overview` · `POST /batches/:id/hazard-decision` · `POST /batches/:id/quality`.

### Destino
`GET /dest/overview` · `POST /works` · `POST /dispatches/:id/receive` · `POST /works/:id/use`.

### Supervisor
`GET /supervisor/overview` · `POST /observations`.

### Administración
`/admin/entities | users | sectors | centers | vehicle-types | vehicles | config | texts | lessons | photos | prereg-codes | transitions | reset-demo | run-jobs` (CRUD de configuración; nunca eventos).

### Bitácora
`GET /events?chain=…` · `POST /events/:id/correct` (corrección con motivo, misma entidad).

## 7. Pantallas (secciones 12, 13, 16, 17)

| Ruta | Pantalla |
|---|---|
| `/` | Entrada: identidad del ente, "con tecnología Kindra", frase, **Avisar de un escombro**, **Ver cómo va mi sector**, Consultar mi reporte |
| `/avisar` | Reporte ciudadano paso a paso → código grande |
| `/aura` | Chat con AURA |
| `/consultar` | Consulta por código |
| `/mis-reportes` · `/reporte/:code` | Lista y ficha de trazabilidad |
| `/tablero` | Tablero público con filtro por sector, en vivo |
| `/publico/lote/:code` · `/publico/obra/:code` · `/publico/ficha/:code` · `/publico/certificado/:code` · `/publico/qr/:kind/:code` | Páginas QR |
| `/aprende` · `/aprende/:id` | Lecciones |
| `/perfil` · `/notificaciones` · `/ajustes` | Perfil, notificaciones, accesibilidad |
| `/ingresar` · `/registro` · `/verificacion` | Cuenta, selfie, progreso |
| `/panel/coordinador` · `/panel/retiro` · `/panel/centro` · `/panel/evaluador` · `/panel/destino` · `/panel/supervisor` | Paneles por rol |
| `/admin/*` | Administración |

Etiqueta permanente "Datos simulados para demostración" mientras `config.demoMode=true` (19.4).

## 8. Tiempo real, trabajos y notificaciones

- SSE `/api/public/stream`: cada evento emite un resumen; tablero y paneles invalidan sus consultas y se refrescan sin recargar (12.6, 21.6).
- `jobs/scheduler.ts` cada minuto: viajes sin llegada (6 h), orígenes validados sin viaje (5 días), lotes retenidos sin decisión (3 días), despachos sin confirmar (3 días) → alertas al coordinador y mensaje de demora al ciudadano (7.13).
- Notificaciones en la app por usuario o por código de reporte (reportantes sin cuenta), con la voz de 8.3 (15).

## 9. AURA (sección 8)

- Sesiones en servidor: paso actual, borrador de reporte, código en contexto.
- Intención híbrida: reglas por palabras clave (Plan B, siempre disponible) y, si `ANTHROPIC_API_KEY` está definido, clasificación por modelo restringida a devolver solo la intención.
- Todos los textos salen de `auraTexts` (≥3 variantes rotadas) y cada dato viene de los servicios. Si no existe el código, lo dice.

## 10. Seguridad y no funcionales (18)

JWT firmado, contraseñas con bcrypt, validación con zod, límite de tamaño de foto, compresión en cliente, cola offline en IndexedDB con reintento, accesibilidad persistente, script de respaldo diario, sin direcciones exactas ni datos personales en páginas públicas.

## 11. Variables de entorno

```
PORT=4000
JWT_SECRET=cambia-esto
DB_DRIVER=memory            # memory | postgres
DATABASE_URL=postgres://user:pass@host:5432/kindra
PERSIST_FILE=true           # solo memory: guarda server/data/db.json
DEMO_MODE=true
ANTHROPIC_API_KEY=          # opcional
AURA_MODEL=claude-opus-5-5
TIME_SKEW_MINUTES=30
UPLOAD_DIR=./data/uploads
PUBLIC_BASE_URL=http://localhost:5173
```
