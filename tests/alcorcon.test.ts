import { describe, expect, it } from 'vitest';
import { RIDE_MINUTES, World } from '../src/sim/world';
import { hasEmotion } from '../src/sim/emotions';
import { migrate, serialize } from '../src/save/serialize';
import { getRel, isAdult, setRel } from '../src/sim/social';
import { isolate } from './helpers';
import { goToDate } from './helpers';

describe('Alcorcón, el metro, la calle, el salseo y las juergas', () => {
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
  const role = (w: World, r: string, post?: string) => w.state.agents.find((a) => a.role === r && (!post || a.post === post))!;

  it('hay Alcorcón (plaza, bar, 3 casas con okupas) y gente de la calle que no envejece', () => {
    const w = World.createNew();
    for (const id of ['MT', 'PL', 'BR', 'AL1', 'AL2', 'AL3']) expect(w.lotById(id), id).toBeTruthy();
    expect(w.districtOf('PL')).toBe('alcorcon');
    expect(w.districtOf('P')).toBe('madrid');
    expect(w.state.households.filter((h) => h.lotId.startsWith('AL'))).toHaveLength(3);
    expect(w.state.households.some((h) => h.okupa)).toBe(true);
    for (const r of ['vendedor', 'rapero', 'musico', 'chismosa', 'militante', 'glovo']) expect(role(w, r), r).toBeTruthy();
    const puri = role(w, 'chismosa');
    const age = puri.ageDays;
    w.state.minutes = 1440 - 1;
    w.tick(2);
    expect(puri.ageDays).toBe(age);
  });

  it('de Madrid a Alcorcón se va en metro', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.state.minutes = 10 * 60;
    expect(w.travel(['a1'], 'PL')).toBe(true);
    const lucia = w.agent('a1')!;
    expect(lucia.travel?.to).toBe('MT');
    w.tick(10);
    expect(lucia.lotId).toBe('MT');
    w.tick(RIDE_MINUTES + 12);
    expect(lucia.lotId).toBe('PL');
  });

  it('el rapero del metro te mete en sus letras', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    lucia.lotId = 'MT';
    const rapper = role(w, 'rapero');
    rapper.hidden = false;
    w.startRap(rapper, lucia);
    expect(hasEmotion(lucia, 'rapeado')).toBe(true);
    w.tick(12);
    const lines = w.ui.speech.filter((x) => x.agentId === rapper.id).map((x) => x.text);
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.some((l) => l.includes('Lucía'))).toBe(true);
  });

  it('las vecinas cotillas te cuentan el salseo', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.state.minutes = 10 * 60;
    const puri = role(w, 'chismosa', 'P');
    puri.travel = undefined;
    puri.hidden = false;
    puri.abstract = false;
    puri.lotId = 'P';
    const lucia = w.agent('a1')!;
    lucia.lotId = 'P';
    lucia.pos = { x: 8, y: 9 };
    puri.pos = { x: 8, y: 8 };
    w.state.secrets = [{ id: 's1', kind: 'cotilleo', text: 'Fulanito debe dinero a medio barrio', about: [], day: 1, known: [puri.id], juicy: 2 }];
    w.command('a1', 'ask_gossip', { kind: 'agent', id: puri.id });
    w.tick(30);
    expect(w.state.secrets[0].known).toContain('a1');
    expect(hasEmotion(lucia, 'salseo')).toBe(true);
  });

  it('un lío a escondidas... hasta que te pillan', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    const hid = w.lotById('L1').householdId!;
    const t = w.state.agents.find((a) => a.householdId === hid && a.kind === 'person' && isAdult(a))!;
    Object.assign(t, { lotId: 'L0', pos: { x: 7, y: 6 }, travel: undefined, current: null, queue: [], abstract: false, visitUntil: w.state.minutes + 600, job: undefined });
    setRel(w.state, 'a1', t.id, { f: 50, r: 60 });
    // Mateo no está delante
    w.agent('a2')!.lotId = 'P';
    withRandom(0.01, () => {
      w.command('a1', 'ask_affair', { kind: 'agent', id: t.id });
      w.tick(20);
    });
    expect(getRel(w.state, 'a1', t.id).affair).toBe(true);
    expect(w.state.secrets?.some((x) => x.kind === 'lio' && x.about[0] === 'a1')).toBe(true);
    // Ahora sí está Mateo... y les pilla besándose
    const mateo = w.agent('a2')!;
    Object.assign(mateo, { lotId: 'L0', pos: { x: 6, y: 6 }, current: null, queue: [] });
    mateo.current = { id: 'q', actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    withRandom(0.01, () => {
      w.command('a1', 'kiss', { kind: 'agent', id: t.id });
      w.tick(20);
    });
    expect(hasEmotion(mateo, 'traicionado')).toBe(true);
    expect(getRel(w.state, 'a1', 'a2').mem?.some((m) => m.k === 'infidelidad')).toBe(true);
  });

  it('cuando un lío de vecinos se hace público, la pareja se entera', () => {
    const w = World.createNew();
    const ppl = w.state.agents.filter((a) => a.householdId !== 'h1' && a.kind === 'person' && !a.role && isAdult(a));
    const x = ppl.find((p) => ppl.some((q) => q !== p && q.householdId === p.householdId))!;
    const p = ppl.find((q) => q !== x && q.householdId === x.householdId)!;
    const y = ppl.find((q) => q.householdId !== x.householdId)!;
    setRel(w.state, x.id, p.id, { f: 60, r: 70, status: 'married' });
    const sec = { id: 's9', kind: 'lio', text: `${x.name} tiene un lío con ${y.name}`, about: [x.id, y.id, p.id], day: 1, known: [x.id, y.id], juicy: 3 };
    w.state.secrets = [sec];
    priv(w).makePublic(sec);
    expect(hasEmotion(p, 'traicionado')).toBe(true);
    expect(w.state.news?.some((n) => n.text.includes('lío'))).toBe(true);
  });

  it('pedos: se oyen, se huelen y se comentan', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    const lucia = w.agent('a1')!, mateo = w.agent('a2')!;
    mateo.pos = { x: lucia.pos.x + 1, y: lucia.pos.y };
    mateo.current = { id: 'q', actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    withRandom(0.1, () => {
      w.command('a1', 'fart', { kind: 'agent', id: 'a1' });
      w.tick(5);
    });
    expect(w.ui.speech.some((x) => x.agentId === 'a1')).toBe(true);
    expect(w.ui.speech.some((x) => x.agentId === 'a2')).toBe(true);
  });

  it('borrachera: achispado, borracho, al suelo y resaca al día siguiente', () => {
    const w = World.createNew();
    isolate(w, ['a2']);
    w.state.minutes = 20 * 60;
    const mateo = w.agent('a2')!;
    priv(w).drink(mateo, 35);
    expect(hasEmotion(mateo, 'achispado')).toBe(true);
    priv(w).drink(mateo, 30);
    expect(hasEmotion(mateo, 'borracho')).toBe(true);
    priv(w).drink(mateo, 40);
    expect(mateo.current?.actionId).toBe('pass_out');
    w.state.minutes = 1440 + 8 * 60 + 59;
    w.tick(2);
    expect(hasEmotion(mateo, 'resaca')).toBe(true);
  });

  it('Glovo: el rider llega a casa con la comida', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.state.minutes = 13 * 60;
    const pc = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    const lucia = w.agent('a1')!;
    lucia.needs.hunger = 20;
    const rider = role(w, 'glovo');
    rider.travel = undefined;
    rider.hidden = true;
    w.command('a1', 'order_glovo', { kind: 'object', id: pc.id });
    w.tick(45);
    expect(lucia.needs.hunger).toBeGreaterThan(60);
    expect(hasEmotion(lucia, 'glovo')).toBe(true);
  });

  it('el rider de Glovo entrega y se va de casa', () => {
    const w = World.createNew();
    w.state.minutes = 13 * 60;
    const pc = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    const rider = role(w, 'glovo');
    rider.travel = undefined;
    rider.hidden = true;
    w.command('a1', 'order_glovo', { kind: 'object', id: pc.id });
    w.tick(45);
    expect(rider.deliverTo).toBeUndefined();
    w.tick(30);
    expect(rider.lotId).not.toBe('L0');
    expect(rider.hidden).toBe(true);
    // Y queda libre para el siguiente pedido.
    w.tick(120);
    w.command('a1', 'order_glovo', { kind: 'object', id: pc.id });
    w.tick(10);
    expect(w.state.agents.some((x) => x.role === 'glovo' && x.deliverTo === 'a1')).toBe(true);
  });

  it('San Isidro el 15 de mayo, y campaña electoral antes de las elecciones del último domingo de mayo', () => {
    const w = World.createNew();
    goToDate(w, '2027-05-15');
    expect(w.hasEvent('sanisidro')).toBe(true);
    goToDate(w, '2027-05-25'); // martes: empieza la campaña (elecciones el domingo 30)
    expect(w.hasEvent('campana')).toBe(true);
    goToDate(w, '2027-05-25', 11);
    expect(w.state.agents.filter((a) => a.role === 'militante' && !a.hidden).length).toBeGreaterThan(0);
    expect(w.facts.elections).toBe(false);
    goToDate(w, '2027-05-30');
    expect(w.facts.elections).toBe(true);
  });

  it('los okupas no pagan facturas', () => {
    const w = World.createNew();
    const ok = w.state.households.find((h) => h.okupa)!;
    const f0 = ok.funds;
    w.state.minutes = 7 * 1440 - 1;
    w.tick(1);
    expect(ok.funds).toBeGreaterThanOrEqual(f0);
  });

  it('las partidas de la versión 9 reciben Alcorcón y el metro', () => {
    const w = World.createNew();
    const st = JSON.parse(serialize(w.state));
    st.version = 9;
    st.lots = st.lots.filter((l: { id: string }) => !['MT', 'PL', 'BR', 'AL1', 'AL2', 'AL3'].includes(l.id));
    st.agents = st.agents.filter((a: { role?: string; lotId: string }) => !a.role && !a.lotId.startsWith('AL'));
    st.households = st.households.filter((h: { lotId: string }) => !h.lotId.startsWith('AL'));
    const m = migrate(st);
    expect(m.lots.some((l) => l.id === 'MT')).toBe(true);
    expect(m.agents.some((a) => a.role === 'rapero')).toBe(true);
    expect(m.lots.find((l) => l.id === 'P')?.district).toBe('madrid');
  });
});

describe('casas que se quedan vacías en Alcorcón', () => {
  it('si llegan okupas, se quedan con las mascotas que había (nadie se queda sin familia)', () => {
    const w = World.createNew();
    const h = w.state.households.find((x) => x.lotId.startsWith('AL') && !x.okupa)!;
    // Que tenga una mascota.
    const pet = w.state.agents.find((a) => a.kind === 'pet' && a.householdId !== h.id && !a.home && !w.isPlayerMember(a))!;
    const prev = w.householdOf(pet)!;
    prev.memberIds = prev.memberIds.filter((id) => id !== pet.id);
    pet.householdId = h.id;
    pet.lotId = h.lotId;
    h.memberIds.push(pet.id);
    const orig = Math.random;
    Math.random = () => 0.1; // llegan okupas
    try {
      for (const id of [...h.memberIds]) {
        const a = w.agent(id);
        if (a?.kind === 'person') w.die(a, 'old');
      }
    } finally {
      Math.random = orig;
    }
    const owner = w.householdOf(pet);
    expect(owner?.okupa).toBe(true);
    expect(owner?.memberIds).toContain(pet.id);
  });
});
