import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import { hasEmotion } from '../src/sim/emotions';
import { ILLNESSES } from '../src/data/illnesses';
import { catchIllness, dailyHealth, hourlyContagion, illnessDecay, jokeRisk, riskyTask } from '../src/sim/systems/illness';
import { fullNeeds, isolate, problems } from './helpers';

/** Ejecuta con un azar fijo (para forzar o evitar lo que pasa por probabilidad). */
function withRandom<T>(v: number, fn: () => T): T {
  const orig = Math.random;
  Math.random = () => v;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

describe('enfermedades', () => {
  it('ponerse malo se nota: cansa más, y se guarda', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const lucia = w.agent('a1')!;
    expect(catchIllness(w, lucia, 'gripe')).toBe(true);
    expect(catchIllness(w, lucia, 'resfriado')).toBe(false); // ya está mala
    expect(hasEmotion(lucia, 'enfermo')).toBe(true);
    expect(illnessDecay(lucia, 'energy')).toBeGreaterThan(1.5);
    const again = new World(migrate(JSON.parse(serialize(w.state))));
    expect(again.agent('a1')?.illness?.id).toBe('gripe');
    // La varicela, solo de pequeños.
    expect(catchIllness(w, w.agent('a2')!, 'varicela')).toBe(false);
  });

  it('se pega a los de casa (menos si van limpios)', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    const mateo = w.agent('a2')!;
    isolate(w, ['a1', 'a2']);
    catchIllness(w, lucia, 'gripe');
    mateo.needs.hygiene = 20;
    withRandom(0.01, () => hourlyContagion(w));
    expect(mateo.illness?.id).toBe('gripe');
  });

  it('se cura sola; con médico, antes; y las medicinas alivian', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const lucia = w.agent('a1')!;
    catchIllness(w, lucia, 'resfriado');
    const until = lucia.illness!.until;
    expect(w.seeDoctor(lucia)).toBeUndefined();
    expect(lucia.illness!.until).toBeLessThan(until);
    expect(w.seeDoctor(lucia)).toMatch(/Ya tiene/);
    // Medicinas: tocándose a sí misma, §5.
    fullNeeds(lucia);
    const f0 = w.household.funds;
    expect(w.command('a1', 'take_medicine', { kind: 'agent', id: 'a1' })).toBe(true);
    w.tick(10);
    expect(w.household.funds).toBe(f0 - 5);
    // Pasado el tiempo, curada.
    w.state.minutes = lucia.illness!.until + 1;
    withRandom(0.99, () => dailyHealth(w));
    expect(lucia.illness).toBeUndefined();
    expect(problems(w)).toEqual([]);
  });

  it('una gripe mal curada en un mayor se complica en neumonía, y la neumonía puede matar', () => {
    const w = World.createNew({ surname: 'Gil', people: [{ name: 'Pepe', stage: 'elder', traits: ['grunon', 'cunado'], color: 1 }, { name: 'Ana', stage: 'adult', traits: ['optimista', 'romantico'], color: 2 }], couple: true, pets: [] });
    isolate(w, ['a1', 'a2']);
    const pepe = w.agent('a1')!;
    catchIllness(w, pepe, 'gripe');
    w.state.minutes = pepe.illness!.until + 1;
    withRandom(0.05, () => dailyHealth(w));
    expect(pepe.illness?.id).toBe('neumonia');
    expect(ILLNESSES.neumonia.deadly?.elder).toBeGreaterThan(0.05);
    withRandom(0.01, () => dailyHealth(w));
    expect(w.agent('a1')).toBeUndefined();
    // Luto en casa, y lápida.
    expect(hasEmotion(w.agent('a2')!, 'luto')).toBe(true);
    expect(w.objectsIn('L0').some((o) => o.def === 'grave')).toBe(true);
  });
});

describe('otras formas de morir (raras)', () => {
  it('infarto, electrocutarse arreglando un aparato sin saber y morirse de risa', () => {
    const toasts: string[] = [];
    // Infarto: un mayor glotón, con mala suerte.
    const w = World.createNew({ surname: 'Gil', people: [{ name: 'Pepe', stage: 'elder', traits: ['gloton', 'cunado'], color: 1 }, { name: 'Ana', stage: 'adult', traits: ['optimista', 'romantico'], color: 2 }], couple: true, pets: [] });
    w.onToast((t) => toasts.push(t.text));
    withRandom(0.0001, () => dailyHealth(w));
    expect(toasts.some((t) => t.includes('infarto'))).toBe(true);
    // Electrocutado: arreglando la tele sin saber de lógica.
    const x = World.createNew();
    x.onToast((t) => toasts.push(t.text));
    withRandom(0.001, () => riskyTask(x, x.agent('a1')!, 'repair', 'tv'));
    expect(x.agent('a1')).toBeUndefined();
    expect(toasts.some((t) => t.includes('electrocutado'))).toBe(true);
    // De risa: un chiste del bromista a un mayor.
    const y = World.createNew({ surname: 'Gil', people: [{ name: 'Pepe', stage: 'elder', traits: ['grunon', 'cunado'], color: 1 }, { name: 'Ana', stage: 'adult', traits: ['bromista', 'romantico'], color: 2 }], couple: true, pets: [] });
    y.onToast((t) => toasts.push(t.text));
    withRandom(0.0001, () => jokeRisk(y, y.agent('a2')!, y.agent('a1')!));
    expect(toasts.some((t) => t.includes('muerto de risa con un chiste de Ana'))).toBe(true);
  });

  it('en un mes normal (con trabajo), la familia no se muere de enfermedades por cualquier cosa', () => {
    let deaths = 0;
    let sick = 0;
    for (let i = 0; i < 6; i++) {
      const w = World.createNew();
      w.setJob(w.agent('a1')!, 'oficina');
      w.setJob(w.agent('a2')!, 'oficina');
      w.onToast((t) => {
        if (/muerto de (?!hambre)|infarto|electrocutado|muerto de risa/.test(t.text)) deaths++;
        if (/se ha puesto malo/.test(t.text)) sick++;
      });
      w.state.activeAgentId = 'nadie';
      w.tick(30 * 1440);
      expect(problems(w)).toEqual([]);
    }
    // Ponerse malo, sí pasa; morirse, casi nunca.
    expect(sick).toBeGreaterThan(0);
    expect(deaths).toBeLessThanOrEqual(1);
  }, 180_000);
});
