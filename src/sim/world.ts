import { ACTIONS, type ActionDef } from '../data/actions';
import { ENTRANCE, START_OBJECTS, parseLot, type LotLayout } from '../data/lot';
import { OBJECTS, type ObjectDef } from '../data/objects';
import { SPECIES, lifeStage } from '../data/species';
import { chooseAutonomous } from './ai';
import { findPath, isWalkable, pathLength, type Grid } from './pathfinding';
import { NEED_KEYS, type Agent, type NeedKey, type Needs, type PlacedObject, type Task, type Vec, type WorldState } from './types';

export const SAVE_VERSION = 1;
export const MINUTES_PER_DAY = 1440;
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

export class World {
  state: WorldState;
  readonly lot: LotLayout;
  grid: Grid = [];
  private toastListeners: ((t: Toast) => void)[] = [];
  private warned = new Set<string>();

  constructor(state: WorldState) {
    this.state = state;
    this.lot = parseLot();
    this.rebuildGrid();
  }

  // ---------------------------------------------------------------------------
  // Creación
  // ---------------------------------------------------------------------------

  static createNew(): World {
    const needs = (): Needs =>
      Object.fromEntries(NEED_KEYS.map((k) => [k, Math.round(rand(55, 90))])) as Needs;
    const mk = (id: string, name: string, species: Agent['species'], ageDays: number, color: number, x: number, y: number): Agent => ({
      id, name, species, ageDays, color,
      kind: SPECIES[species].kind,
      householdId: 'h1',
      needs: needs(),
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
    ];
    const objects: PlacedObject[] = START_OBJECTS.map((o, i) => ({
      id: `o${i + 1}`,
      ...o,
      ...(OBJECTS[o.def].maxStock ? { stock: 2 } : {}),
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

  onToast(fn: (t: Toast) => void) {
    this.toastListeners.push(fn);
  }

  toast(text: string, icon?: string) {
    for (const fn of this.toastListeners) fn({ text, icon });
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

  checkObjectAction(a: Agent, o: PlacedObject, actionId: string): ActionOption {
    const def = ACTIONS[actionId];
    const od = this.objDef(o);
    if (!def.actors.includes(a.kind)) return { def, ok: false, reason: `${a.name} no puede hacer esto` };
    if (this.usersOf(o.id, a).length >= od.capacity) return { def, ok: false, reason: 'Ocupado' };
    if (actionId === 'pet_eat' && !o.stock) return { def, ok: false, reason: 'El comedero está vacío' };
    if (actionId === 'fill_bowl' && (o.stock ?? 0) >= (od.maxStock ?? 0)) return { def, ok: false, reason: 'Ya está lleno' };
    if (def.cost && this.household.funds < def.cost) return { def, ok: false, reason: 'No hay dinero' };
    return { def, ok: true };
  }

  checkSocialAction(a: Agent, t: Agent, actionId: string): ActionOption {
    const def = ACTIONS[actionId];
    if (!def.actors.includes(a.kind) || !def.targetKinds?.includes(t.kind)) return { def, ok: false };
    if (def.targetSpecies && !def.targetSpecies.includes(t.species)) return { def, ok: false };
    if (t.hidden) return { def, ok: false, reason: `${t.name} no está en casa` };
    return { def, ok: true };
  }

  /** Opciones para el menú de acciones del agente activo sobre un objetivo. */
  optionsFor(agentId: string, target: Target): ActionOption[] {
    const a = this.agent(agentId);
    if (!a) return [];
    if (target.kind === 'object') {
      const o = this.object(target.id);
      if (!o) return [];
      return this.objDef(o)
        .actions.filter((id) => ACTIONS[id].actors.includes(a.kind))
        .map((id) => this.checkObjectAction(a, o, id));
    }
    if (target.kind === 'agent') {
      const t = this.agent(target.id);
      if (!t || t === a) return [];
      return Object.values(ACTIONS)
        .filter((d) => d.target === 'agent')
        .map((d) => this.checkSocialAction(a, t, d.id))
        .filter((o) => o.ok || o.reason);
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Órdenes del jugador
  // ---------------------------------------------------------------------------

  setActive(id: string) {
    if (this.household.memberIds.includes(id)) this.state.activeAgentId = id;
  }

  command(agentId: string, actionId: string, target: Target): boolean {
    const a = this.agent(agentId);
    if (!a) return false;
    const task: Task = { id: this.newId('t'), actionId, byPlayer: true, phase: 'walking', remaining: 0 };
    if (target.kind === 'object') task.targetObjectId = target.id;
    else if (target.kind === 'agent') task.targetAgentId = target.id;
    else task.dest = { x: target.x, y: target.y };

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

  private stepAgent(a: Agent, dt: number) {
    const cur = a.current;
    const curDef = cur ? ACTIONS[cur.actionId] : undefined;
    const acting = cur?.phase === 'acting';
    const mult = acting ? (curDef?.decayMult ?? (cur?.passiveOf ? this.passiveDecay(cur) : 1)) : 1;

    // Bajada de necesidades
    const decay = SPECIES[a.species].decay;
    for (const k of NEED_KEYS) a.needs[k] = clamp(a.needs[k] - decay[k] * dt * mult);

    this.checkFailures(a);

    if (!a.current) {
      const next = a.queue.shift();
      if (next) {
        this.beginTask(a, next);
      } else {
        const isActive = a.id === this.state.activeAgentId && this.household.memberIds.includes(a.id);
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
    const wanderChance = a.kind === 'pet' ? 0.6 : 0.3;
    if (Math.random() < wanderChance) {
      const cx = Math.round(a.pos.x), cy = Math.round(a.pos.y);
      const outdoors = this.lot.tiles[cy]?.[cx] === 'grass';
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
      if (!a.hidden) {
        a.needs.hygiene = clamp(a.needs.hygiene - 40);
        this.spawnPuddle(Math.round(a.pos.x), Math.round(a.pos.y));
        this.toast(a.kind === 'pet' ? `¡${a.name} se ha hecho pis en casa!` : `¡${a.name} se ha hecho pis encima!`, '💦');
      }
    }
    if (a.needs.energy <= 0 && a.current?.actionId !== 'pass_out' && !(a.current && ACTIONS[a.current.actionId].effects.energy! > 0 && a.current.phase === 'acting')) {
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
      task.phase = 'acting';
      task.remaining = def.duration;
      return true;
    }
    if (def.target === 'tile') {
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
    if (task.actionId === 'fill_bowl') {
      const o = this.object(task.targetObjectId);
      if (o) o.stock = this.objDef(o).maxStock;
    }
    if (task.actionId === 'clean') {
      this.state.objects = this.state.objects.filter((o) => o.id !== task.targetObjectId);
    }
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
      if (task.actionId === 'pet_eat') o.stock = Math.max(0, (o.stock ?? 0) - 1);
      task.phase = 'acting';
      task.remaining = def.duration;
      const d = this.objDef(o);
      const cx = o.x + (d.w - 1) / 2, cy = o.y + (d.h - 1) / 2;
      this.face(a, { x: cx, y: cy });
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
        this.endTask(t);
        t.current = { id: this.newId('t'), actionId: task.actionId, byPlayer: false, phase: 'acting', remaining: def.duration + 5, passiveOf: a.id };
        t.path = [];
        task.phase = 'acting';
        task.remaining = def.duration;
        this.face(a, t.pos);
        this.face(t, a.pos);
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
