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
  travel?: { from: string; to: string; arrive: number; reason?: 'work' | 'school'; mood?: number };
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
  /** Padres (para saber quién es hijo/nieto de quién). */
  parents?: string[];
  /** Puede elegir un rasgo nuevo (al hacerse adulto). */
  traitPick?: boolean;
  /** Día en que cambió de rasgo por última vez (los hábitos cambian a la gente, pero despacio). */
  traitChangedDay?: number;
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
  lot?: 'park' | 'venue' | 'studio' | 'super' | 'acai';
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
}

export interface Lot {
  id: string;
  name: string;
  /** home = casa de una familia; park/venue = sitios públicos (parque, estudio de pilates). */
  kind: 'home' | 'park' | 'venue';
  layout: 'house' | 'park' | 'studio' | 'super' | 'acai';
  householdId?: string;
  /** Colores propios de cada casa. */
  style?: { wall: number; floor: number };
  /** Tamaño de la casa (1 = la de siempre; 2 y 3 = ampliada). */
  size?: number;
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
  objects: PlacedObject[];
}
