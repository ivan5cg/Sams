// Tipos de datos de la simulación. Todo el estado es JSON puro para poder
// guardarlo tal cual en IndexedDB y migrarlo entre versiones.

export const NEED_KEYS = ['hunger', 'energy', 'bladder', 'hygiene', 'fun', 'social'] as const;
export type NeedKey = (typeof NEED_KEYS)[number];
export type Needs = Record<NeedKey, number>;

export type AgentKind = 'person' | 'pet';
export type SpeciesId = 'human' | 'dog' | 'cat' | 'guineapig' | 'ferret' | 'capybara';

export interface Vec {
  x: number;
  y: number;
}

export type TaskPhase = 'walking' | 'acting' | 'waiting';

export interface Task {
  id: string;
  actionId: string;
  byPlayer: boolean;
  phase: TaskPhase;
  /** Minutos de juego restantes (actuando) o de espera (esperando). */
  remaining: number;
  targetObjectId?: string;
  targetAgentId?: string;
  dest?: Vec;
  /** Tarea pasiva: el agente participa en una acción social iniciada por otro. */
  passiveOf?: string;
  /** Casilla de destino hacia la que se planificó la ruta (para replanificar). */
  goal?: Vec;
  /** Parámetro extra de la orden (p. ej. especie a adoptar). */
  param?: string;
}

export interface Agent {
  id: string;
  name: string;
  kind: AgentKind;
  species: SpeciesId;
  householdId: string;
  ageDays: number;
  /** Color principal (ropa en personas, pelaje en mascotas). */
  color: number;
  needs: Needs;
  pos: Vec;
  path: Vec[];
  queue: Task[];
  current: Task | null;
  facing: 1 | -1;
  /** Fuera de la parcela (p. ej. paseando al perro). */
  hidden: boolean;
  /** Objeto en el que vive sin salir (la jaula de la cobaya). */
  home?: string;
  /** Parcela en la que está. */
  lotId: string;
  /** De camino a otra parcela (o en el trabajo / el colegio, que no se ven). */
  travel?: { from: string; to: string; arrive: number; reason?: 'work' | 'school' | 'trip'; mood?: number };
  /** Trabajo o colegio. */
  job?: Job;
  /** Minutos seguidos con el hambre a cero. */
  starving?: number;
  /** Habilidades (0 a 10, con decimales). */
  skills?: Record<string, number>;
  /** Gustos que ha descubierto de otros (id → gustos; con '-' delante, lo que no soportan). */
  known?: Record<string, string[]>;
  /** Deseos (solo la familia del jugador). */
  wishes?: Wish[];
  /** Rasgos de personalidad (personas). */
  traits?: string[];
  /** Raciones de compra que lleva a casa. */
  carrying?: number;
  /** Recado que está haciendo por su cuenta (ir a hacer la compra). */
  errand?: 'compra';
  /** Está de visita (o en el parque) hasta este minuto; después vuelve a casa. Solo vecinos. */
  visitUntil?: number;
  /** Simulado de forma resumida (vecinos en parcelas donde no está el jugador). */
  abstract?: boolean;
  /** Emociones activas: id, hasta qué minuto dura y por quién/qué (texto). */
  emotions?: { id: string; until: number; about?: string }[];
  /** Cuántas veces ha hecho cada cosa (para metas, rasgos y trucos). */
  stats?: Record<string, number>;
  /** Meta de vida y etapa alcanzada (0 = ninguna aún). */
  aspiration?: { id: string; stage: number };
  /** Metas de vida ya cumplidas. */
  aspirationsDone?: string[];
  /** Aspecto elegido en el creador de familia (si no, sale del nombre). Desde la versión 13. */
  look?: { skin?: number; hair?: number; hairStyle?: string };
  /** Generación en la familia del jugador (1 = la fundadora). */
  gen?: number;
  /** Padres (para saber quién es hijo/nieto de quién). */
  parents?: string[];
  /** Puede elegir un rasgo nuevo (al hacerse adulto). */
  traitPick?: boolean;
  /** Día en que cambió de rasgo por última vez (los hábitos cambian a la gente, pero despacio). */
  traitChangedDay?: number;
  /** Gente de la calle: su papel (vendedor, rapero, cotilla...) y dónde está. */
  role?: string;
  post?: string;
  /** Alcohol en sangre (0-100) y lo máximo que ha llegado hoy. */
  alcohol?: number;
  alcoholMax?: number;
  /** Gases acumulados (después, pedos). */
  gas?: number;
  /** Viaje en metro: destino final y hasta cuándo dura el trayecto. */
  via?: string;
  rideUntil?: number;
  /** Repartidor: a quién le lleva la comida. */
  deliverTo?: string;
  /** Mascotas: carácter y trucos aprendidos (0-100 de adiestramiento). */
  petTrait?: string;
  training?: number;
  tricks?: string[];
}

