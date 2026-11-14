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
  /** Está de visita (o en el parque) hasta este minuto; después vuelve a casa. Solo vecinos. */
  visitUntil?: number;
  /** Simulado de forma resumida (vecinos en parcelas donde no está el jugador). */
  abstract?: boolean;
}

export interface Job {
  career: string;
  /** Nivel en la carrera, desde 1. */
  level: number;
  /** Rendimiento: al llegar a 100, ascenso. En el colegio, las notas. */
  perf: number;
  /** Último día (número de día) en que fue o faltó. */
  lastShiftDay?: number;
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
}

export interface Household {
  id: string;
  name: string;
  funds: number;
  memberIds: string[];
  /** Su casa. */
  lotId: string;
}

export interface Lot {
  id: string;
  name: string;
  kind: 'home' | 'park';
  layout: 'house' | 'park';
  householdId?: string;
  /** Colores propios de cada casa. */
  style?: { wall: number; floor: number };
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
  objects: PlacedObject[];
}
