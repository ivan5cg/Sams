import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { getRel, setRel } from '../src/sim/social';
import { COUPLE, coworkerDay, relTags } from '../src/sim/relations';
import { hasEmotion } from '../src/sim/emotions';
import { migrate, serialize } from '../src/save/serialize';
import { fullNeeds, isolate, problems, saveAt } from './helpers';

const ids = (w: World, a: string, b: string) => relTags(w, w.agent(a)!, w.agent(b)!).map((t) => t.id);

/** Avanza día a día, sin sucesos al azar. */
function days(w: World, n: number) {
  const orig = Math.random;
  Math.random = () => 0.99;
  try {
    for (let i = 0; i < n; i++) {
      w.state.minutes = Math.floor(w.state.minutes / 1440 + 1) * 1440 - 1;
      w.tick(2);
    }
  } finally {
    Math.random = orig;
  }
}

describe('tipos de relación', () => {
  it('pareja, amigos, enemigos, interés romántico, amantes, ex y familia', () => {
    const w = World.createNew();
    expect(ids(w, 'a1', 'a2')[0]).toBe('novios');
    expect(relTags(w, w.agent('a1')!, w.agent('a2')!)[0].label).toBe('Su novio');
    const v = w.state.agents.filter((a) => a.kind === 'person' && !w.isPlayerMember(a) && !a.role);
    const [p, q, r, s] = v;
    setRel(w.state, 'a1', p.id, { f: 50, r: 0 });
    setRel(w.state, 'a1', q.id, { f: -60, r: 0 });
    setRel(w.state, 'a1', r.id, { f: 20, r: 40 });
    setRel(w.state, 'a1', s.id, { f: 30, r: 60, affair: true });
    expect(ids(w, 'a1', p.id)).toContain('buenos');
    expect(ids(w, 'a1', q.id)).toContain('enemigos');
    expect(ids(w, 'a1', r.id)).toContain('interes');
    expect(ids(w, 'a1', s.id)).toContain('amantes');
    // Familia: un hijo.
    const kid = v.find((x) => x.parents?.length);
    if (kid) expect(ids(w, kid.parents![0], kid.id)[0]).toBe('hijo');
  });

  it('compañeros de trabajo: los que caen bien y el que se odia', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const lucia = w.agent('a1')!;
    w.setJob(lucia, 'oficina');
    const mate = w.state.agents.find((a) => a.kind === 'person' && !w.isPlayerMember(a) && !a.role && a.job?.career === 'oficina') ?? w.state.agents.find((a) => a.kind === 'person' && !w.isPlayerMember(a) && !a.role)!;
    mate.job = { career: 'oficina', level: 1, perf: 50 };
    expect(ids(w, 'a1', mate.id)).toContain('companero');
    setRel(w.state, 'a1', mate.id, { f: -40, r: 0 });
    expect(ids(w, 'a1', mate.id)).toContain('companero_odio');
    // Al acabar el turno, a veces pasa algo con un compañero.
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    const orig = Math.random;
    Math.random = () => 0.1;
    try {
      coworkerDay(w, lucia);
    } finally {
      Math.random = orig;
    }
    expect(toasts.some((t) => t.startsWith('En el trabajo'))).toBe(true);
  });

  it('mejores amigos (un pacto) y persona non grata (no pisa tu casa)', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const lucia = w.agent('a1')!;
    const amiga = w.state.agents.find((a) => a.kind === 'person' && !w.isPlayerMember(a) && !a.role && ['young', 'adult'].includes(w.stageOf(a)))!;
    amiga.travel = undefined;
    amiga.lotId = 'L0';
    amiga.pos = { x: 7, y: 6 };
    amiga.current = null;
    amiga.queue = [];
    amiga.job = undefined;
    fullNeeds(amiga);
    fullNeeds(lucia);
    setRel(w.state, 'a1', amiga.id, { f: 80, r: 0 });
    const orig = Math.random;
    Math.random = () => 0.05;
    try {
      expect(w.command('a1', 'best_friends', { kind: 'agent', id: amiga.id })).toBe(true);
      w.tick(30);
    } finally {
      Math.random = orig;
    }
    expect(getRel(w.state, 'a1', amiga.id).best).toBe(true);
    expect(ids(w, 'a1', amiga.id)).toContain('mejores');
    // Ahora, persona non grata: se va de casa y no puede volver.
    setRel(w.state, 'a1', amiga.id, { ...getRel(w.state, 'a1', amiga.id), f: -40 });
    lucia.current = null;
    lucia.queue = [];
    amiga.current = null;
    expect(w.command('a1', 'ban', { kind: 'agent', id: amiga.id })).toBe(true);
    w.tick(30);
    expect(getRel(w.state, 'a1', amiga.id).banned).toBe('a1');
    expect(ids(w, 'a1', amiga.id)).toContain('nongrata');
    w.tick(60);
    expect(amiga.lotId === 'L0' && !amiga.travel).toBe(false);
    amiga.travel = undefined;
    amiga.lotId = w.householdOf(amiga)!.lotId;
    expect(w.canTravel(amiga, 'L0').reason).toMatch(/non grata/);
  });
});

