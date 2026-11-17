import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { ELECTRIC } from '../src/data/seasons';
import { migrate, serialize } from '../src/save/serialize';
import type { Agent } from '../src/sim/types';
import { canRomance, getRel, isAdult, setRel } from '../src/sim/social';
import { fullNeeds, goToDate, isolate, madridHomes } from './helpers';
import { billAmount } from '../src/sim/systems/bills';

describe('relaciones, trabajo y economía (fase 4)', () => {
  const withRandom = <T>(value: number, fn: () => T): T => {
    const orig = Math.random;
    Math.random = () => value;
    try {
      return fn();
    } finally {
      Math.random = orig;
    }
  };
  /** Pone a todos los demás quietos para que no interfieran. */
  const freezeOthers = isolate;
  const neighbourAdult = (w: World) => {
    const hid = w.lotById('L1').householdId!;
    return w.state.agents.find((a) => a.householdId === hid && a.kind === 'person' && isAdult(a))!;
  };
  const bringOver = (w: World, t: Agent) => {
    t.job = undefined;
    t.lotId = 'L0';
    t.pos = { x: 7, y: 5 };
    t.abstract = false;
    t.visitUntil = w.state.minutes + 600;
  };

  it('Lucía y Mateo empiezan como pareja y quieren a sus mascotas', () => {
    const w = World.createNew();
    expect(getRel(w.state, 'a1', 'a2').status).toBe('partner');
    expect(getRel(w.state, 'a1', 'a3').f).toBeGreaterThan(20);
  });

  it('charlar sube la amistad e insultar la baja', () => {
    const w = World.createNew();
    freezeOthers(w, ['a1', 'a2']);
    const before = getRel(w.state, 'a1', 'a2').f;
    w.command('a1', 'chat', { kind: 'agent', id: 'a2' });
    w.tick(40);
    const mid = getRel(w.state, 'a1', 'a2').f;
    expect(mid).toBeGreaterThan(before);
    w.command('a1', 'insult', { kind: 'agent', id: 'a2' });
    w.tick(30);
    expect(getRel(w.state, 'a1', 'a2').f).toBeLessThan(mid);
  });

  it('nada de romance con niños ni con la familia', () => {
    const w = World.createNew();
    const kid = w.state.agents.find((a) => a.kind === 'person' && !isAdult(a))!;
    expect(kid).toBeTruthy();
    expect(canRomance(w.state, w.agent('a1')!, kid)).toBe(false);
    const opts = w.optionsFor('a1', { kind: 'agent', id: kid.id }).map((o) => o.def.id);
    expect(opts).not.toContain('flirt');
  });

  it('con mucho romance se puede pedir salir, casarse y vivir juntos; llega una familia nueva si la casa se vacía', () => {
    const w = World.createNew();
    const t = neighbourAdult(w);
    const oldHid = t.householdId;
    // Que sea la única persona de su casa
    for (const id of w.state.households.find((h) => h.id === oldHid)!.memberIds) {
      const x = w.agent(id)!;
      if (x.kind === 'person' && x !== t) x.ageDays = 30; // da igual: lo quitamos de la familia
    }
    const old = w.state.households.find((h) => h.id === oldHid)!;
    old.memberIds = old.memberIds.filter((id) => id === t.id || w.agent(id)!.kind === 'pet');
    // Lucía rompe con Mateo para este experimento
    w.state.rels['a1|a2'].status = undefined;
    setRel(w.state, 'a1', t.id, { f: 80, r: 90 });
    bringOver(w, t);
    freezeOthers(w, ['a1', t.id]);
    withRandom(0.01, () => {
      w.command('a1', 'ask_partner', { kind: 'agent', id: t.id });
      w.tick(20);
    });
    expect(getRel(w.state, 'a1', t.id).status).toBe('partner');
    withRandom(0.01, () => {
      w.command('a1', 'propose', { kind: 'agent', id: t.id });
      w.tick(20);
    });
    expect(getRel(w.state, 'a1', t.id).status).toBe('married');
    t.visitUntil = w.state.minutes + 600;
    freezeOthers(w, ['a1', t.id]);
    withRandom(0.01, () => {
      w.command('a1', 'move_in', { kind: 'agent', id: t.id });
      w.tick(20);
    });
    expect(w.household.memberIds).toContain(t.id);
    expect(t.householdId).toBe('h1');
    // Su antigua casa tiene una familia nueva
    const newHid = w.lotById('L1').householdId!;
    expect(newHid).not.toBe(oldHid);
    expect(w.state.households.find((h) => h.id === newHid)!.memberIds.length).toBeGreaterThan(0);
    expect(madridHomes(w.state.households)).toHaveLength(10);
  });

  it('un beso a un desconocido suele acabar en cobra', () => {
    const w = World.createNew();
    const t = neighbourAdult(w);
    bringOver(w, t);
    freezeOthers(w, ['a1', t.id]);
    const msgs: string[] = [];
    w.onToast((x) => msgs.push(x.text));
    withRandom(0.9, () => {
      w.command('a1', 'kiss', { kind: 'agent', id: t.id });
      w.tick(15);
    });
    expect(msgs.some((m) => m.includes('cobra'))).toBe(true);
    expect(getRel(w.state, 'a1', t.id).f).toBeLessThan(0);
  });

  it('coquetear delante de la pareja da celos', () => {
    const w = World.createNew();
    const t = neighbourAdult(w);
    bringOver(w, t);
    setRel(w.state, 'a1', t.id, { f: 60, r: 60 });
    // Mateo, la pareja de Lucía, está delante.
    freezeOthers(w, ['a1', 'a2', t.id]);
    w.agent('a2')!.current = { id: 'mirando', actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    const before = getRel(w.state, 'a1', 'a2');
    withRandom(0.01, () => {
      w.command('a1', 'flirt', { kind: 'agent', id: t.id });
      w.tick(15);
    });
    const after = getRel(w.state, 'a1', 'a2');
    expect(after.r).toBeLessThan(before.r);
  });

  it('trabajo: buscarlo en el ordenador, ir a su hora, cobrar y ascender', () => {
    const w = World.createNew();
    const pc = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    w.command('a1', 'find_job', { kind: 'object', id: pc.id }, 'oficina');
    w.tick(40);
    const lucia = w.agent('a1')!;
    expect(lucia.job?.career).toBe('oficina');
    freezeOthers(w, ['a1']);
    // Lunes 8:59 → a las 9 se va
    w.state.minutes = 9 * 60 - 1;
    fullNeeds(lucia);
    w.tick(2);
    expect(lucia.travel?.reason).toBe('work');
    const funds = w.household.funds;
    lucia.job!.perf = 99;
    w.tick(8 * 60 + 5);
    expect(lucia.travel).toBeUndefined();
    expect(lucia.lotId).toBe('L0');
    expect(w.household.funds).toBeGreaterThanOrEqual(funds + 50);
    expect(lucia.job!.level).toBe(2);
  });

  it('si no puede ir, falta al trabajo y baja su rendimiento', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    lucia.job = { career: 'oficina', level: 1, perf: 50 };
    w.state.minutes = 9 * 60 - 1;
    lucia.current = { id: 'po', actionId: 'pass_out', byPlayer: false, phase: 'acting', remaining: 999 };
    lucia.needs.energy = 0;
    w.tick(70);
    expect(lucia.job.perf).toBeLessThan(50);
    expect(lucia.travel).toBeUndefined();
  });

  it('los niños vecinos van al colegio y los adultos trabajan', () => {
    const w = World.createNew();
    const kids = w.state.agents.filter((a) => a.kind === 'person' && !isAdult(a));
    for (const k of kids) expect(k.job?.career).toBe('school');
    expect(w.state.agents.some((a) => a.householdId !== 'h1' && a.job && a.job.career !== 'school')).toBe(true);
    // El lunes a las 8:30 los niños ya no están en casa
    w.tick(31);
    for (const k of kids) expect(k.travel?.reason ?? 'en casa', k.name).toBe('school');
  });

  it('cada mes llegan los recibos (alquiler el 1; luz y agua el 5) y comer gasta la despensa', () => {
    const w = World.createNew();
    freezeOthers(w, ['a1']);
    const fridge = w.objectsIn('L0').find((o) => o.def === 'fridge')!;
    const f0 = w.household.funds;
    const p0 = w.household.pantry!;
    w.agent('a1')!.needs.hunger = 30;
    w.command('a1', 'eat', { kind: 'object', id: fridge.id });
    w.tick(30);
    // Comer no se paga en el momento: gasta raciones de la nevera (la compra se paga en el súper)
    expect(w.household.funds).toBe(f0);
    expect(w.household.pantry).toBe(p0 - 1);
    const f1 = w.household.funds;
    // Sin sucesos al azar (dinero encontrado, lotería) esos días.
    const orig = Math.random;
    Math.random = () => 0.99;
    const h = w.household;
    const rent = billAmount(w, h, 'alquiler');
    const luz = billAmount(w, h, 'luz');
    const agua = billAmount(w, h, 'agua');
    try {
      goToDate(w, '2027-04-01');
      expect(h.funds).toBe(f1 - rent);
      goToDate(w, '2027-04-05');
      expect(h.funds).toBe(f1 - rent - luz - agua);
    } finally {
      Math.random = orig;
    }
    // Lo mismo que antes cada semana (facturas e hipoteca), pero al mes: unas 30/7 veces.
    const appliances = w.objectsIn('L0').filter((o) => ELECTRIC.has(o.def)).length;
    expect(luz + agua).toBeCloseTo((60 + 2 * 20 + 2 * 10 + 3 * appliances) * (30 / 7), -1);
    expect(rent).toBe(Math.round(80 * (30 / 7)));
    expect(h.ledger?.at(-1)?.out).toMatchObject({ facturas: luz + agua });
  });

  it('una partida de la fase 3 recibe relaciones y trabajos al migrar', () => {
    const w = World.createNew();
    const st = JSON.parse(serialize(w.state));
    st.version = 3;
    st.rels = undefined;
    for (const a of st.agents) delete a.job;
    const m = migrate(st);
    expect(m.rels['a1|a2'].status).toBe('partner');
    expect(m.agents.some((a) => a.job)).toBe(true);
    expect(m.agents.find((a) => a.id === 'a1')!.job).toBeUndefined();
  });
});
