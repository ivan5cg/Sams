// El mundo: estado de la partida y bucle de simulación. La lógica de cada sistema
// (trabajo, viajes, construcción, salseo...) está en ./systems; World es la fachada
// que usan la interfaz, la escena, la IA y las pruebas.

import { ACTIONS, type ActionDef } from '../data/actions';
import type { DilemmaOption } from '../data/dilemmas';
import { EMOTIONS } from '../data/emotions';
import { HOUSE_OBJECTS, LAYOUTS, houseLayout, isOutdoor, type LotLayout } from '../data/lot';
import { OBJECTS, sizeOf, type ObjectDef } from '../data/objects';
import { SEASONS } from '../data/seasons';
import { SPECIES, lifeStage } from '../data/species';
import { chooseAutonomous } from './ai';
import { canAspire, suggestAspiration } from './aspirations';
import { feel as feelEmotion, pruneEmotions } from './emotions';
import { ACAI_LOTS, BAR_LOT, GYM_LOT, LIBRARY_LOT, MARKET_LOT, METRO_LOT, PARK_LOT, PLAYER_LOT, PLAZA_LOT, STUDIO_LOT, SUPER_LOT, CERRO_LOT, PADEL_LOT, addAlcorcon, addGetafe, addPlaces, stationOf, generateNeighborhood, makeAgent, placeObjects, randomIndoorTile, setupFamilyLife } from './neighborhood';
import { isWalkable, type Grid } from './pathfinding';
import { isAdult, setRel } from './social';
import { randomPetTrait, traitDecay, traitsOf } from './traits';
import { NEED_KEYS, type Agent, type Household, type Lot, type NeedKey, type PlacedObject, type RoomPaint, type SpeciesId, type Task, type Vec, type WorldState } from './types';
import { topUpWishes } from './wishes';
import { MAX_STEP, MINUTES_PER_DAY, SAVE_VERSION } from './constants';
import { clamp, rand } from './util';
import * as Movement from './systems/movement';
import * as Body from './systems/body';
import * as Street from './systems/street';
import * as Gossip from './systems/gossip';
import * as Party from './systems/party';
import * as Shopping from './systems/shopping';
import * as Build from './systems/build';
import * as Pets from './systems/pets';
import * as Jobs from './systems/jobs';
import * as Calendar from './systems/calendar';
import * as Lifecycle from './systems/lifecycle';
import * as Travel from './systems/travel';
import * as Checks from './systems/checks';
import * as Wishes from './systems/wishes';
import * as Tasks from './systems/tasks';
import * as Social from './systems/social';
import * as Feats from './systems/feats';
import * as Arcs from './systems/arcs';
import * as Trips from './systems/trips';
import * as Bills from './systems/bills';
import * as Illness from './systems/illness';
import { illnessDecay } from './systems/illness';
import { hourlyGrudges } from './systems/violence';
import { dateOfDay, todayISO, type GameDate } from './date';
import { factsOf, type DayFacts } from './feasts';
import { GARCIA, MAX_START_PEOPLE, STAGE_AGE, applyEdit, type FamilySpec, type PersonEdit } from './family';
import * as Economy from './systems/economy';
import { newEconomy } from './systems/economy';

export { SAVE_VERSION, MINUTES_PER_DAY, MAX_MEMBERS, TRAVEL_MINUTES, RIDE_MINUTES, PANTRY_MAX } from './constants';
export { moodScore, objectCenter } from './util';

export type Target =
  | { kind: 'object'; id: string }
  | { kind: 'agent'; id: string }
  | { kind: 'tile'; x: number; y: number };

export interface ActionOption {
  def: ActionDef;
  ok: boolean;
  reason?: string;
  /** No sale en el menú (aún no tiene el nivel, o no pinta nada aquí). */
  hidden?: boolean;
}

export interface Toast {
  text: string;
  icon?: string;
  /** De quién va el aviso (para clasificarlo y para ir hasta esa persona o mascota al tocarlo). */
  agentId?: string;
}

/** Cosas que pasan en la simulación y que le interesan a quien la mira (el sonido, por ejemplo). */
export type SimEvent =
  /** Alguien empieza a hacer algo (comer, ducharse, ladrar...). */
  | { type: 'act'; agentId: string; actionId: string }
  /** Alguien entra o sale por la puerta de una parcela. */
  | { type: 'door'; lotId: string }
  /** Un sonido suelto (comprar un mueble...). */
  | { type: 'sound'; id: string; lotId?: string }
  /** Un gran momento de la familia (para la foto del álbum). */
  | { type: 'moment'; text: string; lotId: string };

export class World {
  state: WorldState;
  /** Estado de la interfaz que no se guarda (modo construcción y vista previa del mueble). */
  ui: {
    building: boolean;
    ghost: { def: string; x: number; y: number; ok: boolean; rot?: 1 } | null;
    /** Mueble sobre el que el tutorial guiado pone una flecha. */
    guide?: { def: string } | null;
    /** Frases que la escena tiene que mostrar en bocadillos. */
    speech: { agentId: string; text: string; kind: 'say' | 'think' }[];
  } = { building: false, ghost: null, speech: [] };
  /** Deseos activados (las pruebas los apagan para que las cuentas cuadren). */
  wishesEnabled = true;
  /** Tras despedir a unas visitas, no llegan otras espontáneas durante un rato. */
  noVisitsUntil = 0;

