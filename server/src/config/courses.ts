import type { Course, Lesson } from '@kindra/shared';

/**
 * Addendum v4.2, 3.2: cursos de Training del Módulo 1. Los textos son borradores en lenguaje sencillo y quedan
 * «pendientes de validación» hasta que el equipo Kindra los apruebe desde Administración → Lecciones.
 */
export const DEFAULT_COURSES: Course[] = [
  {
    id: 'que_pasa', order: 1, title: '¿Qué pasa con el escombro?', description: 'Los 4 estados públicos y en qué se convierte el material.', roles: [], validationStatus: 'pending', published: true,
    quiz: [
      { question: '¿Cuál es el orden de los estados públicos de un lote?', options: ['Retirado, Recibido, Procesado y Ensayado, Destino Final', 'Recibido, Retirado, Destino Final, Procesado y Ensayado', 'Procesado y Ensayado, Retirado, Recibido, Destino Final'], correctIndex: 0 },
      { question: '¿A dónde va el material no apto?', options: ['A una obra pública', 'Al Centro de Disposición Final (CDF)', 'Se queda en la calle'], correctIndex: 1 },
    ],
  },
  {
    id: 'reportar_bien', order: 2, title: 'Cómo reportar bien', description: 'Una buena foto, el sector, el código y cómo confirmar o disputar.', roles: [], validationStatus: 'pending', published: true,
    quiz: [
      { question: '¿Qué dato es obligatorio al reportar?', options: ['La ubicación exacta en el mapa', 'La parroquia y el sector', 'Tu nombre completo'], correctIndex: 1 },
      { question: 'Si te avisan que el punto quedó limpio y no es así, ¿qué haces?', options: ['Nada', 'Disputar el cierre', 'Hacer un reporte nuevo cada día'], correctIndex: 1 },
    ],
  },
  {
    id: 'seguridad', order: 3, title: 'Tu seguridad frente al escombro', description: 'Polvo, materiales que no se tocan, niños y adultos mayores, cuándo pedir ayuda.', roles: [], validationStatus: 'pending', published: true,
    quiz: [
      { question: 'Si ves láminas que parecen de fibrocemento, ¿qué haces?', options: ['Las rompo para llevarlas', 'No las toco y lo indico al reportar', 'Las quemo'], correctIndex: 1 },
    ],
  },
  {
    id: 'economia_circular', order: 4, title: 'Economía circular en tu comunidad', description: 'Por qué recuperar el material importa, con ejemplos sencillos.', roles: [], validationStatus: 'pending', published: true,
    quiz: [
      { question: '¿Qué se busca al triturar el escombro?', options: ['Volver a usarlo como agregado en obras', 'Esconderlo', 'Venderlo como chatarra'], correctIndex: 0 },
    ],
  },
  {
    id: 'contralor', order: 5, title: 'Contralor Comunitario', description: 'Protocolo de verificación en campo, privacidad, disputas y seguridad personal. Obligatorio para la acreditación.', roles: ['citizen', 'monitor'], validationStatus: 'pending', published: true,
    quiz: [
      { question: '¿Puedes verificar en campo un reporte que hiciste tú?', options: ['Sí', 'No, lo verifica otro Contralor del sector'], correctIndex: 1 },
      { question: '¿Qué datos del vecino que reportó puedes ver?', options: ['Nombre y teléfono', 'Ninguno: ves el caso, no a la persona'], correctIndex: 1 },
    ],
  },
  {
    id: 'operacion_trazable', order: 6, title: 'Operación trazable', description: 'Cómo registrar cada etapa: unidades, método de medición, evidencias y diferencias.', roles: ['removal', 'driver', 'center', 'processing', 'evaluator', 'destination'], validationStatus: 'pending', published: true,
    quiz: [
      { question: '¿Se pueden sumar toneladas y m³ en una misma cifra?', options: ['Sí', 'No, nunca se mezclan'], correctIndex: 1 },
      { question: 'Si lo recibido no coincide con lo despachado, ¿qué pasa?', options: ['Se corrige la cifra de salida', 'Se abre una discrepancia y se guardan las dos cifras'], correctIndex: 1 },
    ],
  },
];

/** Curso de cada lección existente y lecciones nuevas de los cursos que no tenían ninguna. */
export const LESSON_COURSE: Record<string, string> = { lec_1: 'economia_circular', lec_2: 'que_pasa', lec_3: 'que_pasa', lec_4: 'seguridad', lec_5: 'que_pasa' };

const draft = (id: string, order: number, courseId: string, title: string, content: string, question: string, options: string[], correctIndex: number): Lesson => ({ id, order, courseId, title, content, imageUrl: null, question, options, correctIndex, validationStatus: 'pending', provisional: true });

export const COURSE_LESSONS: Lesson[] = [
  draft('lec_rep_1', 6, 'reportar_bien', 'Una buena foto', 'Toma la foto con luz de día, de frente y mostrando todo el montón. Si hay personas o placas de carros, trata de que no salgan. Kindra quita la ubicación guardada en la foto al recibirla.', '¿Qué conviene que salga en la foto?', ['Todo el montón de escombro', 'Las caras de los vecinos'], 0),
  draft('lec_rep_2', 7, 'reportar_bien', 'El sector y el código', 'Elige tu parroquia y el sector de la lista. El punto en el mapa es opcional. Al enviar recibes un código como R-CB-004512: guárdalo para seguir tu reporte en Seguimiento o con AURA.', '¿Para qué sirve el código?', ['Para seguir el reporte', 'Para cobrar'], 0),
  draft('lec_rep_3', 8, 'reportar_bien', 'Confirmar o disputar', 'Cuando el Ente de Retiro marca el punto como limpio, te pedimos confirmarlo. Si el escombro sigue ahí, toca Disputar: el caso se reabre y lo revisa un Contralor Comunitario.', 'Si el escombro sigue ahí, ¿qué tocas?', ['Confirmar', 'Disputar'], 1),
  draft('lec_con_1', 9, 'contralor', 'Verificar en campo', 'Visita el punto con calma y de día. Marca si el punto existe, no existe o ya fue despejado, y toma una foto. No necesitas saber quién reportó: el caso es lo que importa.', '¿Qué registras al verificar?', ['El estado del punto y una foto', 'El nombre del vecino'], 0),
  draft('lec_con_2', 10, 'contralor', 'Privacidad y disputas', 'Nunca compartas datos de quien reporta. En una disputa revisa el punto, toma foto actual y registra lo que ves. Tu seguridad va primero: si hay riesgo, no te acerques y avisa.', 'Si hay riesgo en el punto, ¿qué haces?', ['Me acerco igual', 'No me acerco y aviso'], 1),
  draft('lec_op_1', 11, 'operacion_trazable', 'Cada cantidad con su método', 'Toda cantidad lleva unidad (t o m³) y método: báscula, volumen medido, estimación por factor o estimación visual. En la recepción del CDT la cifra principal es el peso de báscula.', '¿Cuál es la cifra principal en la recepción del CDT?', ['El peso de báscula', 'Lo que dice el conductor'], 0),
  draft('lec_op_2', 12, 'operacion_trazable', 'Evidencias y diferencias', 'Cada etapa lleva evidencia. Si lo recibido no coincide con lo despachado, se abre una discrepancia y ninguna cifra se sobrescribe. Nadie confirma su propia entrega.', '¿Quién confirma la recepción de un viaje?', ['El mismo conductor', 'El Centro de Disposición'], 1),
];