describe('desgaste', () => {
  it('una pareja sin detalles entra en crisis y acaba rompiendo; con detalles, no', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    // Nadie se hace caso: sin interacciones.
    for (const a of [w.agent('a1')!, w.agent('a2')!]) a.travel = { from: 'L0', to: 'L0', arrive: Number.POSITIVE_INFINITY };
    // Romance 75, y a partir del cuarto día sin detalles, −3 al día: crisis por debajo de 35 (unos 17 días)...
    days(w, 18);
    expect(toasts.some((t) => t.includes('en crisis'))).toBe(true);
    expect(hasEmotion(w.agent('a1')!, 'crisis')).toBe(true);
    expect(getRel(w.state, 'a1', 'a2').status).toBe('partner');
    // ...y ruptura por debajo de 15 (una semana más).
    days(w, 8);
    const rel = getRel(w.state, 'a1', 'a2');
    expect(rel.status).toBeUndefined();
    expect(rel.ex).toBe(true);
    expect(rel.r).toBeLessThan(COUPLE.breakup);
    expect(toasts.some((t) => t.includes('lo han dejado'))).toBe(true);
    // Otra pareja que se da un beso cada día: ni crisis.
    const x = World.createNew();
    isolate(x, ['a1', 'a2']);
    for (let d = 0; d < 20; d++) {
      days(x, 1);
      getRel(x.state, 'a1', 'a2').last = x.day;
    }
    expect(getRel(x.state, 'a1', 'a2').status).toBe('partner');
    expect(getRel(x.state, 'a1', 'a2').crisis).toBeUndefined();
  });

  it('las amistades se enfrían sin contacto, y los mejores amigos dejan de serlo', () => {
    const w = World.createNew();
    const v = w.state.agents.find((a) => a.kind === 'person' && !w.isPlayerMember(a) && !a.role)!;
    setRel(w.state, 'a1', v.id, { f: 60, r: 0, best: true, last: w.day });
    days(w, 10);
    const rel = getRel(w.state, 'a1', v.id);
    expect(rel.f).toBeLessThan(55);
    expect(rel.best).toBe(false);
  });

  it('las partidas de antes empiezan a contar desde hoy (nadie rompe de golpe) y se guarda todo', () => {
    const m = migrate(saveAt(20));
    expect(Object.values(m.rels).every((r) => typeof r.last === 'number')).toBe(true);
    const w = new World(m);
    days(w, 2);
    expect(getRel(w.state, 'a1', 'a2').status).toBe('partner');
    const again = new World(migrate(JSON.parse(serialize(w.state))));
    expect(problems(again)).toEqual([]);
  });
});
