// La vida en el trabajo: las tareas de cada profesión, el centro de trabajo (con sus muebles), las empresas
// con su jefe y compañeros, las bajas, las amonestaciones y la vida corporativa (afterworks, comidas de
// empresa, la cena de Navidad, enchufes, líos, fusiones...). Las cifras y los textos, aquí; la lógica, en
// sim/systems/work.ts.

import type { ObjectPlacement } from './lot';

export interface WorkTaskDef {
  id: string;
  label: string;
  /** Gerundio mientras se hace. */
  verb: string;
  icon: string;
  /** Mueble del centro de trabajo donde se hace. */
  obj: string;
  /** Minutos de juego que se tarda. */
  minutes: number;
}

const T = (id: string, label: string, verb: string, icon: string, obj: string, minutes = 45): WorkTaskDef => ({ id, label, verb, icon, obj, minutes });

/** Todas las tareas (id → tarea). */
export const WORK_TASKS: Record<string, WorkTaskDef> = Object.fromEntries(
  [
    // Oficina
    T('correos', 'Responder correos', 'Respondiendo correos', '📧', 'computer', 35),
    T('informe', 'Sacar informes', 'Sacando informes', '📊', 'computer'),
    T('reunion', 'Reunión de equipo', 'En una reunión', '🗣️', 'dining_table', 50),
    T('archivo', 'Archivar expedientes', 'Archivando', '🗂️', 'bookshelf', 30),
    T('llamadas', 'Atender llamadas', 'Al teléfono', '☎️', 'desk', 35),
    // Banca
    T('operaciones', 'Revisar operaciones', 'Revisando operaciones', '🔎', 'computer'),
    T('clientes_banco', 'Atender a clientes en la oficina', 'Atendiendo a clientes', '🤝', 'desk'),
    T('caja', 'Cuadrar la caja', 'Cuadrando la caja', '💶', 'desk', 30),
    T('hipoteca', 'Firmar una hipoteca', 'Firmando una hipoteca', '🖊️', 'dining_table', 55),
    // Bolsa
    T('mercado', 'Analizar el mercado', 'Mirando gráficas', '📈', 'computer'),
    T('cartera', 'Revisar las carteras de los clientes', 'Revisando carteras', '💼', 'computer', 40),
    T('comite', 'Comité de inversión', 'En el comité', '🧮', 'dining_table', 55),
    T('llamar_clientes', 'Llamar a los clientes', 'Llamando a clientes', '📞', 'desk', 35),
    // Abogacía
    T('recurso', 'Redactar un recurso', 'Redactando un recurso', '📜', 'computer', 55),
    T('expediente', 'Estudiar el expediente', 'Estudiando el expediente', '📚', 'bookshelf'),
    T('cliente_bufete', 'Reunión con el cliente', 'Reunido con un cliente', '🤝', 'dining_table'),
    T('juicio', 'Preparar el juicio', 'Preparando el juicio', '⚖️', 'desk', 50),
    // Informática
    T('bugs', 'Arreglar bugs', 'Arreglando bugs', '🐛', 'computer'),
    T('funcionalidad', 'Programar una funcionalidad', 'Programando', '⌨️', 'computer', 55),
    T('daily', 'La daily con el equipo', 'En la daily', '🧍', 'dining_table', 25),
    T('code_review', 'Revisar el código de un compañero', 'Revisando código', '👀', 'desk', 35),
    // Ciencia
    T('experimento', 'Hacer un experimento', 'Experimentando', '🧪', 'workbench', 55),
    T('datos', 'Analizar los datos', 'Analizando datos', '📉', 'computer'),
    T('articulo', 'Escribir el artículo', 'Escribiendo el artículo', '📝', 'desk', 50),
    T('seminario', 'Seminario del grupo', 'En el seminario', '🎓', 'dining_table'),
    // Enseñanza
    T('dar_clase', 'Dar clase', 'Dando clase', '🧑‍🏫', 'study_table', 55),
    T('corregir', 'Corregir exámenes', 'Corrigiendo exámenes', '🖍️', 'desk'),
    T('preparar_clase', 'Preparar la clase de mañana', 'Preparando la clase', '💡', 'computer', 35),
    T('claustro', 'Reunión de claustro', 'En el claustro', '🏫', 'dining_table', 50),
    // Cocina
    T('menu', 'Preparar el menú del día', 'Cocinando el menú', '🍲', 'fridge', 55),
    T('plancha', 'Llevar la plancha', 'En la plancha', '🔥', 'bbq'),
    T('emplatar', 'Emplatar los pedidos', 'Emplatando', '🍽️', 'dining_table', 35),
    T('inventario', 'Hacer el inventario de la despensa', 'Haciendo inventario', '📋', 'bookshelf', 30),
    // Camarero
    T('servir', 'Servir las mesas', 'Sirviendo mesas', '🍽️', 'cafe_table', 40),
    T('canas', 'Tirar cañas', 'Tirando cañas', '🍺', 'bar_counter', 35),
    T('cobrar', 'Cobrar las cuentas', 'Cobrando', '💶', 'checkout', 30),
    T('montar', 'Montar las mesas', 'Montando mesas', '🪑', 'dining_table', 30),
    // Veterinaria
    T('consulta_vet', 'Pasar consulta', 'Pasando consulta', '🐶', 'desk'),
    T('vacunar', 'Vacunar a los pacientes', 'Vacunando', '💉', 'bed', 35),
    T('operar', 'Operar en el quirófano', 'Operando', '🩺', 'bed', 60),
    T('historiales', 'Actualizar los historiales', 'Con los historiales', '🗃️', 'computer', 30),
    // Medicina
    T('consulta', 'Pasar consulta', 'Pasando consulta', '🩺', 'desk', 50),
    T('planta', 'Hacer la ronda de planta', 'De ronda', '🛏️', 'bed'),
    T('recetas', 'Recetas e informes', 'Haciendo recetas', '💊', 'computer', 35),
    T('sesion', 'Sesión clínica', 'En la sesión clínica', '🧠', 'dining_table'),
    // Deporte
    T('clase_dirigida', 'Dar una clase dirigida', 'Dando clase', '🧘', 'pilates_mat'),
    T('entrenar', 'Entrenar a un cliente', 'Entrenando a un cliente', '🏋️', 'weights'),
    T('maquinas', 'Revisar las máquinas', 'Revisando máquinas', '🔧', 'treadmill', 30),
    T('rutinas', 'Planificar rutinas', 'Planificando rutinas', '📋', 'desk', 35),
    // Música
    T('ensayar', 'Ensayar', 'Ensayando', '🎹', 'piano', 50),
    T('maqueta', 'Grabar una maqueta', 'Grabando', '🎚️', 'stereo', 55),
    T('prueba_sonido', 'Prueba de sonido', 'Probando el sonido', '🎤', 'karaoke', 30),
    T('componer', 'Componer', 'Componiendo', '🎼', 'desk'),
    // Tienda
    T('caja_tienda', 'Atender en caja', 'En caja', '🛍️', 'checkout', 40),
    T('reponer', 'Reponer las estanterías', 'Reponiendo', '📦', 'super_shelf', 35),
    T('probador', 'Ordenar el probador', 'Doblando ropa', '👕', 'wardrobe', 30),
    // Reparto
    T('pedidos', 'Recoger los pedidos', 'Recogiendo pedidos', '🥡', 'desk', 30),
    T('moto', 'Repasar la moto', 'Repasando la moto', '🛵', 'workbench', 30),
    T('ruta', 'Planificar la ruta de entregas', 'Mirando el mapa', '🗺️', 'computer', 25),
    // Teleoperador
    T('venta_tel', 'Llamadas de venta', 'Llamando', '📞', 'desk', 40),
    T('reclamaciones', 'Atender reclamaciones', 'Aguantando reclamaciones', '😤', 'computer', 40),
    T('crm', 'Rellenar el CRM', 'Rellenando el CRM', '🖥️', 'computer', 25),
    // Clases particulares
    T('clase_repaso', 'Dar la clase de repaso', 'Explicando ecuaciones', '✏️', 'study_table', 50),
    T('ejercicios', 'Preparar ejercicios', 'Preparando ejercicios', '📄', 'desk', 30),
  ].map((t) => [t.id, t]),
);

