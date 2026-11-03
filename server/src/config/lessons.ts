import type { Lesson } from '@kindra/shared';

/** Cinco micro-lecciones (10.1). Textos provisionales hasta recibir los definitivos. */
export const DEFAULT_LESSONS: Lesson[] = [
  {
    id: 'lec_1',
    order: 1,
    title: 'Qué es la economía circular del escombro',
    content:
      'Después del terremoto quedaron miles de toneladas de concreto, ladrillo y metal en las calles. En vez de botarlo todo en un relleno, el escombro se separa, se tritura y se convierte en material para nuevas obras. Eso es economía circular: lo que era un problema vuelve a ser útil, y cada paso queda registrado para que cualquiera lo pueda verificar.',
    imageUrl: null,
    question: '¿Qué significa que el escombro entre en una economía circular?',
    options: ['Que se bota todo en un relleno lejos de la ciudad', 'Que se separa, se tritura y se reutiliza en otras obras', 'Que se vende a empresas privadas'],
    correctIndex: 1,
    validationStatus: 'validated',
    provisional: true,
  },
  {
    id: 'lec_2',
    order: 2,
    title: 'El recorrido del escombro: de la calle a otra obra pública',
    content:
      'Primero un camión retira el escombro de la calle o del edificio demolido. Lo lleva a un Centro de Disposición Temporal. Allí se separa el metal, se aparta lo que pueda ser peligroso y se tritura el concreto y el ladrillo. Lo que sale se revisa y, si cumple la calidad, va a una obra: una base de vía, una acera, unos bloques. Lo que no sirve va a un Centro de Disposición Final.',
    imageUrl: null,
    question: '¿A dónde llega primero el escombro cuando sale de la calle?',
    options: ['A la obra donde se va a usar', 'A un Centro de Disposición Temporal', 'Directo al mar'],
    correctIndex: 1,
    validationStatus: 'validated',
    provisional: true,
  },
  {
    id: 'lec_3',
    order: 3,
    title: 'En qué se convierte',
    content:
      'Cuando el concreto y el ladrillo se trituran se obtiene agregado reciclado: piedra picada, gravilla y arena. Con ese agregado se hacen bases de vías, aceras, brocales, bloques y rellenos. El metal se entrega al Estado por norma. Antes de usar el agregado, una entidad técnica verifica que cumpla los requisitos de calidad.',
    imageUrl: null,
    question: '¿Qué se produce al triturar concreto y ladrillo?',
    options: ['Agregado reciclado: piedra, gravilla y arena', 'Cemento nuevo', 'Vidrio'],
    correctIndex: 0,
    validationStatus: 'pending',
    provisional: true,
  },
  {
    id: 'lec_4',
    order: 4,
    title: 'Qué hacer y qué evitar cerca del escombro',
    content:
      'No toques ni muevas el escombro: puede haber partes inestables. No dejes que los niños jueguen encima. Evita el polvo, sobre todo si alguien en casa tiene problemas respiratorios. Toma las fotos desde una distancia segura. Si ves láminas que parecen fibrocemento, envases de químicos o algo con olor o color raro, no te acerques y repórtalo como posible material peligroso.',
    imageUrl: null,
    question: '¿Qué debes hacer si ves láminas que parecen fibrocemento entre el escombro?',
    options: ['Moverlas a un lado para que no estorben', 'No acercarte y reportarlo como posible material peligroso', 'Romperlas para que ocupen menos'],
    correctIndex: 1,
    validationStatus: 'pending',
    provisional: true,
  },
  {
    id: 'lec_5',
    order: 5,
    title: 'Cómo leer la ficha de trazabilidad y qué es un lote',
    content:
      'La ficha de trazabilidad muestra siete datos de un reporte: dónde y cuándo se originó, quién lo retiró, a qué centro llegó, cómo se clasificó, si pasó la verificación de calidad, en qué se usó y si el ciudadano confirmó. Un lote es el conjunto de todo lo que un centro recibió en un periodo, por ejemplo una semana. Por eso la ficha dice que material de tu sector fue parte de un lote usado en una obra, no que tu escombro exacto está en esa obra.',
    imageUrl: null,
    question: '¿Qué es un lote?',
    options: ['Un solo camión de escombro', 'Todo lo que un centro recibió en un periodo, mezclado y procesado junto', 'La obra donde se usa el material'],
    correctIndex: 1,
    validationStatus: 'validated',
    provisional: true,
  },
];
