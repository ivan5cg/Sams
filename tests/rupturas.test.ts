import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { getRel, partnerOf, setRel } from '../src/sim/social';
import { hasEmotion } from '../src/sim/emotions';
import { relTags } from '../src/sim/relations';
import { EX_COHAB_DAYS, moveOut, moveOutReason, onBreakUp } from '../src/sim/systems/breakups';
import { fullNeeds, isolate, problems } from './helpers';

function quiet<T>(fn: () => T, v = 0.99): T {
  const orig = Math.random;
  Math.random = () => v;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}
function days(w: World, n: number, v = 0.99) {
  quiet(() => {
    for (let i = 0; i < n; i++) {
      w.state.minutes = Math.floor(w.state.minutes / 1440 + 1) * 1440 - 1;
      w.tick(2);
    }
  }, v);
}

/** Lucía corta con Mateo (con el mismo azar siempre). */
function breakUp(w: World) {
  isolate(w, ['a1', 'a2']);
  fullNeeds(w.agent('a1')!);
  quiet(() => {
    expect(w.command('a1', 'break_up', { kind: 'agent', id: 'a2' })).toBe(true);
    w.tick(20);
  }, 0.1);
  const rel = getRel(w.state, 'a1', 'a2');
  expect(rel.status).toBeUndefined();
  expect(rel.ex).toBe(true);
  return rel;
}

describe('después de romper', () => {
  it('si viven juntos, uno se va a un piso de alquiler (a los pocos días, o cuando tú digas)', () => {
    const w = World.createNew();
    breakUp(w);
    expect(moveOutReason(w, w.agent('a2')!)).toBeUndefined();
    // Desde el ordenador, Mateo se busca piso.
    const pc = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    const opt = w.checkObjectAction(w.agent('a2')!, pc, 'move_out');
    expect(opt.ok).toBe(true);
    const funds = w.household.funds;
    expect(moveOut(w, w.agent('a2')!)).toBeUndefined();
    const mateo = w.agent('a2')!;
    expect(w.isPlayerMember(mateo)).toBe(false);
    const flat = w.householdOf(mateo)!;
    expect(w.lotById(flat.lotId).name).toBe('Piso de Mateo');
    expect(w.household.funds).toBe(funds - Math.round(funds * 0.3));
    expect(getRel(w.state, 'a1', 'a2').ex).toBe(false);
    // Se va a su piso (luego hará vida como cualquier vecino).
    expect(mateo.travel?.to === flat.lotId || mateo.via === flat.lotId).toBe(true);
    w.tick(120);
    expect(problems(w)).toEqual([]);
  });

  it('si nadie hace nada, a los pocos días se va solo el que no está al mando', () => {
    const w = World.createNew();
    breakUp(w);
    days(w, EX_COHAB_DAYS + 1);
    expect(w.isPlayerMember(w.agent('a1')!)).toBe(true);
    expect(w.isPlayerMember(w.agent('a2')!)).toBe(false);
  });

  it('con niños a cargo, quien se queda solo con ellos no se va', () => {
    const w = World.createNew({ surname: 'Ruiz', people: [{ name: 'Ana', stage: 'adult', traits: ['optimista', 'romantico'], color: 1 }, { name: 'Leo', stage: 'child', traits: ['friki', 'gloton'], color: 2 }], couple: false, pets: [] });
    expect(moveOutReason(w, w.agent('a1')!)).toMatch(/niños/);
  });

  it('no superarlo: escenas, celos de la nueva pareja del ex, y a veces vuelven', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    const mateo = w.agent('a2')!;
    const rel = breakUp(w);
    lucia.longing = { who: 'a2', since: w.day };
    moveOut(w, mateo);
    // Mateo encuentra pareja nueva...
    const nueva = w.state.agents.find((a) => a.kind === 'person' && a.sex === 'f' && !w.isPlayerMember(a) && !a.role && ['young', 'adult'].includes(w.stageOf(a)) && !partnerOf(w.state, a.id))!;
    setRel(w.state, 'a2', nueva.id, { f: 50, r: 70, status: 'partner', last: w.day });
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    days(w, 1);
    // ...y a Lucía le dan celos.
    expect(toasts.some((t) => t.includes('no lleva nada bien'))).toBe(true);
    expect(hasEmotion(lucia, 'celos')).toBe(true);
    expect(hasEmotion(lucia, 'no_superado')).toBe(true);
    expect(getRel(w.state, 'a1', nueva.id).f).toBeLessThan(0);
    expect(relTags(w, lucia, nueva).map((t) => t.id)).toContain('rival');
    expect(relTags(w, lucia, mateo).find((t) => t.id === 'ex')?.label).toMatch(/no lo ha superado/);
    // Si los dos se echan de menos y están solos, pueden volver.
    const x = World.createNew();
    const r2 = breakUp(x);
    x.agent('a1')!.longing = { who: 'a2', since: x.day };
    x.agent('a2')!.longing = { who: 'a1', since: x.day };
    days(x, 1, 0.1);
    expect(getRel(x.state, 'a1', 'a2').status).toBe('partner');
    expect(r2).toBeTruthy();
    expect(rel).toBeTruthy();
  });

  it('los solteros del barrio encuentran pareja (y lo superan antes)', () => {
    const w = World.createNew();
    const before = Object.values(w.state.rels).filter((r) => r.status).length;
    days(w, 30, 0.005);
    expect(Object.values(w.state.rels).filter((r) => r.status).length).toBeGreaterThan(before);
  });

  it('al romper, alguno no lo supera', () => {
    const w = World.createNew();
    const rel = getRel(w.state, 'a1', 'a2');
    quiet(() => onBreakUp(w, w.agent('a1')!, w.agent('a2')!, rel), 0.1);
    expect(w.agent('a1')!.longing?.who).toBe('a2');
    expect(w.agent('a2')!.longing?.who).toBe('a1');
    expect(rel.split).toBe(w.day);
  });
});
