/** Textos iniciales de la página de Ayuda. La administración los puede cambiar en «Noticias y ayuda». */

const about = `Kindra es una aplicación para seguir el retiro de los escombros del terremoto en La Guaira, desde el lugar donde están hasta su destino final.

Con Kindra, las personas pueden avisar dónde hay escombros, seguir su reporte con un código y saber cómo va el avance en su sector. Los equipos de retiro, los centros de acopio, los evaluadores y los responsables de las obras registran cada paso: origen, transporte, recepción, procesamiento, evaluación y destino.

Cada paso queda guardado con su fecha y con la persona o la entidad responsable. Los registros no se borran: si algo se corrige, se guarda el motivo y el valor anterior.

Avisar de un escombro no exige crear una cuenta. La cuenta es opcional y sirve para ver el historial y sumar puntos por hechos verificados.

Kindra no es un servicio de emergencias. Si hay peligro para las personas, aléjate del lugar y comunícate con los servicios de emergencia.`;

const privacy = `Este aviso explica qué datos usa Kindra, para qué los usa y qué puedes pedir. Versión del 26 de noviembre de 2026.

1. Qué datos usamos
• Reportes: ubicación, dirección o referencia, fotos, notas de voz si las usas, fecha y lo que escribas. El dictado por voz lo procesa tu navegador. Puedes reportar sin cuenta.
• Cuenta: alias, contraseña cifrada y, si los das, nombre, teléfono, correo, sector y dirección.
• Cuentas de trabajo: entidad, rol, centro, vehículo y, cuando se exige verificar la identidad, una selfie.
• Viajes: placa, ruta y posición del vehículo mientras el rastreo del viaje está activo, y fotos de la carga.
• Seguridad: fecha, dirección IP y resultado de los inicios de sesión.
• Teléfono: guardamos en tu navegador tus códigos de reporte, tus preferencias y lo que envías sin conexión hasta que vuelva la señal.

2. Para qué los usamos
Para retirar los escombros, dar seguimiento a cada reporte y carga, avisarte de los cambios, evitar registros falsos o repetidos, proteger las cuentas y elaborar cifras del proyecto. No vendemos tus datos ni los usamos para publicidad.

3. Qué es público
En las páginas públicas se ven el sector, el estado de los reportes, los lotes y las obras, y las fotos que pasaron por moderación. De las personas se muestran el alias y el nivel. Si alguien escanea tu tarjeta Kindra, ve además tu rol, tu entidad, si tu identidad está verificada y desde cuándo participas. La dirección exacta, el nombre, el teléfono y el correo no son públicos.

4. Quién puede ver tus datos
Solo las personas autorizadas, según su rol y su entidad, y solo lo que necesitan para su trabajo. Las descargas de datos y los accesos quedan registrados.

5. Inteligencia artificial
Kindra usa Google Gemini, un servicio externo, en dos casos:
• AURA: si no entiende tu mensaje con sus propias reglas, envía ese texto a Gemini para saber qué necesitas. No escribas datos personales ni contraseñas en el chat.
• Fotos de carga: el personal de un centro puede enviar a Gemini la foto de una carga para recibir una sugerencia de clasificación. Siempre decide una persona.
Con esos envíos no mandamos tu nombre, tu teléfono ni tu correo. Google los trata según sus propias condiciones.

6. Otros servicios
La aplicación se aloja en Render, los datos y las fotos se guardan en Supabase y los mapas vienen de OpenStreetMap. Estos servicios pueden procesar datos fuera de Venezuela.

7. Cómo los protegemos
Usamos conexión cifrada, contraseñas cifradas, permisos por rol, bloqueo tras intentos fallidos, verificación en dos pasos para la administración principal y enlaces de fotos que vencen. Ningún sistema es totalmente seguro. Si ocurre un incidente, se registra y se atiende.

8. Cuánto tiempo los guardamos
Los plazos de conservación están pendientes de aprobación. El historial de trazabilidad no se borra, porque sirve para comprobar qué pasó con cada carga.

9. Qué puedes pedir
Puedes pedir ver tus datos, corregirlos, cerrar tu cuenta o preguntar cómo se usan, desde «Solicitar información». Te damos un código para seguir la respuesta. Si algún dato debe conservarse en el historial, te explicaremos el motivo. En «Perfil» puedes cambiar tus datos y elegir qué avisos recibes.

10. Menores de edad
Las personas menores de edad deben usar Kindra con el permiso y la compañía de su madre, su padre o su representante.

11. Cambios
Si este aviso cambia, publicaremos aquí la nueva versión con su fecha.`;

export const DEFAULT_HELP = { about, privacy, contact: '', updatedAt: '2026-11-26T12:00:00.000Z' };
