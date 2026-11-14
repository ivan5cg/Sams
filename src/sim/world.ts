import { ACTIONS, SELF_ACTIONS, type ActionDef } from '../data/actions';
import { ENTRANCE, START_OBJECTS, parseLot, type LotLayout } from '../data/lot';
import { OBJECTS, type ObjectDef } from '../data/objects';
import { SPECIES, lifeStage } from '../data/species';
import { chooseAutonomous } from './ai';
import { findPath, isWalkable, pathLength, type Grid } from './pathfinding';
import { NEED_KEYS, type Agent, type NeedKey, type Needs, type PlacedObject, type SpeciesId, type Task, type Vec, type WorldState } from './types';

export const SAVE_VERSION = 2;
export const MINUTES_PER_DAY = 1440;
export const MAX_MEMBERS = 8;
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
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randomNeeds = (): Needs => Object.fromEntries(NEED_KEYS.map((k) => [k, Math.round(rand(55, 90))])) as Needs;

/** Centro de un objeto en coordenadas de casilla. */
export function objectCenter(o: PlacedObject): Vec {
  const d = OBJECTS[o.def];
  return { x: o.x + (d.w - 1) / 2, y: o.y + (d.h - 1) / 2 };
}

export class World {
  state: WorldState;
  readonly lot: LotLayout;
  grid: Grid = [];
  private toastListeners: ((t: Toast) => void)[] = [];
  private warned = new Set<string>();
  private lastToast = new Map<string, number>();

  constructor(state: WorldState) {
    this.state = state;
    this.lot = parseLot();
    this.rebuildGrid();
  }

  // ---------------------------------------------------------------------------
  // Creación
  // ---------------------------------------------------------------------------

  static createNew(): World {
    const mk = (id: string, name: string, species: SpeciesId, ageDays: number, color: number, x: number, y: number): Agent => ({
      id, name, species, ageDays, color,
      kind: SPECIES[species].kind,
      householdId: 'h1',
      needs: randomNeeds(),
      pos: { x, y },
      path: [],
      queue: [],
      current: null,
      facing: 1,
      hidden: false,
    });
    const agents = [
      mk('a1', 'Lucía', 'human', 24, 0xe0607e, 6, 4),
      mk('a2', 'Mateo', 'human', 27, 0x4f8fd9, 7, 5),
      mk('a3', 'Toby', 'dog', 9, 0xc68642, 3, 7),
      mk('a4', 'Misi', 'cat', 12, 0x9a9a9a, 4, 5),
    ];
    const objects: PlacedObject[] = START_OBJECTS.map((o, i) => ({
      id: `o${i + 1}`,
      ...o,
      ...(OBJECTS[o.def].maxStock ? { stock: 2 } : {}),
      ...(OBJECTS[o.def].maxDirt ? { dirt: 0 } : {}),
    }));
    return new World({
      version: SAVE_VERSION,
      minutes: 8 * 60,
      speed: 1,
      nextId: 100,
      playerHouseholdId: 'h1',
      activeAgentId: 'a1',
      households: [{ id: 'h1', name: 'Familia García', funds: 2000, memberIds: agents.map((a) => a.id) }],
      agents,
      objects,
    });
  }

  // ---------------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------------

  get household() {
    return this.state.households.find((h) => h.id === this.state.playerHouseholdId)!;
  }

  get members(): Agent[] {
    return this.household.memberIds.map((id) => this.agent(id)!).filter(Boolean);
  }

  get activeAgent(): Agent {
    return this.agent(this.state.activeAgentId) ?? this.members[0];
  }

  get day(): number {
    return Math.floor(this.state.minutes / MINUTES_PER_DAY) + 1;
  }