  // Ajustes que cambian las pruebas
  /** Probabilidad de apagón por día (los tests la cambian). */
  blackoutChance = 0.04;
  /** Probabilidad de dilema por jornada (los tests la cambian). */
  dilemmaChance = 0.35;

  // Estado interno de los sistemas (no se guarda en la partida)
  /** Rejilla de casillas transitables de cada parcela (se recalcula al construir). */
  grids = new Map<string, Grid>();
  /** Quién escucha los avisos (la interfaz). */
  toastListeners: ((t: Toast) => void)[] = [];
  /** Quién escucha los eventos de la simulación (el sonido). */
  eventListeners: ((e: SimEvent) => void)[] = [];
  /** Avisos de necesidades ya dados (para no repetirlos hasta que se recuperen). */
  warned = new Set<string>();
  /** Cuándo salió por última vez cada aviso con clave (ver toastOnce). */
  lastToast = new Map<string, number>();
  /** Hace un calor de muerte (se actualiza cada hora). */
  heatNow = false;
  /** Esta noche hay apagón (se decide al empezar el día). */
  blackoutTonight = false;
  /** Día en que ya se avisó de que no hay dinero para la compra (se avisa una vez al día). */
  noMoneyWarned = -1;
  /** Raps pendientes: ids de quien acaba de subir al metro. */
  rapQueue: string[] = [];
  /** El rap que está sonando en el metro (línea a línea). */
  rap: { by: string; lines: string[]; next: number; about: string } | null = null;
  /** Cuándo se le dedicó el último rap a cada uno (para no repetir). */
  lastRap = new Map<string, number>();
  /** Último día en que las militantes llamaron a la puerta de la familia. */
  campaignKnockDay = -1;
  /** Lo que se puede deshacer en la obra (no se guarda: dura lo que dura la sesión de obra). */
  buildUndo: Build.UndoEntry[] = [];

  constructor(state: WorldState) {
    this.state = state;
    this.rebuildGrid();
    for (const a of state.agents) traitsOf(a);
    topUpWishes(this);
    for (const m of this.members) if (canAspire(this, m) && !m.aspiration) m.aspiration = { id: suggestAspiration(m), stage: 0 };
    for (const a of state.agents) if (a.kind === 'pet' && !a.petTrait) a.petTrait = randomPetTrait(a);
  }

  /** Partida nueva: la familia García o la que se haya diseñado en el creador. */
  static createNew(family: FamilySpec = GARCIA, opts: { start?: string } = {}): World {
    const state: WorldState = {
      version: SAVE_VERSION,
      // El día 1 es hoy (o el que se diga): a partir de ahí, el calendario de verdad.
      calendarStart: opts.start ?? todayISO(),
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
      schedule: [],
      feats: { got: {}, counts: {}, challenges: {} },
      arcs: [],
      economy: newEconomy(1),
    };
    let n = 0;
    const mk = (name: string, species: SpeciesId, ageDays: number, color: number, x: number, y: number) =>
      makeAgent({ id: `a${++n}`, name, species, ageDays, color, householdId: 'h1', lotId: PLAYER_LOT, x, y });
    // Dónde aparece cada uno al empezar.
    const spots = [{ x: 6, y: 4 }, { x: 7, y: 5 }, { x: 5, y: 6 }, { x: 8, y: 4 }];
    const petSpots: Partial<Record<SpeciesId, { x: number; y: number }>> = { dog: { x: 3, y: 7 }, cat: { x: 4, y: 5 }, ferret: { x: 5, y: 7 }, guineapig: { x: 3, y: 6 }, capybara: { x: 11, y: 6 } };
    const people = family.people.slice(0, MAX_START_PEOPLE).map((p, i) => {
      const a = mk(p.name.trim(), 'human', p.ageDays ?? STAGE_AGE[p.stage], p.color, spots[i].x, spots[i].y);
      if (p.look) a.look = { ...p.look };
      if (p.sex) a.sex = p.sex;
      return a;
    });
    const pets = family.pets.map((p) => {
      const at = petSpots[p.species] ?? { x: 4, y: 6 };
      return mk(p.name.trim(), p.species, p.ageDays ?? SPECIES[p.species].stages[0].until + 2, p.color ?? 0x999999, at.x, at.y);
    });
    state.agents.push(...people, ...pets);
    family.people.slice(0, MAX_START_PEOPLE).forEach((p, i) => (people[i].traits = [...p.traits]));
    state.households.push({ id: 'h1', name: `Familia ${family.surname.trim()}`, funds: 2000, memberIds: state.agents.map((a) => a.id), lotId: PLAYER_LOT, pantry: 15 });
    // La pareja (si la hay); todos empiezan sin trabajo (lo eliges tú) y los peques, al colegio.
    const grownUps = people.filter((a) => isAdult(a));
    if (family.couple && grownUps.length >= 2) setRel(state, grownUps[0].id, grownUps[1].id, { f: 70, r: 75, status: 'partner' });
    setupFamilyLife(state, state.agents, { jobs: false });
    for (const a of people) if (['child', 'teen'].includes(lifeStage('human', a.ageDays).id)) a.job = { career: 'school', level: 1, perf: 50 };
    placeObjects(state, PLAYER_LOT, HOUSE_OBJECTS);
    // Las cobayas viven en su jaula.
    for (const pet of pets) {
      const habitat = SPECIES[pet.species].habitat;
      if (!habitat) continue;
      const home = state.objects.find((o) => o.lotId === PLAYER_LOT && o.def === habitat && !state.agents.some((a) => a.home === o.id));
      if (home) {
        pet.home = home.id;
        pet.pos = { x: home.x, y: home.y };
      }
    }
    generateNeighborhood(state);
    addAlcorcon(state);
    addPlaces(state);
    addGetafe(state);
    return new World(state);
  }


