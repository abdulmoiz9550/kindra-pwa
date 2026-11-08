# Camino dorado: guion de la demostración (sección 20)

Un origen recorre todo el ciclo en vivo en unos diez minutos, cambiando de rol en cada paso con el selector de la cabecera (modo demo). Contraseña de todos los usuarios de prueba: `demo1234`.

Antes de empezar: Administración → Datos de demostración → **Reiniciar datos** (doble confirmación, menos de un minuto). Abre el tablero público (`/tablero`) en una segunda ventana: se actualiza solo.

| Paso | Rol | Pantalla | Acción | Lo que se ve |
|---|---|---|---|---|
| 1 | Ciudadano | AURA (`/aura`) | Escribe "Hay un montón de escombro frente a mi casa", manda la foto, comparte la ubicación (o elige Sector A y una referencia), tamaño, urgencia, nombre. | AURA entrega el código LG-XXXX. El tablero suma un punto pendiente en Sector A. |
| 2 | Ente coordinador | Panel coordinador → Bandeja | Validar el reporte (prioridad alta). | El ciudadano recibe "Tu reporte ya fue revisado y está en la lista de retiro…" (campana / AURA). |
| 3 | Ente de retiro | Panel retiro → Registrar salida | Escanear QR del vehículo (`KV-DEMO01`), elegir el origen, Caraballeda, foto, nivel de llenado. | Viaje en tránsito; el ciudadano recibe "Ya están trabajando en tu reporte…". Si se intenta con un origen de Sector D (zona pendiente) el servidor lo bloquea (7.2). |
| 4 | Centro (Norte) | Panel centro → Confirmar llegada | Escanear el QR del vehículo y foto de llegada. Luego, como coordinador, marcar el origen como retirado. | Recepción creada en el lote abierto L-NORTE-002. El ciudadano recibe el primer cierre y confirma en AURA ("Ya se lo llevaron"). |
| 5 | Centro (Norte) | Panel centro → Recepciones | Clasificar la recepción del origen (concreto y ladrillo). Clasificar la otra recepción pendiente (gandola) como **posible material peligroso**. | El lote queda **retenido**. Como evaluador: lista de verificación completa, justificación, "desviar a disposición especial". El lote se libera. Intentar procesarlo retenido lo bloquea (7.3). |
| 6 | Centro (Norte) | Panel centro → Lote abierto | Cerrar el lote y registrar salidas (unidad, agregado, metal, disposición especial, rechazos). | Composición por sector calculada (7.5). El lote pasa a "en verificación". |
| 7 | Evaluador | Panel evaluador → En verificación | Lista de verificación, **aprobar**, justificación. | Lote aprobado. Intentar despachar antes de aprobar lo bloquea (7.4). |
| 8 | Centro (Norte) → Destino | Despachar a la obra OB-003 (cantidad). Como destino: confirmar recepción y **registrar el uso** (tipo de obra, localidad, fecha). | Se envía el cierre final a los reportes de los sectores del lote. |
| 9 | Ciudadano | AURA | Lee el mensaje final ("Tengo algo que contarte sobre el escombro de Sector A…") y responde la pregunta de satisfacción. | Puntos y nivel en el perfil. |
| 10 | Público | `/publico/qr/obra/OB-003` → escanear → `/publico/obra/OB-003` | Página de la obra: sectores de origen con su participación, cadena de entidades, "Verificar integridad" en verde. | Tablero público actualizado sin recargar. |

## Compuertas que la demo debe mostrar bloqueando (21.4)

- Viaje desde zona pendiente de autorización: Panel retiro → elegir un origen de Sector D → "La zona de este origen todavía no ha sido autorizada…".
- Procesar un lote retenido: Panel centro → L-SUR-003 → "El lote está retenido por posible material peligroso…".
- Despachar sin verificación aprobada: Panel centro → L-SUR-002 → "El lote no tiene una verificación de calidad aprobada…".
- Validar o recibir lo que uno mismo reportó: el servidor responde "Nadie puede validar, retirar o recibir algo que reportó él mismo (regla 4.1)".

## Integridad (21.3)

Ficha pública de cualquier reporte → "Verificar integridad" → intacto. Si se altera a mano un evento en la base, el botón muestra "alterado" y nombra el evento:

- Modo memoria: editar cualquier valor dentro de `data` de un evento en `server/data/db.json` y reiniciar el servidor.
- PostgreSQL: el trigger de solo anexado bloquea los UPDATE normales; para simular una alteración hay que saltarlo a propósito en la misma sesión:
  ```sql
  SELECT set_config('kindra.allow_reset', 'on', false);
  UPDATE events SET full_event = jsonb_set(full_event, '{data,manipulado}', 'true') WHERE seq = 42;
  ```
  y reiniciar el servidor (las proyecciones y la verificación se recalculan desde la bitácora).