/** Qué tareas puede tocar cada día en cada profesión (cada jornada salen tres). */
export const CAREER_TASKS: Record<string, string[]> = {
  oficina: ['correos', 'informe', 'reunion', 'archivo', 'llamadas'],
  banca: ['informe', 'operaciones', 'clientes_banco', 'caja', 'hipoteca'],
  bolsa: ['mercado', 'cartera', 'comite', 'llamar_clientes', 'informe'],
  abogacia: ['recurso', 'expediente', 'cliente_bufete', 'juicio', 'correos'],
  informatica: ['bugs', 'funcionalidad', 'daily', 'code_review', 'correos'],
  ciencia: ['experimento', 'datos', 'articulo', 'seminario'],
  docencia: ['dar_clase', 'corregir', 'preparar_clase', 'claustro'],
  cocina: ['menu', 'plancha', 'emplatar', 'inventario'],
  veterinaria: ['consulta_vet', 'vacunar', 'operar', 'historiales'],
  medicina: ['consulta', 'planta', 'recetas', 'sesion'],
  deporte: ['clase_dirigida', 'entrenar', 'maquinas', 'rutinas'],
  musica: ['ensayar', 'maqueta', 'prueba_sonido', 'componer'],
  dependiente: ['caja_tienda', 'reponer', 'probador'],
  reparto: ['pedidos', 'moto', 'ruta'],
  camarero: ['servir', 'canas', 'cobrar', 'montar'],
  teleoperador: ['venta_tel', 'reclamaciones', 'crm'],
  clases: ['clase_repaso', 'ejercicios'],
};