  // ---------------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------------

  get household(): Household {
    return this.state.households.find((h) => h.id === this.state.playerHouseholdId)!;
  }

  /** La familia de un agente. */
  householdOf(a: Agent): Household | undefined {
    return this.state.households.find((h) => h.id === a.householdId);
  }

  /** La familia del jugador (personas y mascotas). */
  get members(): Agent[] {
    return this.household.memberIds.map((id) => this.agent(id)!).filter(Boolean);
  }

  /** El personaje que controla el jugador. */
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
  /** La fecha de hoy en el calendario de verdad. */
  get date(): GameDate {
    const d = this.day;
    if (this.dateCache?.day !== d || this.dateCache.start !== this.state.calendarStart) this.dateCache = { day: d, start: this.state.calendarStart, date: dateOfDay(this.state.calendarStart, d) };
    return this.dateCache.date;
  }
  private dateCache?: { day: number; start: string; date: GameDate };

  /** Fecha de otro día de la partida. */
  dateOf(day: number): GameDate {
    return dateOfDay(this.state.calendarStart, day);
  }

  /** Lo que toca hoy (fiestas, elecciones, lotería...). */
  get facts(): DayFacts {
    return factsOf(this.date);
  }

  /** Día de la semana: 0 = lunes ... 6 = domingo. */
  get weekday(): number {
    return this.date.wd;
  }

  /** Número de semana (de lunes a domingo) desde que empezó la partida. */
  get weekIndex(): number {
    return Math.floor((this.day - 1 + this.dateOf(1).wd) / 7);
  }

  /** Estación (0 primavera … 3 invierno): cada semana, una. */
  get season(): number {
    return this.date.season;
  }