  get clock(): string {
    const m = Math.floor(this.state.minutes % MINUTES_PER_DAY);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
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

  objectAt(x: number, y: number): PlacedObject | undefined {
    // Los objetos sólidos tienen prioridad sobre los transitables (charcos, pelota).
    const hits = this.state.objects.filter((o) => {
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

  private newId(prefix: string) {
    return `${prefix}${this.state.nextId++}`;
  }

  rebuildGrid() {
    const { w, h, tiles } = this.lot;
    this.grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => tiles[y][x] !== 'wall'));
    for (const o of this.state.objects) {
      const d = this.objDef(o);
      if (d.walkable) continue;
      for (let y = o.y; y < o.y + d.h; y++) for (let x = o.x; x < o.x + d.w; x++) if (this.grid[y]) this.grid[y][x] = false;
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
    if (a.home && a.home !== o.id) return { def, ok: false, reason: 'No puede salir de su jaula' };
    const resident = this.residentOf(o.id);
    if (resident && def.actors.includes('pet') && resident !== a) return { def, ok: false, reason: `Es la casa de ${resident.name}` };
    if (this.usersOf(o.id, a).length >= od.capacity) return { def, ok: false, reason: 'Ocupado' };
    if (def.consumes && !o.stock) return { def, ok: false, reason: 'Está vacío' };
    if (def.refill && (o.stock ?? 0) >= (od.maxStock ?? 0)) return { def, ok: false, reason: 'Ya está lleno' };
    if (def.dirties && od.maxDirt && (o.dirt ?? 0) >= od.maxDirt) return { def, ok: false, reason: 'Está demasiado sucio' };
    if (def.cleans && !o.dirt) return { def, ok: false, reason: 'Ya está limpio' };
    if (actionId === 'steal' && this.nearHammock(o)) return { def, ok: false, reason: 'Ya está escondido' };
    if (actionId === 'adopt' && this.members.length >= MAX_MEMBERS) return { def, ok: false, reason: 'La casa está llena' };
    if (def.cost && this.household.funds < def.cost) return { def, ok: false, reason: 'No hay dinero' };
    return { def, ok: true };
  }

  checkSocialAction(a: Agent, t: Agent, actionId: string): ActionOption {
    const def = ACTIONS[actionId];
    if (!this.speciesOk(a, def) || !def.targetKinds?.includes(t.kind)) return { def, ok: false };
    if (def.targetSpecies && !def.targetSpecies.includes(t.species)) return { def, ok: false };
    if (a.home) return { def, ok: false, reason: 'No puede salir de su jaula' };
    if (t.home && def.offLot) return { def, ok: false };
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
    return this.state.objects.find((o) => o.def === defId && !this.residentOf(o.id));
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
    const pet: Agent = {
      id: this.newId('a'),
      name,
      species,
      kind: 'pet',
      householdId: this.household.id,
      ageDays: Math.round(rand(sp.stages[0].until, sp.stages[0].until + 5)),
      color: 0x999999,
      needs: randomNeeds(),
      pos: sp.outdoor ? { x: 11, y: 6 } : { ...ENTRANCE },
      path: [],
      queue: [],
      current: null,
      facing: 1,
      hidden: false,
    };
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
  // Órdenes del jugador
  // ---------------------------------------------------------------------------

  setActive(id: string) {
    if (this.household.memberIds.includes(id)) this.state.activeAgentId = id;
  }

  command(agentId: string, actionId: string, target: Target, param?: string): boolean {
    const a = this.agent(agentId);
    if (!a) return false;
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

  private step(dt: number) {
    const dayBefore = this.day;
    this.state.minutes += dt;
    if (this.day !== dayBefore) this.newDay();
    for (const a of this.state.agents) this.stepAgent(a, dt);
    this.applyAuras(dt);
  }

  private newDay() {
    this.toast(`Empieza el día ${this.day}`, '🌅');
    for (const a of this.state.agents) {
      const before = lifeStage(a.species, a.ageDays);
      a.ageDays += 1;
      const after = lifeStage(a.species, a.ageDays);
      if (before.id !== after.id) this.toast(`¡${a.name} ha crecido! Ahora es ${after.label.toLowerCase()}`, '🎂');
    }
  }

  /** Las capibaras relajan a quien esté cerca. */
  private applyAuras(dt: number) {
    for (const c of this.state.agents) {
      const r = SPECIES[c.species].calmAura;
      if (!r || c.hidden) continue;
      for (const o of this.state.agents) {
        if (o === c || o.hidden) continue;
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

  private passiveDecay(t: Task): number {
    const initiator = this.agent(t.passiveOf);
    const d = initiator?.current ? ACTIONS[initiator.current.actionId] : undefined;
    return d?.decayMult ?? 1;
  }

  private idle(a: Agent) {
    const wanderChance = a.home ? 0 : a.kind === 'pet' ? 0.6 : 0.3;
    if (Math.random() < wanderChance) {
      const cx = Math.round(a.pos.x), cy = Math.round(a.pos.y);
      const outdoors = SPECIES[a.species].outdoor || this.lot.tiles[cy]?.[cx] === 'grass';
      for (let i = 0; i < 8; i++) {
        const x = cx + Math.round(rand(-4, 4)), y = cy + Math.round(rand(-4, 4));
        // Pasea sin cambiar de zona (dentro de casa o en el jardín).
        if (isWalkable(this.grid, x, y) && (this.lot.tiles[y][x] === 'grass') === outdoors) {
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
        this.spawnPuddle(Math.round(a.pos.x), Math.round(a.pos.y));
        this.toast(a.kind === 'pet' ? `¡${a.name} se ha hecho pis en casa!` : `¡${a.name} se ha hecho pis encima!`, '💦');
      }
    }
    if (a.needs.energy <= 0 && a.current?.actionId !== 'pass_out' && !(a.current && (ACTIONS[a.current.actionId].effects.energy ?? 0) > 0 && a.current.phase === 'acting')) {
      this.endTask(a);
      a.queue = [];
      a.current = { id: this.newId('t'), actionId: 'pass_out', byPlayer: false, phase: 'acting', remaining: ACTIONS.pass_out.duration };
      this.toast(`${a.name} se ha desplomado de agotamiento`, '😵');
    }
    for (const k of ['hunger', 'bladder', 'energy'] as NeedKey[]) {
      const key = `${a.id}:${k}`;
      if (a.needs[k] < 12 && !this.warned.has(key) && this.household.memberIds.includes(a.id)) {
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

  private spawnPuddle(x: number, y: number) {
    if (this.lot.tiles[y]?.[x] === 'grass') return;
    if (this.objectAt(x, y)) return;
    this.state.objects.push({ id: this.newId('o'), def: 'puddle', x, y });
  }

  // --- Tareas -----------------------------------------------------------------

  private beginTask(a: Agent, task: Task): boolean {
    const def = ACTIONS[task.actionId];
    a.current = task;
    a.path = [];
    task.phase = 'walking';

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
      const path = task.dest && findPath(this.grid, a.pos, task.dest);
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
      a.pos = { x: ENTRANCE.x + (a.kind === 'pet' ? 1 : 0), y: ENTRANCE.y };
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
    if (task.actionId === 'squeak') this.callForAttention(a);
    this.endTask(a);
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
      if (def.cost) this.household.funds -= def.cost;
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

  private nearestHammock(p: Vec): PlacedObject | undefined {
    let best: PlacedObject | undefined;
    for (const o of this.state.objects) {
      if (o.def !== 'hammock') continue;
      if (!best || Math.hypot(o.x - p.x, o.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) best = o;
    }
    return best;
  }

  private nearHammock(o: PlacedObject): boolean {
    const h = this.nearestHammock(o);
    return !!h && Math.hypot(h.x - o.x, h.y - o.y) <= 2.5;
  }

  /** El hurón esconde lo que ha robado cerca de su hamaca. */
  private hideObject(ferret: Agent, o: PlacedObject) {
    const h = this.nearestHammock(ferret.pos) ?? { x: Math.round(ferret.pos.x), y: Math.round(ferret.pos.y) };
    const spots: Vec[] = [];
    for (let y = h.y - 2; y <= h.y + 2; y++) {
      for (let x = h.x - 2; x <= h.x + 2; x++) {
        if (isWalkable(this.grid, x, y) && !this.objectAt(x, y) && this.lot.tiles[y][x] !== 'grass') spots.push({ x, y });
      }
    }
    if (!spots.length) return;
    const s = spots[Math.floor(Math.random() * spots.length)];
    o.x = s.x;
    o.y = s.y;
    const what: Record<string, string> = { ball: 'la pelota', slippers: 'las zapatillas' };
    this.toastOnce(`${ferret.id}:steal`, `¡${ferret.name} ha escondido ${what[o.def] ?? this.objDef(o).name.toLowerCase()}!`, '🫣', 120);
  }

  /** La cobaya chilla y alguien de la familia viene a hacerle caso. */
  private callForAttention(pet: Agent) {
    let best: { p: Agent; d: number } | null = null;
    for (const p of this.members) {
      if (p.kind !== 'person' || p.hidden || this.isActive(p) || p.queue.length) continue;
      const c = p.current;
      if (c && (c.byPlayer || c.passiveOf || !ACTIONS[c.actionId].interruptible)) continue;
      const d = Math.hypot(p.pos.x - pet.pos.x, p.pos.y - pet.pos.y);
      if (!best || d < best.d) best = { p, d };
    }
    if (!best) {
      this.toastOnce(`${pet.id}:squeak`, `${pet.name} chilla pidiendo atención`, '📣', 240);
      return;
    }
    this.endTask(best.p);
    this.beginTask(best.p, { id: this.newId('t'), actionId: 'pet_animal', byPlayer: false, phase: 'walking', remaining: 0, targetAgentId: pet.id });
  }

  // --- Interacción entre agentes --------------------------------------------

  private canEngage(actor: Agent, actorTask: Task, t: Agent): boolean {
    if (t.hidden) return false;
    const tc = t.current;
    if (!tc) return true;
    if (tc.byPlayer || tc.passiveOf) return false;
    const d = ACTIONS[tc.actionId];
    if (d.forced) return false;
    if (d.interruptible) return true;
    // Una orden del jugador puede interrumpir cualquier cosa que el otro haga por su cuenta.
    return actorTask.byPlayer && actor.householdId === t.householdId;
  }

  private walkToAgent(a: Agent, task: Task, dt: number) {
    const t = this.agent(task.targetAgentId);
    if (!t) return this.endTask(a);
    const def = ACTIONS[task.actionId];
    const dist = Math.hypot(t.pos.x - a.pos.x, t.pos.y - a.pos.y);

    if (dist <= 1.6 && !t.hidden) {
      a.path = [];
      if (this.canEngage(a, task, t)) {
        // Los gatos no siempre están de humor (salvo si los controla el jugador).
        const aloof = SPECIES[t.species].aloof ?? 0;
        if (aloof && a.kind === 'person' && !this.isActive(t) && Math.random() < aloof) {
          if (task.byPlayer) this.toast(`${t.name} no está de humor 😾`, '🐈');
          return this.endTask(a);
        }
        this.endTask(t);
        t.current = { id: this.newId('t'), actionId: task.actionId, byPlayer: false, phase: 'acting', remaining: def.duration + 5, passiveOf: a.id };
        t.path = [];
        task.phase = 'acting';
        task.remaining = def.duration;
        this.face(a, t.pos);
        if (!t.home) this.face(t, a.pos);
        if (def.offLot) {
          a.hidden = t.hidden = true;
          a.pos = { ...ENTRANCE };
          t.pos = { ...ENTRANCE };
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
      const best = this.bestPath(a, this.neighbours(tx, ty));
      if (!best) {
        if (task.byPlayer) this.toast(`${a.name} no puede llegar hasta ${t.name}`, '🚫');
        return this.endTask(a);
      }
      a.path = best.path;
      task.goal = best.goal;
    }
    this.moveAlong(a, dt);
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

  private neighbours(x: number, y: number): Vec[] {
    const out: Vec[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      if (isWalkable(this.grid, x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
    }
    return out;
  }

  /** Casillas desde las que se puede usar un objeto. */
  interactTiles(o: PlacedObject): Vec[] {
    const d = this.objDef(o);
    if (d.walkable) return [{ x: o.x, y: o.y }];
    const out: Vec[] = [];
    for (let y = o.y - 1; y <= o.y + d.h; y++) {
      for (let x = o.x - 1; x <= o.x + d.w; x++) {
        const inside = x >= o.x && x < o.x + d.w && y >= o.y && y < o.y + d.h;
        const diagonal = (x < o.x || x >= o.x + d.w) && (y < o.y || y >= o.y + d.h);
        if (!inside && !diagonal && isWalkable(this.grid, x, y)) out.push({ x, y });
      }
    }
    return out;
  }

  private bestPath(a: Agent, tiles: Vec[]): { path: Vec[]; goal: Vec } | null {
    let best: { path: Vec[]; goal: Vec; len: number } | null = null;
    for (const goal of tiles) {
      const path = findPath(this.grid, a.pos, goal);
      if (!path) continue;
      const len = pathLength(path, a.pos);
      if (!best || len < best.len) best = { path, goal, len };
    }
    return best;
  }
}