/** Cuántas tareas tocan cada jornada (las de medio tiempo, dos). */
export const TASKS_PER_DAY = 3;
export const TASKS_PER_PART_DAY = 2;

/** Lo que cuenta cada tarea en el rendimiento: hecha y sin hacer. */
export const TASK_PERF = { done: 4, missed: 7, allDoneBonus: 5 };

// -----------------------------------------------------------------------------
// El centro de trabajo
// -----------------------------------------------------------------------------

/** Lo que tienen todos: el despacho del jefe, el aseo y la nevera de la oficina. */
export const BASE_KIT: ObjectPlacement[] = [
  { def: 'bookshelf', x: 1, y: 1 },
  { def: 'desk', x: 3, y: 1 },
  { def: 'plant', x: 5, y: 1 },
  { def: 'armchair', x: 2, y: 3 },
  { def: 'toilet', x: 1, y: 8 },
  { def: 'fridge', x: 1, y: 5 },
  { def: 'plant', x: 12, y: 8 },
];

/** Los muebles de la planta según el tipo de trabajo. */
export const WORK_KITS: Record<string, ObjectPlacement[]> = {
  oficina: [
    { def: 'computer', x: 8, y: 1 }, { def: 'computer', x: 10, y: 1 }, { def: 'computer', x: 12, y: 1 },
    { def: 'desk', x: 8, y: 5 }, { def: 'desk', x: 10, y: 5 }, { def: 'bookshelf', x: 12, y: 5 },
    { def: 'dining_table', x: 8, y: 7 },
  ],
  laboratorio: [
    { def: 'workbench', x: 8, y: 1 }, { def: 'workbench', x: 10, y: 1 }, { def: 'computer', x: 12, y: 1 },
    { def: 'desk', x: 8, y: 5 }, { def: 'computer', x: 10, y: 5 }, { def: 'dining_table', x: 8, y: 7 },
  ],
  aula: [
    { def: 'computer', x: 8, y: 1 }, { def: 'desk', x: 11, y: 1 },
    { def: 'study_table', x: 4, y: 6 }, { def: 'study_table', x: 6, y: 6 }, { def: 'study_table', x: 8, y: 5 }, { def: 'study_table', x: 10, y: 5 },
    { def: 'dining_table', x: 10, y: 7 },
  ],
  cocina: [
    { def: 'fridge', x: 8, y: 1 }, { def: 'bbq', x: 10, y: 1 }, { def: 'bbq', x: 11, y: 1 }, { def: 'bookshelf', x: 12, y: 1 },
    { def: 'dining_table', x: 8, y: 5 }, { def: 'cafe_table', x: 5, y: 6 }, { def: 'cafe_table', x: 11, y: 6 },
  ],
  sala: [
    { def: 'bar_counter', x: 8, y: 1 }, { def: 'checkout', x: 11, y: 3 },
    { def: 'cafe_table', x: 4, y: 6 }, { def: 'cafe_table', x: 6, y: 6 }, { def: 'cafe_table', x: 10, y: 6 },
    { def: 'dining_table', x: 8, y: 8 },
  ],
  clinica: [
    { def: 'bed', x: 8, y: 1 }, { def: 'bed', x: 11, y: 1 },
    { def: 'desk', x: 8, y: 5 }, { def: 'desk', x: 10, y: 5 }, { def: 'computer', x: 12, y: 5 },
    { def: 'dining_table', x: 8, y: 7 },
  ],
  gimnasio: [
    { def: 'weights', x: 8, y: 1 }, { def: 'weights', x: 10, y: 1 }, { def: 'treadmill', x: 12, y: 1 }, { def: 'treadmill', x: 12, y: 3 },
    { def: 'pilates_mat', x: 6, y: 6 }, { def: 'pilates_mat', x: 8, y: 6 }, { def: 'pilates_mat', x: 10, y: 6 },
    { def: 'desk', x: 12, y: 6 },
  ],
  estudio: [
    { def: 'piano', x: 8, y: 1 }, { def: 'stereo', x: 10, y: 1 }, { def: 'karaoke', x: 12, y: 1 },
    { def: 'desk', x: 8, y: 5 }, { def: 'desk', x: 11, y: 5 },
  ],
  tienda: [
    { def: 'super_shelf', x: 8, y: 1 }, { def: 'checkout', x: 8, y: 5 }, { def: 'wardrobe', x: 11, y: 7 }, { def: 'super_shelf', x: 3, y: 6 },
  ],
  almacen: [
    { def: 'workbench', x: 8, y: 1 }, { def: 'computer', x: 10, y: 1 }, { def: 'desk', x: 8, y: 5 }, { def: 'desk', x: 10, y: 5 },
  ],
};