  get seasonDef() {
    return SEASONS[this.season];
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

  /** El objeto que hay en una casilla (los sólidos antes que los transitables). */
  objectAt(lotId: string, x: number, y: number): PlacedObject | undefined {
    // Los objetos sólidos tienen prioridad sobre los transitables (charcos, pelota).
    const hits = this.objectsIn(lotId).filter((o) => {
      const d = sizeOf(o);
      return x >= o.x && x < o.x + d.w && y >= o.y && y < o.y + d.h;
    });
    return hits.find((o) => !this.objDef(o).walkable) ?? hits[0];
  }

  /** Quién está usando un objeto. */
  usersOf(objId: string, except?: Agent): Agent[] {
    return this.state.agents.filter((a) => a !== except && a.current?.targetObjectId === objId);
  }

  /** Quién vive en un objeto (jaula, cuna). */
  residentOf(objId: string): Agent | undefined {
    return this.state.agents.find((a) => a.home === objId);
  }

  /** Es el personaje que controla el jugador. */
  isActive(a: Agent): boolean {
    return a.id === this.state.activeAgentId && this.household.memberIds.includes(a.id);
  }

  /** Es de la familia del jugador. */
  isPlayerMember(a: Agent): boolean {
    return a.householdId === this.state.playerHouseholdId;
  }

  /** Está en casa ajena. */
  isGuest(a: Agent): boolean {
    const lot = this.lotById(a.lotId);
    return lot?.kind === 'home' && lot.householdId !== a.householdId;
  }

  /** Etapa de la vida (bebé, niño, adolescente, joven, adulto, anciano...). */
  stageOf(a: Agent): string {
    return lifeStage(a.species, a.ageDays).id;
  }

  /** Plano de una parcela (las casas, según lo ampliadas que estén). */
  layoutFor(lot: Lot | undefined): LotLayout {
    if (!lot) return LAYOUTS.house;
    if (lot.layout === 'house') return houseLayout(lot.size ?? 1, lot.plans);
    return LAYOUTS[lot.layout];
  }

  /** Un sitio del jardín de esa parcela (para las mascotas de exterior). */
  gardenOf(lotId: string): Vec {
    return { ...(this.layoutOf(lotId).garden ?? { x: 11, y: 6 }) };
  }

  // ---------------------------------------------------------------------------
  // Avisos, noticias, emociones y bocadillos
  // ---------------------------------------------------------------------------

  /** Suscribirse a los avisos (los muestra la interfaz). */
  onToast(fn: (t: Toast) => void) {
    this.toastListeners.push(fn);
  }

  toast(text: string, icon?: string, agentId?: string) {
    for (const fn of this.toastListeners) fn({ text, icon, ...(agentId ? { agentId } : {}) });
  }

  /** Suscribirse a los eventos de la simulación. */
  onEvent(fn: (e: SimEvent) => void) {
    this.eventListeners.push(fn);
  }

  emit(e: SimEvent) {
    for (const fn of this.eventListeners) fn(e);
  }

  /** Aviso que no se repite más de una vez cada `every` minutos de juego. */
  toastOnce(key: string, text: string, icon: string, every = 180, agentId?: string) {
    const last = this.lastToast.get(key);
    if (last !== undefined && this.state.minutes - last < every) return;
    this.lastToast.set(key, this.state.minutes);
    this.toast(text, icon, agentId);
  }

  /** Avisos sobre la familia del jugador o lo que pasa donde está. */
  toastFor(a: Agent, text: string, icon: string) {
    if (this.isPlayerMember(a) || a.lotId === this.viewLotId) this.toast(text, icon, a.id);
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
  // Órdenes y ajustes del jugador
  // ---------------------------------------------------------------------------

  /** Cambia el personaje que controla el jugador (solo de su familia). */
  setActive(id: string) {
    if (this.household.memberIds.includes(id)) this.state.activeAgentId = id;
  }

  /** Envejecimiento: sin envejecer, normal o rápido. */
  setAging(mode: 'off' | 'normal' | 'fast') {
    this.state.aging = mode;
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

  /** Un paso de simulación: llegadas, turnos, nacimientos y cada agente de las parcelas activas. */
  step(dt: number) {
    const before = this.state.minutes;
    this.state.minutes += dt;
    if (Math.floor(this.state.minutes / MINUTES_PER_DAY) !== Math.floor(before / MINUTES_PER_DAY)) Calendar.newDay(this);
    const newHour = Math.floor(this.state.minutes / 60) !== Math.floor(before / 60);

    // Llegadas
    for (const a of this.state.agents) {
      if (a.travel && this.state.minutes >= a.travel.arrive) Travel.arrive(this, a);
    }
    // Fin del trayecto en metro: se bajan en su estación.
    for (const a of this.state.agents) {
      if (a.via && !a.travel && a.lotId === METRO_LOT && this.state.minutes >= (a.rideUntil ?? 0)) {
        const dest = a.via;
        if (this.isPlayerMember(a) && a.kind === 'person') this.toastOnce(`${a.id}:bajada`, `Próxima estación: ${stationOf(this.lotById(dest).district)}. ${a.name} se baja`, '🚇', 30);
        Travel.startTravel(this, a, dest);
      }
    }
    Street.rapTick(this);
    Tasks.runSchedule(this);

    Lifecycle.births(this);
    Shopping.checkDelivery(this);
    for (const a of this.state.agents) if (!a.travel) Jobs.checkShift(this, a);

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

  /** Cada hora: fiestas, eventos, la calle, el cuerpo, metas, tiendas, y vecinos que salen o vienen de visita. */
  hourly() {
    for (const a of this.state.agents) pruneEmotions(a, this.state.minutes);
    Party.partyHour(this);
    Calendar.eventsHour(this);
    Illness.hourlyContagion(this);
    hourlyGrudges(this);
    Street.streetHours(this);
    Street.campaignHour(this);
    Body.bodyHour(this);
    Lifecycle.checkAspirations(this);
    Feats.checkFeats(this);
    Arcs.arcsHour(this);
    Trips.tripsHour(this);
    if (this.wishesEnabled) topUpWishes(this);
    Shopping.closingTime(this);
    Shopping.groceryErrand(this);
    const h = this.hour;
    const neighbours = this.state.households.filter((x) => x.id !== this.household.id);
    // Visitas a la familia del jugador
    const someoneHome = this.members.some((m) => m.lotId === this.household.lotId && !m.travel && m.kind === 'person');
    const visitorsNow = this.state.agents.some((a) => a.lotId === this.household.lotId && a.householdId !== this.household.id && (a.visitUntil || a.travel));
    if (h >= 10 && h <= 19 && someoneHome && !visitorsNow && this.state.minutes >= this.noVisitsUntil && Math.random() < 0.12) {
      const nh = neighbours[Math.floor(Math.random() * neighbours.length)];
      if (nh) Travel.sendVisit(this, nh, this.household.lotId, true);
    }
    // Paseos al parque (los de Alcorcón, a su plaza y a su bar; y a veces se cruzan en metro)
    if (h >= 9 && h <= 22) {
      for (const nh of neighbours) {
        // Los de Getafe, a su Cerro y a su pádel.
        if (Travel.districtOf(this, nh.lotId) === 'getafe') {
          if (h <= 20 && Math.random() < 0.1) Travel.sendVisit(this, nh, CERRO_LOT, false);
          else if (h >= 9 && Math.random() < 0.06 && !Shopping.closedReason(this, PADEL_LOT)) Travel.sendVisit(this, nh, PADEL_LOT, false);
          continue;
        }
        const alc = Travel.districtOf(this, nh.lotId) === 'alcorcon';
        if (alc || Math.random() < 0.02) {
          if (h <= 20 && Math.random() < (alc ? 0.08 : 0.3)) Travel.sendVisit(this, nh, PLAZA_LOT, false);
          else if (h >= 12 && Math.random() < (alc ? 0.07 : 0.3)) Travel.sendVisit(this, nh, BAR_LOT, false);
          if (alc) continue;
        }
        if (h > 19) {
          if (Math.random() < 0.02) Travel.sendVisit(this, nh, BAR_LOT, false);
          continue;
        }
        // El domingo por la mañana, lo primero es el mercadillo (los demás días ni se mira: está cerrado).
        if (!Shopping.closedReason(this, MARKET_LOT) && Math.random() < 0.2) Travel.sendVisit(this, nh, MARKET_LOT, false);
        else if (Math.random() < 0.08) Travel.sendVisit(this, nh, PARK_LOT, false);
        else if (Math.random() < 0.04) Travel.sendVisit(this, nh, STUDIO_LOT, false);
        else if (Math.random() < 0.05 && !Shopping.closedReason(this, SUPER_LOT)) Travel.sendVisit(this, nh, SUPER_LOT, false);
        else if (Math.random() < 0.05 && !Shopping.closedReason(this, ACAI_LOTS[0])) Travel.sendVisit(this, nh, ACAI_LOTS[Math.floor(Math.random() * ACAI_LOTS.length)], false);
        // Los sitios nuevos: el gimnasio y la biblioteca.
        else if (Math.random() < 0.03 && !Shopping.closedReason(this, GYM_LOT)) Travel.sendVisit(this, nh, GYM_LOT, false);
        else if (Math.random() < 0.025 && !Shopping.closedReason(this, LIBRARY_LOT)) Travel.sendVisit(this, nh, LIBRARY_LOT, false);
      }
    }
  }

  /** Parcelas que se simulan al detalle: donde hay alguien de la familia del jugador. */
  detailedLots(): Set<string> {
    const s = new Set<string>();
    for (const m of this.members) if (!m.travel) s.add(m.lotId);
    return s;
  }

  /** Un vecino pasa a simularse al detalle: se le coloca en un sitio razonable. */
  wakeUp(a: Agent) {
    a.abstract = false;
    a.current = null;
    a.path = [];
    if (a.role) {
      // La gente de la calle, repartida por su sitio (no todos en la puerta).
      const grid = this.gridOf(a.lotId);
      const lay = this.layoutOf(a.lotId);
      for (let i = 0; i < 20; i++) {
        const x = 1 + Math.floor(Math.random() * (lay.w - 2)), y = 1 + Math.floor(Math.random() * (lay.h - 2));
        if (isWalkable(grid, x, y) && !isOutdoor(lay.tiles[y][x]) === !isOutdoor(lay.tiles[1]?.[1])) {
          a.pos = { x, y };
          return;
        }
      }
      a.pos = Travel.freeSpotNear(this, a.lotId, lay.entrance);
    } else if (a.home) {
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

  /** Un vecino deja de simularse al detalle (nadie de la familia lo ve). */
  goAbstract(a: Agent) {
    a.abstract = true;
    if (a.current && !ACTIONS[a.current.actionId].forced) a.current = null;
    a.path = [];
    a.queue = [];
    // La gente de la calle sale y se esconde según su horario (los riders, solo cuando hay pedido).
    if (!a.role) a.hidden = false;
  }

  /** Simulación resumida de una hora: las necesidades se mantienen razonables. */
  abstractHour(a: Agent) {
    const night = this.hour >= 23 || this.hour < 7;
    for (const k of NEED_KEYS) {
      const target = k === 'energy' && night ? 95 : rand(45, 90);
      a.needs[k] = clamp(a.needs[k] + (target - a.needs[k]) * 0.35);
    }
    if (a.visitUntil && this.state.minutes >= a.visitUntil) Travel.goHome(this, a);
  }

  /** Las capibaras relajan a quien esté cerca. */
  applyAuras(dt: number, detailed: Set<string>) {
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

  /** Un agente simulado al detalle: necesidades, emergencias, visitas y su tarea. */
  stepAgent(a: Agent, dt: number) {
    if (a.role) return Street.stepRole(this, a, dt);
    const cur = a.current;
    const curDef = cur ? ACTIONS[cur.actionId] : undefined;
    const acting = cur?.phase === 'acting';
    const mult = acting ? (curDef?.decayMult ?? (cur?.passiveOf ? this.passiveDecay(cur) : 1)) : 1;

    // Bajada de necesidades. En la jaula, la "higiene" baja más rápido cuanto más sucia está.
    const decay = SPECIES[a.species].decay;
    const homeDirt = a.home ? (this.object(a.home)?.dirt ?? 0) : 0;
    for (const k of NEED_KEYS) {
      const extra = k === 'hygiene' ? (1 + homeDirt * 0.6) * (a.kind === 'person' && this.heatNow ? 1.3 : 1) : 1;
      a.needs[k] = clamp(a.needs[k] - decay[k] * dt * mult * extra * traitDecay(a, k) * illnessDecay(a, k));
    }

    this.checkFailures(a);
    if (this.checkStarving(a, dt)) return;
    const decor = Build.decorAround(this, a);
    if (decor) a.needs.fun = clamp(a.needs.fun + 0.02 * decor * dt);

    // Fin de la visita: ir hacia la salida y volver a casa.
    if (a.visitUntil && this.state.minutes >= a.visitUntil && a.current?.param !== 'leave') {
      this.leave(a);
    }

    if (!a.current) {
      const next = a.queue.shift();
      if (next) {
        Tasks.beginTask(this, a, next);
      } else {
        const isActive = this.isActive(a);
        const urgent = Math.min(...NEED_KEYS.map((k) => a.needs[k])) < 20;
        if (!isActive || urgent) {
          const choice = chooseAutonomous(this, a, isActive);
          if (choice) Tasks.beginTask(this, a, { id: this.newId('t'), byPlayer: false, phase: 'walking', remaining: 0, ...choice });
          else if (!isActive) this.idle(a);
        }
      }
    }
    if (a.current) Tasks.runTask(this, a, a.current, dt);
  }

  /** Fin de una visita: ir hacia la salida y volver a casa. */
  leave(a: Agent) {
    if (a.current?.passiveOf) return; // que termine la conversación
    Tasks.endTask(this, a);
    a.queue = [];
    const e = this.layoutOf(a.lotId).entrance;
    const ok = Tasks.beginTask(this, a, { id: this.newId('t'), actionId: 'move', byPlayer: false, phase: 'walking', remaining: 0, dest: { ...e }, param: 'leave' });
    if (!ok) Travel.goHome(this, a);
    else if (a.kind === 'person' && a.lotId === this.household.lotId) this.toastOnce(`${a.id}:bye`, `${a.name} se despide y se va a casa`, '👋', 60);
  }

  /** Ritmo al que bajan las necesidades de quien participa en la acción de otro. */
  passiveDecay(t: Task): number {
    const initiator = this.agent(t.passiveOf);
    const d = initiator?.current ? ACTIONS[initiator.current.actionId] : undefined;
    return d?.decayMult ?? 1;
  }

  /** Sin nada que hacer: dar una vuelta o quedarse quieto un rato. */
  idle(a: Agent) {
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
          Tasks.beginTask(this, a, { id: this.newId('t'), actionId: 'move', byPlayer: false, phase: 'walking', remaining: 0, dest: { x, y } });
          return;
        }
      }
    }
    a.current = { id: this.newId('t'), actionId: 'idle', byPlayer: false, phase: 'acting', remaining: rand(5, 15) };
  }

  /** Emergencias: hacerse pis encima, desplomarse de sueño y avisos de necesidades bajas. */
  checkFailures(a: Agent) {
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
      Tasks.endTask(this, a);
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
        this.toast(msgs[k], '❗', a.id);
      } else if (a.needs[k] > 30) {
        this.warned.delete(key);
      }
    }
  }

  /** Hambre a cero demasiado tiempo. Devuelve true si el agente ha dejado la partida. */
  checkStarving(a: Agent, dt: number): boolean {
    if (a.needs.hunger > 0) {
      a.starving = undefined;
      return false;
    }
    a.starving = (a.starving ?? 0) + dt;
    const baby = a.kind === 'person' && this.stageOf(a) === 'baby';
    const limit = baby ? 360 : MINUTES_PER_DAY;
    if (a.starving === dt && this.isPlayerMember(a)) this.toast(`¡${a.name} está muriéndose de hambre!`, '🆘', a.id);
    if (a.starving < limit) return false;
    Lifecycle.die(this, a, baby ? 'social' : a.kind === 'pet' ? 'runaway' : 'hunger');
    return true;
  }

  /** Un charco en el suelo (dentro de casa y en una casilla libre). */
  spawnPuddle(lotId: string, x: number, y: number) {
    if (isOutdoor(this.layoutOf(lotId).tiles[y]?.[x])) return;
    if (this.objectAt(lotId, x, y)) return;
    this.state.objects.push({ id: this.newId('o'), def: 'puddle', lotId, x, y });
  }

  /** Identificador nuevo y único dentro de la partida. */
  newId(prefix: string) {
    return `${prefix}${this.state.nextId++}`;
  }

  /** Recalcula qué casillas se pueden pisar en todas las parcelas. */
  rebuildGrid() {
    for (const lot of this.state.lots) {
      const { w, h, tiles } = this.layoutFor(lot);
      const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => tiles[y][x] !== 'wall'));
      for (const o of this.objectsIn(lot.id)) {
        if (this.objDef(o).walkable) continue;
        const d = sizeOf(o);
        for (let y = o.y; y < o.y + d.h; y++) for (let x = o.x; x < o.x + d.w; x++) if (grid[y]) grid[y][x] = false;
      }
      this.grids.set(lot.id, grid);
    }
  }

