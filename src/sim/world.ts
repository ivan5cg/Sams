import { ACTIONS, SELF_ACTIONS, type ActionDef } from '../data/actions';
import { HOUSE_OBJECTS, LAYOUTS, isOutdoor, type LotLayout } from '../data/lot';
import { OBJECTS, type ObjectDef } from '../data/objects';
import { SPECIES, lifeStage } from '../data/species';
import { CAREERS, gradeLabel } from '../data/careers';
import { chooseAutonomous } from './ai';
import { REJECT_TEXT, REL_EFFECTS, ROMANTIC, acceptChance, canRomance, changeRel, getRel, isAdult, partnerOf, relKey, setRel } from './social';
import { PARK_LOT, PLAYER_LOT, generateFamily, generateNeighborhood, makeAgent, placeObjects, randomIndoorTile, setupFamilyLife } from './neighborhood';
import { findPath, isWalkable, pathLength, type Grid } from './pathfinding';
import { NEED_KEYS, type Agent, type Household, type Lot, type NeedKey, type Needs, type PlacedObject, type SpeciesId, type Task, type Vec, type WorldState } from './types';

export const SAVE_VERSION = 4;
export const MINUTES_PER_DAY = 1440;
export const MAX_MEMBERS = 8;
/** Minutos de juego que se tarda en ir de una parcela a otra del barrio. */
export const TRAVEL_MINUTES = 15;
const MAX_STEP = 0.5;

export type Target =
  | { kind: 'object'; id: string }
  | { kind: 'agent'; id: string }
  | { kind: 'tile'; x: number; y: number };

export interface ActionOption {
  def: ActionDef;
  ok: boolean;
  reason?: string;
}

export interface Toast {
  text: string;
  icon?: string;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** Ánimo general (0-100) a partir de las necesidades. */
export function moodScore(a: Agent): number {
  const vals = NEED_KEYS.map((k) => a.needs[k]);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  return avg - vals.filter((v) => v < 20).length * 12;
}
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Centro de un objeto en coordenadas de casilla. */
export function objectCenter(o: PlacedObject): Vec {
  const d = OBJECTS[o.def];
  return { x: o.x + (d.w - 1) / 2, y: o.y + (d.h - 1) / 2 };
}

export class World {
  state: WorldState;
  private grids = new Map<string, Grid>();
  private toastListeners: ((t: Toast) => void)[] = [];
  private warned = new Set<string>();
  private lastToast = new Map<string, number>();
  /** Tras despedir a unas visitas, no llegan otras espontáneas durante un rato. */
  private noVisitsUntil = 0;

  constructor(state: WorldState) {
    this.state = state;
    this.rebuildGrid();
  }

  // ---------------------------------------------------------------------------
  // Creación
  // ---------------------------------------------------------------------------

  static createNew(): World {
    const state: WorldState = {
      version: SAVE_VERSION,
      minutes: 8 * 60,
      speed: 1,
      nextId: 100,
      playerHouseholdId: 'h1',
      activeAgentId: 'a1',
      households: [],
      lots: [{ id: PLAYER_LOT, name: 'Vuestra casa', kind: 'home', layout: 'house', householdId: 'h1' }],
      agents: [],
      objects: [],
      rels: {},
    };
    const mk = (id: string, name: string, species: SpeciesId, ageDays: number, color: number, x: number, y: number) =>
      makeAgent({ id, name, species, ageDays, color, householdId: 'h1', lotId: PLAYER_LOT, x, y });
    state.agents.push(
      mk('a1', 'Lucía', 'human', 24, 0xe0607e, 6, 4),
      mk('a2', 'Mateo', 'human', 27, 0x4f8fd9, 7, 5),
      mk('a3', 'Toby', 'dog', 9, 0xc68642, 3, 7),
      mk('a4', 'Misi', 'cat', 12, 0x9a9a9a, 4, 5),
    );
    state.households.push({ id: 'h1', name: 'Familia García', funds: 2000, memberIds: state.agents.map((a) => a.id), lotId: PLAYER_LOT });
    // Lucía y Mateo son pareja; los dos están sin trabajo (lo eliges tú).
    setRel(state, 'a1', 'a2', { f: 70, r: 75, status: 'partner' });
    setupFamilyLife(state, state.agents, { jobs: false });
    placeObjects(state, PLAYER_LOT, HOUSE_OBJECTS);
    generateNeighborhood(state);
    return new World(state);
  }

  // ---------------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------------

  get household(): Household {
    return this.state.households.find((h) => h.id === this.state.playerHouseholdId)!;
  }

  householdOf(a: Agent): Household | undefined {
    return this.state.households.find((h) => h.id === a.householdId);
  }

  get members(): Agent[] {
    return this.household.memberIds.map((id) => this.agent(id)!).filter(Boolean);
  }

  get activeAgent(): Agent {
    return this.agent(this.state.activeAgentId) ?? this.members[0];
  }

  /** Parcela que se está viendo: donde está (o de donde sale) el personaje activo. */
  get viewLotId(): string {
    const a = this.activeAgent;
    return a.travel ? a.travel.from : a.lotId;
  }

  get day(): number {
    return Math.floor(this.state.minutes / MINUTES_PER_DAY) + 1;
  }

  /** 0 = lunes … 6 = domingo. */
  get weekday(): number {
    return (this.day - 1) % 7;
  }

  get hour(): number {
    return Math.floor((this.state.minutes % MINUTES_PER_DAY) / 60);
  }

  get clock(): string {
    const m = Math.floor(this.state.minutes % MINUTES_PER_DAY);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  lotById(id: string): Lot {
    return this.state.lots.find((l) => l.id === id)!;
  }

  layoutOf(lotId: string): LotLayout {
    return LAYOUTS[this.lotById(lotId)?.layout ?? 'house'];
  }

  gridOf(lotId: string): Grid {
    return this.grids.get(lotId) ?? [];
  }

  /** Atajos de la casa del jugador (pruebas y compatibilidad). */
  get lot(): LotLayout {
    return this.layoutOf(this.household.lotId);
  }

  get grid(): Grid {
    return this.gridOf(this.household.lotId);
  }

  agent(id: string | undefined): Agent | undefined {
    return this.state.agents.find((a) => a.id === id);
  }

  object(id: string | undefined): PlacedObject | undefined {
    return this.state.objects.find((o) => o.id === id);
  }

  objDef(o: PlacedObject): ObjectDef {
    return OBJECTS[o.def];
  }

  objectsIn(lotId: string): PlacedObject[] {
    return this.state.objects.filter((o) => o.lotId === lotId);
  }

  /** Quién está ahora mismo en una parcela (sin contar a quien va de camino). */
  agentsIn(lotId: string): Agent[] {
    return this.state.agents.filter((a) => a.lotId === lotId && !a.travel);
  }

  objectAt(lotId: string, x: number, y: number): PlacedObject | undefined {
    // Los objetos sólidos tienen prioridad sobre los transitables (charcos, pelota).
    const hits = this.objectsIn(lotId).filter((o) => {
      const d = this.objDef(o);
      return x >= o.x && x < o.x + d.w && y >= o.y && y < o.y + d.h;
    });
    return hits.find((o) => !this.objDef(o).walkable) ?? hits[0];
  }

  usersOf(objId: string, except?: Agent): Agent[] {
    return this.state.agents.filter((a) => a !== except && a.current?.targetObjectId === objId);
  }

  residentOf(objId: string): Agent | undefined {
    return this.state.agents.find((a) => a.home === objId);
  }

  isActive(a: Agent): boolean {
    return a.id === this.state.activeAgentId && this.household.memberIds.includes(a.id);
  }

  isPlayerMember(a: Agent): boolean {
    return a.householdId === this.state.playerHouseholdId;
  }

  /** Está en casa ajena. */
  isGuest(a: Agent): boolean {
    const lot = this.lotById(a.lotId);
    return lot?.kind === 'home' && lot.householdId !== a.householdId;
  }

  onToast(fn: (t: Toast) => void) {
    this.toastListeners.push(fn);
  }

  toast(text: string, icon?: string) {
    for (const fn of this.toastListeners) fn({ text, icon });
  }

  /** Aviso que no se repite más de una vez cada `every` minutos de juego. */
  private toastOnce(key: string, text: string, icon: string, every = 180) {
    const last = this.lastToast.get(key);
    if (last !== undefined && this.state.minutes - last < every) return;
    this.lastToast.set(key, this.state.minutes);
    this.toast(text, icon);
  }

  /** Avisos sobre la familia del jugador o lo que pasa donde está. */
  private toastFor(a: Agent, text: string, icon: string) {
    if (this.isPlayerMember(a) || a.lotId === this.viewLotId) this.toast(text, icon);
  }

  private newId(prefix: string) {
    return `${prefix}${this.state.nextId++}`;
  }

  rebuildGrid() {
    for (const lot of this.state.lots) {
      const { w, h, tiles } = LAYOUTS[lot.layout];
      const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => tiles[y][x] !== 'wall'));
      for (const o of this.objectsIn(lot.id)) {
        const d = this.objDef(o);
        if (d.walkable) continue;
        for (let y = o.y; y < o.y + d.h; y++) for (let x = o.x; x < o.x + d.w; x++) if (grid[y]) grid[y][x] = false;
      }
      this.grids.set(lot.id, grid);
    }
  }