/** Una empresa: cómo se llama, qué tipo de sitio es, quién manda y quién trabaja allí. */
export interface CompanyDef {
  name: string;
  kit: keyof typeof WORK_KITS;
  /** Cómo se dice el sitio («la oficina», «el hospital»...). */
  place: string;
  boss: { name: string; sex: 'f' | 'm' };
  mates: { name: string; sex: 'f' | 'm' }[];
}

const f = (name: string) => ({ name, sex: 'f' as const });
const m = (name: string) => ({ name, sex: 'm' as const });

export const COMPANIES: Record<string, CompanyDef> = {
  oficina: { name: 'Seguros La Castiza', kit: 'oficina', place: 'la oficina', boss: m('Don Anselmo'), mates: [f('Begoña'), m('Paco (contabilidad)'), f('Yolanda')] },
  banca: { name: 'Banco Chulapo', kit: 'oficina', place: 'la sucursal', boss: f('Doña Inmaculada'), mates: [m('Íñigo'), f('Rocío'), m('Fermín')] },
  bolsa: { name: 'Gran Vía Capital', kit: 'oficina', place: 'la mesa de bolsa', boss: m('Borja Mari'), mates: [f('Cayetana'), m('Pelayo'), f('Almudena')] },
  abogacia: { name: 'Bufete Ortega & Asociados', kit: 'oficina', place: 'el bufete', boss: f('Letrada Ortega'), mates: [m('Gonzalo'), f('Macarena'), m('Ramiro')] },
  informatica: { name: 'Startup Chamberí', kit: 'oficina', place: 'la startup', boss: m('Kevin (CEO)'), mates: [f('Sheila'), m('Iván el de backend'), f('Noelia')] },
  ciencia: { name: 'Instituto de Investigación Tetuán', kit: 'laboratorio', place: 'el laboratorio', boss: f('Doctora Salvatierra'), mates: [m('Jacinto'), f('Leire'), m('Óscar')] },
  docencia: { name: 'CEIP Lavapiés', kit: 'aula', place: 'el colegio', boss: f('La directora Charo'), mates: [m('Don Julián'), f('Maite'), m('Rubén de gimnasia')] },
  cocina: { name: 'Restaurante Casa Lola', kit: 'cocina', place: 'la cocina', boss: f('Chef Lola'), mates: [m('Brayan'), f('Esther'), m('Toño')] },
  veterinaria: { name: 'Clínica Veterinaria Bigotes', kit: 'clinica', place: 'la clínica', boss: m('Doctor Peláez'), mates: [f('Nuria'), m('Álex'), f('Vane')] },
  medicina: { name: 'Hospital del Barrio', kit: 'clinica', place: 'el hospital', boss: f('Doctora Montes'), mates: [m('Doctor Cuesta'), f('Enfermera Puri'), m('Celador Manolo')] },
  deporte: { name: 'Gimnasio Fit Castizo', kit: 'gimnasio', place: 'el gimnasio', boss: m('Mister Músculo'), mates: [f('Jessi'), m('Rubén'), f('Coral')] },
  musica: { name: 'Estudios Malasaña', kit: 'estudio', place: 'el estudio', boss: m('El Productor'), mates: [f('Lola la del bajo'), m('Chema batería'), f('Bea')] },
  dependiente: { name: 'Modas Pili', kit: 'tienda', place: 'la tienda', boss: f('Pili'), mates: [f('Yeni'), m('Christian')] },
  reparto: { name: 'Rapidillo Delivery', kit: 'almacen', place: 'el almacén', boss: m('El jefe de flota'), mates: [m('Jonathan'), f('Kimberly')] },
  camarero: { name: 'Taberna El Botijo', kit: 'sala', place: 'la taberna', boss: m('Señor Venancio'), mates: [f('Mari'), m('Josete')] },
  teleoperador: { name: 'CallCenter Plus', kit: 'oficina', place: 'el call center', boss: f('La supervisora Tamara'), mates: [m('Edu'), f('Vanessa')] },
  clases: { name: 'Academia El Repaso', kit: 'aula', place: 'la academia', boss: f('Doña Engracia'), mates: [m('Héctor')] },
};

