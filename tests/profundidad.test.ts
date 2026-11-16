import { describe, expect, it } from 'vitest';
import { ELECTRIC } from '../src/data/seasons';
import { findPath } from '../src/sim/pathfinding';
import { SAVE_VERSION, World, moodScore } from '../src/sim/world';
import { hasEmotion } from '../src/sim/emotions';
import { migrate, serialize } from '../src/save/serialize';
import { getRel, isAdult, setRel } from '../src/sim/social';
import { traitAffinity } from '../src/sim/traits';
import { fullNeeds, isolate } from './helpers';

describe('más profundidad: emociones, metas, casa, rasgos, relaciones, trabajo, eventos y mascotas', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priv = (w: World) => w as any;
  const withRandom = <T>(value: number, fn: () => T): T => {
    const orig = Math.random;
    Math.random = () => value;
    try {
      return fn();
    } finally {
      Math.random = orig;
    }
  };
  const neighbour = (w: World) => {
    const hid = w.lotById('L1').householdId!;
    const t = w.state.agents.find((a) => a.householdId === hid && a.kind === 'person' && isAdult(a))!;
    t.job = undefined;
    t.lotId = 'L0';
    t.pos = { x: 7, y: 6 };
    t.abstract = false;
    t.travel = undefined;
    t.current = null;
    t.queue = [];
    t.path = [];
    t.hidden = false;
    t.visitUntil = w.state.minutes + 600;
    return t;
  };

  it('emociones con causa: un açaí alegra (y suma al ánimo) y luego se pasa', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.state.minutes = 11 * 60;
    w.travel(['a1'], 'A1');
    w.tick(20);
    const lucia = w.agent('a1')!;
    const counter = w.objectsIn('A1').find((o) => o.def === 'acai_counter')!;
    lucia.needs.hunger = 40;
    w.command('a1', 'acai_bowl', { kind: 'object', id: counter.id });
    w.tick(40);
    expect(hasEmotion(lucia, 'acai')).toBe(true);
    const withIt = moodScore(lucia);
    const saved = lucia.emotions;
    lucia.emotions = [];
    expect(withIt - moodScore(lucia)).toBe(8);
    lucia.emotions = saved;
    w.tick(5 * 60);
    expect(hasEmotion(lucia, 'acai')).toBe(false);
  });

  it('las emociones cambian lo que apetece: de luto, recordar; enfadado, discutir', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    const base = traitAffinity(lucia, 'remember');
    w.feel(lucia, 'luto', 'la abuela');
    expect(traitAffinity(lucia, 'remember')).toBeGreaterThan(base * 2);
    expect(moodScore(lucia)).toBeLessThan(moodScore({ ...lucia, emotions: [] }));
  });

  it('una cobra se siente y se recuerda', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const t = neighbour(w);
    setRel(w.state, 'a1', t.id, { f: 0, r: 0 });
    withRandom(0.99, () => {
      w.command('a1', 'kiss', { kind: 'agent', id: t.id });
      w.tick(20);
    });
    const lucia = w.agent('a1')!;
    expect(hasEmotion(lucia, 'cobra')).toBe(true);
    expect(getRel(w.state, 'a1', t.id).mem?.some((m) => m.k === 'cobra' && m.by === t.id)).toBe(true);
  });

  it('insultar deja rencor; pedir perdón lo arregla', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    w.command('a1', 'insult', { kind: 'agent', id: 'a2' });
    w.tick(20);
    const lucia = w.agent('a1')!, mateo = w.agent('a2')!;
    expect(hasEmotion(mateo, 'insultado')).toBe(true);
    expect(w.grudge(mateo, lucia)).toBe('insulto');
    expect(w.checkSocialAction(lucia, mateo, 'apologize').ok).toBe(true);
    withRandom(0.01, () => {
      w.command('a1', 'apologize', { kind: 'agent', id: 'a2' });
      w.tick(20);
    });
    expect(w.grudge(mateo, lucia)).toBeUndefined();
    expect(hasEmotion(mateo, 'reconciliados')).toBe(true);
  });

  it('divorcio: corazón roto y, si viven juntos, siguen bajo el mismo techo', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    setRel(w.state, 'a1', 'a2', { f: 40, r: 50, status: 'married' });
    w.command('a1', 'divorce', { kind: 'agent', id: 'a2' });
    w.tick(20);
    const rel = getRel(w.state, 'a1', 'a2');
    expect(rel.status).toBeUndefined();
    expect(rel.ex).toBe(true);
    expect(hasEmotion(w.agent('a2')!, 'corazon_roto')).toBe(true);
    expect(w.household.memberIds).toContain('a2');
  });

  it('metas de vida: cada persona tiene una y las etapas se cumplen solas', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    expect(lucia.aspiration).toBeDefined();
    w.setAspiration(lucia, 'familia');
    const f0 = w.household.funds;
    w.tick(61);
    // Lucía ya tiene pareja: primera etapa hecha
    expect(lucia.aspiration!.stage).toBeGreaterThanOrEqual(1);
    expect(w.household.funds).toBeGreaterThanOrEqual(f0 + 150);
    expect(hasEmotion(lucia, 'orgulloso')).toBe(true);
  });

  it('los bebés heredan un rasgo de sus padres y saben quiénes son sus padres', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    w.household.expecting = { parents: ['a1', 'a2'], due: w.state.minutes };
    w.tick(1);
    const baby = w.state.agents.find((a) => a.parents?.includes('a1'))!;
    expect(baby.parents).toEqual(['a1', 'a2']);
    const parentTraits = ['deportista', 'romantico', 'cunado', 'gloton'];
    expect(baby.traits!.some((t) => parentTraits.includes(t))).toBe(true);
    expect(hasEmotion(w.agent('a1')!, 'bebe')).toBe(true);
  });

  it('los hábitos cambian la forma de ser: quien corre mucho se vuelve deportista', () => {
    const w = World.createNew();
    const mateo = w.agent('a2')!;
    mateo.stats = { run: 30 };
    priv(w).evolveTraits();
    expect(mateo.traits).toContain('deportista');
    expect(mateo.traits).toHaveLength(2);
    // Y no vuelve a cambiar en una semana
    mateo.stats.joke = 40;
    priv(w).evolveTraits();
    expect(mateo.traits).not.toContain('bromista');
  });

  it('al hacerse adulto se puede elegir un rasgo', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    lucia.traitPick = true;
    w.pickTrait(lucia, 'romantico', 'friki');
    expect(lucia.traits).toEqual(['deportista', 'friki']);
    expect(lucia.traitPick).toBe(false);
  });

  it('muebles de lujo: cuestan más, se venden por más y se duerme de maravilla', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.household.funds = 5000;
    let spot: { x: number; y: number } | undefined;
    for (let y = 1; y < 10 && !spot; y++) for (let x = 1; x < 10 && !spot; x++) if (w.canPlace('bed', x, y).ok) spot = { x, y };
    expect(spot).toBeDefined();
    expect(w.buy('bed', spot!.x, spot!.y, 3)).toBe(true);
    expect(w.household.funds).toBe(5000 - 900);
    const bed = w.objectsIn('L0').find((o) => o.def === 'bed' && o.q === 3)!;
    const lucia = w.agent('a1')!;
    lucia.needs.energy = 80;
    w.command('a1', 'sleep', { kind: 'object', id: bed.id });
    w.tick(150);
    expect(hasEmotion(lucia, 'descansado')).toBe(true);
    expect(w.sellObject(bed.id)).toBe(true);
    expect(w.household.funds).toBe(5000 - 900 + 630);
  });

  it('ampliar la casa: el jardín se corre, todo sigue accesible y luego crece hacia la calle', () => {
    const w = World.createNew();
    isolate(w, []);
    w.household.funds = 20000;
    const pond = w.objectsIn('L0').find((o) => o.def === 'pond')!;
    expect(pond.x).toBe(12);
    expect(w.expandHouse()).toBe(true);
    expect(w.lotById('L0').size).toBe(2);
    expect(w.layoutOf('L0').w).toBe(18);
    expect(pond.x).toBe(16);
    const lay = w.layoutOf('L0');
    for (const o of w.objectsIn('L0')) {
      const tiles = w.interactTiles(o);
      const ok = tiles.some((t) => findPath(w.gridOf('L0'), lay.entrance, t));
      expect(ok, o.def).toBe(true);
    }
    expect(w.expandHouse()).toBe(true);
    expect(w.layoutOf('L0').entrance).toEqual({ x: 5, y: 15 });
    expect(w.nextExpansion()).toBeUndefined();
    expect(w.household.funds).toBe(20000 - 6000 - 12000);
  });

  it('dilemas en el trabajo: se pregunta y la respuesta tiene consecuencias', () => {
    const w = World.createNew();
    w.dilemmaChance = 1;
    const mateo = w.agent('a2')!;
    w.setJob(mateo, 'oficina');
    w.state.minutes = 9 * 60 - 1;
    w.tick(2);
    expect(w.state.dilemma?.agentId).toBe('a2');
    w.resolveDilemma(0);
    expect(w.state.dilemma).toBeUndefined();
  });

  it('tres jornadas seguidas rindiendo fatal: despedido', () => {
    const w = World.createNew();
    const mateo = w.agent('a2')!;
    w.setJob(mateo, 'oficina');
    mateo.job!.perf = 0;
    for (let i = 0; i < 3; i++) priv(w).finishShift(mateo, 'work', -40);
    expect(mateo.job).toBeUndefined();
    expect(hasEmotion(mateo, 'despedido')).toBe(true);
  });

  it('negocio propio: cuesta montarlo y cada lunes hay cuota de autónomos', () => {
    const w = World.createNew();
    isolate(w, ['a2']);
    w.household.funds = 3000;
    const mateo = w.agent('a2')!;
    w.setJob(mateo, 'negocio');
    expect(mateo.job?.career).toBe('negocio');
    expect(w.household.funds).toBe(500);
    w.state.minutes = 7 * 1440 - 1;
    withRandom(0.99, () => w.tick(1));
    const appliances = w.objectsIn('L0').filter((o) => ELECTRIC.has(o.def)).length;
    expect(w.household.funds).toBe(500 - (60 + 2 * 20 + 2 * 10 + 3 * appliances) - 80 - 90);
    expect(hasEmotion(mateo, 'cuota')).toBe(true);
  });

  it('estaciones, ofertas, apagón y lotería de Navidad', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    expect(w.seasonDef.id).toBe('primavera');
    w.state.minutes = 7 * 1440 + 600;
    expect(w.seasonDef.id).toBe('verano');
    priv(w).startEvent('ofertas', 600);
    expect(w.costOf('shop_big')).toBe(67);
    priv(w).startEvent('apagon', 120, 'L0');
    const sofa = w.objectsIn('L0').find((o) => o.def === 'sofa')!;
    expect(w.checkObjectAction(w.agent('a1')!, sofa, 'watch_tv').reason).toBe('No hay luz');
    // Invierno: lotería
    const lucia = w.agent('a1')!;
    expect(w.lotteryReason(lucia)).toContain('invierno');
    w.state.minutes = 21 * 1440 + 600;
    expect(w.seasonDef.id).toBe('invierno');
    expect(w.lotteryReason(lucia)).toBeUndefined();
    w.state.lottery = ['a1'];
    const f0 = w.household.funds;
    withRandom(0.01, () => priv(w).lotteryDraw());
    expect(w.household.funds).toBe(f0 + 4000);
    expect(hasEmotion(lucia, 'loteria')).toBe(true);
  });

  it('verbena: el sábado de verano por la noche el parque se llena', () => {
    const w = World.createNew();
    w.state.minutes = 12 * 1440 + 18 * 60 + 59; // sábado de la semana de verano, 18:59
    expect(w.weekday).toBe(5);
    w.tick(2);
    expect(w.hasEvent('verbena', 'P')).toBe(true);
    const going = w.state.agents.filter((a) => a.travel?.to === 'P' || a.lotId === 'P');
    expect(going.length).toBeGreaterThan(3);
  });

  it('fiestas en casa: vienen vecinos, y al acabar hay amigos nuevos', () => {
    const w = World.createNew();
    w.state.minutes = 5 * 1440 + 12 * 60; // sábado a mediodía: la gente no trabaja
    const pc = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    expect(w.command('a1', 'throw_party', { kind: 'object', id: pc.id })).toBe(true);
    w.tick(30);
    expect(w.state.party).toBeDefined();
    const guests = w.state.agents.filter((a) => a.householdId !== 'h1' && !a.role && (a.travel?.to === 'L0' || a.via === 'L0' || a.lotId === 'L0'));
    expect(guests.length).toBeGreaterThanOrEqual(3);
    w.tick(5 * 60);
    expect(w.state.party).toBeUndefined();
    expect(w.agent('a1')!.stats?.parties).toBe(1);
  });

  it('mascotas: carácter, trucos y persona favorita que te recibe', () => {
    const w = World.createNew();
    const toby = w.agent('a3')!;
    const lucia = w.agent('a1')!;
    expect(toby.petTrait).toBeDefined();
    fullNeeds(toby);
    toby.training = 15;
    priv(w).trainPet(lucia, toby);
    expect(toby.tricks).toContain('Sentarse');
    expect(w.checkSocialAction(lucia, toby, 'show_trick').ok).toBe(true);
    setRel(w.state, 'a3', 'a1', { f: 80, r: 0 });
    setRel(w.state, 'a3', 'a2', { f: 30, r: 0 });
    expect(w.favoriteOf(toby)?.id).toBe('a1');
    // Al volver a casa, Toby la recibe
    isolate(w, ['a1', 'a3']);
    lucia.emotions = [];
    w.travel(['a1'], 'P');
    w.tick(20);
    w.travel(['a1'], 'L0');
    w.tick(20);
    expect(hasEmotion(lucia, 'mimos')).toBe(true);
  });

  it('las partidas de la versión 8 se actualizan (las mascotas reciben carácter)', () => {
    const w = World.createNew();
    const st = JSON.parse(serialize(w.state));
    st.version = 8;
    for (const a of st.agents) delete a.petTrait;
    const m = migrate(st);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.agents.filter((a) => a.kind === 'pet').every((a) => !!a.petTrait)).toBe(true);
  });
});