  // ---------------------------------------------------------------------------
  // Fachada: lo que usan la interfaz, la escena, la IA y las pruebas (la lógica está en systems/)
  // ---------------------------------------------------------------------------

  // Movement
  interactTiles(o: PlacedObject): Vec[] {
    return Movement.interactTiles(this, o);
  }

  // Body
  drink(a: Agent, n: number) {
    return Body.drink(this, a, n);
  }

  // Street
  startRap(rapper: Agent, t: Agent) {
    return Street.startRap(this, rapper, t);
  }

  // Gossip
  makePublic(sec: { text: string; public?: boolean; kind: string; about: string[]; known: string[] }) {
    return Gossip.makePublic(this, sec);
  }

  // Shopping
  pantryOwner(lotId: string): Household | undefined {
    return Shopping.pantryOwner(this, lotId);
  }
  closedReason(lotId: string): string | undefined {
    return Shopping.closedReason(this, lotId);
  }

  // Build
  rotateObject(id: string) {
    return Build.rotateObject(this, id);
  }
  paintRoom(roomId: string, patch: RoomPaint) {
    return Build.paintRoom(this, roomId, patch);
  }
  undoBuild() {
    return Build.undoBuild(this);
  }
  lastUndo() {
    return Build.lastUndo(this);
  }
  canBuildHere(): boolean {
    return Build.canBuildHere(this);
  }
  canPlace(defId: string, x: number, y: number, ignoreId?: string, rot?: 1): { ok: boolean; reason?: string } {
    return Build.canPlace(this, defId, x, y, ignoreId, rot);
  }
  buy(defId: string, x: number, y: number, q: 1 | 2 | 3 = 2, rot?: 1): boolean {
    return Build.buy(this, defId, x, y, q, rot);
  }
  nextExpansion() {
    return Build.nextExpansion(this);
  }
  nextExpansions() {
    return Build.nextExpansions(this);
  }
  expandHouse(plan?: string): boolean {
    return Build.expandHouse(this, plan);
  }
  cantTouch(o: PlacedObject): string | undefined {
    return Build.cantTouch(this, o);
  }
  moveObject(id: string, x: number, y: number, rot?: 0 | 1): boolean {
    return Build.moveObject(this, id, x, y, rot);
  }
  sellObject(id: string): boolean {
    return Build.sellObject(this, id);
  }

