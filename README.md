# Kindra PWA – Módulo 1: Trazabilidad Circular de Escombros

Plataforma de trazabilidad y participación ciudadana sobre el ciclo físico de escombros que opera el Estado en La Guaira. Implementa la especificación funcional del 1 de noviembre de 2026 (entrega del 11 de noviembre).

- Diseño técnico: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Guion de la demostración (camino dorado): [docs/GOLDEN_PATH.md](docs/GOLDEN_PATH.md)

## Requisitos

- Node.js 20 o superior (probado con Node 24)
- npm 10

## Arranque rápido (modo de pruebas, sin base de datos)

```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
npm run dev
```

- PWA: http://localhost:5173
- API: http://localhost:4000/api (salud: /api/health)

Con `DB_DRIVER=memory` (valor por defecto) todo el estado vive en memoria y se vuelca a `server/data/db.json` para sobrevivir reinicios (`PERSIST_FILE=true`). Al arrancar con la base vacía se cargan los datos simulados (`SEED_ON_EMPTY=true`). La etiqueta "Datos simulados para demostración" aparece en todas las pantallas mientras `DEMO_MODE=true`.

### Usuarios de prueba (uno por rol, contraseña `demo1234`)

| Rol | Alias |
|---|---|
| Ciudadano | `ciudadano` (también `vecina`) |
| Contralor comunitario | `contralora` |
| Ente coordinador | `coordinador` |
| Ente de retiro | `retiro` |
| Centro de disposición | `centro` (Caraballeda), `centro-sur` (Playa Escondida) |
| Evaluador técnico | `evaluador` |
| Supervisor ambiental | `supervisor` |
| Destino final (obras) | `obras` |
| Administrador de entidad (Ente Ejecutor) | `admin-ejecutor` |
| Administrador principal Kindra (Jesús) | `admin` |

En modo demo, el selector de la cabecera cambia de rol con un toque (19.3). Código de pre-registro de ejemplo para personas sin teléfono: `PR-DEMO01` (el pre-registro está oculto en esta fase; se enciende en Administración → Funciones).

El administrador principal entra con verificación en dos pasos. En modo demostración, y solo para usuarios de prueba, la pantalla del código muestra el código vigente. El secreto de prueba es `KINDRADEMOJESUS2FA234567` si se quiere cargar en una aplicación de autenticación.

## Addendum del módulo de escombros (4 nov 2026)

| Función | Dónde |
|---|---|
| Tarjeta Kindra con QR personal e intransferible | `/tarjeta`; verificación pública en `/publico/tarjeta/:código` |
| Logros en dos capas (personales y del sector) | Perfil |
| Referidos: puntos solo con el primer reporte validado del invitado | Perfil; registro con `?ref=INV-…` |
| Avisos comunitarios por sector | Automáticos al validar puntos (uno por sector y día); manuales en Coordinación → Avisos al sector |
| Compuertas fijas 7.2, 7.3, 7.4 y 4.1 | Se exigen en el código; Administración → Estados las muestra con candado |
| Niveles de administración | Administrador principal (único, dos pasos, cada acción es un evento) y administrador de entidad en `/panel/entidad` |
| Evaluadores propuestos por la entidad y activados por Kindra | Panel de entidad → Proponer; Administración → Usuarios → Propuestas de rol |
| Espacios por convenio | Administración → Espacios; se asignan en Entidades, Usuarios y Sectores |
| Funciones activables y ocultas | Administración → Funciones |
| Bitácora de administración con verificación de integridad | Administración → Bitácora de administración |
| Capacidad de camión opcional | Administración → Vehículos; el volumen siempre se marca como estimado |

Si el administrador pierde el teléfono de la verificación en dos pasos, en el servidor:

```bash
npm run reset-2fa -w server -- admin
```

QR de vehículos de prueba: `KV-DEMO01` … `KV-DEMO05` (también descargables desde Administración → Vehículos).

## Pasar a PostgreSQL (sin cambios de código)

1. Crear la base y definir en `.env`:
   ```
   DB_DRIVER=postgres
   DATABASE_URL=postgres://usuario:clave@host:5432/kindra
   DATABASE_SSL=false
   ```
2. Aplicar el esquema: `npm run -w server db:schema` (también se aplica solo al arrancar si faltan las tablas).
3. Arrancar: `npm run dev` o `npm start`.

La bitácora de eventos es solo de anexado: un trigger en la base impide UPDATE y DELETE sobre `events`. El reinicio de datos de demostración es la única ruta que la vacía.

## Producción

```bash
npm run build          # compila la PWA en client/dist
npm start              # el servidor sirve la API y la PWA compilada en el puerto PORT
```

Define `PUBLIC_BASE_URL` con la URL pública (se usa en enlaces y códigos QR) y un `JWT_SECRET` propio.

## Pruebas

```bash
npm test               # pruebas del servidor: sello de integridad, reproducción de la bitácora, compuertas 7.2/7.3/7.4/4.1, balance de masas, AURA, textos
npm run typecheck      # verificación de tipos de servidor y cliente
```

## Copia de seguridad diaria

`npm run backup` guarda una copia en `server/data/backups/`. Programarlo una vez al día con cron o el Programador de tareas de Windows.

## AURA

Funciona siempre con reconocimiento por palabras clave (Plan B). Si se define `ANTHROPIC_API_KEY`, la clasificación de intención usa además un modelo de lenguaje que devuelve únicamente la etiqueta de intención; los textos y los datos siguen saliendo de la base. Todos los textos de AURA y de los mensajes son editables en Administración → Textos de AURA.

## Estructura

```
shared/   tipos, constantes y utilidades comunes
server/   API (Express), bitácora con sello de integridad, reglas de negocio, AURA, semilla de demostración, pruebas
client/   PWA (React + Vite + Tailwind)
docs/     arquitectura y guion de demostración
```

## Identidad visual

La paleta sale del logotipo de Kindra: teal profundo (`#04303f`), verde (`#4f9a2f`), naranja (`#d98d2b`) y blanco. Los archivos del logotipo están en `client/public/brand/` y los iconos de la PWA en `client/public/icons/`. Las variables de color y los estilos propios (cabecera, hero, navegación, tarjetas, botones) viven en `client/src/styles.css`; las tipografías son Sora (títulos) y Source Sans 3 (texto), con respaldo del sistema si no hay conexión. El logotipo del ente operador se configura en Administración → Configuración; mientras no exista se muestra su inicial.