export interface Wish {
  id: string;
  kind: 'action' | 'place' | 'skill' | 'money';
  label: string;
  icon: string;
  action?: string;
  /** Con quién (id), o 'vecino' para cualquiera de otra familia. */
  target?: string;
  /** Plano del sitio al que ir ('venue' = estudio, en partidas antiguas). */
  lot?: 'park' | 'venue' | 'studio' | 'super' | 'acai' | 'plaza' | 'bar' | 'metro';
  skill?: string;
  level?: number;
  money?: number;
  reward: number;
}

export interface Job {
  career: string;
  /** Nivel en la carrera, desde 1. */
  level: number;
  /** Rendimiento: al llegar a 100, ascenso. En el colegio, las notas. */
  perf: number;
  /** Último día (número de día) en que fue o faltó. */
  lastShiftDay?: number;
  /** Día libre pedido (número de día). */
  dayOff?: number;
  /** Días seguidos rindiendo fatal (para los despidos). */
  badDays?: number;
  /** Último día en que teletrabajó (desde la versión 12). */
  homeDay?: number;
  /** El negocio propio: cómo se lleva el bar (desde la versión 12). */
  bar?: BarPlan;
}

/** Decisiones del bar de tapas (se cambian una vez por semana). */
export interface BarPlan {
  menu: 'barata' | 'normal' | 'cara';
  /** Un vecino contratado de camarero (su nombre). */
  staff?: string;
  /** Abre también los domingos. */
  sunday?: boolean;
  /** Semana en que se cambió por última vez. */
  week?: number;
}

/** Relación entre dos personajes. */
export interface Rel {
  /** Amistad, de -100 (enemigos) a 100 (mejores amigos). */
  f: number;
  /** Romance, de 0 a 100. */
  r: number;
  status?: 'partner' | 'married';
  /** Son familia (padres, hijos, hermanos): sin romance. */
  kin?: boolean;
  /** Recuerdos de lo que ha pasado entre los dos: qué (k), qué día (d) y quién lo hizo (by). */
  mem?: { k: string; d: number; by: string }[];
  /** Separados (divorciados o lo dejaron) que siguen bajo el mismo techo. */
  ex?: boolean;
  /** Tienen un lío a escondidas. */
  affair?: boolean;
}

export interface PlacedObject {
  id: string;
  def: string;
  lotId: string;
  x: number;
  y: number;
  /** Raciones disponibles (comedero, heno). */
  stock?: number;
  /** Suciedad acumulada (arenero, jaula). */
  dirt?: number;
  /** Texto propio (el nombre en una lápida). */
  label?: string;
  /** Estropeado: hay que repararlo antes de usarlo. */
  broken?: boolean;
  /** Calidad: 1 básica, 2 normal (por defecto), 3 de lujo. */
  q?: 1 | 2 | 3;
  /** Girado 90° (la huella pasa de w×h a h×w). Desde la versión 12. */
  rot?: 1;
}

export interface Household {
  id: string;
  name: string;
  funds: number;
  memberIds: string[];
  /** Su casa. */
  lotId: string;
  /** Bebé en camino. */
  expecting?: { parents: string[]; due: number };
  /** Raciones de comida en la nevera de casa. */
  pantry?: number;
  /** Compra a domicilio en camino. */
  delivery?: { at: number; amount: number };
  /** Okupas (no pagan facturas, pero tampoco tienen trabajo). */
  okupa?: boolean;
  /** Fin de semana fuera reservado (desde la versión 12). */
  trip?: { start: number; end: number; dest: string };
  /** Movimientos de dinero por categoría: esta semana y la anterior (desde la versión 11). */
  ledger?: LedgerWeek[];
}

export interface LedgerWeek {
  /** Semana del juego (0 = la primera). */
  week: number;
  in: Record<string, number>;
  out: Record<string, number>;
}