  // ---------------------------------------------------------------------------
  // Qué se puede hacer
  // ---------------------------------------------------------------------------

  private speciesOk(a: Agent, def: ActionDef) {
    return def.actors.includes(a.kind) && (!def.species || def.species.includes(a.species));
  }

  checkObjectAction(a: Agent, o: PlacedObject, actionId: string): ActionOption {
    const def = ACTIONS[actionId];
    const od = this.objDef(o);
    if (!this.speciesOk(a, def)) return { def, ok: false, reason: `${a.name} no puede hacer esto` };
    if (o.lotId !== a.lotId || a.travel) return { def, ok: false, reason: 'No está aquí' };
    if (a.home && a.home !== o.id) return { def, ok: false, reason: 'No puede salir de su jaula' };
    if (!def.guestOk && this.isGuest(a)) return { def, ok: false, reason: 'Estás de visita' };
    const resident = this.residentOf(o.id);
    if (resident && def.actors.includes('pet') && resident !== a) return { def, ok: false, reason: `Es la casa de ${resident.name}` };
    if (this.usersOf(o.id, a).length >= od.capacity) return { def, ok: false, reason: 'Ocupado' };
    if (def.consumes && !o.stock) return { def, ok: false, reason: 'Está vacío' };
    if (def.refill && (o.stock ?? 0) >= (od.maxStock ?? 0)) return { def, ok: false, reason: 'Ya está lleno' };
    if (def.dirties && od.maxDirt && (o.dirt ?? 0) >= od.maxDirt) return { def, ok: false, reason: 'Está demasiado sucio' };
    if (def.cleans && !o.dirt) return { def, ok: false, reason: 'Ya está limpio' };
    if (actionId === 'steal' && this.nearHammock(o)) return { def, ok: false, reason: 'Ya está escondido' };
    if (actionId === 'adopt' && this.members.length >= MAX_MEMBERS) return { def, ok: false, reason: 'La casa está llena' };
    if (actionId === 'find_job' && !isAdult(a)) return { def, ok: false, reason: 'Primero, el colegio' };
    const funds = this.householdOf(a)?.funds ?? 0;
    if (def.cost && funds < def.cost) return { def, ok: false, reason: 'No hay dinero' };
    return { def, ok: true };
  }

  checkSocialAction(a: Agent, t: Agent, actionId: string): ActionOption {
    const def = ACTIONS[actionId];
    if (!this.speciesOk(a, def) || !def.targetKinds?.includes(t.kind)) return { def, ok: false };
    if (def.targetSpecies && !def.targetSpecies.includes(t.species)) return { def, ok: false };
    // Despedir solo a invitados de otra familia que están en tu casa.
    if (actionId === 'say_goodbye' && (t.householdId === a.householdId || !t.visitUntil || this.isGuest(a))) return { def, ok: false };
    if (ROMANTIC.has(actionId)) {
      if (!canRomance(this.state, a, t)) return { def, ok: false };
      const rel = getRel(this.state, a.id, t.id);
      const mine = partnerOf(this.state, a.id);
      if (actionId === 'ask_partner') {
        if (rel.status) return { def, ok: false };
        if (mine) return { def, ok: false, reason: 'Ya tienes pareja' };
      }
      if (actionId === 'propose' && rel.status !== 'partner') return { def, ok: false };
      if (actionId === 'move_in') {
        if (!rel.status || t.householdId === a.householdId || !this.isPlayerMember(a)) return { def, ok: false };
        if (this.members.length >= MAX_MEMBERS) return { def, ok: false, reason: 'La casa está llena' };
        const why = this.cantMoveOut(t);
        if (why) return { def, ok: false, reason: why };
      }
    }
    if (a.home) return { def, ok: false, reason: 'No puede salir de su jaula' };
    if (t.home && def.offLot) return { def, ok: false };
    if (def.offLot && (t.householdId !== a.householdId || this.isGuest(a))) return { def, ok: false };
    if (t.lotId !== a.lotId || t.travel) return { def, ok: false, reason: `${t.name} no está aquí` };
    if (t.hidden) return { def, ok: false, reason: `${t.name} no está en casa` };
    return { def, ok: true };
  }

  checkSelfAction(a: Agent, actionId: string): ActionOption {
    const def = ACTIONS[actionId];
    return { def, ok: this.speciesOk(a, def) };
  }

