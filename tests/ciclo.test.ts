import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate } from '../src/save/serialize';
import { sexOfName } from '../src/data/names';
import { hasEmotion } from '../src/sim/emotions';
import { CYCLE_DAYS, FERTILITY, cycleDay, hasCycle, isPregnant, maybeConceive, phase, phaseOf } from '../src/sim/systems/fertility';
import { setRel } from '../src/sim/social';
import { fullNeeds, isolate, problems, saveAt } from './helpers';

/** Avanza día a día, pasando por cada mañana, sin sucesos al azar (nadie se pone malo por el camino). */
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

describe('sexo, ciclo menstrual y embarazos', () => {
  it('cada persona es mujer u hombre (por el nombre, o lo que se elija)', () => {
    expect(sexOfName('Lucía')).toBe('f');
    expect(sexOfName('Mateo')).toBe('m');
    expect(sexOfName('Carmen')).toBe('f');
    expect(sexOfName('Doña Puri')).toBe('f');
    expect(sexOfName('El del acordeón')).toBe('m');
    const w = World.createNew();
    expect(w.agent('a1')!.sex).toBe('f');
    expect(w.agent('a2')!.sex).toBe('m');
    expect(w.state.agents.filter((a) => a.kind === 'person').every((a) => a.sex === 'f' || a.sex === 'm')).toBe(true);
    // Las partidas de antes lo reciben por el nombre.
    const old = migrate(saveAt(18));
    expect(old.agents.find((a) => a.id === 'a1')?.sex).toBe('f');
    expect(problems(new World(old))).toEqual([]);
  });

  it('el ciclo: 28 días con regla, ovulación y días de antes; cada fase se nota', () => {
    expect(['regla', 'folicular', 'ovulacion', 'lutea', 'premenstrual'].map((p) => Array.from({ length: CYCLE_DAYS }, (_, d) => phaseOf(d)).filter((x) => x === p).length)).toEqual([5, 7, 3, 8, 5]);
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    const lucia = w.agent('a1')!;
    const mateo = w.agent('a2')!;
    expect(hasCycle(w, lucia)).toBe(true);
    expect(hasCycle(w, mateo)).toBe(false);
    // Mañana le baja la regla.
    lucia.cycle = w.day - CYCLE_DAYS + 1;
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    fullNeeds(lucia);
    // (Solo se recuerdan seis emociones a la vez: se empieza sin ninguna para ver las del ciclo.)
    lucia.emotions = [];
    days(w, 1);
    expect(cycleDay(w, lucia)).toBe(0);
    expect(phase(w, lucia)).toBe('regla');
    expect(hasEmotion(lucia, 'dolor_regla')).toBe(true);
    expect(toasts.some((t) => t.includes('le ha bajado la regla'))).toBe(true);
    days(w, 12);
    lucia.emotions = [];
    days(w, 1);
    expect(phase(w, lucia)).toBe('ovulacion');
    expect(hasEmotion(lucia, 'radiante')).toBe(true);
    days(w, 9);
    lucia.emotions = [];
    days(w, 1);
    expect(phase(w, lucia)).toBe('premenstrual');
    expect(hasEmotion(lucia, 'sensible')).toBe(true);
  });

  it('el ñiqui ñiqui puede acabar en embarazo: más en la ovulación; se sabe al día siguiente y nace el bebé', () => {
    expect(FERTILITY.ovulacion).toBeGreaterThan(FERTILITY.regla * 10);
    // Muchas veces en la ovulación: unas cuantas acaban en embarazo, pero no todas.
    let yes = 0;
    for (let i = 0; i < 200; i++) {
      const x = World.createNew();
      const l = x.agent('a1')!;
      l.cycle = x.day - 13; // día 13: ovulación
      if (maybeConceive(x, l, x.agent('a2')!)) yes++;
    }
    expect(yes).toBeGreaterThan(40);
    expect(yes).toBeLessThan(110);
    // Una pareja de dos mujeres no se queda embarazada así.
    const w = World.createNew({ surname: 'Ruiz', people: [{ name: 'Ana', stage: 'young', traits: ['optimista', 'romantico'], color: 1 }, { name: 'Eva', stage: 'young', traits: ['friki', 'romantico'], color: 2 }], couple: true, pets: [] });
    for (let i = 0; i < 50; i++) expect(maybeConceive(w, w.agent('a1')!, w.agent('a2')!)).toBe(false);
    // Lucía y Mateo: embarazo en la ovulación (forzado), se sabe al día siguiente, y nace.
    const g = World.createNew();
    isolate(g, ['a1', 'a2']);
    const lucia = g.agent('a1')!;
    lucia.cycle = g.day - 13;
    const orig = Math.random;
    Math.random = () => 0.01;
    let ok: boolean;
    try {
      ok = maybeConceive(g, lucia, g.agent('a2')!);
    } finally {
      Math.random = orig;
    }
    expect(ok).toBe(true);
    expect(isPregnant(g, lucia)).toBe(true);
    expect(g.household.expecting?.known).toBe(false);
    expect(hasCycle(g, lucia)).toBe(false);
    days(g, 1);
    expect(g.household.expecting?.known).toBe(true);
    expect(hasEmotion(lucia, 'embarazada')).toBe(true);
    // Embarazada, nada de alcohol.
    const fridge = g.objectsIn('L0').find((o) => o.def === 'fridge')!;
    g.state.minutes = Math.floor(g.state.minutes / 1440) * 1440 + 20 * 60;
    expect(g.checkObjectAction(lucia, fridge, 'drink_beer').reason).toMatch(/Embarazada/);
    const before = g.members.length;
    days(g, 3);
    g.tick(60);
    expect(g.members.length).toBe(before + 1);
    expect(isPregnant(g, lucia)).toBe(false);
    expect(problems(g)).toEqual([]);
  });

  it('las amantes también pueden quedarse embarazadas (y el barrio se entera)', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    const vecino = w.state.agents.find((a) => a.kind === 'person' && a.sex === 'm' && !w.isPlayerMember(a) && w.stageOf(a) === 'adult')!;
    setRel(w.state, lucia.id, vecino.id, { f: 50, r: 70, affair: true });
    lucia.cycle = w.day - 13;
    const orig = Math.random;
    Math.random = () => 0.01;
    try {
      expect(maybeConceive(w, lucia, vecino)).toBe(true);
    } finally {
      Math.random = orig;
    }
    days(w, 1);
    expect(w.state.secrets?.some((s) => s.text.includes('amante'))).toBe(true);
  });
});
