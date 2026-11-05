import type { AuraTextEntry } from '@kindra/shared';

/**
 * Textos de AURA (8.5, 8.6) y mensajes a ciudadanos (14, 15) y a entidades (15.2).
 * La primera variante de cada clave es el guion de referencia tal como está escrito en la
 * especificación. Las siguientes son variantes con el mismo contenido y distinta redacción (8.3).
 * Editable desde el panel de administración; nada está escrito en código de pantalla.
 */
export const DEFAULT_AURA_TEXTS: AuraTextEntry[] = [
  {
    key: 'first_contact',
    label: 'Primer contacto',
    variants: [
      'Hola, soy AURA, la asistente virtual que acompaña el retiro de escombros en La Guaira. Por aquí puedes avisar dónde hay escombro, saber qué pasó con lo que reportaste y ver en qué se está convirtiendo. ¿Qué necesitas hoy?',
      'Hola, soy AURA, una asistente virtual. Acompaño el retiro de escombros en La Guaira. Puedes avisarme dónde hay escombro, preguntarme por algo que ya reportaste o ver en qué se convierte. ¿Qué necesitas hoy?',
      'Hola, te habla AURA, asistente virtual del retiro de escombros en La Guaira. Aquí puedes avisar de un escombro, consultar cómo va un reporte o ver en qué termina el material. Cuéntame qué necesitas.',
    ],
  },
  {
    key: 'report_start',
    label: 'Inicio de reporte',
    variants: [
      'Vamos a dejarlo registrado. Antes, algo importante: toma la foto desde una distancia segura y no muevas nada, que puede haber partes inestables. Cuando la tengas, mándamela por aquí.',
      'Lo registramos ahora. Primero, algo importante: la foto tómala desde lejos y sin mover nada, porque puede haber partes inestables. Cuando la tengas, envíamela por aquí.',
      'Vamos a registrarlo. Antes de la foto, una cosa importante: hazla desde una distancia segura y no toques ni muevas nada, puede haber partes sueltas. Mándamela cuando la tengas.',
    ],
  },
  {
    key: 'after_photo',
    label: 'Después de la foto',
    variants: [
      'Recibida. Ahora compárteme la ubicación, o si te queda más fácil, dime la calle y una referencia que la gente de la zona conozca.',
      'Ya la tengo. Ahora mándame la ubicación, o si prefieres, escríbeme la calle y una referencia que conozca la gente de por ahí.',
      'Recibida. Lo que sigue es la ubicación: compártela desde el teléfono o dime la calle y una referencia conocida en la zona.',
    ],
  },
  {
    key: 'ask_size',
    label: 'Tamaño',
    variants: [
      '¿Más o menos qué tanto es? Algo que cabe en una carretilla, lo que llenaría una camioneta, o más que eso.',
      '¿Cuánto escombro hay, más o menos? Lo que cabe en una carretilla, lo que llena una camioneta, o más que eso.',
      'Para hacerme una idea del tamaño: ¿cabe en una carretilla, llenaría una camioneta, o es más que eso?',
    ],
  },
  {
    key: 'ask_urgency',
    label: 'Urgencia',
    variants: [
      '¿Está tapando la entrada de alguna casa o es un riesgo para quien pasa por ahí?',
      '¿Ese escombro tapa la entrada de alguna casa o pone en riesgo a quien pasa?',
      'Dime si está bloqueando la entrada de una casa, si es un peligro para quien pasa por ahí, o si puede esperar.',
    ],
  },
  {
    key: 'ask_name',
    label: 'Nombre opcional',
    variants: [
      'Si quieres, dime tu nombre para llamarte así en los avisos. Si prefieres no darlo, escribe "sin nombre" y seguimos.',
      '¿Cómo te llamo en los avisos? Puedes darme tu nombre o escribir "sin nombre" si prefieres no decirlo.',
      'Una cosa opcional: tu nombre, para usarlo en los mensajes. Si no quieres darlo, escribe "sin nombre".',
    ],
  },
  {
    key: 'report_confirmed',
    label: 'Reporte confirmado',
    variants: [
      'Listo, [nombre]. Tu reporte quedó registrado con el código [código]. Guárdalo, con él puedes preguntarme cuando quieras cómo va. Ahora lo revisa el equipo de coordinación y te aviso apenas haya novedad.',
      'Quedó registrado, [nombre]. El código de tu reporte es [código]. Guárdalo: con él me puedes preguntar cómo va cuando quieras. Ahora lo revisa el equipo de coordinación y te aviso en cuanto haya algo nuevo.',
      '[nombre], tu reporte ya está registrado con el código [código]. Anótalo, porque con ese código me preguntas cómo va en cualquier momento. El equipo de coordinación lo revisa ahora y te escribo apenas se mueva.',
    ],
  },
  {
    key: 'status_registered',
    label: 'Estado: registrado',
    variants: [
      'Tu reporte [código] está registrado y lo está revisando el equipo de coordinación de [sector]. Te aviso apenas lo validen.',
      'El reporte [código] ya está en manos del equipo de coordinación de [sector], que lo está revisando. Te escribo cuando haya novedad.',
      'Tu reporte [código] quedó registrado y está en revisión para [sector]. En cuanto lo validen te lo hago saber.',
    ],
  },
  {
    key: 'status_validated',
    label: 'Estado: validado',
    variants: [
      'Tu reporte [código] ya fue revisado y está en la lista de retiro de [sector]. Todavía no tengo fecha confirmada, pero en cuanto salga un camión hacia allá te lo hago saber.',
      'El reporte [código] ya fue revisado y entró en la lista de retiro de [sector]. No tengo fecha confirmada todavía, pero te aviso apenas salga un camión para allá.',
      'Ya revisaron tu reporte [código] y está en la lista de retiro de [sector]. Fecha confirmada aún no hay; cuando salga un camión hacia ese punto te escribo.',
    ],
  },
  {
    key: 'status_under_removal',
    label: 'Estado: en retiro',
    variants: [
      'Ya están trabajando en tu reporte [código]. Salió al menos un camión desde ese punto hacia el [centro].',
      'Tu reporte [código] ya está en retiro: al menos un camión salió desde ese punto hacia el [centro].',
      'Hay movimiento en tu reporte [código]: ya salió por lo menos un camión de ahí con destino al [centro].',
    ],
  },
  {
    key: 'status_removed',
    label: 'Estado: retirado',
    variants: [
      'Tu reporte [código] figura como retirado y el material fue llevado al [centro]. Si no quedó despejado, dímelo y lo reviso.',
      'Según el registro, el escombro de tu reporte [código] ya fue retirado y llevado al [centro]. Si sigue ahí, avísame.',
      'El reporte [código] está marcado como retirado; el material fue al [centro]. Si no es así, cuéntamelo y lo paso a revisión.',
    ],
  },
  {
    key: 'status_disputed',
    label: 'Estado: en disputa',
    variants: [
      'Tu reporte [código] está en revisión porque dijiste que no fue retirado. El equipo va a verificar en el sitio y te escribo con lo que encuentren.',
      'El reporte [código] quedó marcado para revisión en el sitio, como pediste. Te escribo cuando el equipo confirme qué pasó.',
      'Sobre tu reporte [código]: está en revisión por la disputa que abriste. El equipo verifica en el sitio y te cuento el resultado.',
    ],
  },
  {
    key: 'status_in_batch',
    label: 'Estado: en lote',
    variants: [
      'El material de tu reporte [código] ya está en el [centro], en un lote que se está clasificando y triturando. Cuando sepa en qué obra termina, te cuento.',
      'Tu reporte [código] avanzó: el material llegó al [centro] y está en un lote en proceso. Te aviso cuando se use en una obra.',
      'El escombro de tu reporte [código] ya entró en un lote del [centro]. Ahí lo clasifican y trituran. Te escribo cuando sepa en qué obra se usó.',
    ],
  },
  {
    key: 'status_in_work',
    label: 'Estado: en obra',
    variants: [
      'Material de [sector], del lote donde entró tu reporte [código], ya se usó en una obra. Te mandé el detalle en el mensaje de cierre.',
      'Tu reporte [código] llegó al final del recorrido: material de [sector] ya forma parte de una obra. Mira el mensaje de cierre para el detalle.',
      'Buenas noticias sobre [código]: el material de [sector] ya se usó en una obra pública. Los detalles están en tu mensaje de cierre.',
    ],
  },
  {
    key: 'status_closed',
    label: 'Estado: cerrado',
    variants: [
      'Tu reporte [código] ya cerró su recorrido completo: fue retirado, procesado en el [centro] y material de [sector] terminó en una obra. Gracias por reportar.',
      'El reporte [código] está cerrado: retiro, procesamiento en el [centro] y uso en obra, todo registrado. Gracias por estar pendiente.',
      'Recorrido completo para tu reporte [código]: retirado, procesado en el [centro] y convertido en parte de una obra. Gracias por avisar.',
    ],
  },
  {
    key: 'status_rejected',
    label: 'Estado: rechazado',
    variants: [
      'Revisamos tu reporte [código] y no pudimos registrarlo porque [motivo]. Si crees que es un error, cuéntame y lo vuelven a mirar.',
      'Tu reporte [código] fue revisado y no se pudo registrar porque [motivo]. Si piensas que es un error, dímelo y lo revisan de nuevo.',
      'Sobre el reporte [código]: no pudimos registrarlo porque [motivo]. Si te parece un error, cuéntame y pido que lo miren otra vez.',
    ],
  },
  {
    key: 'status_duplicate',
    label: 'Estado: duplicado',
    variants: [
      'Tu aviso [código] se sumó a otro reporte del mismo punto, el [principal]. Te mantengo al tanto de ese.',
      'El aviso [código] quedó unido al reporte [principal], que es del mismo lugar. Cualquier novedad te la cuento por ese.',
      'Alguien ya había reportado ese punto, así que tu aviso [código] se sumó al reporte [principal]. Te aviso lo que pase con él.',
    ],
  },
  {
    key: 'zone_not_cleared',
    label: 'Zona no liberada',
    variants: [
      'Esa zona todavía no ha sido liberada por los equipos de rescate, así que por ahora no se puede retirar nada ahí. Tu reporte queda guardado y se activa apenas den el visto bueno. Mientras tanto, mejor mantenerse alejados.',
      'Los equipos de rescate todavía no han liberado esa zona, por eso ahí no se puede retirar nada por ahora. Tu reporte queda guardado y se activa cuando den el visto bueno. Mientras, lo mejor es mantenerse lejos.',
      'En esa zona todavía no se puede retirar nada: los equipos de rescate no la han liberado. Tu reporte queda guardado y se activa en cuanto la autoricen. Por ahora, mejor no acercarse.',
    ],
  },
  {
    key: 'possible_duplicate',
    label: 'Posible duplicado',
    variants: [
      'Parece que alguien ya reportó ese mismo punto hace poco. Para no duplicar, voy a sumar tu aviso a ese reporte, así le damos más peso. Te mantengo al tanto con el código [código].',
      'Creo que ese punto ya lo reportó alguien hace poco. Para no repetirlo, sumo tu aviso a ese reporte y así tiene más peso. Te aviso lo que pase con el código [código].',
      'Ese mismo punto parece reportado hace poco. Voy a unir tu aviso a ese reporte para darle más fuerza, en vez de duplicarlo. Sigues al tanto con el código [código].',
    ],
  },
  {
    key: 'unreadable_photo',
    label: 'Foto ilegible',
    variants: [
      'No logro ver bien el escombro en esa foto, puede que esté oscura o muy de cerca. ¿Me mandas otra un poco más abierta?',
      'En esa foto no se distingue bien el escombro; quizá salió oscura o muy cerca. ¿Puedes mandarme otra más abierta?',
      'La foto no deja ver bien el escombro, tal vez por la luz o la distancia. ¿Me envías otra tomada un poco más lejos?',
    ],
  },
  {
    key: 'manual_review',
    label: 'Segunda foto ilegible: revisión manual',
    variants: [
      'Tampoco logro ver bien esta. No te preocupes: tu reporte [código] queda guardado y una persona del equipo lo va a revisar directamente. Te aviso lo que decidan.',
      'Esta tampoco se ve bien. Tu reporte [código] no se pierde: pasa a revisión manual por alguien del equipo, y te escribo con lo que decidan.',
      'No pude ver bien ninguna de las dos fotos, pero el reporte [código] queda guardado y lo revisa una persona del equipo. Te cuento el resultado.',
    ],
  },
  {
    key: 'daily_limit',
    label: 'Límite diario alcanzado',
    variants: [
      'Por hoy ya registraste varios puntos, gracias por estar tan pendiente. Si hay otro urgente, cuéntamelo y lo paso directo al equipo de coordinación.',
      'Hoy ya registraste varios puntos; gracias por estar tan atento. Si hay uno urgente, dímelo y se lo paso directamente al equipo de coordinación.',
      'Ya registraste varios puntos por hoy, se agradece que estés tan pendiente. Si queda alguno urgente, cuéntamelo y lo paso de una vez al equipo de coordinación.',
    ],
  },
  {
    key: 'rejection',
    label: 'Rechazo',
    variants: [
      'Revisamos tu reporte [código] y no pudimos registrarlo porque [motivo]. Si crees que es un error, cuéntame y lo vuelven a mirar.',
      'Tu reporte [código] fue revisado y no se pudo registrar porque [motivo]. Si piensas que es un error, dímelo y lo revisan de nuevo.',
      'Sobre el reporte [código]: no pudimos registrarlo porque [motivo]. Si te parece un error, cuéntame y pido que lo miren otra vez.',
    ],
  },
  {
    key: 'validated_notice',
    label: 'Aviso: reporte validado',
    variants: [
      'Tu reporte [código] ya fue revisado y está en la lista de retiro de [sector]. Todavía no tengo fecha confirmada, pero en cuanto salga un camión hacia allá te lo hago saber.',
      'Revisaron tu reporte [código]: ya está en la lista de retiro de [sector]. Fecha todavía no hay; te aviso cuando salga un camión hacia allá.',
      'Tu reporte [código] fue validado y entró en la lista de retiro de [sector]. Apenas salga un camión para ese punto te lo cuento.',
    ],
  },
  {
    key: 'delay',
    label: 'Demora',
    variants: [
      'Sé que ha pasado más tiempo del que debería. Tu reporte [código] sigue pendiente y ya avisé al equipo de coordinación de la demora. No te voy a dar una fecha que no tengo, pero te escribo apenas se mueva.',
      'Ha pasado más tiempo del que debería, lo sé. Tu reporte [código] sigue pendiente y ya le avisé al equipo de coordinación. No tengo una fecha para darte, pero en cuanto se mueva te escribo.',
      'Tu reporte [código] lleva más tiempo pendiente del que debería y ya se lo hice saber al equipo de coordinación. No te prometo una fecha que no tengo; te escribo apenas haya avance.',
    ],
  },
  {
    key: 'first_closure',
    label: 'Primer cierre',
    variants: [
      'Buenas noticias sobre tu reporte [código]: el escombro fue retirado y llevado al [centro]. ¿Puedes confirmarme si de verdad quedó despejado? Si no es así, dímelo y lo reviso.',
      'Hay novedad de tu reporte [código]: el escombro ya fue retirado y llevado al [centro]. ¿Me confirmas que el punto quedó despejado? Si no, dímelo y lo reviso.',
      'Sobre tu reporte [código]: el escombro fue retirado y está en el [centro]. ¿Puedes decirme si de verdad quedó limpio el sitio? Si no, avísame y lo paso a revisión.',
    ],
  },
  {
    key: 'citizen_confirms',
    label: 'Ciudadano confirma',
    variants: [
      'Gracias por confirmarlo. Ahora ese material empieza su segunda vida. Cuando sepa en qué obra terminó, te cuento.',
      'Gracias por confirmar. Ese material ahora empieza una segunda vida; cuando sepa en qué obra terminó, te lo cuento.',
      'Confirmado, gracias. A partir de aquí el material empieza su segunda vida. Te escribo cuando sepa en qué obra se usó.',
    ],
  },
  {
    key: 'dispute',
    label: 'Disputa',
    variants: [
      'Gracias por avisarme, eso es justo lo que necesitamos saber. Lo dejo marcado para revisión y el equipo va a verificar en el sitio. Te escribo con lo que encuentren.',
      'Gracias por decírmelo, es justo lo que necesitamos saber. Queda marcado para revisión y el equipo va a verificar en el sitio. Te cuento lo que encuentren.',
      'Bien que me avises, es lo que necesitamos saber. Lo marco para revisión; el equipo va a ir a verificar y te escribo con lo que encuentren.',
    ],
  },
  {
    key: 'dispute_resolved',
    label: 'Disputa resuelta',
    variants: [
      'Ya revisaron tu reporte [código]. [resultado]',
      'Hay respuesta sobre tu reporte [código]. [resultado]',
      'El equipo ya revisó tu reporte [código]. [resultado]',
    ],
  },
  {
    key: 'dispute_result_removed',
    label: 'Resultado de disputa: confirmado retirado',
    variants: [
      'Verificaron en el sitio y confirmaron que el punto quedó despejado; hay una foto como evidencia en tu ficha.',
      'Fueron al sitio y confirmaron que quedó despejado; la foto de evidencia está en tu ficha.',
      'La verificación en el sitio confirmó que ya no hay escombro ahí; puedes ver la foto en tu ficha.',
    ],
  },
  {
    key: 'dispute_result_reopened',
    label: 'Resultado de disputa: vuelve a retiro',
    variants: [
      'Tenías razón: el punto vuelve a la lista de retiro y te aviso cuando salga un camión.',
      'Confirmaron que todavía hay escombro; el punto vuelve a retiro y te escribo cuando salga un camión.',
      'El equipo vio que faltaba material, así que el punto regresa a la lista de retiro. Te aviso apenas salga un camión.',
    ],
  },
  {
    key: 'final_closure',
    label: 'Cierre final',
    variants: [
      'Tengo algo que contarte sobre el escombro de [sector]. Pasó por el [centro], se procesó junto con material de otras calles y se convirtió en [cantidad] de agregado que pasó las pruebas de calidad. Ese material se usó en [tipo de obra] en [localidad]. Lo que reportaste ayudó a que eso pasara. Si quieres ver el recorrido completo, está aquí: [enlace].',
      'Te cuento en qué terminó el escombro de [sector]. Llegó al [centro], se procesó con material de otras calles y salió como [cantidad] de agregado aprobado en calidad. Se usó en [tipo de obra] en [localidad]. Tu reporte fue parte de eso. El recorrido completo está aquí: [enlace].',
      'Hay noticias del escombro de [sector]: pasó por el [centro], se mezcló con material de otras calles y se convirtió en [cantidad] de agregado que aprobó las pruebas de calidad. Terminó en [tipo de obra] en [localidad]. Lo que reportaste ayudó. Puedes ver todo el recorrido aquí: [enlace].',
    ],
  },
  {
    key: 'satisfaction_question',
    label: 'Pregunta de satisfacción',
    variants: [
      'Una última cosa, y me ayuda mucho: ¿sentiste que tu reporte fue tomado en cuenta?',
      'Una pregunta final que me ayuda mucho: ¿sentiste que tu reporte fue tomado en cuenta?',
      'Para terminar, y me sirve mucho saberlo: ¿sentiste que tomaron en cuenta tu reporte?',
    ],
  },
  {
    key: 'satisfaction_yes',
    label: 'Respuesta "sí"',
    variants: [
      'Me alegra saberlo. Si ves otro punto, ya sabes dónde encontrarme.',
      'Qué bueno saberlo. Si ves otro punto, aquí me encuentras.',
      'Me alegra. Cuando veas otro punto, ya sabes dónde estoy.',
    ],
  },
  {
    key: 'satisfaction_no',
    label: 'Respuesta "más o menos" o "no"',
    variants: [
      'Gracias por decírmelo con sinceridad. Lo voy a tomar en cuenta para mejorar. Si quieres contarme qué faltó, te leo.',
      'Gracias por ser sincero. Lo tomo en cuenta para mejorar. Si quieres decirme qué faltó, te leo.',
      'Te agradezco la sinceridad. Lo voy a tener en cuenta para hacerlo mejor. Si me quieres contar qué faltó, aquí estoy.',
    ],
  },
  {
    key: 'where_debris_goes',
    label: 'A dónde va el escombro',
    variants: [
      'Lo que se retira en [sector] va al [centro]. Allí separan el metal, que va al Estado, apartan lo que pueda ser peligroso y trituran el concreto y el ladrillo. Eso se convierte en material para nuevas obras. Hasta ahora, de lo que entró a ese centro, cerca del [porcentaje] terminó reutilizado.',
      'El escombro de [sector] se lleva al [centro]. Ahí separan el metal, que se entrega al Estado, apartan lo que puede ser peligroso y trituran concreto y ladrillo. Eso termina como material para obras nuevas. Hasta ahora, de lo que entró a ese centro, cerca del [porcentaje] se reutilizó.',
      'Desde [sector] el escombro va al [centro]. En el centro sacan el metal (va al Estado), apartan lo que pueda ser peligroso y trituran el concreto y el ladrillo para hacer material de obra. De lo que ha entrado ahí, cerca del [porcentaje] terminó reutilizado.',
    ],
  },
  {
    key: 'where_debris_goes_no_data',
    label: 'A dónde va el escombro (sin datos de reutilización)',
    variants: [
      'Lo que se retira en [sector] va al [centro]. Allí separan el metal, que va al Estado, apartan lo que pueda ser peligroso y trituran el concreto y el ladrillo. Eso se convierte en material para nuevas obras. Todavía no tengo cifras de cuánto se ha reutilizado en ese centro.',
      'El escombro de [sector] se lleva al [centro], donde separan el metal, apartan lo peligroso y trituran concreto y ladrillo para hacer material de obra. Aún no tengo cifras de reutilización de ese centro.',
      'Desde [sector] el escombro va al [centro]. Ahí separan el metal, apartan lo que pueda ser peligroso y trituran el concreto y el ladrillo. Cifras de cuánto se reutilizó todavía no tengo.',
    ],
  },
  {
    key: 'sector_progress',
    label: 'Avance del sector',
    variants: [
      'En [sector] hay [número] puntos reportados. Ya se despejaron [despejados] y [en proceso] están en proceso. Si quieres te muestro el mapa.',
      'En [sector] van [número] puntos reportados: [despejados] ya despejados y [en proceso] en proceso. Si quieres, te muestro el mapa.',
      'Así va [sector]: [número] puntos reportados, [despejados] despejados y [en proceso] en proceso. Puedo mostrarte el mapa si quieres.',
    ],
  },
  {
    key: 'recognition',
    label: 'Reconocimiento',
    variants: [
      'Tu reporte quedó cerrado y verificado, así que sumaste puntos. Ya estás en el nivel [nivel]. Gracias por estar pendiente de tu comunidad.',
      'Tu reporte se cerró y quedó verificado, por eso sumaste puntos. Estás en el nivel [nivel]. Gracias por cuidar tu comunidad.',
      'Se cerró y verificó tu reporte, así que ganaste puntos. Tu nivel ahora es [nivel]. Gracias por estar pendiente de tu comunidad.',
    ],
  },
  {
    key: 'level_reached',
    label: 'Nivel alcanzado',
    variants: [
      'Llegaste al nivel [nivel] por hechos verificados de tus reportes. Gracias por estar pendiente de tu comunidad.',
      'Subiste al nivel [nivel]. Son hechos verificados de tus reportes los que te trajeron hasta aquí. Gracias por cuidar tu comunidad.',
      'Nuevo nivel: [nivel]. Lo ganaste con reportes verificados por otras personas. Gracias por estar atento a tu comunidad.',
    ],
  },
  {
    key: 'points_suspended',
    label: 'Suspensión de puntos',
    variants: [
      'Tus últimos reportes fueron rechazados tres veces seguidas, así que por [días] días no se van a sumar puntos a tu cuenta. Puedes seguir reportando con normalidad; solo te pido revisar bien el punto antes de enviarlo.',
      'Hubo tres rechazos seguidos en tus reportes y por eso, durante [días] días, no se suman puntos a tu cuenta. Puedes seguir avisando como siempre; solo revisa bien el punto antes de enviar.',
      'Como tres reportes seguidos fueron rechazados, la suma de puntos queda en pausa [días] días. Sigues pudiendo reportar; te pido confirmar bien el punto antes de enviarlo.',
    ],
  },
  {
    key: 'safety',
    label: 'Seguridad',
    variants: [
      'Cerca del escombro, lo principal es no tocarlo, no dejar que los niños jueguen encima y evitar el polvo, sobre todo si alguien en casa tiene problemas respiratorios. Si ves algo que parece material peligroso, avísame y no te acerques.',
      'Lo más importante cerca del escombro: no tocarlo, no dejar que los niños se suban y evitar respirar el polvo, más aún si en casa alguien tiene problemas respiratorios. Si algo parece material peligroso, avísame y mantente lejos.',
      'Con el escombro, lo principal es no tocarlo, que los niños no jueguen encima y evitar el polvo, sobre todo si alguien en casa tiene problemas para respirar. Si ves algo que parezca peligroso, no te acerques y avísame.',
    ],
  },
  {
    key: 'lesson_invitation',
    label: 'Invitación a lección',
    variants: [
      'Mientras se atiende tu reporte, ¿te cuento en menos de un minuto qué pasa con el escombro cuando llega al centro?',
      'Mientras atienden tu reporte, ¿quieres que te cuente en menos de un minuto qué pasa con el escombro al llegar al centro?',
      'En lo que se atiende tu reporte, si quieres te explico en menos de un minuto qué le pasa al escombro cuando llega al centro.',
    ],
  },
  {
    key: 'out_of_scope',
    label: 'Fuera de alcance',
    variants: [
      'Eso se escapa de lo que puedo ayudarte por aquí. Para ese tema te conviene comunicarte con [canal].',
      'Eso queda fuera de lo que puedo resolver por aquí. Para ese tema, mejor comunícate con [canal].',
      'Por aquí no puedo ayudarte con eso. Para ese tema te conviene contactar a [canal].',
    ],
  },
  {
    key: 'not_understood',
    label: 'No entendí',
    variants: [
      'No estoy segura de haberte entendido. ¿Quieres avisar de un escombro o saber cómo va algo que ya reportaste?',
      'Creo que no te entendí bien. ¿Quieres avisar de un escombro, o saber cómo va un reporte que ya hiciste?',
      'No me quedó claro. ¿Me cuentas si quieres reportar un escombro o consultar uno que ya reportaste?',
    ],
  },
  {
    key: 'code_not_found',
    label: 'Código no encontrado',
    variants: [
      'No encuentro ningún reporte con el código [código]. Revisa que esté bien escrito; son dos letras, un guion y cuatro caracteres, como LG-4821.',
      'No tengo ningún reporte registrado con el código [código]. ¿Puedes revisarlo? Tiene la forma LG-4821.',
      'Busqué el código [código] y no aparece en el sistema. Fíjate si está bien escrito: dos letras, guion y cuatro caracteres.',
    ],
  },
  {
    key: 'ask_code',
    label: 'Pedir código',
    variants: [
      'Dime el código de tu reporte, el que empieza por LG, y te cuento cómo va.',
      '¿Cuál es el código del reporte? Empieza por LG. Con eso te digo cómo va.',
      'Pásame el código del reporte (empieza por LG) y te cuento en qué está.',
    ],
  },
  {
    key: 'ask_location_again',
    label: 'Ubicación no reconocida',
    variants: [
      'No logré ubicar ese punto dentro de los sectores que atendemos. ¿Me compartes la ubicación desde el teléfono o me dices el sector y una referencia?',
      'Ese punto no me cae dentro de los sectores atendidos. ¿Puedes compartir la ubicación desde el teléfono, o decirme el sector y una referencia?',
      'No pude ubicar ese lugar en los sectores que cubrimos. Compárteme la ubicación o dime el nombre del sector y una referencia.',
    ],
  },
  {
    key: 'confirm_removal_which',
    label: 'Confirmar retiro: pedir código',
    variants: [
      'Qué bueno. ¿De cuál reporte me hablas? Dime el código y lo dejo confirmado.',
      'Bien. ¿Cuál es el código del reporte que quedó despejado? Así lo confirmo.',
      'Me alegra. Dime el código del reporte para dejar registrado que quedó despejado.',
    ],
  },
  {
    key: 'nothing_to_confirm',
    label: 'Nada que confirmar',
    variants: [
      'Tu reporte [código] todavía no figura como retirado, así que no tengo nada que confirmar por ahora. Te aviso apenas lo marquen.',
      'Según el sistema, el reporte [código] aún no está marcado como retirado. Cuando lo esté, te pido confirmación.',
      'El reporte [código] no aparece como retirado todavía, así que no hay nada que confirmar aún. Te escribo cuando cambie.',
    ],
  },
  {
    key: 'anonymous_cannot_dispute',
    label: 'Anónimo no puede disputar',
    variants: [
      'Como el reporte [código] se hizo sin cuenta, no puedo abrir una disputa desde aquí. Si quieres, puedes hacer un reporte nuevo del mismo punto y el equipo lo revisa.',
      'El reporte [código] fue anónimo y las disputas solo se pueden abrir con cuenta. Puedes volver a reportar el punto y el equipo lo mira.',
      'No puedo abrir disputa sobre [código] porque se hizo sin cuenta. Si el escombro sigue ahí, repórtalo de nuevo y lo revisan.',
    ],
  },
  {
    key: 'lesson_offer_list',
    label: 'Lista de lecciones',
    variants: [
      'Tengo cinco lecciones cortas, de menos de un minuto cada una. Dime el número de la que quieras o escribe "ninguna".',
      'Hay cinco lecciones cortas, cada una de menos de un minuto. Dime cuál quieres por su número, o "ninguna".',
      'Puedo contarte cinco cosas breves, cada una en menos de un minuto. Elige por número o escribe "ninguna".',
    ],
  },
  {
    key: 'lesson_correct',
    label: 'Respuesta correcta de lección',
    variants: [
      'Correcto. Esa lección quedó completada y sumaste puntos.',
      'Así es. Lección completada; se sumaron puntos a tu cuenta.',
      'Bien respondido. La lección queda completada y ganaste puntos.',
    ],
  },
  {
    key: 'lesson_incorrect',
    label: 'Respuesta incorrecta de lección',
    variants: [
      'No era esa. La respuesta correcta es: [respuesta]. Igual quedó completada.',
      'Esa no era. La correcta es: [respuesta]. La lección queda completada de todas formas.',
      'No exactamente; la respuesta correcta es: [respuesta]. Ya quedó completada.',
    ],
  },
  {
    key: 'need_photo',
    label: 'Falta la foto',
    variants: [
      'Para registrar el reporte necesito al menos una foto. Tómala desde lejos y mándamela por aquí.',
      'Sin una foto no puedo registrar el reporte. Hazla desde una distancia segura y envíamela.',
      'Necesito al menos una foto para seguir. Desde lejos, sin mover nada, y me la mandas por aquí.',
    ],
  },
  {
    key: 'report_cancelled',
    label: 'Reporte cancelado',
    variants: [
      'Listo, dejamos ese reporte sin enviar. Cuando quieras retomarlo, me dices.',
      'De acuerdo, no se envía. Si más tarde quieres reportarlo, aquí estoy.',
      'Queda sin enviar. Cuando quieras, lo retomamos.',
    ],
  },
  {
    key: 'noted',
    label: 'Entendido (sin acción)',
    variants: [
      'Entendido. Te aviso apenas haya novedad de tu reporte.',
      'De acuerdo. Cualquier novedad de tu reporte te la cuento por aquí.',
      'Bien. En cuanto se mueva tu reporte, te escribo.',
    ],
  },
  {
    key: 'menu_hint',
    label: 'Qué puedo hacer',
    variants: [
      'Puedo registrar un escombro, decirte cómo va un reporte, contarte a dónde va el material o darte consejos de seguridad. ¿Por dónde empezamos?',
      'Por aquí puedes avisar de un escombro, consultar un reporte con su código, saber a dónde va el material o preguntar por seguridad. Tú me dices.',
      'Te puedo ayudar a reportar un escombro, revisar cómo va uno que ya reportaste, explicarte en qué se convierte o darte recomendaciones de seguridad. ¿Qué necesitas?',
    ],
  },
  {
    key: 'which_sector',
    label: 'Pedir sector',
    variants: [
      '¿De qué sector me hablas? Dime el nombre o elige uno de la lista.',
      '¿Cuál es tu sector? Puedes escribir el nombre o escogerlo abajo.',
      'Para responderte bien necesito el sector. ¿Cuál es?',
    ],
  },
  {
    key: 'lesson_done_already',
    label: 'Lección ya completada',
    variants: [
      'Esa lección ya la completaste antes, así que no suma puntos de nuevo, pero puedes repasarla cuando quieras.',
      'Ya tenías completada esa lección; no suma puntos otra vez, pero igual te la cuento si quieres repasar.',
      'Esa ya la hiciste. No se repiten los puntos, pero puedes volver a leerla.',
    ],
  },
  {
    key: 'lesson_correct_nopoints',
    label: 'Respuesta correcta de lección (sin cuenta)',
    variants: [
      'Correcto. Si creas una cuenta, las lecciones que completes suman puntos.',
      'Así es. Con una cuenta, cada lección completada suma puntos a tu nivel.',
      'Bien respondido. Las lecciones suman puntos cuando tienes una cuenta en la plataforma.',
    ],
  },
  // ---- Notificaciones a usuarios institucionales (15.2) ----
  { key: 'notif_coord_new_reports', label: 'Coordinador: reportes nuevos', variants: ['Hay [número] reportes nuevos en [sector] esperando tu revisión.', 'Tienes [número] reportes nuevos de [sector] por revisar.', 'Llegaron [número] reportes nuevos en [sector]; están esperando tu revisión.'] },
  { key: 'notif_coord_delay', label: 'Coordinador: reporte sin camión', variants: ['Un reporte de [sector] lleva [número] días validado sin camión asignado.', 'En [sector] hay un reporte validado desde hace [número] días y todavía no sale camión.', 'Reporte [código] de [sector]: [número] días validado sin camión asignado.'] },
  { key: 'notif_coord_trip_no_arrival', label: 'Coordinador: viaje sin llegada', variants: ['El viaje [código] salió hace más de [número] horas y el [centro] no ha confirmado su llegada.', 'Sin llegada confirmada: el viaje [código] hacia el [centro] venció su plazo de [número] horas.', 'El [centro] no ha confirmado el viaje [código], que salió hace más de [número] horas.'] },
  { key: 'notif_coord_batch_held', label: 'Coordinador: lote retenido sin decisión', variants: ['El lote [código] lleva [número] días retenido sin decisión del evaluador.', 'Lote [código]: [número] días retenido y aún sin decisión técnica.', 'El evaluador no ha decidido sobre el lote [código], retenido desde hace [número] días.'] },
  { key: 'notif_coord_dispatch_unconfirmed', label: 'Coordinador: despacho sin confirmar', variants: ['El despacho [código] lleva [número] días sin que la obra confirme su recepción.', 'Despacho [código]: [número] días sin confirmación de la obra.', 'La obra no ha confirmado el despacho [código], enviado hace [número] días.'] },
  { key: 'notif_coord_dispute', label: 'Coordinador: disputa abierta', variants: ['El reporte [código] de [sector] tiene una disputa abierta: el ciudadano dice que el escombro sigue ahí.', 'Nueva disputa en [sector]: el reporte [código] no fue retirado según el ciudadano.', 'Hay una disputa en el reporte [código] de [sector] que espera tu revisión.'] },
  { key: 'notif_coord_alert_observation', label: 'Coordinador: alerta del supervisor', variants: ['El supervisor ambiental marcó una alerta: [texto]', 'Alerta del supervisor ambiental: [texto]', 'Nueva alerta registrada por el supervisor ambiental: [texto]'] },
  { key: 'notif_coord_monitor_request', label: 'Coordinador: solicitud de contralor', variants: ['[alias] pide activar el rol de contralor comunitario. Espera tu aprobación.', 'Nueva solicitud de contralor comunitario de [alias], pendiente de tu aprobación.', '[alias] quiere ser contralor comunitario; la solicitud espera tu decisión.'] },
  { key: 'notif_removal_prioritized', label: 'Retiro: puntos priorizados', variants: ['Se priorizaron [número] puntos nuevos en [sector].', 'Hay [número] puntos nuevos priorizados en [sector].', 'En [sector] se priorizaron [número] puntos nuevos para retiro.'] },
  { key: 'notif_center_trips', label: 'Centro: viajes por confirmar', variants: ['Llegaron [número] viajes desde [sector] que esperan tu confirmación en el [centro].', 'Hay [número] viajes desde [sector] esperando confirmación en el [centro].', '[número] viajes desde [sector] van hacia el [centro] y esperan tu confirmación.'] },
  { key: 'notif_evaluator_held', label: 'Evaluador: lote retenido', variants: ['El lote [código] quedó retenido por una posible presencia de material peligroso y espera tu decisión.', 'Lote [código] retenido: posible material peligroso. Espera tu decisión.', 'Hay una posible presencia de material peligroso en el lote [código]; quedó retenido hasta tu decisión.'] },
  { key: 'notif_evaluator_verification', label: 'Evaluador: lote por verificar', variants: ['El lote [código] del [centro] está listo para verificación de calidad.', 'Lote [código] ([centro]) espera tu verificación de calidad.', 'Hay un lote listo para verificar: [código], del [centro].'] },
  { key: 'notif_destination_dispatch', label: 'Destino: despacho pendiente', variants: ['Tienes un despacho del lote [código] pendiente de confirmar.', 'Hay un despacho del lote [código] esperando tu confirmación.', 'Un despacho del lote [código] espera que confirmes su recepción.'] },
  { key: 'notif_supervisor_discrepancy', label: 'Supervisor: discrepancia', variants: ['Se registró una discrepancia de [número] viajes sin llegada en el [centro].', 'Discrepancia en el [centro]: [número] viajes sin llegada.', 'En el [centro] hay [número] viajes sin llegada registrados como discrepancia.'] },
  // ---- Addendum del módulo de escombros: avisos comunitarios, referidos, entidad ----
  { key: 'sector_assigned', label: 'Aviso comunitario: puntos del sector asignados para retiro', variants: ['En [sector] hay [número] puntos asignados para retiro. Si pasas por ahí, ten cuidado con los camiones y no muevas el escombro.', 'Aviso para [sector]: [número] puntos ya están en la lista de retiro. Puede haber camiones en la zona en los próximos días.', 'Tu sector, [sector], tiene [número] puntos asignados para retiro. Mantén despejado el paso para los camiones.'] },
  { key: 'referral_validated', label: 'Referido: primer reporte validado', variants: ['[alias], a quien invitaste, tuvo su primer reporte validado. Sumaste puntos por ese hecho verificado.', 'El primer reporte de [alias], a quien invitaste, fue validado. Eso te suma puntos.', 'Se validó el primer reporte de [alias], tu invitado. Los puntos por referido ya están en tu saldo.'] },
  { key: 'notif_kindra_evaluator_proposed', label: 'Kindra: evaluador propuesto por una entidad', variants: ['[entidad] propuso a [alias] como evaluador técnico. Falta tu activación.', 'Nueva propuesta de evaluador: [alias], de [entidad]. Espera tu activación.', '[alias] fue propuesto como evaluador por [entidad]; la activación depende de Kindra.'] },
  { key: 'notif_evaluator_activated', label: 'Evaluador activado por Kindra', variants: ['Kindra activó tu rol de evaluador técnico. Ya puedes usarlo después de la verificación de identidad.', 'Tu rol de evaluador técnico quedó activado por Kindra.', 'Ya tienes activado el rol de evaluador técnico.'] },
  { key: 'notif_citizen_monitor_decided', label: 'Ciudadano: solicitud de contralor decidida', variants: ['Tu solicitud para ser contralor comunitario fue [resultado].', 'Sobre tu solicitud de contralor comunitario: fue [resultado].', 'El equipo de coordinación revisó tu solicitud de contralor comunitario: [resultado].'] },
];