  /** Opciones para el menú de acciones del agente activo sobre un objetivo. */
  optionsFor(agentId: string, target: Target): ActionOption[] {
    const a = this.agent(agentId);
    if (!a) return [];
    if (target.kind === 'object') {
      const o = this.object(target.id);
      if (!o) return [];
      return this.objDef(o)
        .actions.filter((id) => this.speciesOk(a, ACTIONS[id]))
        .map((id) => this.checkObjectAction(a, o, id));
    }
    if (target.kind === 'agent') {
      if (target.id === a.id) return SELF_ACTIONS.filter((d) => this.speciesOk(a, d)).map((d) => ({ def: d, ok: true }));
      const t = this.agent(target.id);
      if (!t) return [];
      return Object.values(ACTIONS)
        .filter((d) => d.target === 'agent')
        .map((d) => this.checkSocialAction(a, t, d.id))
        .filter((o) => o.ok || o.reason);
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Adopción
  // ---------------------------------------------------------------------------

  canAdopt(species: SpeciesId): { ok: boolean; reason?: string } {
    const sp = SPECIES[species];
    if (sp.kind !== 'pet') return { ok: false };
    if (this.members.length >= MAX_MEMBERS) return { ok: false, reason: `Máximo ${MAX_MEMBERS} en casa` };
    if (this.household.funds < sp.price) return { ok: false, reason: 'No hay dinero' };
    if (sp.habitat && !this.freeHabitat(sp.habitat)) return { ok: false, reason: 'Hace falta una jaula libre' };
    return { ok: true };
  }

  private freeHabitat(defId: string): PlacedObject | undefined {
    return this.objectsIn(this.household.lotId).find((o) => o.def === defId && !this.residentOf(o.id));
  }

  adopt(species: SpeciesId): Agent | null {
    const check = this.canAdopt(species);
    if (!check.ok) {
      this.toast(`No se ha podido adoptar: ${check.reason ?? ''}`, '🚫');
      return null;
    }
    const sp = SPECIES[species];
    const used = new Set(this.state.agents.map((a) => a.name));
    const free = sp.names.filter((n) => !used.has(n));
    const name = free.length ? free[Math.floor(Math.random() * free.length)] : `${sp.label} ${this.state.nextId}`;
    const lotId = this.household.lotId;
    const entrance = this.layoutOf(lotId).entrance;
    const pet = makeAgent({
      id: this.newId('a'),
      name,
      species,
      ageDays: Math.round(rand(sp.stages[0].until, sp.stages[0].until + 5)),
      color: 0x999999,
      householdId: this.household.id,
      lotId,
      ...(sp.outdoor ? { x: 11, y: 6 } : entrance),
    });
    if (sp.habitat) {
      const home = this.freeHabitat(sp.habitat)!;
      pet.home = home.id;
      pet.pos = { x: home.x, y: home.y };
    }
    this.household.funds -= sp.price;
    this.state.agents.push(pet);
    this.household.memberIds.push(pet.id);
    this.toast(`¡Bienvenido/a a casa, ${name}! (${sp.label.toLowerCase()})`, '🎉');
    return pet;
  }

  // ---------------------------------------------------------------------------
  // Barrio: viajes y visitas
  // ---------------------------------------------------------------------------

  canTravel(a: Agent, lotId: string): { ok: boolean; reason?: string } {
    if (a.travel) return { ok: false, reason: 'Ya va de camino' };
    if (a.lotId === lotId) return { ok: false, reason: 'Ya está aquí' };
    if (a.home) return { ok: false, reason: 'Vive en su jaula' };
    if (a.hidden) return { ok: false, reason: 'Está fuera' };
    if (a.current && ACTIONS[a.current.actionId].forced) return { ok: false, reason: 'No puede moverse ahora' };
    return { ok: true };
  }

  /** Manda a uno o varios agentes a otra parcela del barrio. */
  travel(agentIds: string[], lotId: string): boolean {
    const group = agentIds.map((id) => this.agent(id)!).filter((a) => a && this.canTravel(a, lotId).ok);
    if (!group.length) return false;
    for (const a of group) this.startTravel(a, lotId);
    const lot = this.lotById(lotId);
    const names = group.map((a) => a.name).join(', ');
    if (group.some((a) => this.isPlayerMember(a))) {
      this.toast(`${names} ${group.length > 1 ? 'van' : 'va'} a: ${lot.householdId === this.household.id ? 'casa' : lot.name}`, '🚶');
    }
    return true;
  }

  private startTravel(a: Agent, to: string) {
    this.endTask(a);
    a.queue = [];
    a.travel = { from: a.lotId, to, arrive: this.state.minutes + TRAVEL_MINUTES };
    a.hidden = false;
  }

  private arrive(a: Agent) {
    const { to, reason, mood } = a.travel!;
    a.travel = undefined;
    if (reason) this.finishShift(a, reason, mood ?? 50);
    a.lotId = to;
    a.pos = this.freeSpotNear(to, this.layoutOf(to).entrance);
    a.path = [];
    a.current = null;
    if (!this.isPlayerMember(a) && to !== this.householdOf(a)?.lotId) {
      // Un vecino que llega de visita o al parque se queda un rato.
      if (!a.visitUntil) a.visitUntil = this.state.minutes + rand(90, 180);
    }
    if (to === this.householdOf(a)?.lotId) a.visitUntil = undefined;
  }

  /** Una casilla libre (sin nadie encima) cerca de un punto, para no aparecer unos encima de otros. */
  private freeSpotNear(lotId: string, p: Vec): Vec {
    const grid = this.gridOf(lotId);
    const taken = new Set(this.agentsIn(lotId).map((a) => `${Math.round(a.pos.x)},${Math.round(a.pos.y)}`));
    for (let r = 0; r <= 3; r++) {
      const spots: Vec[] = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = p.x + dx, y = p.y + dy;
          if (isWalkable(grid, x, y) && !taken.has(`${x},${y}`) && findPath(grid, p, { x, y })) spots.push({ x, y });
        }
      }
      if (spots.length) return spots[Math.floor(Math.random() * spots.length)];
    }
    return { ...p };
  }

  /** Invitar a una familia vecina a casa. */
  canInvite(householdId: string): { ok: boolean; reason?: string } {
    const h = this.state.households.find((x) => x.id === householdId);
    if (!h || h.id === this.household.id) return { ok: false };
    if (!this.members.some((m) => m.lotId === this.household.lotId && !m.travel && m.kind === 'person')) return { ok: false, reason: 'No hay nadie en casa' };
    if (this.hour >= 21 || this.hour < 8) return { ok: false, reason: 'Es muy tarde' };
    const free = this.availableVisitors(h);
    if (!free.length) return { ok: false, reason: 'No pueden ahora' };
    return { ok: true };
  }

  invite(householdId: string): boolean {
    const check = this.canInvite(householdId);
    const h = this.state.households.find((x) => x.id === householdId);
    if (!check.ok || !h) {
      if (check.reason) this.toast(check.reason, '📞');
      return false;
    }
    this.sendVisit(h, this.household.lotId, true);
    return true;
  }

  private availableVisitors(h: Household): Agent[] {
    return h.memberIds
      .map((id) => this.agent(id)!)
      .filter((a) => a && a.kind === 'person' && a.lotId === h.lotId && !a.travel && lifeStage(a.species, a.ageDays).id !== 'baby' && !this.busySoon(a, 3));
  }

  /** Tiene que ir a trabajar o a clase ahora o en las próximas `hours` horas. */
  busySoon(a: Agent, hours: number): boolean {
    const job = a.job;
    if (!job || job.lastShiftDay === this.day) return false;
    const c = CAREERS[job.career];
    if (!c?.days.includes(this.weekday)) return false;
    const m = this.state.minutes % MINUTES_PER_DAY;
    return m < c.end * 60 && m + hours * 60 >= c.start * 60;
  }

  /** Algunos miembros de una familia vecina van a otra parcela (y quizá su perro). */
  private sendVisit(h: Household, lotId: string, toPlayer: boolean) {
    const people = this.availableVisitors(h);
    if (!people.length) return;
    const n = Math.min(people.length, Math.random() < 0.5 ? 1 : 2);
    const group = people.sort(() => Math.random() - 0.5).slice(0, n);
    const dog = h.memberIds.map((id) => this.agent(id)!).find((a) => a.species === 'dog' && a.lotId === h.lotId && !a.travel);
    if (dog && Math.random() < 0.6) group.push(dog);
    const until = Math.min(this.state.minutes + TRAVEL_MINUTES + rand(120, 240), this.endOfVisits());
    for (const a of group) {
      this.startTravel(a, lotId);
      a.visitUntil = until;
    }
    const people2 = group.filter((a) => a.kind === 'person');
    if (toPlayer) this.toast(`¡Llaman a la puerta! ${people2.map((a) => a.name).join(' y ')} (${h.name}) ${people2.length > 1 ? 'vienen' : 'viene'} de visita`, '🔔');
  }

