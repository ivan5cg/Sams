import { ACTIONS, SELF_ACTIONS, type ActionDef } from '../data/actions';
import { EXPANSIONS, HOUSE_OBJECTS, HOUSE_SIZES, LAYOUTS, isOutdoor, type LotLayout } from '../data/lot';
import { OBJECTS, QUALITY, SELL_RATIO, priceOf, type ObjectDef } from '../data/objects';
import { SPECIES, lifeStage } from '../data/species';
import { CAREERS, gradeLabel } from '../data/careers';
import { DILEMMAS, DILEMMA_BY_ID } from '../data/dilemmas';
import { ELECTRIC, EVENTS, POWERED_ACTIONS, SEASONS } from '../data/seasons';
import { CAREER_SKILL, MAX_SKILL, SKILL_BY_ID } from '../data/skills';
import { chooseAutonomous } from './ai';
import { matchWish, newWish, topUpWishes } from './wishes';
import { ASPIRATION_BY_ID, canAspire, suggestAspiration } from './aspirations';
import { hasTrait, randomPetTrait, traitDecay, traitsOf } from './traits';
import { PET_TRAIT_BY_ID, TRICKS } from '../data/pets';
import { emotionMood, feel as feelEmotion, forget, hasEmotion, pruneEmotions } from './emotions';
import { EMOTIONS } from '../data/emotions';
import { TRAITS, TRAIT_BY_ID } from '../data/traits';
import { REJECT_TEXT, REL_EFFECTS, ROMANTIC, acceptChance, canRomance, changeRel, getRel, grudgeOf, isAdult, partnerOf, relKey, setRel } from './social';
import { ACAI_LOTS, PARK_LOT, PLAYER_LOT, STUDIO_LOT, SUPER_LOT, generateFamily, generateNeighborhood, makeAgent, newbornLooks, placeObjects, randomIndoorTile, setupFamilyLife } from './neighborhood';
import { findPath, isWalkable, pathLength, reachable, type Grid } from './pathfinding';
import { NEED_KEYS, type Agent, type Household, type Lot, type NeedKey, type Needs, type PlacedObject, type SpeciesId, type Task, type Vec, type WorldState } from './types';

export const SAVE_VERSION = 9;
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

/** Hábitos que acaban cambiando la forma de ser: acciones y cuántas veces. */
const HABITS: { trait: string; actions: string[]; min: number }[] = [
  { trait: 'deportista', actions: ['run', 'pilates', 'reformer'], min: 25 },
  { trait: 'bromista', actions: ['joke'], min: 25 },
  { trait: 'gloton', actions: ['eat', 'snack', 'cook', 'acai_bowl', 'buy_hotdog', 'buy_fruit'], min: 80 },
  { trait: 'friki', actions: ['play_games', 'play_chess', 'browse'], min: 30 },
  { trait: 'fiestero', actions: ['dance', 'parties', 'listen_music'], min: 30 },
  { trait: 'animalero', actions: ['pet_animal', 'play_pet', 'walk_dog', 'train_pet', 'brush_capy', 'bathe_pet'], min: 45 },
  { trait: 'tiquismiquis', actions: ['clean', 'clean_litter', 'clean_cage'], min: 25 },
  { trait: 'grunon', actions: ['insult', 'argue'], min: 12 },
  { trait: 'cotilla', actions: ['chat', 'talk', 'browse_aisles'], min: 70 },
  { trait: 'romantico', actions: ['flirt', 'kiss', 'hug'], min: 45 },
  { trait: 'perezoso', actions: ['nap_sofa', 'watch_tv'], min: 60 },
  { trait: 'optimista', actions: ['apologize', 'wishes_done'], min: 25 },
];
const HABIT_TEXT: Record<string, string> = {
  deportista: 'Tanto correr y tanto pilates...',
  bromista: 'De tanto contar chistes...',
  gloton: 'Entre tapa y tapa...',
  friki: 'Tantas horas delante de la pantalla...',
  fiestero: 'De fiesta en fiesta...',
  animalero: 'Tanto cariño a los animales...',
  tiquismiquis: 'De tanto limpiar...',
  grunon: 'Tanta bronca acaba pasando factura...',
  cotilla: 'De tanto charlar con todo el mundo...',
  romantico: 'Tanto amor en el aire...',
  perezoso: 'Entre siesta y siesta...',
  optimista: 'Viéndole el lado bueno a todo...',
};
/** Lo que se come de la nevera (gasta raciones de la despensa). */
const FRIDGE_FOOD = new Set(['eat', 'snack', 'cook']);
export const PANTRY_MAX = 40;