/** Compradores que pueden quedarse con una empresa (fusiones y adquisiciones). */
export const BUYERS = ['MegaCorp Global', 'Grupo Ibérico Holdings', 'Fondo Buitre Capital', 'Conglomerado Valdebebas', 'Inversiones Bernabéu', 'TechGiant Inc.', 'Grupo Mahou-Fusión'];

/** El sitio de las cenas y comidas de empresa. */
export const EVENT_LOT_NAME = 'Restaurante La Tasca';
export const EVENT_KIT: ObjectPlacement[] = [
  { def: 'dining_table', x: 2, y: 2 },
  { def: 'dining_table', x: 6, y: 2 },
  { def: 'dining_table', x: 2, y: 5 },
  { def: 'dining_table', x: 6, y: 5 },
  { def: 'bar_counter', x: 8, y: 1 },
  { def: 'jukebox', x: 10, y: 5 },
  { def: 'karaoke', x: 10, y: 3 },
  { def: 'toilet', x: 1, y: 6 },
];

// -----------------------------------------------------------------------------
// Bajas, amonestaciones y despidos
// -----------------------------------------------------------------------------

/** Días de baja por nacimiento (en el juego, lo que dura la etapa de bebé) y lo que se cobra. */
export const BIRTH_LEAVE_DAYS = 3;
export const LEAVE_PAY = { maternidad: 1, paternidad: 1, enfermedad: 0.75 };
export const LEAVE_LABEL = { maternidad: 'baja por maternidad', paternidad: 'baja por paternidad', enfermedad: 'baja por enfermedad' };

/** Amonestaciones para el despido, y días sin incidentes para que se olvide una. */
export const STRIKES_TO_FIRE = 3;
export const STRIKE_FORGET_DAYS = 7;

// -----------------------------------------------------------------------------
// Vida corporativa
// -----------------------------------------------------------------------------

export type CorpEventKind = 'afterwork' | 'comida' | 'navidad';

export const CORP_EVENTS: Record<CorpEventKind, { label: string; icon: string; hours: number; invite: string }> = {
  afterwork: { label: 'Afterwork', icon: '🍻', hours: 3, invite: 'El equipo de {company} se va de afterwork al salir. ¿Qué hace {name}?' },
  comida: { label: 'Comida de empresa', icon: '🥘', hours: 3, invite: '{company} invita a toda la plantilla a una comida de empresa. ¿Va {name}?' },
  navidad: { label: 'Cena de Navidad', icon: '🎄', hours: 4, invite: '¡Llega la cena de Navidad de {company}! Barra libre, amigo invisible y el jefe con gorro de Papá Noel. ¿Qué hace {name}?' },
};

