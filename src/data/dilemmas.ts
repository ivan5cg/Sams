// Dilemas del trabajo: a veces, durante la jornada, hay que decidir algo.
// {name} = quien trabaja.

export interface DilemmaOutcome {
  perf?: number;
  money?: number;
  energy?: number;
  emotion?: string;
  /** Sube la habilidad de su carrera. */
  skill?: number;
  /** Horas extra: vuelve más tarde a casa. */
  extraHours?: number;
  text: string;
}

export interface DilemmaOption {
  label: string;
  icon: string;
  /** Probabilidad de que salga bien (si no, `fail`). */
  chance?: number;
  ok: DilemmaOutcome;
  fail?: DilemmaOutcome;
}

export interface DilemmaDef {
  id: string;
  /** Solo en estas carreras (si no, en cualquier trabajo). */
  careers?: string[];
  title: string;
  text: string;
  options: DilemmaOption[];
}

export const DILEMMAS: DilemmaDef[] = [
  {
    id: 'horas_extra',
    title: 'Horas extra',
    text: 'El jefe asoma la cabeza: «{name}, ¿te importa quedarte un par de horitas más? Es para hoy».',
    options: [
      { label: 'Quedarse (+§40, vuelve 2 h más tarde)', icon: '⏰', ok: { perf: 12, money: 40, energy: -15, extraHours: 2, emotion: 'estresado', text: '{name} se queda. El jefe lo apunta en su libretita' } },
      { label: '«Uy, es que tengo una cosa...»', icon: '🏃', ok: { perf: -4, text: 'El jefe pone cara de lunes' } },
    ],
  },
  {
    id: 'merito',
    title: 'Se lleva el mérito',
    text: 'Un compañero presenta el trabajo de {name} en la reunión como si fuera suyo. Y le aplauden.',
    options: [
      { label: 'Decírselo delante de todos', icon: '📢', chance: 0.6, ok: { perf: 10, text: '¡Toma! Todo el mundo sabe ya quién lo hizo' }, fail: { perf: -8, emotion: 'enfadado', text: 'El jefe se ha puesto de parte del otro. Indignante' } },
      { label: 'Hablarlo luego en privado', icon: '🤝', ok: { perf: 3, text: 'El compañero se disculpa con la boca pequeña' } },
      { label: 'Callarse y tragar', icon: '😶', ok: { emotion: 'mal_dia_curro', text: '{name} vuelve a casa con un humor de perros' } },
    ],
  },
  {
    id: 'cena_empresa',
    title: 'Cena de empresa',
    text: 'Esta noche es la cena de empresa. Habrá karaoke. Y barra libre.',
    options: [
      { label: 'Ir y darlo todo en el karaoke', icon: '🎤', chance: 0.65, ok: { perf: 6, energy: -15, extraHours: 3, emotion: 'fiesta', text: '{name} ha cantado «Resistiré» y se ha ganado a toda la oficina' }, fail: { energy: -15, extraHours: 3, emotion: 'verguenza', text: 'Hay vídeo de {name} cantando a Raphael encima de una silla. Circula por WhatsApp' } },
      { label: 'Excusa: «la abuela está malita»', icon: '👵', ok: { perf: -2, text: 'Nadie se lo cree, pero nadie dice nada' } },
    ],
  },
  {
    id: 'curso',
    title: 'Curso de formación',
    text: 'Ofrecen a {name} un curso de formación. Los sábados por la mañana.',
    options: [
      { label: 'Apuntarse', icon: '📚', ok: { perf: 6, skill: 1, energy: -10, text: '{name} aprende un montón (y pilla todos los cafés gratis)' } },
      { label: 'No, gracias', icon: '🙅', ok: { text: 'Los sábados son sagrados' } },
    ],
  },
  {
    id: 'cafetera',
    title: 'Crisis de la cafetera',
    text: 'La máquina del café se ha estropeado. La plantilla está al borde del motín.',
    options: [
      { label: 'Arreglarla con un clip', icon: '🔧', chance: 0.5, ok: { perf: 8, emotion: 'buen_dia_curro', text: '¡{name} es el héroe del día! Hasta le hacen la ola' }, fail: { perf: -3, emotion: 'verguenza', text: 'Ahora la cafetera echa humo. Y huele a quemado toda la planta' } },
      { label: 'Bajar a por cafés para todos (§15)', icon: '☕', ok: { money: -15, perf: 5, text: 'Todo el mundo quiere a {name}. Por hoy' } },
      { label: 'Sobrevivir a base de agua', icon: '💧', ok: { emotion: 'mal_dia_curro', text: 'Ha sido un día muy, muy largo' } },
    ],
  },
  {
    id: 'paella',
    careers: ['cocina'],
    title: 'Paella con chorizo',
    text: 'Un turista pide paella... con chorizo. Insiste mucho.',
    options: [
      { label: 'Hacérsela (el cliente manda)', icon: '🥘', chance: 0.6, ok: { money: 30, text: 'Le encanta y deja §30 de propina. Que no se entere nadie' }, fail: { perf: -6, emotion: 'verguenza', text: 'Un valenciano lo ha visto. Ha habido gritos' } },
      { label: 'Negarse con dignidad', icon: '🙅', ok: { perf: 5, emotion: 'buen_dia_curro', text: 'El chef aplaude en silencio' } },
    ],
  },
  {
    id: 'excel',
    careers: ['oficina'],
    title: 'El Excel maldito',
    text: 'Se ha borrado el Excel de la contabilidad. No hay copia de seguridad.',
    options: [
      { label: 'Rehacerlo de memoria', icon: '🧮', ok: { perf: 12, energy: -20, emotion: 'estresado', text: '{name} lo ha rehecho entero. Es una leyenda' } },
      { label: 'Echarle la culpa a «los de informática»', icon: '🙈', chance: 0.6, ok: { text: 'Cuela. Los de informática ni se enteran' }, fail: { perf: -10, emotion: 'verguenza', text: 'Los de informática tenían el historial. Pillado/a' } },
    ],
  },
  {
    id: 'chihuahua',
    careers: ['veterinaria'],
    title: 'El chihuahua del infierno',
    text: 'Llega un chihuahua con muy malas pulgas. Su dueña dice que «es muy bueno».',
    options: [
      { label: 'Atenderlo con paciencia y chuches', icon: '🦴', chance: 0.7, ok: { perf: 8, emotion: 'buen_dia_curro', text: 'El chihuahua acaba durmiendo en sus brazos' }, fail: { perf: 2, emotion: 'mal_dia_curro', text: 'Mordisco en el dedo. Vale la pena, dice {name}' } },
      { label: 'Pasárselo al compañero nuevo', icon: '😅', ok: { perf: -2, text: 'El nuevo no olvidará este día' } },
    ],
  },
  {
    id: 'boda',
    careers: ['musica'],
    title: 'Bolo en una boda',
    text: 'Ofrecen a {name} tocar en una boda. Pagan bien, pero quieren «Paquito el Chocolatero» tres veces.',
    options: [
      { label: 'Aceptar (+§90)', icon: '🎺', ok: { money: 90, energy: -15, extraHours: 2, emotion: 'fiesta', text: 'Toda la boda haciendo el trenecito. Hay que reconocer que funciona' } },
      { label: 'Rechazar por principios artísticos', icon: '🎼', ok: { perf: 5, text: 'El arte no se vende. Bueno, hoy no' } },
    ],
  },
  {
    id: 'experimento',
    careers: ['ciencia'],
    title: 'Resultado inesperado',
    text: 'El experimento de {name} ha dado un resultado rarísimo. Podría ser un descubrimiento... o un error.',
    options: [
      { label: 'Publicarlo ya', icon: '📰', chance: 0.4, ok: { perf: 25, emotion: 'orgulloso', text: '¡Sale en el telediario! Bueno, en un periódico digital' }, fail: { perf: -10, emotion: 'verguenza', text: 'Era el microondas de la sala de al lado. Qué apuro' } },
      { label: 'Repetirlo con calma', icon: '🔬', ok: { perf: 6, energy: -10, skill: 1, text: 'Ciencia de la buena: despacio y con buena letra' } },
    ],
  },
  {
    id: 'cliente_boda',
    careers: ['deporte'],
    title: 'Operación bikini exprés',
    text: 'Un cliente quiere ponerse en forma para su boda... que es dentro de dos semanas.',
    options: [
      { label: 'Plan intensivo', icon: '🏋️', chance: 0.5, ok: { perf: 10, emotion: 'buen_dia_curro', text: 'El cliente llora de emoción (y de agujetas)' }, fail: { perf: -4, text: 'El cliente se ha lesionado. A la boda va con muleta' } },
      { label: 'Ser sincero/a con él', icon: '🗣️', ok: { perf: 3, text: '«Para la próxima boda, empezamos antes»' } },
    ],
  },
  {
    id: 'inspector',
    careers: ['negocio'],
    title: 'Inspección sorpresa',
    text: 'Viene un inspector de Sanidad sin avisar. La cocina está... más o menos.',
    options: [
      { label: 'Enseñárselo todo con una sonrisa', icon: '😁', chance: 0.6, ok: { perf: 10, text: 'Aprobado. El inspector hasta repite de croquetas' }, fail: { money: -150, emotion: 'estresado', text: 'Multa de §150. Había una cucaracha con muy mal sentido de la oportunidad' } },
      { label: 'Invitarle a unas bravas primero', icon: '🍟', chance: 0.4, ok: { perf: 5, text: 'Las bravas obran milagros' }, fail: { money: -200, emotion: 'verguenza', text: 'Eso se considera soborno. Multa de §200' } },
    ],
  },
  {
    id: 'cliente_pesado',
    careers: ['negocio'],
    title: 'El cliente del café eterno',
    text: 'Un cliente lleva tres horas con un solo café. Ahora pide la contraseña del wifi.',
    options: [
      { label: 'Darle la contraseña, con amor', icon: '📶', ok: { perf: 4, text: 'Vuelve al día siguiente con cuatro amigos. Y piden bravas' } },
      { label: '«El wifi es para clientes de verdad»', icon: '🙅', chance: 0.5, ok: { money: 10, text: 'Se pide un bocadillo. Victoria' }, fail: { perf: -5, text: 'Le ha puesto una estrella en Google. Una' } },
    ],
  },
];

export const DILEMMA_BY_ID: Record<string, DilemmaDef> = Object.fromEntries(DILEMMAS.map((d) => [d.id, d]));
