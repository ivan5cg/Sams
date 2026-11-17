import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { getRel, setRel } from '../src/sim/social';
import { hasEmotion } from '../src/sim/emotions';
import { JAIL_DAYS, crime, fight, hourlyGrudges, poison } from '../src/sim/systems/violence';
import { dailyHealth } from '../src/sim/systems/illness';
import { fullNeeds, isolate, problems } from './helpers';

function withRandom<T>(v: number, fn: () => T): T {
  const orig = Math.random;
  Math.random = () => v;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** Un vecino adulto, en casa de la familia. */
function enemy(w: World, f: number) {
  const e = w.state.agents.find((a) => a.kind === 'person' && !w.isPlayerMember(a) && !a.role && ['young', 'adult'].includes(w.stageOf(a)))!;
  e.travel = undefined;
  e.lotId = 'L0';
  e.pos = { x: 7, y: 6 };
  e.job = undefined;
  setRel(w.state, 'a1', e.id, { f, r: 0 });
  return e;
}

describe('enemistades que acaban mal', () => {
  it('solo con enemigos, nunca con niños ni con los de casa', () => {
    const w = World.createNew();
    const e = enemy(w, 0);
    const opt = (id: string, t = e.id) => w.optionsFor('a1', { kind: 'agent', id: t }).find((o) => o.def.id === id);
    expect(opt('fight')).toBeUndefined();
    setRel(w.state, 'a1', e.id, { f: -60, r: 0 });
    expect(opt('fight')?.ok).toBe(true);
    expect(opt('poison')).toBeUndefined();
    setRel(w.state, 'a1', e.id, { f: -80, r: 0 });
    expect(opt('poison')?.ok).toBe(true);
    // A Mateo (de casa), ni aunque se lleven fatal.
    setRel(w.state, 'a1', 'a2', { f: -90, r: 0 });
    expect(opt('fight', 'a2')).toBeUndefined();
    expect(opt('poison', 'a2')).toBeUndefined();
  });

  it('una pelea: el que pierde acaba magullado (y, rara vez, muerto)', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const e = enemy(w, -60);
    const lucia = w.agent('a1')!;
    lucia.skills = { ...lucia.skills, forma: 8 };
    withRandom(0.5, () => fight(w, lucia, e));
    expect(hasEmotion(e, 'magullado')).toBe(true);
    expect(getRel(w.state, 'a1', e.id).f).toBeLessThan(-60);
    expect(w.agent(e.id)).toBeTruthy();
    // Con muy mala suerte, la pelea acaba en muerte... y a la cárcel.
    const x = World.createNew();
    isolate(x, ['a1']);
    const e2 = enemy(x, -60);
    const toasts: string[] = [];
    x.onToast((t) => toasts.push(t.text));
    const l2 = x.agent('a1')!;
    l2.skills = { ...l2.skills, forma: 10 };
    withRandom(0.01, () => fight(x, l2, e2));
    expect(x.agent(e2.id)).toBeUndefined();
    expect(toasts.some((t) => t.includes('ha muerto en una pelea'))).toBe(true);
    expect(l2.travel?.reason).toBe('jail');
    expect(toasts.some((t) => t.includes('detenido'))).toBe(true);
    expect(problems(x)).toEqual([]);
  });

  it('envenenar: si sale, el envenenado puede morir (el médico le salva casi siempre); si no, sospecha', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const e = enemy(w, -80);
    const lucia = w.agent('a1')!;
    // Sale mal: le sabe raro.
    expect(withRandom(0.99, () => poison(w, lucia, e))).toBe(false);
    expect(getRel(w.state, 'a1', e.id).f).toBe(-100);
    // Sale bien: envenenado, y a la mañana siguiente...
    expect(withRandom(0.01, () => poison(w, lucia, e))).toBe(true);
    expect(e.illness?.id).toBe('envenenamiento');
    expect(e.illness?.by).toBe('a1');
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    withRandom(0.5, () => dailyHealth(w));
    expect(w.agent(e.id)).toBeUndefined();
    expect(toasts.some((t) => t.includes('envenenado'))).toBe(true);
    // Con médico, se salva mucho más a menudo.
    let saved = 0;
    for (let i = 0; i < 40; i++) {
      const x = World.createNew();
      isolate(x, ['a1']);
      const v = enemy(x, -80);
      withRandom(0.01, () => poison(x, x.agent('a1')!, v));
      x.seeDoctor(v);
      dailyHealth(x);
      if (x.agent(v.id)) saved++;
    }
    expect(saved).toBeGreaterThan(25);
  });

  it('si no te pillan: remordimientos y murmuraciones; si te pillan, sales a los días', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const e = enemy(w, -80);
    const lucia = w.agent('a1')!;
    withRandom(0.99, () => crime(w, lucia, e, 0));
    expect(hasEmotion(lucia, 'remordimientos')).toBe(true);
    expect(w.state.secrets?.some((s) => s.text.includes('tuvo algo que ver'))).toBe(true);
    // Pillada: a la cárcel y, al salir, a casa.
    withRandom(0.01, () => crime(w, lucia, e, 2));
    expect(lucia.travel?.reason).toBe('jail');
    expect(hasEmotion(w.agent('a2')!, 'verguenza')).toBe(true);
    fullNeeds(lucia);
    w.state.minutes = lucia.travel!.arrive - 1;
    w.tick(2);
    expect(lucia.travel).toBeUndefined();
    expect(lucia.lotId).toBe('L0');
    expect(JAIL_DAYS).toBeGreaterThan(5);
  });

  it('un enemigo del barrio te puede buscar bronca (raro); si se defiende y gana, es defensa propia', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    enemy(w, -90);
    const lucia = w.agent('a1')!;
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    withRandom(0.001, () => hourlyGrudges(w));
    expect(toasts.some((t) => t.includes('Mamporros'))).toBe(true);
    // Si muere el que buscó la pelea, defensa propia: sin cárcel.
    const x = World.createNew();
    isolate(x, ['a1']);
    const bully = enemy(x, -90);
    const l2 = x.agent('a1')!;
    l2.skills = { ...l2.skills, forma: 10 };
    bully.skills = { forma: 0 };
    const t2: string[] = [];
    x.onToast((t) => t2.push(t.text));
    withRandom(0.001, () => fight(x, bully, l2));
    if (!x.agent(bully.id)) {
      expect(t2.some((t) => t.includes('Defensa propia'))).toBe(true);
      expect(l2.travel?.reason).toBeUndefined();
    }
    expect(lucia).toBeTruthy();
  });
});