export interface Lot {
  id: string;
  name: string;
  /** home = casa de una familia; park/venue = sitios públicos (parque, estudio de pilates). */
  kind: 'home' | 'park' | 'venue';
  layout: 'house' | 'park' | 'studio' | 'super' | 'acai' | 'metro' | 'plaza' | 'bar';
  /** Barrio: Madrid (por defecto), Alcorcón o el propio metro. */
  district?: 'madrid' | 'alcorcon' | 'metro';
  householdId?: string;
  /** Colores propios de cada casa. */
  style?: { wall: number; floor: number };
  /** Tamaño de la casa (1 = la de siempre; 2 y 3 = ampliada). */
  size?: number;
  /** Plantillas elegidas en cada reforma de la casa ('jardin'/'bano', 'salon'/'dormitorios'). Desde la versión 12. */
  plans?: string[];
  /** Pintura de cada habitación (por su id, ver sim/rooms.ts). Desde la versión 12. */
  paint?: Record<string, RoomPaint>;
}

/** Color de las paredes y suelo de una habitación. */
export interface RoomPaint {
  wall?: number;
  /** Id de un suelo de data/paint.ts. */
  floor?: string;
}

export interface Secret {
  id: string;
  kind: string;
  text: string;
  /** De quién va. */
  about: string[];
  day: number;
  /** Quién lo sabe (ids). */
  known: string[];
  /** Lo jugoso que es (1-3 guindillas). */
  juicy: number;
  /** Ya lo sabe todo el barrio. */
  public?: boolean;
}

export interface WorldState {
  version: number;
  /** Minutos de juego transcurridos desde el inicio (día 1, 00:00). */
  minutes: number;
  speed: number;
  nextId: number;
  playerHouseholdId: string;
  activeAgentId: string;
  households: Household[];
  lots: Lot[];
  agents: Agent[];
  /** Relaciones, por pareja de ids ordenados "a|b". */
  rels: Record<string, Rel>;
  /** Velocidad de envejecimiento (opción del menú). */
  aging?: 'off' | 'normal' | 'fast';
  /** La familia del jugador se ha quedado sin personas: hay que elegir con quién seguir. */
  familyGone?: boolean;
  /** Salseo: secretos del barrio, quién los sabe y si ya son públicos. */
  secrets?: Secret[];
  /** Fiesta en casa de la familia del jugador. */
  party?: { lotId: string; host: string; until: number; birthday?: string };
  /** Eventos del barrio en marcha (verbena, ola de calor, apagón...). */
  events?: { id: string; until: number; lotId?: string }[];
  /** Décimos de lotería de Navidad comprados este año (ids de quien los compró). */
  lottery?: string[];
  /** Dilema del trabajo esperando respuesta del jugador. */
  dilemma?: { id: string; agentId: string; until: number };
  /** Noticias del barrio (lo último primero): de qué se habla y se cotillea. */
  news?: { day: number; text: string; about: string[] }[];
  /** Órdenes programadas a una hora (desde la versión 11). */
  schedule?: ScheduledOrder[];
  /** Logros conseguidos, contadores de la familia y retos activos (desde la versión 11). */
  feats?: Feats;
  /** Culebrones del barrio: historias de varios días entre vecinos (desde la versión 12). */
  arcs?: Arc[];
  objects: PlacedObject[];
}

/** Una orden que se da sola a una hora («a las 20:00, Mateo cocina»). */
export interface ScheduledOrder {
  id: string;
  agentId: string;
  /** Minuto absoluto de la partida en que se da. */
  at: number;
  actionId: string;
  target: { kind: 'object' | 'agent' | 'tile'; id?: string; x?: number; y?: number };
  param?: string;
}

export interface Feats {
  /** Logros conseguidos: id → día. */
  got: Record<string, number>;
  /** Contadores de la familia del jugador (bebés, raps, premios...). */
  counts: Record<string, number>;
  /** Retos activados: desde cuándo, sus contadores, y si se cumplieron o se perdieron. */
  challenges: Record<string, { since: number; counts: Record<string, number>; done?: number; failed?: string }>;
}

/** Un culebrón del barrio: una historia en pasos que duran días. */
export interface Arc {
  id: string;
  kind: 'lio' | 'pelea' | 'romance';
  /** Paso actual (0 = el primero). */
  step: number;
  /** Quiénes: lio [infiel, amante, engañado/a]; pelea [a, b]; romance [a, b]. */
  who: string[];
  /** Cuándo toca el siguiente paso (minuto de la partida). */
  next: number;
  /** Día en que empezó. */
  day: number;
  /** Cómo acabó (si ha acabado). */
  end?: { day: number; how: string };
}