/** Ánimo general (0-100) a partir de las necesidades. */
export function moodScore(a: Agent): number {
  const vals = NEED_KEYS.map((k) => a.needs[k]);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  // Los optimistas lo ven todo un poco mejor; los gruñones, un poco peor.
  const temper = hasTrait(a, 'optimista') ? 6 : hasTrait(a, 'grunon') ? -4 : 0;
  return avg - vals.filter((v) => v < 20).length * 12 + temper + emotionMood(a);
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
  /** Estado de la interfaz que no se guarda (modo construcción y vista previa del mueble). */
  ui: {
    building: boolean;
    ghost: { def: string; x: number; y: number; ok: boolean } | null;
    /** Frases que la escena tiene que mostrar en bocadillos. */
    speech: { agentId: string; text: string; kind: 'say' | 'think' }[];
  } = { building: false, ghost: null, speech: [] };
  /** Tras despedir a unas visitas, no llegan otras espontáneas durante un rato. */
  private noVisitsUntil = 0;

  /** Deseos activados (las pruebas los apagan para que las cuentas cuadren). */
  wishesEnabled = true;

  constructor(state: WorldState) {
    this.state = state;
    this.rebuildGrid();
    for (const a of state.agents) traitsOf(a);
    topUpWishes(this);
    for (const m of this.members) if (canAspire(this, m) && !m.aspiration) m.aspiration = { id: suggestAspiration(m), stage: 0 };
    for (const a of state.agents) if (a.kind === 'pet' && !a.petTrait) a.petTrait = randomPetTrait(a);
  }

  /** Algo que pasa en el barrio y de lo que la gente habla. */
  addNews(text: string, about: string[]) {
    const news = (this.state.news = this.state.news ?? []);
    news.unshift({ day: this.day, text, about });
    if (news.length > 30) news.length = 30;
  }

  /** Una noticia reciente de la que pueden hablar `a` y `t` (que no sea sobre ellos mismos). */
  gossipFor(a: Agent, t: Agent): string | undefined {
    const recent = (this.state.news ?? []).filter((n) => this.day - n.day <= 7 && !n.about.includes(a.id) && !n.about.includes(t.id));
    return recent.length ? recent[Math.floor(Math.random() * Math.min(recent.length, 5))].text : undefined;
  }

  /** `a` siente algo (emoción con causa). Si es nuevo y es de la familia, lo piensa en voz alta. */
  feel(a: Agent | undefined, id: string, about?: string, hours?: number) {
    if (!a) return;
    if (feelEmotion(a, id, this.state.minutes, about, hours) && this.isPlayerMember(a) && !a.travel) {
      const th = EMOTIONS[id]?.thoughts;
      if (th?.length && Math.random() < 0.7) this.say(a.id, th[Math.floor(Math.random() * th.length)], 'think');
    }
  }

  /** Lleva la cuenta de lo que hace cada uno. */
  bump(a: Agent, key: string, n = 1) {
    a.stats = a.stats ?? {};
    a.stats[key] = (a.stats[key] ?? 0) + n;
  }

  /** Un personaje dice (o piensa) algo: lo pinta la escena en un bocadillo. */
  say(agentId: string, text: string, kind: 'say' | 'think' = 'say') {
    this.ui.speech.push({ agentId, text, kind });
    if (this.ui.speech.length > 30) this.ui.speech.shift();
  }

  // ---------------------------------------------------------------------------
  // Deseos
  // ---------------------------------------------------------------------------

  /** Algo ha pasado: si cumple un deseo de la familia, recompensa. */
  wishEvent(a: Agent, ev: { action?: string; target?: string; targetHousehold?: string; lotKind?: string; layout?: string; skill?: string; level?: number }) {
    if (!this.wishesEnabled || !this.isPlayerMember(a) || !a.wishes?.length) return;
    const w = matchWish(a, ev, this.household.id);
    if (!w) return;
    a.wishes = a.wishes.filter((x) => x !== w);
    this.household.funds += w.reward;
    a.needs.fun = clamp(a.needs.fun + 15);
    a.needs.social = clamp(a.needs.social + 5);
    this.toast(`¡Deseo cumplido! ${a.name}: ${w.label} (+§${w.reward})`, '⭐');
    this.say(a.id, '¡Sí! ¡Lo he conseguido!', 'say');
    this.feel(a, 'deseo');
    this.bump(a, 'wishes_done');
    const next = newWish(this, a);
    if (next) a.wishes.push(next);
  }

  /** Atajo: el personaje se pone a cumplir un deseo (si se puede desde donde está). */
  pursueWish(agentId: string, wishId: string): boolean {
    const a = this.agent(agentId);
    const w = a?.wishes?.find((x) => x.id === wishId);
    if (!a || !w) return false;
    if (w.kind === 'place') {
      const want = w.lot === 'venue' ? 'studio' : w.lot;
      const lot = this.state.lots.find((l) => l.layout === want);
      if (lot) return this.travel([a.id], lot.id);
      return false;
    }
    if (w.kind === 'skill') {
      this.toast(`Para subir habilidades: cocinar, tocar, pintar, hacer deporte, ajedrez, charlar...`, '💡');
      return false;
    }
    if (w.kind === 'action' && w.action) {
      const def = ACTIONS[w.action];
      if (def.target === 'self') return this.command(a.id, w.action, { kind: 'agent', id: a.id });
      if (def.target === 'agent') {
        if (w.target === 'vecino') {
          const n = this.agentsIn(a.lotId).find((x) => x.kind === 'person' && x.householdId !== a.householdId && this.stageOf(x) !== 'baby');
          if (!n) {
            this.toast('No hay vecinos por aquí: prueba en el parque o invítalos a casa', '💡');
            return false;
          }
          return this.command(a.id, w.action, { kind: 'agent', id: n.id });
        }
        const t = this.agent(w.target);
        if (!t || t.lotId !== a.lotId || t.travel) {
          this.toast(`${t?.name ?? 'Esa persona'} no está aquí`, '💡');
          return false;
        }
        return this.command(a.id, w.action, { kind: 'agent', id: t.id });
      }
      const o = this.objectsIn(a.lotId).find((x) => this.objDef(x).actions.includes(w.action!) && this.checkObjectAction(a, x, w.action!).ok);
      // Cosas que se hacen fuera de casa: primero, ir allí.
      const away: Record<string, string> = { shop_small: 'super', shop_big: 'super', acai_bowl: 'acai', smoothie: 'acai', selfie: 'acai' };
      if (!o && away[w.action]) {
        const lot = this.state.lots.find((l) => l.layout === away[w.action!]);
        if (lot && lot.id !== a.lotId) {
          this.toast(`${a.name} va a ${lot.name}. Allí, toca la caja o la barra`, '💡');
          return this.travel([a.id], lot.id);
        }
      }
      if (!o) {
        this.toast('Aquí no se puede: hace falta estar en casa (o comprar el mueble)', '💡');
        return false;
      }
      return this.command(a.id, w.action, { kind: 'object', id: o.id });
    }
    return false;
  }

  /** Un turno de conversación interactiva (la lógica está en conversation.ts). */
  onTalkTurn(a: Agent, t: Agent, res: { say: string; reply: string; goPark?: boolean }, firstTurn: boolean) {
    this.say(a.id, res.say);
    this.say(t.id, res.reply);
    if (firstTurn) this.wishEvent(a, { action: 'talk', target: t.id, targetHousehold: t.householdId });
    if (res.goPark) {
      const park = this.state.lots.find((l) => l.kind === 'park');
      if (park) {
        this.endTask(a);
        this.endTask(t);
        this.travel([a.id, t.id], park.id);
        if (!this.isPlayerMember(t)) t.visitUntil = this.state.minutes + 180;
      }
    }
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
      aging: 'normal',
    };
    const mk = (id: string, name: string, species: SpeciesId, ageDays: number, color: number, x: number, y: number) =>
      makeAgent({ id, name, species, ageDays, color, householdId: 'h1', lotId: PLAYER_LOT, x, y });
    state.agents.push(
      mk('a1', 'Lucía', 'human', 24, 0xe0607e, 6, 4),
      mk('a2', 'Mateo', 'human', 27, 0x4f8fd9, 7, 5),
      mk('a3', 'Toby', 'dog', 9, 0xc68642, 3, 7),
      mk('a4', 'Misi', 'cat', 12, 0x9a9a9a, 4, 5),
    );
    state.agents[0].traits = ['deportista', 'romantico'];
    state.agents[1].traits = ['cunado', 'gloton'];
    state.households.push({ id: 'h1', name: 'Familia García', funds: 2000, memberIds: state.agents.map((a) => a.id), lotId: PLAYER_LOT, pantry: 15 });
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

  /** Estación (0 primavera … 3 invierno): cada semana, una. */
  get season(): number {
    return Math.floor((this.day - 1) / 7) % 4;
  }

  get seasonDef() {
    return SEASONS[this.season];
  }

  /** ¿Está en marcha este evento (en esa parcela, si se dice)? */
  hasEvent(id: string, lotId?: string): boolean {
    return !!this.state.events?.some((e) => e.id === id && e.until > this.state.minutes && (!lotId || !e.lotId || e.lotId === lotId));
  }

  activeEvents() {
    return (this.state.events ?? []).filter((e) => e.until > this.state.minutes && EVENTS[e.id]);
  }

  private startEvent(id: string, minutes: number, lotId?: string) {
    this.state.events = [...this.activeEvents().filter((e) => e.id !== id), { id, until: this.state.minutes + minutes, ...(lotId ? { lotId } : {}) }];
  }

  /** Lo que cuesta una acción ahora (con ofertas, más barato). */
  costOf(actionId: string): number {
    const c = ACTIONS[actionId]?.cost ?? 0;
    if (this.hasEvent('ofertas') && (actionId === 'shop_small' || actionId === 'shop_big')) return Math.round(c * 0.7);
    return c;
  }

  /** Por qué no se puede comprar lotería ahora (o nada si se puede). */
  lotteryReason(a: Agent): string | undefined {
    if (this.season !== 3) return 'Solo se vende en invierno, antes de Navidad';
    if (this.weekday === 6) return 'El sorteo es hoy: ya no se venden';
    if (this.state.lottery?.includes(a.id)) return 'Ya tiene su décimo';
    return undefined;
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
    return this.layoutFor(this.lotById(lotId));
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

  /** Plano de una parcela (las casas, según lo ampliadas que estén). */
  layoutFor(lot: Lot | undefined): LotLayout {
    if (!lot) return LAYOUTS.house;
    if (lot.layout === 'house') return HOUSE_SIZES[Math.max(1, Math.min(3, lot.size ?? 1)) - 1];
    return LAYOUTS[lot.layout];
  }

  /** Un sitio del jardín de esa parcela (para las mascotas de exterior). */
  gardenOf(lotId: string): Vec {
    return { ...(this.layoutOf(lotId).garden ?? { x: 11, y: 6 }) };
  }

  rebuildGrid() {
    for (const lot of this.state.lots) {
      const { w, h, tiles } = this.layoutFor(lot);
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

  stageOf(a: Agent): string {
    return lifeStage(a.species, a.ageDays).id;
  }

  private speciesOk(a: Agent, def: ActionDef) {
    if (!def.actors.includes(a.kind) || (def.species && !def.species.includes(a.species))) return false;
    // Los bebés solo hacen cosas de bebé (dormir en la cuna, llorar).
    const st = a.kind === 'person' ? this.stageOf(a) : '';
    if (def.actorStages) return def.actorStages.includes(st);
    return st !== 'baby';
  }

  checkObjectAction(a: Agent, o: PlacedObject, actionId: string): ActionOption {
    const def = ACTIONS[actionId];
    const od = this.objDef(o);
    if (!this.speciesOk(a, def)) return { def, ok: false, reason: `${a.name} no puede hacer esto` };
    if (o.lotId !== a.lotId || a.travel) return { def, ok: false, reason: 'No está aquí' };
    if (a.home && a.home !== o.id) return { def, ok: false, reason: 'No puede salir de su jaula' };
    if (!def.guestOk && this.isGuest(a)) return { def, ok: false, reason: 'Estás de visita' };
    if (actionId === 'repair') {
      if (!o.broken) return { def, ok: false };
      if (!isAdult(a) && this.stageOf(a) !== 'teen') return { def, ok: false, reason: 'Es cosa de mayores' };
    } else if (o.broken) return { def, ok: false, reason: 'Está roto' };
    if (actionId === 'watch_tv') {
      const tv = this.objectsIn(o.lotId).find((x) => x.def === 'tv');
      if (!tv) return { def, ok: false, reason: 'No hay tele' };
      if (tv.broken) return { def, ok: false, reason: 'La tele está rota' };
    }
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
    if (def.cost && funds < this.costOf(actionId)) return { def, ok: false, reason: 'No hay dinero' };
    if ((ELECTRIC.has(o.def) || POWERED_ACTIONS.has(actionId)) && this.hasEvent('apagon', o.lotId)) return { def, ok: false, reason: 'No hay luz' };
    // Comer de la nevera gasta raciones de la despensa de esa casa.
    if (FRIDGE_FOOD.has(actionId)) {
      const owner = this.pantryOwner(o.lotId);
      if (owner && (owner.pantry ?? 0) <= 0) return { def, ok: false, reason: 'La nevera está vacía: toca ir al Mercadona' };
    }
    // Horarios de las tiendas
    const closed = this.closedReason(o.lotId);
    if (closed) return { def, ok: false, reason: closed };
    if (actionId === 'order_groceries' && this.householdOf(a)?.delivery) return { def, ok: false, reason: 'Ya hay un pedido en camino' };
    if (actionId === 'throw_party') {
      if (!this.isPlayerMember(a) || o.lotId !== this.household.lotId) return { def, ok: false };
      if (this.state.party) return { def, ok: false, reason: 'Ya hay una fiesta montada' };
      if (this.hour < 10 || this.hour >= 21) return { def, ok: false, reason: 'Las fiestas, de 10:00 a 21:00' };
    }
    if (actionId === 'day_off') {
      if (!a.job || CAREERS[a.job.career]?.school) return { def, ok: false, reason: 'No tiene trabajo' };
      if (a.job.dayOff === this.day + 1) return { def, ok: false, reason: 'Ya lo tiene pedido' };
    }
    if (actionId === 'buy_lottery') {
      const why = this.lotteryReason(a);
      if (why) return { def, ok: false, reason: why };
    }
    return { def, ok: true };
  }

  checkSocialAction(a: Agent, t: Agent, actionId: string): ActionOption {
    const def = ACTIONS[actionId];
    if (!this.speciesOk(a, def) || !def.targetKinds?.includes(t.kind)) return { def, ok: false };
    if (def.targetSpecies && !def.targetSpecies.includes(t.species)) return { def, ok: false };
    // Despedir solo a invitados de otra familia que están en tu casa.
    if (actionId === 'say_goodbye' && (t.householdId === a.householdId || !t.visitUntil || this.isGuest(a))) return { def, ok: false };
    const tStage = t.kind === 'person' ? this.stageOf(t) : '';
    if (def.targetStages ? !def.targetStages.includes(tStage) : tStage === 'baby') return { def, ok: false };
    if (ROMANTIC.has(actionId)) {
      if (!canRomance(this.state, a, t)) return { def, ok: false };
      if (actionId === 'niqui') {
        const rel0 = getRel(this.state, a.id, t.id);
        if (!rel0.status && (rel0.r < 50 || rel0.f < 30)) return { def, ok: false };
        const lot = this.lotById(a.lotId);
        if (lot.kind !== 'home' || (lot.householdId !== a.householdId && lot.householdId !== t.householdId)) return { def, ok: false, reason: 'Mejor en casa' };
        if (!this.freeBed(a.lotId)) return { def, ok: false, reason: 'Hace falta una cama libre' };
      }
      if (actionId === 'try_baby') {
        const rel0 = getRel(this.state, a.id, t.id);
        if (!rel0.status || t.householdId !== a.householdId) return { def, ok: false };
        if (this.stageOf(a) === 'elder' || tStage === 'elder') return { def, ok: false, reason: 'Ya no tenéis edad' };
        const h = this.householdOf(a)!;
        if (h.expecting) return { def, ok: false, reason: 'Ya hay un bebé en camino' };
        if (h.memberIds.length >= MAX_MEMBERS) return { def, ok: false, reason: 'La casa está llena' };
        if (!this.freeCrib(h.lotId)) return { def, ok: false, reason: 'Hace falta una cuna libre' };
      }
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
    const relX = getRel(this.state, a.id, t.id);
    if (actionId === 'break_up' && relX.status !== 'partner') return { def, ok: false };
    if (actionId === 'divorce' && relX.status !== 'married') return { def, ok: false };
    if (actionId === 'apologize' && !this.grudge(t, a) && relX.f >= -10) return { def, ok: false };
    if (actionId === 'argue' && (a.kind !== 'person' || ['baby'].includes(tStage))) return { def, ok: false };
    if (actionId === 'train_pet') {
      if (t.householdId !== a.householdId) return { def, ok: false };
      if ((t.training ?? 0) >= 100) return { def, ok: false, reason: 'Ya se sabe todos los trucos' };
    }
    if (actionId === 'show_trick' && !t.tricks?.length) return { def, ok: false };
    if (a.home) return { def, ok: false, reason: 'No puede salir de su jaula' };
    if (t.home && def.offLot) return { def, ok: false };
    if (def.offLot && (t.householdId !== a.householdId || this.isGuest(a))) return { def, ok: false };
    if (t.lotId !== a.lotId || t.travel) return { def, ok: false, reason: `${t.name} no está aquí` };
    if (t.hidden) return { def, ok: false, reason: `${t.name} no está en casa` };
    return { def, ok: true };
  }

  checkSelfAction(a: Agent, actionId: string): ActionOption {
    const def = ACTIONS[actionId];
    if (!this.speciesOk(a, def)) return { def, ok: false };
    if (actionId === 'homework' && a.job?.career !== 'school') return { def, ok: false };
    if (actionId === 'busk') {
      if (this.lotById(a.lotId)?.kind !== 'park') return { def, ok: false };
      if (this.skillLevel(a, 'musica') < 3) return { def, ok: false, reason: 'Hace falta música nivel 3' };
    }
    return { def, ok: true };
  }

  // ---------------------------------------------------------------------------
  // Habilidades
  // ---------------------------------------------------------------------------

  skillLevel(a: Agent, id: string): number {
    return Math.floor(a.skills?.[id] ?? 0);
  }

  /** Practicar sube la habilidad (cada nivel cuesta más que el anterior). */
  private practice(a: Agent, skill: { id: string; rate: number }, dt: number) {
    if (a.kind !== 'person') return;
    a.skills = a.skills ?? {};
    const before = a.skills[skill.id] ?? 0;
    if (before >= MAX_SKILL) return;
    const after = Math.min(MAX_SKILL, before + (skill.rate * dt) / (1 + Math.floor(before) * 0.35));
    a.skills[skill.id] = after;
    if (Math.floor(after) > Math.floor(before) && this.isPlayerMember(a)) {
      const s = SKILL_BY_ID[skill.id];
      this.toast(`${a.name} ha subido a ${s.label.toLowerCase()} nivel ${Math.floor(after)}`, s.icon);
      this.feel(a, 'nivel', s.label.toLowerCase());
      this.wishEvent(a, { skill: skill.id, level: Math.floor(after) });
    }
  }

  /** Opciones para el menú de acciones del agente activo sobre un objetivo. */
  optionsFor(agentId: string, target: Target): ActionOption[] {
    const a = this.agent(agentId);
    if (!a) return [];
    if (target.kind === 'object') {
      const o = this.object(target.id);
      if (!o) return [];
      return this.objDef(o)
        .actions.filter((id) => this.speciesOk(a, ACTIONS[id]) && (id !== 'repair' || o.broken))
        .map((id) => this.checkObjectAction(a, o, id));
    }
    if (target.kind === 'agent') {
      if (target.id === a.id) {
        const self = [...SELF_ACTIONS, ACTIONS.busk];
        return self.map((d) => this.checkSelfAction(a, d.id)).filter((o) => o.ok || o.reason);
      }
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
      ...(sp.outdoor ? this.gardenOf(this.household.lotId) : entrance),
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
    this.addNews(`la ${this.household.name} ha adoptado ${species === 'guineapig' || species === 'capybara' ? 'una' : 'un'} ${sp.label.toLowerCase()}`, [pet.id]);
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
    const closed = this.closedReason(lotId);
    if (closed) return { ok: false, reason: closed };
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
    this.wishEvent(a, { lotKind: this.lotById(to).kind, layout: this.lotById(to).layout });
    this.onArriveShopping(a, to);
    if (to === this.householdOf(a)?.lotId) this.petGreeting(a);
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
    // El perro va al parque o de visita, pero no a clase de pilates.
    if (dog && (lotId === PARK_LOT || this.lotById(lotId)?.kind === 'home') && Math.random() < 0.6) group.push(dog);
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
    for (const a of this.state.agents) pruneEmotions(a, this.state.minutes);
    this.partyHour();
    this.eventsHour();
    this.checkAspirations();
    if (this.wishesEnabled) topUpWishes(this);
    this.closingTime();
    this.groceryErrand();
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
        else if (Math.random() < 0.04) this.sendVisit(nh, STUDIO_LOT, false);
        else if (Math.random() < 0.05 && !this.closedReason(SUPER_LOT)) this.sendVisit(nh, SUPER_LOT, false);
        else if (Math.random() < 0.05 && !this.closedReason(ACAI_LOTS[0])) this.sendVisit(nh, ACAI_LOTS[Math.floor(Math.random() * ACAI_LOTS.length)], false);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Trabajo y colegio
  // ---------------------------------------------------------------------------

  setJob(a: Agent, careerId: string) {
    const c = CAREERS[careerId];
    if (!c || c.school || !isAdult(a)) return;
    const h = this.householdOf(a);
    if (c.startup) {
      if (!h || h.funds < c.startup) {
        this.toast(`Montar el negocio cuesta §${c.startup}: no hay dinero suficiente`, '💸');
        return;
      }
      h.funds -= c.startup;
      a.job = { career: careerId, level: 1, perf: 0 };
      this.feel(a, 'jefe_propio');
      this.toast(`¡${a.name} monta su propio negocio: ${c.levels[0].title}! (−§${c.startup}). Ojo: cada lunes, cuota de autónomos`, c.icon);
      this.addNews(`${a.name} ha abierto un bar en el barrio. Dicen que las bravas pican de verdad`, [a.id]);
      return;
    }
    a.job = { career: careerId, level: 1, perf: 0 };
    this.toast(`¡${a.name} tiene trabajo! ${c.levels[0].title} (§${c.levels[0].pay} por jornada)`, c.icon);
  }

  /** Despido: tres jornadas seguidas rindiendo fatal. */
  private fire(a: Agent) {
    const c = a.job && CAREERS[a.job.career];
    a.job = undefined;
    this.feel(a, 'despedido');
    if (this.isPlayerMember(a)) this.toast(c?.business ? `El negocio de ${a.name} ha tenido que cerrar` : `¡Han despedido a ${a.name}! Toca buscar otro trabajo`, '📦');
    this.addNews(c?.business ? `ha cerrado el bar de ${a.name}` : `han despedido a ${a.name}`, [a.id]);
  }

  // --- Dilemas del trabajo ---------------------------------------------------

  /** A veces, al empezar la jornada, surge algo que hay que decidir. */
  private maybeDilemma(a: Agent) {
    if (!this.wishesEnabled || !this.isPlayerMember(a) || this.state.dilemma || !a.job || CAREERS[a.job.career]?.school) return;
    if (Math.random() > this.dilemmaChance) return;
    const pool = DILEMMAS.filter((d) => !d.careers || d.careers.includes(a.job!.career));
    const d = pool[Math.floor(Math.random() * pool.length)];
    this.state.dilemma = { id: d.id, agentId: a.id, until: a.travel?.arrive ?? this.state.minutes + 240 };
  }
  /** Hace un calor de muerte (se actualiza cada hora). */
  private heatNow = false;
  /** Esta noche hay apagón (se decide al empezar el día). */
  private blackoutTonight = false;
  /** Probabilidad de apagón por día (los tests la cambian). */
  blackoutChance = 0.04;

  /** Lo que pasa cada día según la estación: olas de calor, ofertas, Navidad... */
  private seasonalDay() {
    const wd = this.weekday;
    const se = this.season;
    if (wd === 0) this.toast(this.seasonDef.intro, this.seasonDef.icon);
    if (wd === 0 && se === 0) {
      for (const m of this.members) if (m.kind === 'person' && partnerOf(this.state, m.id)) this.feel(m, 'enamorado', undefined, 8);
    }
    if (se === 1 && wd >= 1 && wd <= 4 && !this.hasEvent('calor') && Math.random() < 0.35) {
      this.startEvent('calor', 2 * MINUTES_PER_DAY);
      this.toast('¡Ola de calor! 40 grados a la sombra. Duchas, piscina y batidos', '🥵');
      this.addNews('hace un calor que no se puede ni respirar', []);
    }
    if (se === 2 && wd === 1) {
      this.startEvent('ofertas', 2 * MINUTES_PER_DAY);
      this.toast('Días de la huerta en el Mercadona: la compra, un 30% más barata', '🥬');
    }
    if (se === 1 && wd === 5) this.toast('Esta noche hay verbena en el parque. ¡Que no falte nadie!', '🎆');
    if (se === 3 && wd === 6) {
      this.startEvent('navidad', MINUTES_PER_DAY);
      for (const m of this.members) if (m.kind === 'person') this.feel(m, 'navidad');
      const cunado = this.members.find((m) => hasTrait(m, 'cunado'));
      this.toast(
        cunado ? `¡Feliz Navidad! En la cena, ${cunado.name} ha explicado cómo arreglar el país. Dos veces` : '¡Feliz Navidad! Turrón, polvorones y villancicos a todo volumen',
        '🎄',
      );
    }
    this.blackoutTonight = this.wishesEnabled && Math.random() < this.blackoutChance;
  }

  /** Lo que pasa cada hora con los eventos. */
  private eventsHour() {
    const h = this.hour;
    const se = this.season;
    const now = this.state.minutes;
    this.heatNow = this.hasEvent('calor') && h >= 11 && h < 20;
    if (this.heatNow) for (const m of this.members) if (m.kind === 'person' && !m.travel && m.lotId !== SUPER_LOT) this.feel(m, 'calor', undefined, 2);
    // Verbena: sábado de verano por la noche, en el parque.
    if (se === 1 && this.weekday === 5 && h === 19 && !this.hasEvent('verbena')) {
      const until = now + 6 * 60;
      this.startEvent('verbena', 6 * 60, PARK_LOT);
      for (const hh of this.state.households) {
        if (hh.id === this.household.id || Math.random() < 0.25) continue;
        for (const p of this.availableVisitors(hh)) {
          if (p.kind !== 'person') continue;
          this.startTravel(p, PARK_LOT);
          p.visitUntil = until;
        }
      }
      this.toast('¡Empieza la verbena en el parque! Música, churros y Paquito el Chocolatero', '🎆');
    }
    if (this.hasEvent('verbena')) for (const a of this.agentsIn(PARK_LOT)) if (a.kind === 'person' && !a.travel) this.feel(a, 'verbena');
    // Apagón: un par de horas sin luz por la noche.
    if (this.blackoutTonight && h === 21) {
      this.blackoutTonight = false;
      const home = this.household.lotId;
      this.startEvent('apagon', 120, home);
      for (const a of this.agentsIn(home)) {
        if (a.kind === 'person' && !a.travel) this.feel(a, 'apagon');
        const cur = a.current && this.object(a.current.targetObjectId);
        if (cur && (ELECTRIC.has(cur.def) || POWERED_ACTIONS.has(a.current!.actionId))) this.endTask(a);
      }
      this.toast('¡Apagón! Se ha ido la luz en toda la calle. ¿Dónde están las velas?', '🕯️');
    }
    // Lotería de Navidad: el sorteo, el último día del invierno a mediodía.
    if (se === 3 && this.weekday === 6 && h === 12 && this.state.lottery?.length) this.lotteryDraw();
  }

  private lotteryDraw() {
    const tickets = this.state.lottery ?? [];
    this.state.lottery = [];
    this.toast('Los niños de San Ildefonso cantan el sorteo de la Lotería de Navidad...', '🎶');
    for (const id of tickets) {
      const a = this.agent(id);
      const h = a && this.householdOf(a);
      if (!a || !h) continue;
      const r = Math.random();
      if (r < 0.03) {
        h.funds += 4000;
        this.feel(a, 'loteria');
        this.toast(`¡¡EL GORDO!! ¡A ${a.name} le han tocado §4.000!`, '🤑');
        this.addNews(`a ${a.name} le ha tocado el Gordo de Navidad`, [a.id]);
      } else if (r < 0.2) {
        h.funds += 100;
        this.toast(`Pedrea para ${a.name}: +§100. Algo es algo`, '🎫');
      } else if (r < 0.32) {
        h.funds += 20;
        this.toast(`Reintegro para ${a.name}: recupera los §20`, '🎫');
      } else {
        this.toast(`A ${a.name} no le ha tocado nada. Lo importante es la salud`, '🙃');
      }
    }
  }

  /** Probabilidad de dilema por jornada (los tests la cambian). */
  dilemmaChance = 0.35;

  /** El jugador elige una opción del dilema (o se elige la última si no contesta a tiempo). */
  resolveDilemma(index: number) {
    const dl = this.state.dilemma;
    if (!dl) return;
    this.state.dilemma = undefined;
    const d = DILEMMA_BY_ID[dl.id];
    const a = this.agent(dl.agentId);
    const opt = d?.options[Math.max(0, Math.min(index, d.options.length - 1))];
    if (!d || !a || !opt) return;
    const res = opt.chance === undefined || Math.random() < opt.chance || !opt.fail ? opt.ok : opt.fail;
    const h = this.householdOf(a);
    if (a.job && res.perf) a.job.perf = Math.max(0, Math.min(100, a.job.perf + res.perf));
    if (h && res.money) h.funds += res.money;
    if (res.energy) a.needs.energy = clamp(a.needs.energy + res.energy);
    if (res.emotion) this.feel(a, res.emotion);
    if (res.skill && a.job) {
      const sk = CAREER_SKILL[a.job.career];
      if (sk) {
        a.skills = a.skills ?? {};
        a.skills[sk] = Math.min(MAX_SKILL, (a.skills[sk] ?? 0) + res.skill);
      }
    }
    if (res.extraHours && a.travel?.reason === 'work') a.travel.arrive += res.extraHours * 60;
    this.toast(res.text.replace('{name}', a.name), opt.icon);
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
    if (job.dayOff === this.day) {
      job.lastShiftDay = this.day;
      job.perf = Math.max(0, job.perf - 2);
      if (mine) this.toast(`${a.name} tiene hoy el día libre`, '🏖️');
      return;
    }
    const busy = a.travel || a.hidden || a.current?.actionId === 'pass_out';
    if (busy) {
      if (m >= start + 60) {
        // Una hora tarde: ya no va.
        job.lastShiftDay = this.day;
        job.perf = Math.max(0, job.perf - 15);
        if (mine) this.toast(`${a.name} ha faltado ${c.school ? 'a clase' : 'al trabajo'}`, '😬');
        if (!c.school) {
          job.badDays = (job.badDays ?? 0) + 1;
          if (job.badDays >= 3 && job.perf <= 10) this.fire(a);
        }
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
    this.maybeDilemma(a);
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
    const skillBonus = CAREER_SKILL[job.career] ? this.skillLevel(a, CAREER_SKILL[job.career]) * 0.6 : 0;
    job.perf = Math.max(0, Math.min(100, job.perf + (mood - 45) / 4 + rand(-3, 5) + skillBonus));
    if (reason === 'school') {
      if (mine && gradeLabel(before) !== gradeLabel(job.perf)) this.toast(`Notas de ${a.name}: ${gradeLabel(job.perf)}`, '📚');
      return;
    }
    if (this.state.dilemma?.agentId === a.id) this.resolveDilemma(99);
    let pay = c.levels[job.level - 1].pay;
    if (c.business) {
      // En el negocio propio unos días se gana mucho y otros, nada (o se pierde).
      pay = Math.random() < 0.12 ? -Math.round(rand(20, 60)) : Math.round(pay * rand(0.3, 1.7) * (0.6 + Math.max(0, mood) / 125));
    }
    const h = this.householdOf(a);
    if (h) h.funds += pay;
    const delta = job.perf - before;
    if (delta >= 12) this.feel(a, 'buen_dia_curro');
    else if (delta <= -3) this.feel(a, 'mal_dia_curro');
    job.badDays = job.perf <= 8 ? (job.badDays ?? 0) + 1 : 0;
    if (job.badDays >= 3) {
      this.fire(a);
      return;
    }
    if (job.perf >= 100 && job.level < c.levels.length) {
      job.level++;
      job.perf = 10;
      const lvl = c.levels[job.level - 1];
      this.addNews(`han ascendido a ${a.name} a ${lvl.title.toLowerCase()}`, [a.id]);
      this.feel(a, 'ascenso');
      if (mine) this.toast(`¡Ascenso! ${a.name} ahora es ${lvl.title} (§${lvl.pay} por jornada)`, '🎉');
    } else if (mine) {
      if (c.business && pay < 0) this.toast(`Hoy en el bar de ${a.name} no ha entrado ni el tato: −§${-pay} de gastos`, '🦗');
      else this.toast(`${a.name} vuelve del ${c.business ? 'bar' : 'trabajo'}: +§${pay}`, '💰');
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
    this.addNews(`${t.name} se ha ido a vivir con la ${mine.name}`, [t.id]);
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
  // Ciclo de vida: nacimientos, crecer, morir
  // ---------------------------------------------------------------------------

  freeBed(lotId: string): PlacedObject | undefined {
    return this.objectsIn(lotId).find((o) => o.def === 'bed' && !o.broken && this.usersOf(o.id).length === 0);
  }

  freeCrib(lotId: string): PlacedObject | undefined {
    return this.objectsIn(lotId).find((o) => o.def === 'crib' && !this.residentOf(o.id));
  }

  private births() {
    for (const h of this.state.households) {
      if (!h.expecting || this.state.minutes < h.expecting.due) continue;
      const crib = this.freeCrib(h.lotId);
      const mine = h.id === this.household.id;
      if (!crib || h.memberIds.length >= MAX_MEMBERS) {
        h.expecting.due += MINUTES_PER_DAY;
        if (mine) this.toast('El bebé no puede llegar: hace falta una cuna libre y sitio en casa', '🍼');
        continue;
      }
      const parents = h.expecting.parents.map((id) => this.agent(id)).filter((x): x is Agent => !!x);
      h.expecting = undefined;
      const { name, color } = newbornLooks(this.state);
      const baby = makeAgent({ id: this.newId('a'), name, species: 'human', ageDays: 0, color, householdId: h.id, lotId: h.lotId, x: crib.x, y: crib.y });
      baby.home = crib.id;
      baby.parents = parents.map((p) => p.id);
      baby.traits = this.inheritTraits(parents);
      for (const p of parents) this.bump(p, 'babies');
      baby.abstract = !this.detailedLots().has(h.lotId);
      this.state.agents.push(baby);
      h.memberIds.push(baby.id);
      for (const m of h.memberIds.map((id) => this.agent(id)!).filter(Boolean)) {
        if (m === baby) continue;
        const parent = parents.includes(m);
        if (m.kind === 'person') setRel(this.state, m.id, baby.id, { f: parent ? 70 : 40, r: 0, kin: true });
        if (m.kind === 'person') this.feel(m, 'bebe', name);
        else setRel(this.state, m.id, baby.id, { f: 30, r: 0 });
      }
      if (mine) this.toast(`¡Ha nacido ${name}! Bienvenido/a al mundo${parents.length ? `, bebé de ${parents.map((p) => p.name).join(' y ')}` : ''}`, '👶');
      this.addNews(`ha nacido ${name}, el bebé de la ${h.name}`, [baby.id, ...parents.map((p) => p.id)]);
    }
  }

  /** Lo que da practicar: cuadros que se venden, propinas, notas, comida más rica. */
  private skillPayoff(a: Agent, actionId: string) {
    const h = this.householdOf(a);
    const mine = this.isPlayerMember(a);
    if (actionId === 'paint' && h) {
      const lvl = this.skillLevel(a, 'arte');
      const price = Math.round(10 + lvl * 15 + rand(0, 10 + lvl * 5));
      h.funds += price;
      if (mine) this.toast(`${a.name} ha vendido un cuadro por §${price}`, '🖼️');
    }
    if (actionId === 'busk' && h) {
      const tips = Math.round(this.skillLevel(a, 'musica') * 8 + rand(0, 15));
      h.funds += tips;
      if (mine) this.toast(`${a.name} ha sacado §${tips} en propinas`, '🪕');
    }
    if (actionId === 'homework' && a.job?.career === 'school') a.job.perf = Math.min(100, a.job.perf + 4);
    if (actionId === 'cook') a.needs.hunger = clamp(a.needs.hunger + this.skillLevel(a, 'cocina') * 3);
  }

  /** Lo que cambia al pasar de una etapa de la vida a otra. */
  private onStageChange(a: Agent, after: string) {
    const mine = this.isPlayerMember(a);
    if (a.kind !== 'person') return;
    if (after === 'child') {
      // Sale de la cuna y empieza el colegio.
      const crib = this.object(a.home);
      a.home = undefined;
      if (crib) a.pos = this.freeSpotNear(a.lotId, { x: crib.x, y: crib.y + 1 });
      a.current = null;
      a.job = { career: 'school', level: 1, perf: 50 };
      if (mine) this.toast(`${a.name} ya camina y empieza el colegio`, '🎒');
    } else if (after === 'young' && a.job?.career === 'school') {
      a.job = undefined;
      if (mine) this.toast(`${a.name} ha terminado el colegio y ya puede buscar trabajo`, '🎓');
      if (mine) {
        a.traitPick = true;
        this.toast(`${a.name} ya es adulto/a: en su perfil puedes elegir uno de sus rasgos`, '🧬');
      }
    } else if (after === 'elder' && a.job && a.job.career !== 'school') {
      a.job = undefined;
      if (mine) this.toast(`${a.name} se jubila. ¡A disfrutar! (pensión de §30 al día)`, '🏖️');
    }
  }

  /** Probabilidad diaria de morir de viejo: empieza unos días antes del final de la última etapa. */
  private deathChance(a: Agent): number {
    const stages = SPECIES[a.species].stages;
    const last = stages[stages.length - 1].until;
    const from = last - 8;
    if (a.ageDays < from) return 0;
    if (a.ageDays >= last) return 1;
    return (a.ageDays - from + 1) / 10;
  }

  /** Alguien deja la partida: muere, se escapa o se lo llevan. */
  die(a: Agent, cause: 'old' | 'hunger' | 'social' | 'runaway') {
    const h = this.householdOf(a);
    const mine = this.isPlayerMember(a);
    const texts = {
      old: `${a.name} ha fallecido a los ${a.ageDays} días. Descanse en paz`,
      hunger: `${a.name} ha muerto de hambre`,
      social: `Los servicios sociales se han llevado a ${a.name} por falta de cuidados`,
      runaway: `${a.name} se ha escapado de casa en busca de comida`,
    };
    const knownByPlayer = this.members.some((m) => m !== a && (getRel(this.state, m.id, a.id).f >= 15 || getRel(this.state, m.id, a.id).status));
    if (mine || knownByPlayer) this.toast(mine ? texts[cause] : `${texts[cause]} (${h?.name ?? ''})`, cause === 'old' || cause === 'hunger' ? '🕊️' : '💔');
    // Luto: su familia y quien le quería.
    if (cause === 'old' || cause === 'hunger') {
      for (const o of this.state.agents) {
        if (o === a) continue;
        const rel = getRel(this.state, o.id, a.id);
        if (o.householdId === a.householdId || rel.f >= 45 || rel.status) {
          o.needs.fun = clamp(o.needs.fun - 25);
          o.needs.social = clamp(o.needs.social - 15);
          if (o.kind === 'person') this.feel(o, 'luto', a.name);
        }
      }
      if (h && mine) this.placeGrave(h.lotId, a);
    }
    if (cause === 'old' && a.kind === 'person') this.addNews(`ha fallecido ${a.name}, de la ${h?.name ?? 'vecindad'}. Que en paz descanse`, [a.id]);
    const lastPerson = !!h && a.kind === 'person' && !h.memberIds.some((id) => id !== a.id && this.agent(id)?.kind === 'person');
    if (lastPerson && h) this.inherit(h, a);

    // Fuera del mundo
    this.state.agents = this.state.agents.filter((x) => x !== a);
    if (h) h.memberIds = h.memberIds.filter((id) => id !== a.id);
    for (const k of Object.keys(this.state.rels)) if (k.split('|').includes(a.id)) delete this.state.rels[k];
    for (const x of this.state.households) if (x.expecting?.parents.includes(a.id)) x.expecting.parents = x.expecting.parents.filter((id) => id !== a.id);
    if (this.state.activeAgentId === a.id) {
      const next = this.members.find((m) => m.kind === 'person') ?? this.members[0];
      if (next) this.state.activeAgentId = next.id;
    }
    if (lastPerson && h) {
      if (h.id === this.household.id) {
        this.state.familyGone = true;
        this.state.speed = 0;
        this.toast(`La ${h.name} se ha quedado sin nadie. Elige con qué familia del barrio continuar`, '🕯️');
      } else {
        this.replaceFamily(h, []);
      }
    }
  }

  private placeGrave(lotId: string, a: Agent) {
    const layout = this.layoutOf(lotId);
    const grid = this.gridOf(lotId);
    for (let y = 0; y < layout.h; y++) {
      for (let x = layout.w - 1; x >= 0; x--) {
        if (!isOutdoor(layout.tiles[y][x]) || !isWalkable(grid, x, y) || this.objectAt(lotId, x, y)) continue;
        if (y === layout.entrance.y) continue; // no tapar el camino de entrada
        this.state.objects.push({ id: this.newId('o'), def: 'grave', lotId, x, y, label: a.name });
        return;
      }
    }
  }

  /** Herencia: el dinero de una familia que se extingue pasa a su pariente o pareja más cercano. */
  private inherit(h: Household, last: Agent) {
    if (h.funds <= 0) return;
    let best: { heir: Agent; score: number } | null = null;
    for (const [k, rel] of Object.entries(this.state.rels)) {
      const ids = k.split('|');
      if (!ids.includes(last.id)) continue;
      const other = this.agent(ids[0] === last.id ? ids[1] : ids[0]);
      if (!other || other.kind !== 'person' || other.householdId === h.id) continue;
      const score = (rel.kin ? 200 : 0) + (rel.status ? 150 : 0) + rel.f;
      if (score >= 60 && (!best || score > best.score)) best = { heir: other, score };
    }
    if (!best) return;
    const to = this.householdOf(best.heir);
    if (!to) return;
    to.funds += h.funds;
    if (to.id === this.household.id) this.toast(`${best.heir.name} hereda §${h.funds} de ${last.name}`, '💰');
    h.funds = 0;
  }

  /** Una familia vecina desaparece: llega otra nueva a su casa (con las mascotas que quedaron). */
  private replaceFamily(old: Household, extraPets: Agent[]) {
    const pets = [...old.memberIds.map((id) => this.agent(id)!).filter(Boolean), ...extraPets];
    this.state.households = this.state.households.filter((x) => x.id !== old.id);
    const fresh = generateFamily(this.state, old.lotId);
    for (const pet of pets) {
      pet.householdId = fresh.id;
      fresh.memberIds.push(pet.id);
    }
    if (this.detailedLots().has(old.lotId)) for (const id of fresh.memberIds) this.agent(id)!.abstract = true;
    this.toast(`La ${fresh.name} se muda al barrio`, '🚚');
    this.addNews(`han llegado vecinos nuevos: la ${fresh.name}`, fresh.memberIds);
  }

  /** La familia del jugador se ha extinguido: seguir con otra del barrio. */
  continueWith(householdId: string) {
    const old = this.household;
    const next = this.state.households.find((h) => h.id === householdId);
    if (!next || next.id === old.id) return;
    this.state.playerHouseholdId = next.id;
    this.state.familyGone = false;
    const person = next.memberIds.map((id) => this.agent(id)!).find((m) => m.kind === 'person');
    this.state.activeAgentId = (person ?? this.agent(next.memberIds[0]))!.id;
    // Las mascotas que quedaron en la antigua casa se van con la familia nueva de esa casa.
    const oldLot = this.lotById(old.lotId);
    if (oldLot.name === 'Vuestra casa') oldLot.name = `Casa de los ${old.name.replace('Familia ', '')}`;
    this.replaceFamily(old, []);
    this.toast(`Ahora juegas con la ${next.name}`, '🏡');
  }

  private neighbourAdopts(h: Household, species: SpeciesId) {
    const sp = SPECIES[species];
    const used = new Set(this.state.agents.map((a) => a.name));
    const name = sp.names.find((n) => !used.has(n)) ?? `${sp.label} ${this.state.nextId}`;
    const pet = makeAgent({ id: this.newId('a'), name, species, ageDays: sp.stages[0].until, color: 0x999999, householdId: h.id, lotId: h.lotId, ...(sp.outdoor ? this.gardenOf(h.lotId) : randomIndoorTile()) });
    if (sp.habitat) {
      const cage = this.objectsIn(h.lotId).find((o) => o.def === sp.habitat && !this.residentOf(o.id))!;
      pet.home = cage.id;
      pet.pos = { x: cage.x, y: cage.y };
    }
    pet.abstract = !this.detailedLots().has(h.lotId);
    this.state.agents.push(pet);
    h.memberIds.push(pet.id);
    for (const id of h.memberIds) {
      const m = this.agent(id);
      if (m?.kind === 'person') setRel(this.state, m.id, pet.id, { f: 40, r: 0 });
    }
  }

  // ---------------------------------------------------------------------------
  // La compra: despensa, Mercadona y pedidos a domicilio
  // ---------------------------------------------------------------------------

  /** La familia dueña de la nevera de esa parcela (si es una casa). */
  pantryOwner(lotId: string): Household | undefined {
    const lot = this.lotById(lotId);
    if (lot?.kind !== 'home') return undefined;
    return this.state.households.find((h) => h.id === lot.householdId);
  }

  /** Si la tienda de esa parcela está cerrada a esta hora, el motivo. */
  closedReason(lotId: string): string | undefined {
    const layout = this.lotById(lotId)?.layout;
    const m = this.state.minutes % MINUTES_PER_DAY;
    if (layout === 'super' && (m < 9 * 60 || m >= 21 * 60 + 30)) return 'Está cerrado (abre de 9:00 a 21:30)';
    if (layout === 'acai' && (m < 10 * 60 || m >= 22 * 60)) return 'Está cerrado (abre de 10:00 a 22:00)';
    return undefined;
  }

  /** A la hora de cerrar, todo el mundo a la calle (y a casa). */
  private closingTime() {
    for (const lot of this.state.lots) {
      if (lot.kind !== 'venue' || !this.closedReason(lot.id)) continue;
      const inside = this.agentsIn(lot.id).filter((a) => !a.travel);
      if (inside.some((a) => this.isPlayerMember(a))) this.toast(`${lot.name} cierra: ¡a casa!`, '🔒');
      for (const a of inside) {
        a.errand = undefined;
        this.goHome(a);
      }
    }
  }

  /** Lo que se compra: a la bolsa (y a casa) o pedido a domicilio. */
  private shopping(a: Agent, actionId: string) {
    const h = this.householdOf(a);
    if (!h) return;
    const mine = this.isPlayerMember(a);
    if (actionId === 'shop_small' || actionId === 'shop_big') {
      const n = actionId === 'shop_big' ? 20 : 8;
      a.carrying = (a.carrying ?? 0) + n;
      if (mine) this.toast(`${a.name} ha hecho la compra: ${n} raciones para casa`, '🛒');
      if (a.errand === 'compra') {
        a.errand = undefined;
        if (a.lotId !== h.lotId) this.startTravel(a, h.lotId);
      }
    }
    if (actionId === 'order_groceries') {
      h.delivery = { at: this.state.minutes + 4 * 60, amount: 8 };
      if (mine) this.toast('Pedido hecho: la compra llegará en unas 4 horas', '📦');
    }
  }

  private checkDelivery() {
    for (const h of this.state.households) {
      if (!h.delivery || this.state.minutes < h.delivery.at) continue;
      h.pantry = Math.min(PANTRY_MAX, (h.pantry ?? 0) + h.delivery.amount);
      if (h.id === this.household.id) this.toast(`¡Ha llegado la compra a domicilio! (+${h.delivery.amount} raciones)`, '📦');
      h.delivery = undefined;
    }
  }

  /** Al llegar a casa con la compra se llena la nevera; al llegar al súper a hacer un recado, a la caja. */
  private onArriveShopping(a: Agent, to: string) {
    const h = this.householdOf(a);
    if (!h) return;
    if (a.carrying && to === h.lotId) {
      h.pantry = Math.min(PANTRY_MAX, (h.pantry ?? 0) + a.carrying);
      if (this.isPlayerMember(a)) this.toast(`${a.name} ha llenado la nevera (${h.pantry} raciones)`, '🧊');
      a.carrying = 0;
    }
    if (a.errand === 'compra' && this.lotById(to)?.layout === 'super') {
      const action = h.funds >= 300 ? 'shop_big' : 'shop_small';
      const checkout = this.objectsIn(to).find((o) => o.def === 'checkout' && this.checkObjectAction(a, o, action).ok);
      if (!checkout || !this.command(a.id, action, { kind: 'object', id: checkout.id })) {
        a.errand = undefined;
        this.toast(`${a.name} no ha podido hacer la compra`, '🛒');
        this.startTravel(a, h.lotId);
      }
    }
  }

  /** Si la nevera se queda casi vacía, alguien libre de la familia va solo al Mercadona. */
  private noMoneyWarned = -1;
  private groceryErrand() {
    const h = this.household;
    if ((h.pantry ?? 0) > 3 || h.delivery || this.closedReason(SUPER_LOT) || this.state.familyGone) return;
    if (this.members.some((m) => m.errand || m.carrying || m.travel?.to === SUPER_LOT)) return;
    if (h.funds < (ACTIONS.shop_small.cost ?? 0)) {
      // Sin dinero no hay compra: se avisa una vez al día, no cada hora.
      if ((h.pantry ?? 0) <= 0 && this.noMoneyWarned !== this.day) {
        this.noMoneyWarned = this.day;
        this.toast('La nevera está vacía y no hay dinero para la compra. ¡A buscar curro!', '💸');
      }
      return;
    }
    const who = this.members.find(
      (m) => m.kind === 'person' && ['teen', 'young', 'adult', 'elder'].includes(this.stageOf(m)) && !this.isActive(m) && m.lotId === h.lotId && !m.travel && !m.hidden && !this.busySoon(m, 2) && !(m.current && ACTIONS[m.current.actionId].forced),
    );
    if (!who) {
      this.toastOnce('pantry-empty', 'La nevera está casi vacía: id al Mercadona o pedid la compra por el ordenador', '🧊', 360);
      return;
    }
    who.errand = 'compra';
    this.travel([who.id], SUPER_LOT);
    this.toast(`${who.name} se va al Mercadona a hacer la compra`, '🛒');
  }

  setAging(mode: 'off' | 'normal' | 'fast') {
    this.state.aging = mode;
  }

  // ---------------------------------------------------------------------------
  // Modo construcción: comprar, mover y vender
  // ---------------------------------------------------------------------------

  /** Solo se construye en la casa de la familia, estando allí. */
  canBuildHere(): boolean {
    return this.viewLotId === this.household.lotId && !this.state.familyGone;
  }

  /** ¿Cabe `defId` en (x, y)? Comprueba paredes, otros objetos y que no bloquee el paso. */
  canPlace(defId: string, x: number, y: number, ignoreId?: string): { ok: boolean; reason?: string } {
    const lotId = this.household.lotId;
    const d = OBJECTS[defId];
    const layout = this.layoutOf(lotId);
    if (!d) return { ok: false };
    for (let ty = y; ty < y + d.h; ty++) {
      for (let tx = x; tx < x + d.w; tx++) {
        const t = layout.tiles[ty]?.[tx];
        if (!t) return { ok: false, reason: 'Fuera de la parcela' };
        if (t === 'wall' || t === 'door') return { ok: false, reason: t === 'door' ? 'Tapa una puerta' : 'Hay una pared' };
        if (tx === layout.entrance.x && ty === layout.entrance.y) return { ok: false, reason: 'Tapa la entrada' };
        const other = this.objectsIn(lotId).find((o) => o.id !== ignoreId && tx >= o.x && tx < o.x + this.objDef(o).w && ty >= o.y && ty < o.y + this.objDef(o).h);
        if (other) return { ok: false, reason: `Ahí está: ${this.objDef(other).name.toLowerCase()}` };
        if (!d.walkable && this.agentsIn(lotId).some((a) => !a.hidden && !a.home && Math.round(a.pos.x) === tx && Math.round(a.pos.y) === ty)) {
          return { ok: false, reason: 'Hay alguien ahí' };
        }
      }
    }
    if (d.walkable) return { ok: true };
    // Que no deje zonas o muebles inaccesibles.
    const grid = this.gridOf(lotId).map((row) => [...row]);
    const ignored = ignoreId ? this.object(ignoreId) : undefined;
    if (ignored && !this.objDef(ignored).walkable) {
      const od = this.objDef(ignored);
      for (let ty = ignored.y; ty < ignored.y + od.h; ty++) for (let tx = ignored.x; tx < ignored.x + od.w; tx++) grid[ty][tx] = true;
    }
    for (let ty = y; ty < y + d.h; ty++) for (let tx = x; tx < x + d.w; tx++) grid[ty][tx] = false;
    const reach = reachable(grid, layout.entrance);
    for (let ty = 0; ty < layout.h; ty++) {
      for (let tx = 0; tx < layout.w; tx++) {
        if (grid[ty][tx] && !reach.has(`${tx},${ty}`)) return { ok: false, reason: 'Bloquearía el paso' };
      }
    }
    const check = (o: { def: string; x: number; y: number }) => {
      const od = OBJECTS[o.def];
      if (!od.actions.length || od.walkable) return true;
      for (let ty = o.y - 1; ty <= o.y + od.h; ty++) {
        for (let tx = o.x - 1; tx <= o.x + od.w; tx++) {
          const inside = tx >= o.x && tx < o.x + od.w && ty >= o.y && ty < o.y + od.h;
          const diagonal = (tx < o.x || tx >= o.x + od.w) && (ty < o.y || ty >= o.y + od.h);
          if (!inside && !diagonal && reach.has(`${tx},${ty}`)) return true;
        }
      }
      return false;
    };
    if (!check({ def: defId, x, y })) return { ok: false, reason: 'No se podría usar' };
    for (const o of this.objectsIn(lotId)) {
      if (o.id === ignoreId) continue;
      if (!check(o)) return { ok: false, reason: `Dejaría sin acceso: ${this.objDef(o).name.toLowerCase()}` };
    }
    return { ok: true };
  }

  buy(defId: string, x: number, y: number, q: 1 | 2 | 3 = 2): boolean {
    const d = OBJECTS[defId];
    if (!d?.price || !this.canBuildHere()) return false;
    const price = priceOf(d, q);
    if (this.household.funds < price) {
      this.toast('No hay dinero suficiente', '💸');
      return false;
    }
    const can = this.canPlace(defId, x, y);
    if (!can.ok) {
      if (can.reason) this.toast(can.reason, '🚫');
      return false;
    }
    this.household.funds -= price;
    this.state.objects.push({
      id: this.newId('o'),
      def: defId,
      lotId: this.household.lotId,
      x,
      y,
      ...(d.tiers && q !== 2 ? { q } : {}),
      ...(d.maxStock ? { stock: 0 } : {}),
      ...(d.maxDirt ? { dirt: 0 } : {}),
    });
    this.rebuildGrid();
    return true;
  }

  /** La siguiente ampliación posible de la casa (si queda alguna). */
  nextExpansion() {
    const size = this.lotById(this.household.lotId)?.size ?? 1;
    return EXPANSIONS.find((e) => e.size === size + 1);
  }

  /** Amplía la casa de la familia: el plano crece y lo del jardín se corre. */
  expandHouse(): boolean {
    const ex = this.nextExpansion();
    const lot = this.lotById(this.household.lotId);
    if (!ex || !lot || !this.canBuildHere()) return false;
    if (this.household.funds < ex.price) {
      this.toast('No hay dinero suficiente para la reforma', '💸');
      return false;
    }
    const before = this.layoutFor(lot);
    this.household.funds -= ex.price;
    if (ex.shiftX) {
      // Todo lo que estaba en el jardín de la derecha se corre para dejar sitio a la habitación.
      const edge = before.w - 3;
      for (const o of this.objectsIn(lot.id)) if (o.x >= edge) o.x += ex.shiftX;
      for (const a of this.agentsIn(lot.id)) {
        if (a.pos.x >= edge - 0.5) a.pos = { x: a.pos.x + ex.shiftX, y: a.pos.y };
        a.path = [];
        if (a.current && !a.home) this.endTask(a);
      }
    }
    lot.size = ex.size;
    this.rebuildGrid();
    for (const m of this.members) if (m.kind === 'person') this.feel(m, 'casa_nueva');
    this.toast(`¡Reforma terminada! ${ex.label}. Los albañiles se han dejado un bocadillo a medias`, '🏗️');
    this.addNews(`la ${this.household.name} ha hecho obras en casa. Han estado tres semanas con el taladro`, []);
    return true;
  }

  /** Motivo por el que no se puede mover o vender un objeto (o undefined si se puede). */
  cantTouch(o: PlacedObject): string | undefined {
    if (o.lotId !== this.household.lotId) return 'No es vuestro';
    if (this.usersOf(o.id).length) return 'Alguien lo está usando';
    if (this.residentOf(o.id)) return `Aquí vive ${this.residentOf(o.id)!.name}`;
    return undefined;
  }

  moveObject(id: string, x: number, y: number): boolean {
    const o = this.object(id);
    if (!o || !this.canBuildHere()) return false;
    const why = this.cantTouch(o);
    const can = why ? { ok: false, reason: why } : this.canPlace(o.def, x, y, id);
    if (!can.ok) {
      if (can.reason) this.toast(can.reason, '🚫');
      return false;
    }
    o.x = x;
    o.y = y;
    this.rebuildGrid();
    return true;
  }

  sellObject(id: string): boolean {
    const o = this.object(id);
    if (!o || !this.canBuildHere()) return false;
    const d = this.objDef(o);
    const why = !d.price ? 'Esto no se puede vender' : this.cantTouch(o);
    if (why) {
      this.toast(why, '🚫');
      return false;
    }
    const refund = Math.floor(priceOf(d, o.q ?? 2) * SELL_RATIO);
    this.household.funds += refund;
    this.state.objects = this.state.objects.filter((x) => x !== o);
    this.rebuildGrid();
    this.toast(`Vendido: ${d.name.toLowerCase()} (+§${refund})`, '🏷️');
    return true;
  }

  /** Decoración bonita alrededor (plantas, lámparas, alfombras...). */
  private decorAround(a: Agent): number {
    if (a.kind !== 'person' || a.hidden) return 0;
    let sum = 0;
    for (const o of this.objectsIn(a.lotId)) {
      const d = (this.objDef(o).decor ?? 0) + (o.q === 3 ? 1 : 0);
      if (d && Math.abs(o.x - a.pos.x) <= 2 && Math.abs(o.y - a.pos.y) <= 2) sum += d;
    }
    return Math.min(sum, 3);
  }

  /** Cosas que pasan: averías, dinero encontrado, la lotería... */
  private dailyEvents() {
    const h = this.household;
    if (this.state.familyGone) return;
    for (const o of this.objectsIn(h.lotId)) {
      if (this.objDef(o).breakable && !o.broken && Math.random() < 0.03 * QUALITY[o.q ?? 2].breaks) {
        o.broken = true;
        this.toast(`Se ha estropeado: ${this.objDef(o).name.toLowerCase()}. Toca para repararlo`, '🔧');
      }
    }
    const r = Math.random();
    if (r < 0.01) {
      h.funds += 500;
      this.toast('¡Os ha tocado la lotería! +§500', '🎟️');
      this.addNews(`a la ${h.name} le ha tocado la lotería`, []);
    } else if (r < 0.08) {
      h.funds += 50;
      this.toast('Habéis encontrado §50 en el bolsillo de un abrigo viejo', '🧥');
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

    this.births();
    this.checkDelivery();
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
      a.pos = this.gardenOf(a.lotId);
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
        for (const m of ms) {
          if (m.job && CAREERS[m.job.career]?.business) {
            h.funds -= 90;
            this.feel(m, 'cuota');
            if (h.id === this.household.id) this.toast(`Cuota de autónomos de ${m.name}: −§90`, '🧾');
          }
        }
        if (h.id === this.household.id) {
          this.toast(`Han llegado las facturas de la semana: §${bill}`, '🧾');
          if (h.funds < 0) this.toast('¡Estáis en números rojos!', '⚠️');
        }
      }
    }
    this.dailyEvents();
    this.seasonalDay();
    this.evolveTraits();
    // Cada día, el deseo más antiguo de cada uno cambia por otro.
    for (const m of this.members) {
      if (m.wishes && m.wishes.length >= 3) {
        m.wishes.shift();
        const w = newWish(this, m);
        if (w) m.wishes.push(w);
      }
    }
    // Los vecinos hacen su compra sin que lo veamos.
    for (const h of this.state.households) if (h.id !== this.household.id) h.pantry = Math.max(h.pantry ?? 0, 12);
    // Pensiones
    for (const h of this.state.households) {
      for (const id of h.memberIds) {
        const m = this.agent(id);
        if (m?.kind === 'person' && this.stageOf(m) === 'elder' && !m.job) h.funds += 30;
      }
    }
    // Envejecer
    const step = this.state.aging === 'off' ? 0 : this.state.aging === 'fast' ? 2 : 1;
    if (step) {
      for (const a of [...this.state.agents]) {
        const before = lifeStage(a.species, a.ageDays);
        a.ageDays += step;
        const after = lifeStage(a.species, a.ageDays);
        if (before.id !== after.id) {
          if (this.isPlayerMember(a)) this.toast(`¡${a.name} ha crecido! Ahora es ${after.label.toLowerCase()}. ¡Feliz cumpleaños!`, '🎂');
          if (a.kind === 'person' && after.id !== 'baby') this.feel(a, 'cumple');
          this.onStageChange(a, after.id);
        }
      }
      for (const a of [...this.state.agents]) {
        if (Math.random() < this.deathChance(a)) this.die(a, 'old');
      }
    }
    // Dramas del barrio: alguna pareja de vecinos se separa (y hay que contarlo).
    for (const [k, rel] of Object.entries(this.state.rels)) {
      if (!rel.status) continue;
      const [x, y] = k.split('|').map((id) => this.agent(id));
      if (!x || !y || this.isPlayerMember(x) || this.isPlayerMember(y)) continue;
      if (x.householdId === y.householdId) rel.r = Math.min(100, rel.r + 0.5);
      if (Math.random() < 0.004) {
        const married = rel.status === 'married';
        rel.status = undefined;
        rel.r = Math.min(rel.r, 15);
        if (x.householdId === y.householdId) rel.ex = true;
        this.addNews(married ? `${x.name} y ${y.name} se han divorciado. Dicen que por una herencia` : `${x.name} y ${y.name} lo han dejado`, [x.id, y.id]);
      }
    }
    // Los vecinos también tienen hijos.
    for (const h of this.state.households) {
      if (h.id === this.household.id || h.expecting || h.memberIds.length >= 6) continue;
      const people = h.memberIds.map((id) => this.agent(id)!).filter((m) => m && m.kind === 'person' && ['young', 'adult'].includes(this.stageOf(m)));
      const couple = people.flatMap((p, i) => people.slice(i + 1).map((q) => [p, q] as const)).find(([p, q]) => getRel(this.state, p.id, q.id).status);
      if (couple && this.freeCrib(h.lotId) && Math.random() < 0.12) h.expecting = { parents: [couple[0].id, couple[1].id], due: this.state.minutes + 3 * MINUTES_PER_DAY };
    }
    // Mascotas en el barrio: si falta alguna especie, una familia la adopta; y de vez en cuando, por gusto.
    const ALL: SpeciesId[] = ['dog', 'cat', 'guineapig', 'ferret', 'capybara'];
    const present = new Set(this.state.agents.map((a) => a.species));
    const wanted: SpeciesId[] = ALL.filter((sp) => !present.has(sp));
    if (Math.random() < 0.3) wanted.push(ALL[Math.floor(Math.random() * ALL.length)]);
    for (const species of wanted) {
      const candidates = this.state.households.filter((h) => {
        if (h.id === this.household.id || h.memberIds.length >= 6) return false;
        const ms = h.memberIds.map((id) => this.agent(id)!).filter(Boolean);
        if (ms.filter((m) => m.kind === 'pet').length >= 2 || !ms.some((m) => m.kind === 'person' && isAdult(m))) return false;
        return species !== 'guineapig' || this.objectsIn(h.lotId).some((o) => o.def === 'cage' && !this.residentOf(o.id));
      });
      const h = candidates[Math.floor(Math.random() * candidates.length)];
      if (h) this.neighbourAdopts(h, species);
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
      const extra = k === 'hygiene' ? (1 + homeDirt * 0.6) * (a.kind === 'person' && this.heatNow ? 1.3 : 1) : 1;
      a.needs[k] = clamp(a.needs[k] - decay[k] * dt * mult * extra * traitDecay(a, k));
    }

    this.checkFailures(a);
    if (this.checkStarving(a, dt)) return;
    const decor = this.decorAround(a);
    if (decor) a.needs.fun = clamp(a.needs.fun + 0.02 * decor * dt);

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
        if (a.kind === 'person') this.feel(a, 'verguenza');
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

  /** Hambre a cero demasiado tiempo. Devuelve true si el agente ha dejado la partida. */
  private checkStarving(a: Agent, dt: number): boolean {
    if (a.needs.hunger > 0) {
      a.starving = undefined;
      return false;
    }
    a.starving = (a.starving ?? 0) + dt;
    const baby = a.kind === 'person' && this.stageOf(a) === 'baby';
    const limit = baby ? 360 : MINUTES_PER_DAY;
    if (a.starving === dt && this.isPlayerMember(a)) this.toast(`¡${a.name} está muriéndose de hambre!`, '🆘');
    if (a.starving < limit) return false;
    this.die(a, baby ? 'social' : a.kind === 'pet' ? 'runaway' : 'hunger');
    return true;
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
      if (task.actionId === 'repair') {
        o.broken = false;
        if (this.isPlayerMember(a)) this.toast(`${a.name} ha arreglado: ${od.name.toLowerCase()}`, '🔧');
      }
      if (task.actionId === 'steal') this.hideObject(a, o);
      if (def.doneToast) this.toastOnce(`${a.id}:${def.id}`, def.doneToast.replace('{name}', a.name).replace('{obj}', od.name.toLowerCase()), def.icon);
    }
    if (task.actionId === 'adopt' && task.param) this.adopt(task.param as SpeciesId);
    if (task.actionId === 'throw_party') this.startParty(a);
    if (task.actionId === 'train_pet') {
      const pet = this.agent(task.targetAgentId);
      if (pet) this.trainPet(a, pet);
    }
    if (task.actionId === 'show_trick') {
      const pet = this.agent(task.targetAgentId);
      const tr = pet?.tricks?.[Math.floor(Math.random() * (pet.tricks?.length ?? 1))];
      if (pet && tr) {
        this.say(a.id, `¡${pet.name}, ${tr.toLowerCase()}!`);
        for (const x of this.agentsIn(a.lotId)) if (x.kind === 'person' && x !== a && !x.hidden && Math.hypot(x.pos.x - pet.pos.x, x.pos.y - pet.pos.y) < 5) x.needs.fun = clamp(x.needs.fun + 10);
      }
    }
    if (task.actionId === 'day_off' && a.job) {
      a.job.dayOff = this.day + 1;
      this.toast(`${a.name} tiene libre mañana. ¡A disfrutar!`, '🏖️');
    }
    if (task.actionId === 'buy_lottery') {
      this.state.lottery = [...(this.state.lottery ?? []), a.id];
      this.toast(`${a.name} ha comprado un décimo. ¡Que toque!`, '🎫');
    }
    this.bump(a, task.actionId);
    this.taskFeelings(a, task, o);
    this.skillPayoff(a, task.actionId);
    this.shopping(a, task.actionId);
    if (task.actionId === 'find_job' && task.param) this.setJob(a, task.param);
    if (ACTIONS[task.actionId].target === 'agent' && task.actionId !== 'say_goodbye') {
      const t = this.agent(task.targetAgentId);
      if (t) this.socialOutcome(a, t, task.actionId);
    }
    if (task.actionId !== 'talk') {
      const t = this.agent(task.targetAgentId);
      this.wishEvent(a, { action: task.actionId, target: task.targetAgentId, targetHousehold: t?.householdId });
    }
    if (task.actionId === 'squeak' || task.actionId === 'cry') this.callForAttention(a);
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
      if (def.cost && hh) hh.funds -= this.costOf(task.actionId);
      if (def.consumes) o.stock = Math.max(0, (o.stock ?? 0) - 1);
      if (FRIDGE_FOOD.has(task.actionId)) {
        const owner = this.pantryOwner(o.lotId);
        if (owner) owner.pantry = Math.max(0, (owner.pantry ?? 0) - 1);
      }
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
    const tq = def.target === 'object' ? this.object(task.targetObjectId)?.q : undefined;
    this.applyEffects(a, def.effects, dt, tq ? QUALITY[tq].mult : 1);
    if (def.skill) this.practice(a, def.skill, dt);
    if (partner && def.partnerEffects) this.applyEffects(partner, def.partnerEffects, dt);
    task.remaining -= dt;
    if (task.remaining <= 0 || this.isSatisfied(a, def)) {
      if (def.offLot && partner) {
        this.endTask(partner);
      }
      this.completeTask(a, task);
    }
  }

  private applyEffects(a: Agent, effects: Partial<Needs>, dt: number, mult = 1) {
    for (const k of NEED_KEYS) {
      const e = effects[k];
      if (e) a.needs[k] = clamp(a.needs[k] + e * dt * (e > 0 ? mult : 1));
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
      if (p.kind !== 'person' || this.stageOf(p) === 'baby' || p.householdId !== pet.householdId || p.hidden || this.isActive(p) || p.queue.length) continue;
      const c = p.current;
      if (c && (c.byPlayer || c.passiveOf || !ACTIONS[c.actionId].interruptible)) continue;
      const d = Math.hypot(p.pos.x - pet.pos.x, p.pos.y - pet.pos.y);
      if (!best || d < best.d) best = { p, d };
    }
    if (!best) {
      if (this.isPlayerMember(pet)) {
        const baby = pet.kind === 'person';
        this.toastOnce(`${pet.id}:squeak`, baby ? `${pet.name} está llorando y no hay nadie para atenderle` : `${pet.name} chilla pidiendo atención`, baby ? '😭' : '📣', 240);
      }
      return;
    }
    let care = 'pet_animal';
    if (pet.kind === 'person') {
      care = pet.needs.hunger < 50 ? 'feed_baby' : pet.needs.bladder < 50 || pet.needs.hygiene < 50 ? 'change_diaper' : 'rock_baby';
    }
    this.endTask(best.p);
    this.beginTask(best.p, { id: this.newId('t'), actionId: care, byPlayer: false, phase: 'walking', remaining: 0, targetAgentId: pet.id });
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
        if (def.cost) {
          const hh = this.householdOf(a);
          if (hh) hh.funds -= def.cost;
        }
        if (task.actionId === 'flirt' || task.actionId === 'kiss' || task.actionId === 'niqui') this.jealousy(a, t);
        let bedId: string | undefined;
        if (task.actionId === 'niqui') {
          bedId = this.freeBed(a.lotId)?.id;
          if (!bedId) {
            if (task.byPlayer) this.toast('Hace falta una cama libre', '🛏️');
            return this.endTask(a);
          }
          task.targetObjectId = bedId;
        }
        this.endTask(t);
        t.current = { id: this.newId('t'), actionId: task.actionId, byPlayer: false, phase: 'acting', remaining: def.duration + 5, passiveOf: a.id, targetObjectId: bedId };
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
    let p = acceptChance(this.state, a, t, actionId);
    const friendly = ['chat', 'joke', 'hug', 'flirt', 'kiss', 'talk', 'niqui', 'ask_partner', 'propose'].includes(actionId);
    if (t.kind === 'person' && friendly) {
      // De buen humor se acepta más; con rencor o enfadado, bastante menos.
      if (p < 1) p *= 0.8 + Math.max(0, Math.min(100, moodScore(t))) / 250;
      if (this.grudge(t, a)) p *= 0.55;
      if (hasEmotion(t, 'enfadado')) p *= 0.7;
    }
    if (Math.random() < p) return true;
    changeRel(this.state, a.id, t.id, -3, ROMANTIC.has(actionId) ? -5 : 0);
    a.needs.social = clamp(a.needs.social - 10);
    a.needs.fun = clamp(a.needs.fun - 5);
    const text = REJECT_TEXT[actionId] ?? 'ha rechazado a';
    if (actionId === 'ask_partner' || actionId === 'propose') this.feel(a, 'calabazas', t.name);
    else if (ROMANTIC.has(actionId)) this.feel(a, 'cobra', t.name);
    this.remember(a, t, actionId === 'kiss' ? 'cobra' : 'rechazo');
    if (this.isPlayerMember(a) || this.isPlayerMember(t)) this.toast(`${t.name} ${text} ${a.name}`, '😳');
    return false;
  }

  /** Guarda un recuerdo en la relación de los dos: `doer` hizo `k` (a `victim`). */
  remember(victim: Agent, doer: Agent, k: string) {
    const key = relKey(victim.id, doer.id);
    const rel = this.state.rels[key] ?? (this.state.rels[key] = { f: 0, r: 0 });
    rel.mem = rel.mem ?? [];
    rel.mem.push({ k, d: this.day, by: doer.id });
    if (rel.mem.length > 5) rel.mem.shift();
  }

  /** Lo que `t` le hizo a `a` y aún no le ha perdonado. */
  grudge(a: Agent, t: Agent): string | undefined {
    return grudgeOf(getRel(this.state, a.id, t.id), a.id, t.id, this.day);
  }

  /** Emociones al terminar algo: lo rico que estaba, lo bien que se ha dormido... */
  private taskFeelings(a: Agent, task: Task, o?: PlacedObject) {
    if (a.kind !== 'person') return;
    const id = task.actionId;
    if (id === 'acai_bowl' || id === 'smoothie') this.feel(a, 'acai');
    else if (id === 'cook' && this.skillLevel(a, 'cocina') >= 2) this.feel(a, 'casero');
    else if (id === 'selfie') this.feel(a, 'selfie');
    else if (id === 'run' || id === 'pilates' || id === 'reformer') this.feel(a, 'endorfinas');
    else if (['listen_music', 'read', 'swing', 'sit_bench'].includes(id) && Math.random() < 0.35) this.feel(a, 'inspirado');
    if (!o) return;
    const q = o.q ?? 2;
    if (id === 'sleep' || id === 'nap_bed') {
      if (q === 3) this.feel(a, 'descansado');
      else if (q === 1 && Math.random() < 0.6) this.feel(a, 'espalda');
    }
    if ((id === 'shower' || id === 'bath') && q === 3) this.feel(a, 'ducha_spa');
    if (id === 'nap_sofa' && q === 1 && Math.random() < 0.4) this.feel(a, 'espalda');
  }

  /** Emociones y recuerdos de las interacciones que salen bien. */
  private socialFeelings(a: Agent, t: Agent, id: string) {
    const rel = getRel(this.state, a.id, t.id);
    if (id === 'hug') {
      this.feel(a, 'abrazo');
      this.feel(t, 'abrazo');
    }
    if (id === 'joke') this.feel(t, 'risas');
    if (id === 'kiss' || id === 'ask_partner') {
      this.feel(a, 'enamorado', t.name);
      this.feel(t, 'enamorado', a.name);
      if (id === 'kiss' && !(rel.mem ?? []).some((m) => m.k === 'primer_beso')) this.remember(t, a, 'primer_beso');
    }
    if (id === 'propose') {
      this.feel(a, 'boda', t.name);
      this.feel(t, 'boda', a.name);
      this.remember(t, a, 'boda');
    }
    if (id === 'insult') {
      this.feel(t, 'insultado', a.name);
      this.remember(t, a, 'insulto');
    }
    if (['pet_animal', 'play_pet', 'cuddle_capy', 'beg_affection', 'play_with_person'].includes(id)) {
      const person = a.kind === 'person' ? a : t;
      const pet = a.kind === 'pet' ? a : t;
      if (person.kind === 'person' && pet.kind === 'pet' && Math.random() < 0.5) this.feel(person, 'mimos', pet.name);
    }
  }

  // --- Metas de vida ----------------------------------------------------------

  setAspiration(a: Agent, id: string) {
    if (!ASPIRATION_BY_ID[id] || !canAspire(this, a)) return;
    a.aspiration = { id, stage: 0 };
    this.toast(`${a.name} tiene una nueva meta de vida: ${ASPIRATION_BY_ID[id].label}`, ASPIRATION_BY_ID[id].icon);
  }

  /** Cada hora: ¿alguien de la familia ha cumplido una etapa de su meta? */
  private checkAspirations() {
    if (!this.wishesEnabled) return;
    for (const m of this.members) {
      if (!canAspire(this, m)) continue;
      if (!m.aspiration) {
        m.aspiration = { id: suggestAspiration(m), stage: 0 };
        continue;
      }
      const def = ASPIRATION_BY_ID[m.aspiration.id];
      const st = def?.stages[m.aspiration.stage];
      if (!def || !st || !st.done(this, m)) continue;
      m.aspiration.stage++;
      const last = m.aspiration.stage >= def.stages.length;
      const reward = last ? 1500 : 150 * m.aspiration.stage;
      this.household.funds += reward;
      if (last) {
        this.feel(m, 'orgulloso', def.label, 72);
        m.aspirationsDone = [...(m.aspirationsDone ?? []), def.id];
        this.toast(`¡${m.name} ha cumplido su meta de vida: ${def.label}! +§${reward}`, '🏆');
        this.addNews(`${m.name} ha cumplido su sueño: ${def.label.toLowerCase()}`, [m.id]);
        this.say(m.id, '¡Lo he conseguido! ¡Mi sueño!', 'say');
      } else {
        this.feel(m, 'orgulloso', def.label);
        this.toast(`Meta de ${m.name}: «${st.label}» ✓ (+§${reward})`, def.icon);
      }
    }
  }

  /** Los hijos sacan un rasgo de su padre o de su madre; el otro es suyo. */
  private inheritTraits(parents: Agent[]): string[] {
    const pool = parents.flatMap((p) => traitsOf(p).map((t) => t.id));
    const any = () => TRAITS[Math.floor(Math.random() * TRAITS.length)].id;
    const first = pool.length ? pool[Math.floor(Math.random() * pool.length)] : any();
    let second = any();
    for (let i = 0; i < 20 && (second === first || [first, second].sort().join() === 'grunon,optimista'); i++) second = any();
    if (second === first) second = first === 'bromista' ? 'optimista' : 'bromista';
    return [first, second];
  }

  /** Los hábitos cambian a la gente: quien corre mucho acaba siendo deportista. */
  private evolveTraits() {
    for (const m of this.members) {
      if (m.kind !== 'person' || !['teen', 'young', 'adult', 'elder'].includes(this.stageOf(m))) continue;
      if (m.traitChangedDay !== undefined && this.day - m.traitChangedDay < 7) continue;
      const ts = traitsOf(m).map((t) => t.id);
      let best: { trait: string; ratio: number; sum: number } | undefined;
      for (const h of HABITS) {
        if (ts.includes(h.trait)) continue;
        const sum = h.actions.reduce((acc, k) => acc + (m.stats?.[k] ?? 0), 0) - (m.stats?.[`base_${h.trait}`] ?? 0);
        const ratio = sum / h.min;
        if (ratio >= 1 && (!best || ratio > best.ratio)) best = { trait: h.trait, ratio, sum };
      }
      if (!best) continue;
      // Se pierde el rasgo que menos encaja con lo que hace ahora (y nunca gruñón y optimista a la vez).
      const habitRatio = (t: string) => {
        const h = HABITS.find((x) => x.trait === t);
        return h ? h.actions.reduce((acc, k) => acc + (m.stats?.[k] ?? 0), 0) / h.min : 0;
      };
      const clash = best.trait === 'grunon' ? 'optimista' : best.trait === 'optimista' ? 'grunon' : '';
      const out = ts.includes(clash) ? clash : [...ts].sort((x, y) => habitRatio(x) - habitRatio(y))[0];
      m.traits = ts.map((t) => (t === out ? best!.trait : t));
      m.traitChangedDay = this.day;
      m.stats = m.stats ?? {};
      m.stats[`base_${best.trait}`] = (m.stats[`base_${best.trait}`] ?? 0) + best.sum;
      const nt = TRAIT_BY_ID[best.trait];
      const ot = TRAIT_BY_ID[out];
      this.toast(`${HABIT_TEXT[best.trait] ?? 'Con el tiempo...'} ¡${m.name} se ha vuelto ${nt.label.toLowerCase()}!${ot ? ` (ya no es ${ot.label.toLowerCase()})` : ''}`, nt.icon);
      this.addNews(`${m.name} ha cambiado mucho: ahora es ${nt.label.toLowerCase()}`, [m.id]);
    }
  }

  /** Cambia un rasgo (al hacerse adulto se puede elegir uno). */
  pickTrait(a: Agent, oldId: string, newId: string) {
    const ts = traitsOf(a).map((t) => t.id);
    if (!a.traitPick || !ts.includes(oldId) || ts.includes(newId)) return;
    if ((newId === 'grunon' && ts.includes('optimista') && oldId !== 'optimista') || (newId === 'optimista' && ts.includes('grunon') && oldId !== 'grunon')) return;
    a.traits = ts.map((t) => (t === oldId ? newId : t));
    a.traitPick = false;
    this.toast(`${a.name} ahora es ${TRAIT_BY_ID[newId].label.toLowerCase()}`, TRAIT_BY_ID[newId].icon);
  }

  // --- Mascotas: trucos y persona favorita ------------------------------------

  /** La persona de la familia a la que más quiere (si quiere a alguien de verdad). */
  favoriteOf(pet: Agent): Agent | undefined {
    if (pet.kind !== 'pet') return undefined;
    let best: Agent | undefined;
    let bf = 25;
    for (const id of this.householdOf(pet)?.memberIds ?? []) {
      const p = this.agent(id);
      if (!p || p.kind !== 'person') continue;
      const f = getRel(this.state, pet.id, p.id).f;
      if (f > bf) {
        bf = f;
        best = p;
      }
    }
    return best;
  }

  /** Una sesión de adiestramiento: más rápido si es listo, si está contento y con su persona favorita. */
  private trainPet(person: Agent, pet: Agent) {
    const learn = PET_TRAIT_BY_ID[pet.petTrait ?? '']?.learn ?? 1;
    const fav = this.favoriteOf(pet) === person ? 1.3 : 1;
    const mood = moodScore(pet);
    if (mood < 25) {
      this.toastFor(person, `${pet.name} no está por la labor hoy`, SPECIES[pet.species].icon);
      return;
    }
    const before = pet.training ?? 0;
    pet.training = Math.min(100, before + 11 * learn * fav * (0.7 + mood / 160));
    const list = TRICKS[pet.species] ?? [];
    const known = Math.min(list.length, Math.floor(pet.training / 20));
    pet.tricks = pet.tricks ?? [];
    while (pet.tricks.length < known) {
      const trick = list[pet.tricks.length];
      pet.tricks.push(trick);
      this.feel(person, 'truco', pet.name);
      this.bump(person, 'tricks');
      if (this.isPlayerMember(person)) this.toast(`¡${pet.name} ha aprendido un truco: ${trick}!`, '🎪');
      this.addNews(`${pet.name}, la mascota de la ${this.householdOf(pet)?.name ?? 'familia'}, sabe ${trick.toLowerCase()}`, [pet.id]);
    }
  }

  /** Al llegar a casa, la mascota recibe a su persona favorita. */
  private petGreeting(a: Agent) {
    if (a.kind !== 'person' || !this.isPlayerMember(a)) return;
    for (const pet of this.members) {
      if (pet.kind !== 'pet' || pet.lotId !== a.lotId || pet.travel || pet.hidden || pet.home) continue;
      if (this.favoriteOf(pet) !== a) continue;
      pet.needs.social = clamp(pet.needs.social + 20);
      a.needs.social = clamp(a.needs.social + 8);
      this.feel(a, 'mimos', pet.name);
      const how: Partial<Record<SpeciesId, string>> = { dog: 'moviendo el rabo como loco', cat: 'restregándose por sus piernas', ferret: 'dando saltitos', capybara: 'con toda la calma del mundo' };
      this.toastOnce(`${pet.id}:greet`, `¡${pet.name} recibe a ${a.name} ${how[pet.species] ?? 'muy contento'}!`, SPECIES[pet.species].icon, 360);
    }
  }

  // --- Fiestas ---------------------------------------------------------------

  /** La familia monta una fiesta en casa: vienen vecinos de varias familias. */
  startParty(host: Agent) {
    const lotId = this.household.lotId;
    const until = Math.min(this.state.minutes + 240, this.endOfVisits() + 60);
    const birthday = this.members.find((m) => hasEmotion(m, 'cumple'))?.name;
    this.state.party = { lotId, host: host.id, until, ...(birthday ? { birthday } : {}) };
    // Se invita a gente de varias familias (primero a los amigos).
    const guests: Agent[] = [];
    const others = this.state.households.filter((h) => h.id !== this.household.id).sort(() => Math.random() - 0.5);
    for (const h of others) {
      const ppl = this.availableVisitors(h).filter((x) => x.kind === 'person' && this.stageOf(x) !== 'child');
      ppl.sort((x, y) => getRel(this.state, host.id, y.id).f - getRel(this.state, host.id, x.id).f);
      for (const p of ppl.slice(0, 2)) guests.push(p);
      if (guests.length >= 6) break;
    }
    for (const g of guests) {
      this.startTravel(g, lotId);
      g.visitUntil = until;
    }
    for (const m of this.members) if (m.kind === 'person' && m.lotId === lotId) this.feel(m, 'fiesta', undefined, 4);
    this.noVisitsUntil = until;
    this.toast(birthday ? `¡Fiesta de cumpleaños de ${birthday}! Vienen ${guests.length} invitados` : `¡Fiesta en casa! Vienen ${guests.length} invitados`, '🥳');
  }

  private partyHour() {
    const p = this.state.party;
    if (!p) return;
    const here = this.agentsIn(p.lotId).filter((x) => x.kind === 'person' && !x.travel);
    for (const x of here) this.feel(x, 'fiesta', undefined, 4);
    if (this.state.minutes < p.until) return;
    // Fin de fiesta: buen recuerdo, nuevos amigos y alguna resaca.
    const host = this.agent(p.host);
    for (const x of here) {
      this.feel(x, 'fiesta');
      if (host && x !== host) {
        changeRel(this.state, host.id, x.id, 8);
        this.remember(x, host, 'fiesta');
      }
      if (isAdult(x) && !hasTrait(x, 'fiestero') && Math.random() < 0.3) this.feel(x, 'resaca', undefined, 10);
    }
    for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) changeRel(this.state, here[i].id, here[j].id, 3);
    if (host) this.bump(host, 'parties');
    const guests = here.filter((x) => x.householdId !== this.household.id).length;
    const good = guests >= 3;
    this.toast(good ? '¡La fiesta ha sido todo un éxito!' : 'La fiesta ha estado... tranquila', good ? '🎉' : '😅');
    this.addNews(p.birthday ? `la fiesta de cumpleaños de ${p.birthday} fue la comidilla del barrio` : `la fiesta de la ${this.household.name} ${good ? 'fue un fiestón' : 'fue un poco sosa'}`, host ? [host.id] : []);
    this.state.party = undefined;
  }

  /** Coquetear delante de la pareja tiene consecuencias. */
  private jealousy(a: Agent, t: Agent) {
    for (const [who, other] of [[a, t], [t, a]] as const) {
      const pid = partnerOf(this.state, who.id);
      if (!pid || pid === other.id) continue;
      const p = this.agent(pid);
      if (!p || p.lotId !== who.lotId || p.travel || p.hidden) continue;
      changeRel(this.state, who.id, p.id, -12, -15);
      this.feel(p, 'celos', who.name);
      this.remember(p, who, 'celos');
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
      this.addNews(`${a.name} y ${t.name} están saliendo`, [a.id, t.id]);
    }
    if (actionId === 'propose' && rel) {
      rel.status = 'married';
      if (loud) this.toast(`¡${a.name} y ${t.name} se casan!`, '💍');
      this.addNews(`${a.name} y ${t.name} se casan`, [a.id, t.id]);
    }
    if (actionId === 'move_in') this.moveIn(t);
    this.socialFeelings(a, t, actionId);
    if (actionId === 'try_baby') {
      const h = this.householdOf(a);
      if (h && !h.expecting && Math.random() < 0.7) {
        h.expecting = { parents: [a.id, t.id], due: this.state.minutes + 3 * MINUTES_PER_DAY };
        if (loud) this.toast(`¡${a.name} y ${t.name} van a tener un bebé! Llegará en 3 días`, '🍼');
      } else if (loud) this.toast('Esta vez no ha habido suerte. ¡Otra vez será!', '🍀');
    }
    if (actionId === 'change_diaper') {
      const crib = this.object(t.home);
      if (crib) crib.dirt = 0;
    }
    if (actionId === 'insult' && loud) this.toastOnce(`${key}:insult`, `${a.name} y ${t.name} han discutido`, '🤬', 120);
    if (actionId === 'argue') {
      this.feel(a, 'enfadado', t.name);
      this.feel(t, 'enfadado', a.name);
      this.remember(t, a, 'pelea');
      if (loud) this.toastOnce(`${key}:argue`, `¡Bronca entre ${a.name} y ${t.name}!`, '💢', 120);
    }
    if (actionId === 'apologize') {
      forget(t, 'enfadado');
      forget(t, 'insultado');
      forget(a, 'enfadado');
      this.remember(t, a, 'perdon');
      this.feel(a, 'reconciliados', t.name);
      this.feel(t, 'reconciliados', a.name);
      if (loud) this.toast(`${t.name} acepta las disculpas de ${a.name}. ¡Hacen las paces!`, '🕊️');
    }
    if ((actionId === 'break_up' || actionId === 'divorce') && rel) {
      const divorce = actionId === 'divorce';
      rel.status = undefined;
      if (a.householdId === t.householdId) rel.ex = true;
      this.remember(t, a, divorce ? 'divorcio' : 'ruptura');
      this.feel(t, 'corazon_roto', a.name);
      this.feel(a, 'corazon_roto', t.name, 24);
      if (loud) {
        this.toast(divorce ? `${a.name} y ${t.name} se divorcian` : `${a.name} ha cortado con ${t.name}`, '💔');
        if (rel.ex) this.toast('...pero siguen viviendo juntos. La hipoteca no entiende de sentimientos', '🏠');
      }
      this.addNews(divorce ? `${a.name} y ${t.name} se han divorciado` : `${a.name} y ${t.name} lo han dejado`, [a.id, t.id]);
    }
    if (actionId === 'insult' && (rel?.f ?? 0) <= -50) this.addNews(`${a.name} y ${t.name} no se pueden ni ver`, [a.id, t.id]);
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
