import type { AuraTextEntry } from '@kindra/shared';

/**
 * Addendum v4.2, sección 10: textos de AURA en estilo conversacional. La primera variante de cada clave es el texto
 * del addendum cuando lo trae; las demás dicen lo mismo con otras palabras. Los aprueba el equipo Kindra y se editan
 * en Administración → Textos de AURA. Variables entre corchetes: [nombre], [código], etc.
 */
const t = (key: string, label: string, variants: string[]): AuraTextEntry => ({ key, label, variants });

export const AURA_TEXTS_V42: AuraTextEntry[] = [
  t('v42_greet_new', 'v4.2 · Primer contacto (saludo)', [
    '¡Hola, [nombre]! Soy AURA, de Kindra 👋 Te ayudo a reportar escombro en Caraballeda, Catia La Mar, Macuto y Urimare, y te voy contando qué pasa con él.',
    '¡Hola, [nombre]! Te habla AURA, de Kindra 👋 Te acompaño para reportar escombro en Caraballeda, Catia La Mar, Macuto y Urimare, y te aviso qué pasa con él.',
    '¡Qué tal, [nombre]! Soy AURA, de Kindra 👋 Por aquí reportas escombro en Caraballeda, Catia La Mar, Macuto y Urimare, y yo te voy contando cómo avanza.',
  ]),
  t('v42_consent_whatsapp', 'v4.2 · Consentimiento (WhatsApp)', [
    'Antes de empezar: para atenderte uso tu nombre de WhatsApp, este número, la foto y el sector. Tu nombre nunca se publica, y si algún día quieres que borre tus datos, solo dímelo. ¿Te parece bien?',
    'Una cosa antes de seguir: para atenderte uso tu nombre de WhatsApp, este número, la foto y el sector. Tu nombre no se publica nunca y, si quieres, borro tus datos cuando me lo pidas. ¿Estás de acuerdo?',
    'Antes de arrancar: necesito usar tu nombre de WhatsApp, este número, la foto y el sector para atenderte. Tu nombre nunca sale publicado, y puedes pedirme que borre tus datos cuando quieras. ¿Te parece bien?',
  ]),
  t('v42_consent_pwa', 'v4.2 · Consentimiento (PWA)', [
    'Antes de empezar: para atenderte uso el nombre de tu cuenta, la foto y el sector. Tu nombre nunca se publica, y si algún día quieres que borre tus datos, solo dímelo. ¿Te parece bien?',
    'Una cosa antes de seguir: para atenderte uso el nombre de tu cuenta, la foto y el sector. Tu nombre no se publica nunca y puedes pedirme que borre tus datos. ¿Estás de acuerdo?',
    'Antes de arrancar: necesito el nombre de tu cuenta, la foto y el sector para atenderte. Tu nombre nunca sale publicado, y borro tus datos cuando me lo pidas. ¿Te parece bien?',
  ]),
  t('v42_consent_no', 'v4.2 · Consentimiento rechazado', [
    'Entendido, no guardo nada. Puedes ver cómo va tu parroquia en [enlace] o buscar al Contralor Comunitario de tu sector.',
    'Perfecto, no guardo ningún dato. El avance de tu parroquia está en [enlace], y el Contralor Comunitario de tu sector también te puede ayudar.',
    'Listo, no queda nada guardado. Si quieres ver el avance, entra a [enlace], o acércate al Contralor Comunitario de tu sector.',
  ]),
  t('v42_open', 'v4.2 · Pregunta abierta tras el saludo', [
    '¿Viste escombro por tu zona o quieres saber cómo va un reporte?',
    'Cuéntame, ¿hay escombro por tu zona o quieres revisar un reporte?',
    '¿Te escribo por un escombro nuevo o por algo que ya reportaste?',
  ]),
  t('v42_greet_back', 'v4.2 · Persona que vuelve', [
    '¡Epa, [nombre]! ¿Cómo sigue todo por [sector]? [pendiente] ¿Me escribes por eso o viste algo nuevo?',
    '¡Hola de nuevo, [nombre]! ¿Qué tal por [sector]? [pendiente] ¿Es por eso o hay algo nuevo?',
    '¡Epa, [nombre]! [pendiente] ¿Seguimos con eso o viste escombro en otro lado?',
  ]),
  t('v42_ask_name', 'v4.2 · Preguntar cómo llamarle', [
    '¿Cómo te gusta que te llame?',
    'Antes de seguir, ¿cómo te gusta que te llame?',
    'Una pregunta rápida: ¿cómo te gusta que te llame?',
  ]),
  t('v42_name_saved', 'v4.2 · Nombre guardado', [
    '¡Listo, [nombre]! Así te llamo desde ahora.',
    'Perfecto, [nombre], así te voy a llamar.',
    '¡Anotado, [nombre]!',
  ]),
  t('v42_ask_parish', 'v4.2 · Preguntar parroquia', [
    '¿En qué parroquia está? Caraballeda, Catia La Mar, Macuto o Urimare.',
    '¿Por cuál parroquia es: Caraballeda, Catia La Mar, Macuto o Urimare?',
    'Dime la parroquia, porfa: Caraballeda, Catia La Mar, Macuto o Urimare.',
  ]),
  t('v42_suggest_parish', 'v4.2 · Sugerir parroquia habitual', [
    '¿Es por [parroquia] otra vez?',
    '¿Otra vez por [parroquia]?',
    '¿Sigue siendo por [parroquia]?',
  ]),
  t('v42_ask_sector', 'v4.2 · Preguntar sector', [
    '¿En qué sector está? Si me dices una calle o algo de referencia, mejor.',
    '¿Y en qué sector? Una calle o algo que la gente conozca me ayuda mucho.',
    '¿Me dices el sector? Si tienes una calle o una referencia, mejor todavía.',
  ]),
  t('v42_suggest_sector', 'v4.2 · Sugerir sector habitual', [
    '¿Es por [sector] otra vez?',
    '¿Otra vez por [sector]?',
    '¿Es en [sector], como la vez pasada?',
  ]),
  t('v42_ask_photo', 'v4.2 · Pedir foto', [
    '¿Me mandas una foto? Así el equipo lo ubica más rápido. Si no tienes cámara, escribe «sin foto».',
    '¿Tienes una foto? Ayuda a que el equipo lo encuentre rápido. Si no puedes, escribe «sin foto».',
    'Mándame una foto del escombro, tomada desde lejos. Si no tienes cámara, escribe «sin foto».',
  ]),
  t('v42_ask_reference', 'v4.2 · Pedir referencia (opcional)', [
    '¿Algún punto de referencia? Por ejemplo «frente a la bodega». Si no, escribe «no».',
    '¿Hay algo cerca que la gente conozca? Si no, dime «no» y seguimos.',
    'Si tienes una referencia, escríbemela. Si no, responde «no».',
  ]),
  t('v42_report_done', 'v4.2 · Reporte registrado', [
    'Listo, [nombre], ya quedó anotado 🙏 Tu código es [código]. Te aviso por aquí cada vez que avance.',
    'Ya está, [nombre] 🙏 Tu código es [código]. Te voy avisando por aquí cómo avanza.',
    '¡Anotado, [nombre]! Tu código es [código]. Cuando cambie algo, te aviso por aquí.',
  ]),
  t('v42_grouped', 'v4.2 · Punto ya reportado', [
    'Este punto ya fue reportado; seguirás el mismo caso.',
    'Ese punto ya estaba reportado, así que sigues el mismo caso.',
    'Alguien ya había reportado ese punto: vas a seguir el mismo caso.',
  ]),
  t('v42_no_photo', 'v4.2 · Reporte sin foto', [
    'Como va sin foto, queda «Por Verificar» hasta que lo confirme un Contralor Comunitario.',
    'Al ir sin foto, un Contralor Comunitario lo confirma en el sitio antes de validarlo.',
    'Sin foto queda «Por Verificar»: un Contralor Comunitario pasa a confirmarlo.',
  ]),
  t('v42_not_understood', 'v4.2 · No entendí', [
    'Creo que no te entendí bien 🙏 ¿Quieres reportar escombro o revisar un reporte?',
    'Disculpa, no te entendí 🙏 ¿Es para reportar escombro o para revisar un reporte?',
    'Me perdí un poco 🙏 ¿Quieres reportar escombro o saber cómo va un reporte?',
  ]),
  t('v42_menu', 'v4.2 · Menú (solo si lo pide o tras dos intentos)', [
    'Esto es lo que puedo hacer:\n1. Reportar escombro\n2. Consultar mi código\n3. Ver el avance de mi sector\n4. Confirmar o disputar un cierre\n5. Hablar con una persona\n6. Privacidad y borrar mis datos',
    'Te dejo las opciones:\n1. Reportar escombro\n2. Consultar mi código\n3. Ver el avance de mi sector\n4. Confirmar o disputar un cierre\n5. Hablar con una persona\n6. Privacidad y borrar mis datos',
    'Escríbeme el número de lo que necesitas:\n1. Reportar escombro\n2. Consultar mi código\n3. Ver el avance de mi sector\n4. Confirmar o disputar un cierre\n5. Hablar con una persona\n6. Privacidad y borrar mis datos',
  ]),
  t('v42_voice', 'v4.2 · Nota de voz', [
    'Disculpa, por aquí no puedo escuchar audios 🙏 ¿Me lo escribes cortico? Si prefieres, te paso con una persona del equipo.',
    'Perdona, los audios no los puedo escuchar 🙏 ¿Me lo escribes en pocas palabras? También te puedo pasar con alguien del equipo.',
    'Ay, los audios no me llegan bien 🙏 Escríbemelo cortico, o si quieres te comunico con una persona.',
  ]),
  t('v42_is_human', 'v4.2 · ¿Eres una persona?', [
    'Te digo la verdad: soy AURA, la asistente de Kindra, no una persona. Si quieres, te conecto con alguien del equipo.',
    'Soy AURA, la asistente de Kindra; no soy una persona. Si prefieres hablar con alguien del equipo, te comunico.',
    'No, soy AURA, la asistente de Kindra. Si quieres hablar con una persona del equipo, te paso ahora.',
  ]),
  t('v42_handoff', 'v4.2 · Pasar a una persona', [
    'Listo, le paso tu conversación a una persona del equipo, con lo que ya me contaste, para que no tengas que repetir nada. [horario]',
    'Ya le pasé tu conversación a alguien del equipo, con todo lo que me dijiste. [horario]',
    'Te comunico con una persona del equipo; ya tiene lo que conversamos. [horario]',
  ]),
  t('v42_emotion', 'v4.2 · Reconocer la emoción', [
    'Lamento mucho eso, [nombre]. Te entiendo.',
    'Qué difícil, [nombre]. Entiendo cómo te sientes.',
    'Siento mucho que estés pasando por eso, [nombre].',
  ]),
  t('v42_emergency', 'v4.2 · Riesgo inmediato', [
    'Si hay peligro inmediato, como algo que se puede caer, aléjate y llama a [número]. Tu seguridad va primero.',
    'Si hay riesgo ya mismo, sal de ahí y llama a [número]. Primero estás tú.',
    'Ante un peligro inmediato, aléjate del lugar y comunícate con [número].',
  ]),
  t('v42_off_topic', 'v4.2 · Tema fuera de alcance', [
    'De eso no te puedo ayudar por aquí 🙏 Yo te acompaño con el escombro: reportarlo, consultar tu código y ver el avance de tu sector.',
    'Eso se me escapa 🙏 Lo mío es el escombro: reportes, códigos y el avance de tu sector.',
    'Disculpa, eso no lo manejo. Te ayudo con el escombro: reportar, consultar o ver cómo va tu sector.',
  ]),
  t('v42_privacy', 'v4.2 · Privacidad', [
    'Guardo tu nombre, este número, tus fotos, tus sectores habituales y tus reportes, solo para atenderte. Tu nombre nunca se publica. Si quieres que borre tus datos, responde «sí, borrar».',
    'Lo que guardo: tu nombre, tu número, tus fotos, tus sectores y tus reportes, solo para atenderte. Nunca publico tu nombre. Para borrar tus datos, escribe «sí, borrar».',
    'Para atenderte guardo tu nombre, número, fotos, sectores y reportes. Tu nombre no se publica. Si quieres borrarlos, responde «sí, borrar».',
  ]),
  t('v42_erased', 'v4.2 · Datos borrados', [
    'Listo, borré tus datos personales. Tus reportes siguen, pero ya sin tu nombre ni tu número.',
    'Hecho: tus datos personales quedaron borrados. Los reportes siguen, sin tu nombre ni tu número.',
    'Ya borré tus datos. Los casos siguen abiertos, pero de forma anónima.',
  ]),
  t('v42_status', 'v4.2 · Estado de un código', [
    '[código]: [estado]. Último cambio: [fecha].[lote]',
    'Tu [código] está en «[estado]» desde el [fecha].[lote]',
    '[código] va así: [estado] (último cambio el [fecha]).[lote]',
  ]),
  t('v42_status_delay', 'v4.2 · Retraso o mala noticia', [
    'Todavía no lo han retirado. Ya está en la lista y te aviso apenas cambie.',
    'Aún no pasan a buscarlo, pero está en la lista. Te aviso en cuanto se mueva.',
    'Sigue pendiente de retiro. Está anotado y te aviso apenas cambie.',
  ]),
  t('v42_which_code', 'v4.2 · ¿Cuál código?', [
    '¿De cuál reporte me hablas? Te dejo tus códigos.',
    '¿Cuál de tus reportes quieres revisar?',
    'Tengo estos reportes tuyos. ¿Cuál revisamos?',
  ]),
  t('v42_ask_code', 'v4.2 · Pedir código', [
    '¿Me pasas el código? Es algo como R-CB-004512.',
    'Escríbeme el código del reporte, por ejemplo R-CB-004512.',
    '¿Cuál es el código? Tiene la forma R-CB-004512.',
  ]),
  t('v42_progress', 'v4.2 · Avance del sector', [
    '[sector]: [semáforo]. [cerrados] cerrados y [pendientes] pendientes (corte [fecha]). Mira el detalle en [enlace]',
    'Así va [sector]: [semáforo]. Cerrados: [cerrados]. Pendientes: [pendientes]. Corte: [fecha]. Más detalle: [enlace]',
    'En [sector] el semáforo está en [semáforo]: [cerrados] cerrados y [pendientes] por atender (corte [fecha]). [enlace]',
  ]),
  t('v42_confirm_ask', 'v4.2 · Confirmar o disputar', [
    'El Ente de Retiro marcó [código] como despejado. ¿Cómo quedó?\n1 Confirmo que se retiró\n2 No se retiró o quedó incompleto',
    'Te cuento: [código] figura como despejado. ¿Es así?\n1 Confirmo que se retiró\n2 No se retiró o quedó incompleto',
    'Dicen que ya limpiaron [código]. ¿Me confirmas?\n1 Confirmo que se retiró\n2 No se retiró o quedó incompleto',
  ]),
  t('v42_confirmed', 'v4.2 · Cierre confirmado', [
    '¡Gracias, [nombre]! Quedó confirmado 🙏[raíces]',
    '¡Listo, [nombre]! Confirmado 🙏[raíces]',
    'Perfecto, [nombre], ya quedó confirmado.[raíces]',
  ]),
  t('v42_dispute_photo', 'v4.2 · Disputa: pedir foto', [
    'Gracias por avisar. Si puedes, mándame una foto de cómo está ahora, o escribe «sin foto». Se lo paso a un Contralor Comunitario.',
    'Entiendo. ¿Me mandas una foto de cómo quedó? Si no, escribe «sin foto». Lo va a revisar un Contralor Comunitario.',
    'Gracias. Una foto de cómo está ahora ayuda mucho; si no tienes, escribe «sin foto». Lo revisa un Contralor Comunitario.',
  ]),
  t('v42_disputed', 'v4.2 · Disputa registrada', [
    'Listo, el caso se reabrió y lo va a revisar un Contralor Comunitario de tu sector. Te aviso por aquí.',
    'Hecho: reabrimos el caso y un Contralor Comunitario lo revisa. Te mantengo al tanto.',
    'El caso quedó reabierto y va a un Contralor Comunitario de tu sector. Te aviso cualquier cambio.',
  ]),
  t('v42_nothing_pending', 'v4.2 · Nada por confirmar', [
    'Por ahora no tienes ningún cierre por confirmar.',
    'No hay cierres esperando tu respuesta en este momento.',
    'Todavía no te toca confirmar nada; te aviso cuando haya un cierre.',
  ]),
  t('v42_learn_tip', 'v4.2 · Sugerir una lección', [
    '¿Quieres ver en 2 minutos qué pasa con el escombro que reportaste? [enlace]',
    'Si te provoca, en 2 minutos te cuento qué pasa con el escombro: [enlace]',
    'Dato: en 2 minutos puedes ver a dónde va el escombro que reportaste. [enlace]',
  ]),
  t('v42_blocked', 'v4.2 · Número bloqueado', [
    'Por ahora no puedo recibir reportes desde este número. Si crees que es un error, usa la PWA de Kindra.',
    'Este número tiene los reportes en pausa. Si es un error, entra a la PWA de Kindra.',
    'No puedo tomar reportes desde este número por ahora. Puedes usar la PWA de Kindra.',
  ]),
  t('v42_daily_limit', 'v4.2 · Límite diario', [
    'Por hoy ya registraste varios puntos, gracias por estar tan pendiente 🙏 Si hay otro urgente, te paso con una persona del equipo.',
    'Hoy ya llegaste al máximo de reportes por número 🙏 Si es urgente, te comunico con alguien del equipo.',
    'Ya van varios reportes hoy desde este número. Si hay uno urgente, te paso con una persona.',
  ]),
  t('v42_anon_start', 'v4.2 · Reportar sin mis datos', [
    'Listo, lo hacemos sin tus datos: no guardo tu nombre ni recuerdo esta conversación. Vamos con el reporte.',
    'Perfecto, reporte sin tus datos: no guardo nombre ni memoria. Empecemos.',
    'De acuerdo, sin datos personales y sin memoria. Cuéntame dónde está el escombro.',
  ]),
  t('v42_report_done_anon', 'v4.2 · Reporte sin datos registrado', [
    'Listo, ya quedó anotado 🙏 Tu código es [código]. Guárdalo: con él puedes consultar el avance en Seguimiento.',
    'Anotado 🙏 Tu código es [código]. Con ese código ves cómo avanza en Seguimiento.',
    'Ya está registrado. Código: [código]. Guárdalo para consultar el avance.',
  ]),
  t('v42_ask_size', 'v4.2 · Tamaño estimado', [
    '¿Más o menos qué tanto es? Pequeño (una carretilla), mediano (una camioneta) o grande (un camión o más).',
    '¿Qué tamaño tiene, más o menos? Como una carretilla, una camioneta o un camión.',
    'Un cálculo a ojo: ¿es pequeño, mediano o grande?',
  ]),
  t('v42_voice_attached', 'v4.2 · Nota de voz adjunta', [
    'Recibí tu nota de voz y la adjunto al reporte: la escucha una persona del equipo. No la transcribo.',
    'Guardé tu audio con el reporte para que lo escuche alguien del equipo.',
    'Tu nota de voz va con el reporte; una persona la escucha.',
  ]),
  t('v42_emergency_life', 'v4.2 · Peligro para la vida (911)', [
    'Si hay personas atrapadas, heridas, fuego o gas, llama ya al [número]. Aléjate del lugar.',
    'Primero lo urgente: llama al [número] ahora mismo si hay heridos, personas atrapadas, fuego o gas.',
    'Llama de inmediato al [número]. Tu vida y la de los demás van primero.',
  ]),
  t('v42_emergency_civil', 'v4.2 · Estructura inestable o material peligroso (166)', [
    'Si la estructura está inestable o sospechas de material peligroso, no te acerques y avisa a Protección Civil al [número]. Igual lo dejo reportado y marcado como posible material peligroso.',
    'No te acerques. Para estructuras inestables o materiales peligrosos llama a Protección Civil, [número]. Lo registro marcado como sospecha de material peligroso.',
    'Mantén distancia y comunícate con Protección Civil al [número]. Yo lo dejo registrado con la marca de posible material peligroso.',
  ]),
  t('v42_hazard_flagged', 'v4.2 · Reporte marcado como posible material peligroso', [
    'Quedó marcado como posible material peligroso: el Evaluador Técnico lo revisa antes de procesarlo.',
    'Lo marqué como sospecha de material peligroso para que lo revise el Evaluador Técnico.',
    'Va con la marca de posible material peligroso.',
  ]),
];

/** Plantillas de WhatsApp aprobadas por Meta (10.5): nombre de la plantilla por tipo de aviso. */
export const WHATSAPP_TEMPLATES: Record<string, string> = {
  validated: 'reporte_validado',
  lote_asignado: 'lote_asignado',
  under_removal: 'cambio_estado_lote',
  status_change: 'cambio_estado_lote',
  final_closure: 'cambio_estado_lote',
  first_closure: 'cierre_propuesto',
  caso_reabierto: 'caso_reabierto',
  dispute_resolved: 'caso_reabierto',
};