/** Cosas que pasan en los eventos de empresa ({a} y {b}: compañeros; {boss}: el jefe; {company}). */
export const EVENT_GOSSIP = [
  '{a} se ha subido a la mesa a cantar «Paquito el Chocolatero»',
  '{a} le ha dicho a {boss} lo que piensa de los horarios. Silencio absoluto en la mesa',
  '{a} y {b} se han ido juntos del restaurante... y no a la misma parada de metro',
  'En el amigo invisible a {boss} le ha tocado un tupper. Nadie confiesa',
  '{a} ha llorado en el baño porque «nadie valora su trabajo»',
  '{a} ha bailado una bachata con {boss}. Mañana no se habla de otra cosa',
  '{a} se ha quedado dormido/a encima del cordero',
  'Se ha sabido que {a} cobra más que {b}. Mal rollo en el postre',
  '{boss} ha prometido subidas de sueldo para todos. Nadie se lo cree',
  '{a} se ha llevado tres botellas de vino del catering en el bolso',
];

/** Despidos fulminantes de compañeros por su comportamiento en un evento. */
export const EVENT_SACKINGS = [
  'Han despedido a {a} por vomitar en los zapatos de {boss}',
  'Han despedido a {a} por llamar «cuñado» a {boss} delante de todos',
  'Han despedido a {a} por intentar besar a {boss} en el karaoke',
  'Han despedido a {a} por subir a Instagram un vídeo de {boss} bailando',
];

/** Cómo le va a uno de la familia que va solo a un evento (lo que se cuenta al volver). */
export const EVENT_GOOD = [
  '{name} vuelve del {event} encantado/a: ha caído genial a todo el mundo',
  '{name} ha cantado en el karaoke y {boss} le ha aplaudido. Puntos ganados',
  '{name} ha hecho contactos: «{boss} me ha dicho que cuenta conmigo»',
];
export const EVENT_DRUNK = [
  '{name} vuelve del {event} con una cogorza de campeonato. Mañana habrá resaca',
  '{name} se ha pasado con el vino y le ha contado su vida a {a}. Toda. Con detalles',
];
export const EVENT_IMPROPER = [
  '{name} se ha pasado de copas y le ha dicho a {boss} lo que piensa de él/ella. Delante de todos',
  '{name} ha bailado encima de la mesa y ha tirado la tarta de {boss}',
  '{name} se ha puesto a gritar en el karaoke que la empresa es una explotación',
];
export const EVENT_ROMANCE = [
  'En el {event}, {name} y {a} no se han separado en toda la noche... 👀',
  '{name} y {a} han acabado bailando agarrados. El grupo de WhatsApp de la oficina arde',
];

/** Drama del día a día en la oficina. */
export const OFFICE_DRAMA = [
  '{a} y {b} han discutido a gritos por el aire acondicionado',
  '{a} ha robado el tupper de {b} de la nevera. Guerra abierta',
  '{a} va diciendo que {b} no da un palo al agua',
  'Hay un grupo de WhatsApp de la oficina en el que no está {boss}. Y {boss} lo sabe',
  '{a} ha llegado tarde por quinta vez esta semana y {boss} ha montado un pollo',
];
export const OFFICE_AFFAIRS = [
  '{boss} y {a} tienen un lío. Los han pillado en el ascensor',
  '{a} y {b} están liados. Lo sabe toda la planta menos sus parejas',
];
/** El enchufado: alguien entra a trabajar por ser familia de quien manda. */
export const NEPOTISM = [
  { name: 'Borjita', who: 'el sobrino de {boss}' },
  { name: 'Cayetanita', who: 'la ahijada de {boss}' },
  { name: 'Jacobo', who: 'el hijo del presidente' },
  { name: 'Tamarita', who: 'la cuñada de {boss}' },
  { name: 'Álvaro', who: 'el yerno de {boss}' },
];

/** Probabilidades por día y por empresa (el mundo las multiplica por `corpChance`). */
export const CORP_CHANCE = {
  afterwork: 0.25,
  comida: 0.04,
  drama: 0.12,
  affair: 0.04,
  nepotism: 0.02,
  merger: 0.006,
  /** En una fusión, probabilidad de que el ERE se lleve por delante a alguien de la familia (más con mal rendimiento). */
  ereBase: 0.18,
  ereLowPerf: 0.25,
  /** Que el ascenso se lo lleve el enchufado. */
  stolenPromotion: 0.3,
  /** Despido por comportarse mal en un evento (si ha hecho algo impropio). */
  improperFire: 0.4,
};