  // Pets
  canAdopt(species: SpeciesId): { ok: boolean; reason?: string } {
    return Pets.canAdopt(this, species);
  }
  adopt(species: SpeciesId): Agent | null {
    return Pets.adopt(this, species);
  }
  favoriteOf(pet: Agent): Agent | undefined {
    return Pets.favoriteOf(this, pet);
  }
  trainPet(person: Agent, pet: Agent) {
    return Pets.trainPet(this, person, pet);
  }

  // Jobs
  bookTrip(a: Agent) {
    return Trips.bookTrip(this, a);
  }
  setBarPlan(a: Agent, patch: { menu?: 'barata' | 'normal' | 'cara'; staff?: boolean; sunday?: boolean }) {
    return Jobs.setBarPlan(this, a, patch);
  }
  canChoose(a: Agent, opt: DilemmaOption) {
    return Jobs.canChoose(this, a, opt);
  }
  setJob(a: Agent, careerId: string) {
    return Jobs.setJob(this, a, careerId);
  }
  resolveDilemma(index: number) {
    return Jobs.resolveDilemma(this, index);
  }
  quitJob(a: Agent) {
    return Jobs.quitJob(this, a);
  }
  finishShift(a: Agent, reason: 'work' | 'school', mood: number) {
    return Jobs.finishShift(this, a, reason, mood);
  }

