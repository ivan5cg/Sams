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
}

export interface PlacedObject {
  id: string;
  def: string;
  x: number;
  y: number;
  /** Raciones disponibles (comedero). */
  stock?: number;
}

export interface Household {
  id: string;
  name: string;
  funds: number;
  memberIds: string[];
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
  agents: Agent[];
  objects: PlacedObject[];
}