  /** Las visitas se acaban como muy tarde a las 22:00. */
  private endOfVisits(): number {
    const dayStart = Math.floor(this.state.minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
    return dayStart + 22 * 60;
  }

  /** Cada hora: los vecinos salen al parque o vienen de visita. */
  private hourly() {
    const h = this.hour;
    const neighbours = this.state.households.filter((x) => x.id !== this.household.id);
    // Visitas a la familia del jugador
    const someoneHome = this.members.some((m) => m.lotId === this.household.lotId && !m.travel && m.kind === 'person');
    const visitorsNow = this.state.agents.some((a) => a.lotId === this.household.lotId && a.householdId !== this.household.id && (a.visitUntil || a.travel));
    if (h >= 10 && h <= 19 && someoneHome && !visitorsNow && this.state.minutes >= this.noVisitsUntil && Math.random() < 0.12) {
      const nh = neighbours[Math.floor(Math.random() * neighbours.length)];
      if (nh) this.sendVisit(nh, this.household.lotId, true);
    }
    // Paseos al parque
    if (h >= 9 && h <= 19) {
      for (const nh of neighbours) {
        if (Math.random() < 0.08) this.sendVisit(nh, PARK_LOT, false);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Trabajo y colegio
  // ---------------------------------------------------------------------------

  setJob(a: Agent, careerId: string) {
    const c = CAREERS[careerId];
    if (!c || c.school || !isAdult(a)) return;
    a.job = { career: careerId, level: 1, perf: 0 };
    this.toast(`¡${a.name} tiene trabajo! ${c.levels[0].title} (§${c.levels[0].pay} por jornada)`, c.icon);
  }

  quitJob(a: Agent) {
    if (!a.job || CAREERS[a.job.career].school) return;
    a.job = undefined;
    this.toast(`${a.name} ha dejado el trabajo`, '📦');
  }

  /** A su hora, cada uno se va al trabajo o al colegio (y vuelve a casa al salir). */
  private checkShift(a: Agent) {
    const job = a.job;
    if (!job || job.lastShiftDay === this.day) return;
    const c = CAREERS[job.career];
    if (!c || !c.days.includes(this.weekday)) return;
    const m = this.state.minutes % MINUTES_PER_DAY;
    const start = c.start * 60, end = c.end * 60;
    const mine = this.isPlayerMember(a);
    if (mine && m >= start - 60 && m < start) {
      this.toastOnce(`${a.id}:shift`, `${a.name} entra ${c.school ? 'a clase' : 'a trabajar'} a las ${c.start}:00`, c.icon, 600);
    }
    if (m < start || m >= end) return;
    const busy = a.travel || a.hidden || a.current?.actionId === 'pass_out';
    if (busy) {
      if (m >= start + 60) {
        // Una hora tarde: ya no va.
        job.lastShiftDay = this.day;
        job.perf = Math.max(0, job.perf - 15);
        if (mine) this.toast(`${a.name} ha faltado ${c.school ? 'a clase' : 'al trabajo'}`, '😬');
      }
      return;
    }
    job.lastShiftDay = this.day;
    const home = this.householdOf(a)?.lotId ?? a.lotId;
    const dayStart = Math.floor(this.state.minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
    this.startTravel(a, home);
    a.travel = { ...a.travel!, arrive: dayStart + end, reason: c.school ? 'school' : 'work', mood: moodScore(a) };
    a.visitUntil = undefined;
    if (mine) this.toast(`${a.name} se va ${c.school ? 'al colegio' : 'a trabajar'}`, c.icon);
  }

  /** Al volver: cansancio, sueldo y rendimiento (ascensos o notas). */
  private finishShift(a: Agent, reason: 'work' | 'school', mood: number) {
    const job = a.job;
    if (!job) return;
    const c = CAREERS[job.career];
    a.needs.hunger = clamp(a.needs.hunger - 30);
    a.needs.energy = clamp(a.needs.energy - (reason === 'school' ? 20 : 30));
    a.needs.fun = clamp(a.needs.fun - 20);
    a.needs.hygiene = clamp(a.needs.hygiene - 15);
    a.needs.social = clamp(a.needs.social + 15);
    a.needs.bladder = 80;
    const mine = this.isPlayerMember(a);
    const before = job.perf;
    job.perf = Math.max(0, Math.min(100, job.perf + (mood - 45) / 4 + rand(-3, 5)));
    if (reason === 'school') {
      if (mine && gradeLabel(before) !== gradeLabel(job.perf)) this.toast(`Notas de ${a.name}: ${gradeLabel(job.perf)}`, '📚');
      return;
    }
    const pay = c.levels[job.level - 1].pay;
    const h = this.householdOf(a);
    if (h) h.funds += pay;
    if (job.perf >= 100 && job.level < c.levels.length) {
      job.level++;
      job.perf = 10;
      const lvl = c.levels[job.level - 1];
      if (mine) this.toast(`¡Ascenso! ${a.name} ahora es ${lvl.title} (§${lvl.pay} por jornada)`, '🎉');
    } else if (mine) {
      this.toast(`${a.name} vuelve del trabajo: +§${pay}`, '💰');
    }
  }

  // ---------------------------------------------------------------------------
  // Mudanzas
  // ---------------------------------------------------------------------------

  /** Si alguien no puede dejar su casa (p. ej. no dejaría solos a sus hijos), el motivo. */
  cantMoveOut(t: Agent): string | undefined {
    const h = this.householdOf(t);
    if (!h) return undefined;
    const others = h.memberIds.map((id) => this.agent(id)!).filter((x) => x && x.id !== t.id && x.kind === 'person');
    if (others.length && !others.some((x) => isAdult(x))) return 'Tiene hijos a su cargo';
    return undefined;
  }

  /** `t` deja su familia y se viene a vivir con la del jugador. */
  moveIn(t: Agent) {
    const old = this.householdOf(t);
    const mine = this.household;
    if (!old || old.id === mine.id) return;
    old.memberIds = old.memberIds.filter((id) => id !== t.id);
    t.householdId = mine.id;
    mine.memberIds.push(t.id);
    t.visitUntil = undefined;
    t.abstract = false;
    // Su nueva familia
    for (const m of this.members) if (m.id !== t.id && m.kind === 'person' && !getRel(this.state, m.id, t.id).f) changeRel(this.state, m.id, t.id, 30);
    this.toast(`¡${t.name} se viene a vivir con la ${mine.name}!`, '🏡');
    if (t.lotId !== mine.lotId) this.startTravel(t, mine.lotId);

    // Si se ha quedado sin personas, sus mascotas se vienen (si caben) y llega una familia nueva a esa casa.
    const left = old.memberIds.map((id) => this.agent(id)!).filter(Boolean);
    if (!left.some((x) => x.kind === 'person')) {
      const stay: Agent[] = [];
      for (const pet of left) {
        if (this.members.length < MAX_MEMBERS && !pet.home) {
          pet.householdId = mine.id;
          mine.memberIds.push(pet.id);
          pet.visitUntil = undefined;
          if (pet.lotId !== mine.lotId && !pet.travel) this.startTravel(pet, mine.lotId);
          this.toast(`${pet.name} también se viene`, SPECIES[pet.species].icon);
        } else stay.push(pet);
      }
      this.state.households = this.state.households.filter((x) => x.id !== old.id);
      const fresh = generateFamily(this.state, old.lotId);
      for (const pet of stay) {
        pet.householdId = fresh.id;
        fresh.memberIds.push(pet.id);
      }
      this.toast(`La ${fresh.name} se muda a ${this.lotById(old.lotId).name.replace('Casa de los ', 'la casa de los ')}`, '🚚');
    }
  }

  // ---------------------------------------------------------------------------
  // Órdenes del jugador
  // ---------------------------------------------------------------------------

  setActive(id: string) {
    if (this.household.memberIds.includes(id)) this.state.activeAgentId = id;
  }

  command(agentId: string, actionId: string, target: Target, param?: string): boolean {
    const a = this.agent(agentId);
    if (!a) return false;
    if (a.travel) {
      this.toast(`${a.name} va de camino`, '🚶');
      return false;
    }
    const def = ACTIONS[actionId];
    const task: Task = { id: this.newId('t'), actionId, byPlayer: true, phase: 'walking', remaining: 0 };
    if (param) task.param = param;
    if (def.target === 'object' && target.kind === 'object') task.targetObjectId = target.id;
    else if (def.target === 'agent' && target.kind === 'agent') task.targetAgentId = target.id;
    else if (target.kind === 'tile') task.dest = { x: target.x, y: target.y };

    if (a.home && def.target === 'tile') {
      this.toast(`${a.name} vive en su jaula`, '🏠');
      return false;
    }

    const cur = a.current;
    const curDef = cur && ACTIONS[cur.actionId];
    const busyWithPlayer = cur && (cur.byPlayer || curDef?.forced || (cur.passiveOf && this.agent(cur.passiveOf)?.current?.byPlayer));
    if (cur && !busyWithPlayer) {
      this.endTask(a);
    }
    if (a.queue.length >= 6) {
      this.toast(`La cola de ${a.name} está llena`, '⚠️');
      return false;
    }
    a.queue.push(task);
    return true;
  }

  cancel(agentId: string, taskId: string) {
    const a = this.agent(agentId);
    if (!a) return;
    if (a.current?.id === taskId) {
      if (ACTIONS[a.current.actionId].forced) return;
      this.endTask(a);
    } else {
      a.queue = a.queue.filter((t) => t.id !== taskId);
    }
  }

  // ---------------------------------------------------------------------------
  // Simulación
  // ---------------------------------------------------------------------------

  /** Avanza la simulación `minutes` minutos de juego. */
  tick(minutes: number) {
    while (minutes > 0) {
      const dt = Math.min(MAX_STEP, minutes);
      this.step(dt);
      minutes -= dt;
    }
  }

  /** Parcelas que se simulan al detalle: donde hay alguien de la familia del jugador. */
  private detailedLots(): Set<string> {
    const s = new Set<string>();
    for (const m of this.members) if (!m.travel) s.add(m.lotId);
    return s;
  }

  private step(dt: number) {
    const before = this.state.minutes;
    this.state.minutes += dt;
    if (Math.floor(this.state.minutes / MINUTES_PER_DAY) !== Math.floor(before / MINUTES_PER_DAY)) this.newDay();
    const newHour = Math.floor(this.state.minutes / 60) !== Math.floor(before / 60);

    // Llegadas
    for (const a of this.state.agents) {
      if (a.travel && this.state.minutes >= a.travel.arrive) this.arrive(a);
    }

    for (const a of this.state.agents) if (!a.travel) this.checkShift(a);

    const detailed = this.detailedLots();
    for (const a of this.state.agents) {
      if (a.travel) continue;
      if (detailed.has(a.lotId)) {
        if (a.abstract) this.wakeUp(a);
        this.stepAgent(a, dt);
      } else {
        if (!a.abstract) this.goAbstract(a);
        if (newHour) this.abstractHour(a);
      }
    }
    this.applyAuras(dt, detailed);
    if (newHour) this.hourly();
  }

  /** Un vecino pasa a simularse al detalle: se le coloca en un sitio razonable. */
  private wakeUp(a: Agent) {
    a.abstract = false;
    a.current = null;
    a.path = [];
    if (a.home) {
      const h = this.object(a.home);
      if (h) a.pos = { x: h.x, y: h.y };
    } else if (SPECIES[a.species].outdoor) {
      a.pos = { x: 11, y: 6 };
    } else if (this.lotById(a.lotId).kind === 'home' && a.lotId === this.householdOf(a)?.lotId) {
      a.pos = randomIndoorTile();
    } else {
      a.pos = { ...this.layoutOf(a.lotId).entrance };
    }
  }

  private goAbstract(a: Agent) {
    a.abstract = true;
    if (a.current && !ACTIONS[a.current.actionId].forced) a.current = null;
    a.path = [];
    a.queue = [];
    a.hidden = false;
  }

  /** Simulación resumida de una hora: las necesidades se mantienen razonables. */
  private abstractHour(a: Agent) {
    const night = this.hour >= 23 || this.hour < 7;
    for (const k of NEED_KEYS) {
      const target = k === 'energy' && night ? 95 : rand(45, 90);
      a.needs[k] = clamp(a.needs[k] + (target - a.needs[k]) * 0.35);
    }
    if (a.visitUntil && this.state.minutes >= a.visitUntil) this.goHome(a);
  }

  private goHome(a: Agent) {
    a.visitUntil = undefined;
    const home = this.householdOf(a)?.lotId;
    if (home && home !== a.lotId) this.startTravel(a, home);
  }

  private newDay() {
    this.toast(`Empieza el día ${this.day}`, '🌅');
    // Las relaciones se enfrían un poco si no se cuidan.
    for (const rel of Object.values(this.state.rels)) {
      if (!rel.kin && Math.abs(rel.f) > 5) rel.f -= Math.sign(rel.f) * 0.5;
      rel.r = Math.max(0, rel.r - (rel.status ? 0.5 : 1));
    }
    // Facturas, cada lunes.
    if (this.weekday === 0 && this.day > 1) {
      for (const h of this.state.households) {
        const ms = h.memberIds.map((id) => this.agent(id)!).filter(Boolean);
        const bill = 60 + 20 * ms.filter((m) => m.kind === 'person').length + 10 * ms.filter((m) => m.kind === 'pet').length;
        h.funds -= bill;
        if (h.id === this.household.id) {
          this.toast(`Han llegado las facturas de la semana: §${bill}`, '🧾');
          if (h.funds < 0) this.toast('¡Estáis en números rojos!', '⚠️');
        }
      }
    }
    for (const a of this.state.agents) {
      const before = lifeStage(a.species, a.ageDays);
      a.ageDays += 1;
      const after = lifeStage(a.species, a.ageDays);
      if (before.id !== after.id && this.isPlayerMember(a)) this.toast(`¡${a.name} ha crecido! Ahora es ${after.label.toLowerCase()}`, '🎂');
    }
  }

  /** Las capibaras relajan a quien esté cerca. */
  private applyAuras(dt: number, detailed: Set<string>) {
    for (const c of this.state.agents) {
      const r = SPECIES[c.species].calmAura;
      if (!r || c.hidden || c.travel || !detailed.has(c.lotId)) continue;
      for (const o of this.state.agents) {
        if (o === c || o.hidden || o.travel || o.lotId !== c.lotId) continue;
        if (Math.hypot(o.pos.x - c.pos.x, o.pos.y - c.pos.y) <= r) {
          o.needs.fun = clamp(o.needs.fun + 0.13 * dt);
          o.needs.social = clamp(o.needs.social + 0.08 * dt);
        }
      }
    }
  }

  private stepAgent(a: Agent, dt: number) {
    const cur = a.current;
    const curDef = cur ? ACTIONS[cur.actionId] : undefined;
    const acting = cur?.phase === 'acting';
    const mult = acting ? (curDef?.decayMult ?? (cur?.passiveOf ? this.passiveDecay(cur) : 1)) : 1;

    // Bajada de necesidades. En la jaula, la "higiene" baja más rápido cuanto más sucia está.
    const decay = SPECIES[a.species].decay;
    const homeDirt = a.home ? (this.object(a.home)?.dirt ?? 0) : 0;
    for (const k of NEED_KEYS) {
      const extra = k === 'hygiene' ? 1 + homeDirt * 0.6 : 1;
      a.needs[k] = clamp(a.needs[k] - decay[k] * dt * mult * extra);
    }

    this.checkFailures(a);

    // Fin de la visita: ir hacia la salida y volver a casa.
    if (a.visitUntil && this.state.minutes >= a.visitUntil && a.current?.param !== 'leave') {
      this.leave(a);
    }

    if (!a.current) {
      const next = a.queue.shift();
      if (next) {
        this.beginTask(a, next);
      } else {
        const isActive = this.isActive(a);
        const urgent = Math.min(...NEED_KEYS.map((k) => a.needs[k])) < 20;
        if (!isActive || urgent) {
          const choice = chooseAutonomous(this, a, isActive);
          if (choice) this.beginTask(a, { id: this.newId('t'), byPlayer: false, phase: 'walking', remaining: 0, ...choice });
          else if (!isActive) this.idle(a);
        }
      }
    }
    if (a.current) this.runTask(a, a.current, dt);
  }

  private leave(a: Agent) {
    if (a.current?.passiveOf) return; // que termine la conversación
    this.endTask(a);
    a.queue = [];
    const e = this.layoutOf(a.lotId).entrance;
    const ok = this.beginTask(a, { id: this.newId('t'), actionId: 'move', byPlayer: false, phase: 'walking', remaining: 0, dest: { ...e }, param: 'leave' });
    if (!ok) this.goHome(a);
    else if (a.kind === 'person' && a.lotId === this.household.lotId) this.toastOnce(`${a.id}:bye`, `${a.name} se despide y se va a casa`, '👋', 60);
  }

  private passiveDecay(t: Task): number {
    const initiator = this.agent(t.passiveOf);
    const d = initiator?.current ? ACTIONS[initiator.current.actionId] : undefined;
    return d?.decayMult ?? 1;
  }

  private idle(a: Agent) {
    const wanderChance = a.home ? 0 : a.kind === 'pet' ? 0.6 : 0.3;
    const layout = this.layoutOf(a.lotId);
    const grid = this.gridOf(a.lotId);
    if (Math.random() < wanderChance) {
      const cx = Math.round(a.pos.x), cy = Math.round(a.pos.y);
      const outdoors = SPECIES[a.species].outdoor || isOutdoor(layout.tiles[cy]?.[cx]);
      for (let i = 0; i < 8; i++) {
        const x = cx + Math.round(rand(-4, 4)), y = cy + Math.round(rand(-4, 4));
        // Pasea sin cambiar de zona (dentro de casa o en el jardín).
        if (isWalkable(grid, x, y) && isOutdoor(layout.tiles[y][x]) === outdoors) {
          this.beginTask(a, { id: this.newId('t'), actionId: 'move', byPlayer: false, phase: 'walking', remaining: 0, dest: { x, y } });
          return;
        }
      }
    }
    a.current = { id: this.newId('t'), actionId: 'idle', byPlayer: false, phase: 'acting', remaining: rand(5, 15) };
  }

  private checkFailures(a: Agent) {
    if (a.needs.bladder <= 0) {
      a.needs.bladder = 100;
      const home = this.object(a.home);
      if (home) {
        home.dirt = Math.min((home.dirt ?? 0) + 1, (this.objDef(home).maxDirt ?? 5) + 2);
      } else if (!a.hidden) {
        a.needs.hygiene = clamp(a.needs.hygiene - 40);
        this.spawnPuddle(a.lotId, Math.round(a.pos.x), Math.round(a.pos.y));
        this.toastFor(a, a.kind === 'pet' ? `¡${a.name} se ha hecho pis en casa!` : `¡${a.name} se ha hecho pis encima!`, '💦');
      }
    }
    if (a.needs.energy <= 0 && a.current?.actionId !== 'pass_out' && !(a.current && (ACTIONS[a.current.actionId].effects.energy ?? 0) > 0 && a.current.phase === 'acting')) {
      this.endTask(a);
      a.queue = [];
      a.current = { id: this.newId('t'), actionId: 'pass_out', byPlayer: false, phase: 'acting', remaining: ACTIONS.pass_out.duration };
      this.toastFor(a, `${a.name} se ha desplomado de agotamiento`, '😵');
    }
    if (!this.isPlayerMember(a)) return;
    for (const k of ['hunger', 'bladder', 'energy'] as NeedKey[]) {
      const key = `${a.id}:${k}`;
      if (a.needs[k] < 12 && !this.warned.has(key)) {
        this.warned.add(key);
        const msgs: Record<string, string> = {
          hunger: `${a.name} se muere de hambre`,
          bladder: `${a.name} necesita ir al baño ya`,
          energy: `${a.name} está agotado/a`,
        };
        this.toast(msgs[k], '❗');
      } else if (a.needs[k] > 30) {
        this.warned.delete(key);
      }
    }
  }

  private spawnPuddle(lotId: string, x: number, y: number) {
    if (isOutdoor(this.layoutOf(lotId).tiles[y]?.[x])) return;
    if (this.objectAt(lotId, x, y)) return;
    this.state.objects.push({ id: this.newId('o'), def: 'puddle', lotId, x, y });
  }

  // --- Tareas -----------------------------------------------------------------

  private beginTask(a: Agent, task: Task): boolean {
    const def = ACTIONS[task.actionId];
    a.current = task;
    a.path = [];
    task.phase = 'walking';
    const grid = this.gridOf(a.lotId);

    const fail = (reason: string) => {
      a.current = null;
      if (task.byPlayer) this.toast(`${a.name}: ${reason}`, '🚫');
      return false;
    };

    if (def.target === 'self') {
      if (!this.speciesOk(a, def)) return fail('no puede hacer eso');
      task.phase = 'acting';
      task.remaining = def.duration;
      return true;
    }
    if (def.target === 'tile') {
      if (a.home) return fail('vive en su jaula');
      const path = task.dest && findPath(grid, a.pos, task.dest);
      if (!path) return fail('no puede llegar ahí');
      a.path = path;
      return true;
    }
    if (def.target === 'object') {
      const o = this.object(task.targetObjectId);
      if (!o) return fail('ese objeto ya no está');
      const check = this.checkObjectAction(a, o, task.actionId);
      if (!check.ok) return fail(check.reason ?? 'no es posible');
      if (a.home === o.id) {
        // Ya está dentro.
        task.goal = { ...a.pos };
        return true;
      }
      const best = this.bestPath(a, this.interactTiles(o));
      if (!best) return fail('no puede llegar');
      a.path = best.path;
      task.goal = best.goal;
      return true;
    }
    // Social
    const t = this.agent(task.targetAgentId);
    if (!t) return fail('ya no está');
    const check = this.checkSocialAction(a, t, task.actionId);
    if (!check.ok) return fail(check.reason ?? 'no es posible');
    return true;
  }

  /** Termina la tarea actual sin aplicar efectos de finalización. */
  private endTask(a: Agent) {
    a.current = null;
    a.path = [];
    if (a.hidden) {
      a.hidden = false;
      const e = this.layoutOf(a.lotId).entrance;
      a.pos = { x: e.x + (a.kind === 'pet' ? 1 : 0), y: e.y };
    }
  }

  private completeTask(a: Agent, task: Task) {
    const def = ACTIONS[task.actionId];
    const o = this.object(task.targetObjectId);
    if (o) {
      const od = this.objDef(o);
      if (def.refill) o.stock = od.maxStock;
      if (def.dirties) o.dirt = (o.dirt ?? 0) + 1;
      if (def.cleans) {
        o.dirt = 0;
        const resident = this.residentOf(o.id);
        if (resident) resident.needs.hygiene = Math.max(resident.needs.hygiene, 90);
      }
      if (def.removes) this.state.objects = this.state.objects.filter((x) => x.id !== o.id);
      if (task.actionId === 'steal') this.hideObject(a, o);
      if (def.doneToast) this.toastOnce(`${a.id}:${def.id}`, def.doneToast.replace('{name}', a.name).replace('{obj}', od.name.toLowerCase()), def.icon);
    }
    if (task.actionId === 'adopt' && task.param) this.adopt(task.param as SpeciesId);
    if (task.actionId === 'find_job' && task.param) this.setJob(a, task.param);
    if (ACTIONS[task.actionId].target === 'agent' && task.actionId !== 'say_goodbye') {
      const t = this.agent(task.targetAgentId);
      if (t) this.socialOutcome(a, t, task.actionId);
    }
    if (task.actionId === 'squeak') this.callForAttention(a);
    if (task.actionId === 'say_goodbye') {
      const t = this.agent(task.targetAgentId);
      if (t?.visitUntil) {
        // Despide a toda su familia que esté de visita.
        for (const g of this.agentsIn(a.lotId)) if (g.householdId === t.householdId) g.visitUntil = this.state.minutes;
        this.noVisitsUntil = this.state.minutes + 240;
      }
    }
    this.endTask(a);
    if (task.param === 'leave') this.goHome(a);
  }

  private runTask(a: Agent, task: Task, dt: number) {
    const def = ACTIONS[task.actionId];

    if (task.passiveOf) {
      const initiator = this.agent(task.passiveOf);
      const ok = initiator?.current?.targetAgentId === a.id && initiator.current.phase === 'acting';
      task.remaining -= dt;
      if (!ok || task.remaining <= 0) this.endTask(a);
      return;
    }

    if (task.phase === 'walking') {
      if (def.target === 'agent') return this.walkToAgent(a, task, dt);
      if (def.target === 'object' && !this.object(task.targetObjectId)) return this.endTask(a);
      if (!this.moveAlong(a, dt)) return;
      if (def.target === 'tile') return this.completeTask(a, task);
      // Ha llegado al objeto
      const o = this.object(task.targetObjectId)!;
      const check = this.checkObjectAction(a, o, task.actionId);
      if (!check.ok) {
        if (task.byPlayer) this.toast(`${a.name}: ${check.reason}`, '🚫');
        return this.endTask(a);
      }
      const hh = this.householdOf(a);
      if (def.cost && hh) hh.funds -= def.cost;
      if (def.consumes) o.stock = Math.max(0, (o.stock ?? 0) - 1);
      task.phase = 'acting';
      task.remaining = def.duration;
      this.face(a, objectCenter(o));
      return;
    }

    if (task.phase === 'waiting') {
      return this.walkToAgent(a, task, dt);
    }

    // Actuando
    let partner: Agent | undefined;
    if (def.target === 'agent') {
      partner = this.agent(task.targetAgentId);
      if (!partner || partner.current?.passiveOf !== a.id) return this.endTask(a);
    }
    this.applyEffects(a, def.effects, dt);
    if (partner && def.partnerEffects) this.applyEffects(partner, def.partnerEffects, dt);
    task.remaining -= dt;
    if (task.remaining <= 0 || this.isSatisfied(a, def)) {
      if (def.offLot && partner) {
        this.endTask(partner);
      }
      this.completeTask(a, task);
    }
  }

  private applyEffects(a: Agent, effects: Partial<Needs>, dt: number) {
    for (const k of NEED_KEYS) {
      const e = effects[k];
      if (e) a.needs[k] = clamp(a.needs[k] + e * dt);
    }
  }

  private isSatisfied(a: Agent, def: ActionDef): boolean {
    const until = def.until;
    if (!until) return false;
    if (until === 'full') {
      const ups = NEED_KEYS.filter((k) => (def.effects[k] ?? 0) > 0);
      return ups.length > 0 && ups.every((k) => a.needs[k] >= 99.5);
    }
    return NEED_KEYS.every((k) => until[k] === undefined || a.needs[k] >= until[k]);
  }

  // --- Comportamientos especiales --------------------------------------------

  private nearestHammock(lotId: string, p: Vec): PlacedObject | undefined {
    let best: PlacedObject | undefined;
    for (const o of this.objectsIn(lotId)) {
      if (o.def !== 'hammock') continue;
      if (!best || Math.hypot(o.x - p.x, o.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) best = o;
    }
    return best;
  }

  private nearHammock(o: PlacedObject): boolean {
    const h = this.nearestHammock(o.lotId, o);
    return !!h && Math.hypot(h.x - o.x, h.y - o.y) <= 2.5;
  }

  /** El hurón esconde lo que ha robado cerca de su hamaca. */
  private hideObject(ferret: Agent, o: PlacedObject) {
    const layout = this.layoutOf(o.lotId);
    const grid = this.gridOf(o.lotId);
    const h = this.nearestHammock(o.lotId, ferret.pos) ?? { x: Math.round(ferret.pos.x), y: Math.round(ferret.pos.y) };
    const spots: Vec[] = [];
    for (let y = h.y - 2; y <= h.y + 2; y++) {
      for (let x = h.x - 2; x <= h.x + 2; x++) {
        if (isWalkable(grid, x, y) && !this.objectAt(o.lotId, x, y) && !isOutdoor(layout.tiles[y][x])) spots.push({ x, y });
      }
    }
    if (!spots.length) return;
    const s = spots[Math.floor(Math.random() * spots.length)];
    o.x = s.x;
    o.y = s.y;
    const what: Record<string, string> = { ball: 'la pelota', slippers: 'las zapatillas' };
    if (this.isPlayerMember(ferret)) this.toastOnce(`${ferret.id}:steal`, `¡${ferret.name} ha escondido ${what[o.def] ?? this.objDef(o).name.toLowerCase()}!`, '🫣', 120);
  }

  /** La cobaya chilla y alguien de su familia viene a hacerle caso. */
  private callForAttention(pet: Agent) {
    let best: { p: Agent; d: number } | null = null;
    for (const p of this.agentsIn(pet.lotId)) {
      if (p.kind !== 'person' || p.householdId !== pet.householdId || p.hidden || this.isActive(p) || p.queue.length) continue;
      const c = p.current;
      if (c && (c.byPlayer || c.passiveOf || !ACTIONS[c.actionId].interruptible)) continue;
      const d = Math.hypot(p.pos.x - pet.pos.x, p.pos.y - pet.pos.y);
      if (!best || d < best.d) best = { p, d };
    }
    if (!best) {
      if (this.isPlayerMember(pet)) this.toastOnce(`${pet.id}:squeak`, `${pet.name} chilla pidiendo atención`, '📣', 240);
      return;
    }
    this.endTask(best.p);
    this.beginTask(best.p, { id: this.newId('t'), actionId: 'pet_animal', byPlayer: false, phase: 'walking', remaining: 0, targetAgentId: pet.id });
  }

  // --- Interacción entre agentes --------------------------------------------

  private canEngage(actor: Agent, actorTask: Task, t: Agent): boolean {
    if (t.hidden || t.travel || t.lotId !== actor.lotId) return false;
    const tc = t.current;
    if (!tc) return true;
    if (tc.byPlayer || tc.passiveOf || tc.param === 'leave') return false;
    const d = ACTIONS[tc.actionId];
    if (d.forced) return false;
    if (d.interruptible) return true;
    // Una orden del jugador puede interrumpir cualquier cosa que el otro haga por su cuenta.
    return actorTask.byPlayer;
  }

  private walkToAgent(a: Agent, task: Task, dt: number) {
    const t = this.agent(task.targetAgentId);
    if (!t || t.travel || t.lotId !== a.lotId) return this.endTask(a);
    const def = ACTIONS[task.actionId];
    const dist = Math.hypot(t.pos.x - a.pos.x, t.pos.y - a.pos.y);

    if (dist <= 1.6 && !t.hidden) {
      a.path = [];
      // Para despedir a alguien basta con acercarse: no hace falta que deje lo que hace.
      if (task.actionId === 'say_goodbye') {
        this.face(a, t.pos);
        return this.completeTask(a, task);
      }
      if (this.canEngage(a, task, t)) {
        // Los gatos no siempre están de humor (salvo si los controla el jugador).
        const aloof = SPECIES[t.species].aloof ?? 0;
        if (aloof && a.kind === 'person' && !this.isActive(t) && Math.random() < aloof) {
          if (task.byPlayer) this.toast(`${t.name} no está de humor 😾`, '🐈');
          return this.endTask(a);
        }
        if (!this.accepts(a, t, task.actionId)) return this.endTask(a);
        if (task.actionId === 'flirt' || task.actionId === 'kiss') this.jealousy(a, t);
        this.endTask(t);
        t.current = { id: this.newId('t'), actionId: task.actionId, byPlayer: false, phase: 'acting', remaining: def.duration + 5, passiveOf: a.id };
        t.path = [];
        task.phase = 'acting';
        task.remaining = def.duration;
        this.face(a, t.pos);
        if (!t.home) this.face(t, a.pos);
        if (def.offLot) {
          const e = this.layoutOf(a.lotId).entrance;
          a.hidden = t.hidden = true;
          a.pos = { ...e };
          t.pos = { ...e };
        }
        return;
      }
      // Ocupado: esperar un rato.
      if (task.phase !== 'waiting') {
        task.phase = 'waiting';
        task.remaining = 20;
      }
      task.remaining -= dt;
      if (task.remaining <= 0) {
        if (task.byPlayer) this.toast(`${t.name} está ocupado/a`, '⏳');
        this.endTask(a);
      }
      return;
    }

    task.phase = 'walking';
    if (t.hidden) {
      task.remaining -= dt;
      if (task.remaining < -30) this.endTask(a);
      return;
    }
    const tx = Math.round(t.pos.x), ty = Math.round(t.pos.y);
    const needReplan = !task.goal || Math.hypot(task.goal.x - tx, task.goal.y - ty) > 1.5 || a.path.length === 0;
    if (needReplan) {
      const best = this.bestPath(a, this.neighbours(a.lotId, tx, ty));
      if (!best) {
        if (task.byPlayer) this.toast(`${a.name} no puede llegar hasta ${t.name}`, '🚫');
        return this.endTask(a);
      }
      a.path = best.path;
      task.goal = best.goal;
    }
    this.moveAlong(a, dt);
  }

  /** ¿Acepta `t` la interacción? Si no, rechazo: baja la relación y avisa. */
  private accepts(a: Agent, t: Agent, actionId: string): boolean {
    if (Math.random() < acceptChance(this.state, a, t, actionId)) return true;
    changeRel(this.state, a.id, t.id, -3, ROMANTIC.has(actionId) ? -5 : 0);
    a.needs.social = clamp(a.needs.social - 10);
    a.needs.fun = clamp(a.needs.fun - 5);
    const text = REJECT_TEXT[actionId] ?? 'ha rechazado a';
    if (this.isPlayerMember(a) || this.isPlayerMember(t)) this.toast(`${t.name} ${text} ${a.name}`, '😳');
    return false;
  }

  /** Coquetear delante de la pareja tiene consecuencias. */
  private jealousy(a: Agent, t: Agent) {
    for (const [who, other] of [[a, t], [t, a]] as const) {
      const pid = partnerOf(this.state, who.id);
      if (!pid || pid === other.id) continue;
      const p = this.agent(pid);
      if (!p || p.lotId !== who.lotId || p.travel || p.hidden) continue;
      changeRel(this.state, who.id, p.id, -12, -15);
      changeRel(this.state, other.id, p.id, -10, 0);
      if (this.isPlayerMember(who) || this.isPlayerMember(p)) this.toast(`¡${p.name} ha pillado a ${who.name} coqueteando con ${other.name}!`, '😠');
    }
  }

  /** Efectos de las interacciones sociales en la relación (y parejas, bodas, mudanzas). */
  private socialOutcome(a: Agent, t: Agent, actionId: string) {
    const eff = REL_EFFECTS[actionId];
    if (eff) changeRel(this.state, a.id, t.id, eff[0], eff[1]);
    const key = relKey(a.id, t.id);
    const rel = this.state.rels[key];
    const loud = this.isPlayerMember(a) || this.isPlayerMember(t);
    if (actionId === 'ask_partner' && rel) {
      // Si `t` tenía pareja, la deja.
      const ex = partnerOf(this.state, t.id);
      if (ex && ex !== a.id) {
        const exRel = this.state.rels[relKey(t.id, ex)];
        if (exRel) exRel.status = undefined;
        changeRel(this.state, t.id, ex, -30, -40);
        if (loud) this.toast(`${t.name} ha roto con ${this.agent(ex)?.name ?? 'su pareja'}`, '💔');
      }
      rel.status = 'partner';
      if (loud) this.toast(`¡${a.name} y ${t.name} ahora son pareja!`, '💘');
    }
    if (actionId === 'propose' && rel) {
      rel.status = 'married';
      if (loud) this.toast(`¡${a.name} y ${t.name} se casan!`, '💍');
    }
    if (actionId === 'move_in') this.moveIn(t);
    if (actionId === 'insult' && loud) this.toastOnce(`${key}:insult`, `${a.name} y ${t.name} han discutido`, '🤬', 120);
  }

  // --- Movimiento ------------------------------------------------------------

  private face(a: Agent, p: Vec) {
    const sx = p.x - p.y - (a.pos.x - a.pos.y);
    if (Math.abs(sx) > 0.01) a.facing = sx > 0 ? 1 : -1;
  }

  /** Mueve al agente por su ruta. Devuelve true al llegar. */
  private moveAlong(a: Agent, dt: number): boolean {
    let budget = SPECIES[a.species].speed * dt;
    while (budget > 0 && a.path.length) {
      const next = a.path[0];
      const dx = next.x - a.pos.x, dy = next.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      this.face(a, next);
      if (d <= budget) {
        a.pos = { x: next.x, y: next.y };
        a.path.shift();
        budget -= d;
      } else {
        a.pos = { x: a.pos.x + (dx / d) * budget, y: a.pos.y + (dy / d) * budget };
        budget = 0;
      }
    }
    return a.path.length === 0;
  }

  private neighbours(lotId: string, x: number, y: number): Vec[] {
    const grid = this.gridOf(lotId);
    const out: Vec[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      if (isWalkable(grid, x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
    }
    return out;
  }

  /** Casillas desde las que se puede usar un objeto. */
  interactTiles(o: PlacedObject): Vec[] {
    const d = this.objDef(o);
    if (d.walkable) return [{ x: o.x, y: o.y }];
    const grid = this.gridOf(o.lotId);
    const out: Vec[] = [];
    for (let y = o.y - 1; y <= o.y + d.h; y++) {
      for (let x = o.x - 1; x <= o.x + d.w; x++) {
        const inside = x >= o.x && x < o.x + d.w && y >= o.y && y < o.y + d.h;
        const diagonal = (x < o.x || x >= o.x + d.w) && (y < o.y || y >= o.y + d.h);
        if (!inside && !diagonal && isWalkable(grid, x, y)) out.push({ x, y });
      }
    }
    return out;
  }

  private bestPath(a: Agent, tiles: Vec[]): { path: Vec[]; goal: Vec } | null {
    const grid = this.gridOf(a.lotId);
    let best: { path: Vec[]; goal: Vec; len: number } | null = null;
    for (const goal of tiles) {
      const path = findPath(grid, a.pos, goal);
      if (!path) continue;
      const len = pathLength(path, a.pos);
      if (!best || len < best.len) best = { path, goal, len };
    }
    return best;
  }
}