  // Calendar
  hasEvent(id: string, lotId?: string): boolean {
    return Calendar.hasEvent(this, id, lotId);
  }
  activeEvents() {
    return Calendar.activeEvents(this);
  }
  startEvent(id: string, minutes: number, lotId?: string) {
    return Calendar.startEvent(this, id, minutes, lotId);
  }
  costOf(actionId: string, a?: Agent): number {
    return Calendar.costOf(this, actionId, a);
  }
  lotteryReason(a: Agent): string | undefined {
    return Calendar.lotteryReason(this, a);
  }
  lotteryDraw() {
    return Calendar.lotteryDraw(this);
  }

  // Lifecycle
  die(a: Agent, cause: Lifecycle.DeathCause, detail?: string) {
    return Lifecycle.die(this, a, cause, detail);
  }
  seeDoctor(a: Agent): string | undefined {
    return Illness.seeDoctor(this, a);
  }
  catchIllness(a: Agent, id: string): boolean {
    return Illness.catchIllness(this, a, id);
  }
  continueWith(householdId: string) {
    return Lifecycle.continueWith(this, householdId);
  }
  evolveTraits() {
    return Lifecycle.evolveTraits(this);
  }
  pickTrait(a: Agent, oldId: string, newId: string) {
    return Lifecycle.pickTrait(this, a, oldId, newId);
  }
  setAspiration(a: Agent, id: string) {
    return Lifecycle.setAspiration(this, a, id);
  }
  // Recibos (bills.ts)
  hasPower(lotId: string): boolean {
    return Bills.hasPower(this, lotId);
  }
  hasWater(lotId: string): boolean {
    return Bills.hasWater(this, lotId);
  }
  get evicted(): boolean {
    return Bills.isEvicted(this);
  }
  // --- Economía y bolsa ---
  get economy() {
    return Economy.econ(this);
  }
  priced(n: number): number {
    return Economy.priced(this, n);
  }
  wage(n: number): number {
    return Economy.wage(this, n);
  }
  buyAsset(agentId: string, assetId: string, amount: number): string | undefined {
    const a = this.agent(agentId);
    return a ? Economy.buyAsset(this, a, assetId, amount) : 'No hay nadie';
  }
  sellAsset(agentId: string, assetId: string, fraction = 1): string | undefined {
    const a = this.agent(agentId);
    return a ? Economy.sellAsset(this, a, assetId, fraction) : 'No hay nadie';
  }

  payDebt(id: string): string | undefined {
    return Bills.payDebt(this, id);
  }
  payAllDebts(): number {
    return Bills.payAll(this);
  }
  rentBack(): string | undefined {
    return Bills.rentBack(this);
  }
  askAid(): string | undefined {
    return Bills.askAid(this);
  }

  /** Cambia el aspecto (y el nombre) de una persona de la familia. Devuelve el motivo si no se puede. */
  editPerson(agentId: string, e: PersonEdit): string | undefined {
    const a = this.agent(agentId);
    if (!a || !this.isPlayerMember(a)) return 'Solo se puede cambiar a los de la familia';
    const old = a.name;
    const why = applyEdit(a, e);
    if (!why && old !== a.name) this.toast(`${old} ahora se llama ${a.name}`, '✏️', a.id);
    return why;
  }

  // Travel
  canTravel(a: Agent, lotId: string): { ok: boolean; reason?: string } {
    return Travel.canTravel(this, a, lotId);
  }
  travel(agentIds: string[], lotId: string): boolean {
    return Travel.travel(this, agentIds, lotId);
  }
  districtOf(lotId: string): string {
    return Travel.districtOf(this, lotId);
  }
  needsMetro(from: string, to: string): boolean {
    return Travel.needsMetro(this, from, to);
  }
  travelMinutes(from: string, to: string): number {
    return Travel.travelMinutes(this, from, to);
  }
  canInvite(householdId: string): { ok: boolean; reason?: string } {
    return Travel.canInvite(this, householdId);
  }
  invite(householdId: string): boolean {
    return Travel.invite(this, householdId);
  }
  busySoon(a: Agent, hours: number): boolean {
    return Travel.busySoon(this, a, hours);
  }

  // Checks
  checkObjectAction(a: Agent, o: PlacedObject, actionId: string): ActionOption {
    return Checks.checkObjectAction(this, a, o, actionId);
  }
  checkSocialAction(a: Agent, t: Agent, actionId: string): ActionOption {
    return Checks.checkSocialAction(this, a, t, actionId);
  }
  checkSelfAction(a: Agent, actionId: string): ActionOption {
    return Checks.checkSelfAction(this, a, actionId);
  }
  optionsFor(agentId: string, target: Target): ActionOption[] {
    return Checks.optionsFor(this, agentId, target);
  }

  // Wishes
  pursueWish(agentId: string, wishId: string): boolean {
    return Wishes.pursueWish(this, agentId, wishId);
  }
  onTalkTurn(a: Agent, t: Agent, res: { say: string; reply: string; goPark?: boolean }, firstTurn: boolean) {
    return Wishes.onTalkTurn(this, a, t, res, firstTurn);
  }

  // Tasks
  startArc(kind: 'lio' | 'pelea' | 'romance', who?: string[]) {
    return Arcs.startArc(this, kind, who);
  }
  startChallenge(id: string) {
    return Feats.startChallenge(this, id);
  }
  dropChallenge(id: string) {
    return Feats.dropChallenge(this, id);
  }
  scheduleOrder(agentId: string, actionId: string, target: Target, minuteOfDay: number, param?: string) {
    return Tasks.scheduleOrder(this, agentId, actionId, target, minuteOfDay, param);
  }
  cancelOrder(orderId: string) {
    return Tasks.cancelOrder(this, orderId);
  }
  command(agentId: string, actionId: string, target: Target, param?: string): boolean {
    return Tasks.command(this, agentId, actionId, target, param);
  }
  cancel(agentId: string, taskId: string) {
    return Tasks.cancel(this, agentId, taskId);
  }

  // Social
  grudge(a: Agent, t: Agent): string | undefined {
    return Social.grudge(this, a, t);
  }
}
