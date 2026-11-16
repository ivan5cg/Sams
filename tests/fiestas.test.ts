import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { agendaFor, calendarEvents } from '../src/sim/agenda';
import { holidayOf, knockKnock } from '../src/sim/systems/holidays';
import { hasEmotion } from '../src/sim/emotions';
import type { FamilySpec } from '../src/sim/family';
import { fullNeeds, isolate, problems } from './helpers';

const PEREZ: FamilySpec = {
  surname: 'Pérez',
  people: [
    { name: 'Rosa', stage: 'adult', traits: ['bromista', 'fiestero'], color: 0x52b788 },
    { name: 'Leo', stage: 'child', traits: ['friki', 'gloton'], color: 0x48cae4 },
  ],
  couple: false,
  pets: [],
};

/** Lleva el reloj al día `day` a la hora `hour` (pasando por el cambio de día). */
function goTo(w: World, day: number, hour = 0) {
  w.state.minutes = (day - 1) * 1440 - 1;
  w.tick(2);
  if (hour) {
    w.state.minutes = (day - 1) * 1440 + hour * 60 - 1;
    w.tick(2);
  }
}

const fridge = (w: World) => w.objectsIn(w.household.lotId).find((o) => o.def === 'fridge')!;

describe('fiestas nuevas', () => {
  it('las fechas: Reyes abre la primavera (no el primer día), Carnaval en jueves y Halloween en otoño', () => {
    expect(holidayOf(1)).toBeNull();
    expect(holidayOf(29)).toBe('reyes');
    expect(holidayOf(4)).toBe('carnaval');
    expect(holidayOf(19)).toBe('halloween');
    const fiestas = Array.from({ length: 28 }, (_, i) => holidayOf(i + 1)).filter(Boolean);
    expect(fiestas).toEqual(['carnaval', 'halloween']);
    // Y salen en la agenda.
    expect(calendarEvents(29).map((e) => e.id)).toEqual(expect.arrayContaining(['reyes', 'cabalgata']));
    expect(calendarEvents(4).map((e) => e.id)).toEqual(expect.arrayContaining(['carnaval', 'desfile']));
    expect(calendarEvents(19).map((e) => e.id)).toEqual(expect.arrayContaining(['halloween', 'truco']));
  });

  it('fuera de su día, lo de fiesta ni se ve en el menú', () => {
    const w = World.createNew();
    expect(w.optionsFor('a1', { kind: 'object', id: fridge(w).id }).map((o) => o.def.id)).not.toContain('eat_roscon');
    expect(w.optionsFor('a1', { kind: 'agent', id: 'a1' }).map((o) => o.def.id)).not.toContain('costume');
  });

  it('Reyes: regalos para los niños, roscón con figurita o haba, y cabalgata en el parque', () => {
    const w = World.createNew(PEREZ);
    isolate(w, ['a1', 'a2']);
    goTo(w, 29, 9);
    expect(w.hasEvent('reyes')).toBe(true);
    expect(hasEmotion(w.agent('a2')!, 'reyes')).toBe(true);
    expect(agendaFor(w, 0).some((i) => i.text.includes('Cabalgata'))).toBe(true);
    // El roscón: cada uno, su trozo (y a veces sale la figurita o el haba).
    const rosa = w.agent('a1')!;
    fullNeeds(rosa);
    rosa.needs.hunger = 40;
    // (Por la mañana la nevera se puede haber estropeado: es una avería normal.)
    fridge(w).broken = false;
    const before = w.household.funds;
    expect(w.command('a1', 'eat_roscon', { kind: 'object', id: fridge(w).id })).toBe(true);
    w.tick(60);
    expect(hasEmotion(rosa, 'roscon')).toBe(true);
    const opt = w.optionsFor('a1', { kind: 'object', id: fridge(w).id }).find((o) => o.def.id === 'eat_roscon')!;
    expect(opt.ok).toBe(false);
    expect(opt.reason).toMatch(/trozo/);
    expect(w.household.funds === before || w.household.funds === before - 25).toBe(true);
    // Por la tarde, cabalgata: quien esté en el parque coge caramelos.
    goTo(w, 29, 17);
    expect(w.hasEvent('cabalgata')).toBe(true);
    expect(problems(w)).toEqual([]);
  });

  it('Carnaval: disfrazarse cuesta §15 y el concurso del desfile puede dar premio', () => {
    const w = World.createNew(PEREZ);
    isolate(w, ['a1']);
    goTo(w, 4, 10);
    expect(w.hasEvent('carnaval')).toBe(true);
    const rosa = w.agent('a1')!;
    const before = w.household.funds;
    expect(w.command('a1', 'costume', { kind: 'agent', id: 'a1' })).toBe(true);
    w.tick(30);
    expect(hasEmotion(rosa, 'disfrazado')).toBe(true);
    expect(w.household.funds).toBe(before - 15);
    expect(w.checkSelfAction(rosa, 'costume').reason).toMatch(/disfrazad/);
    // En el desfile, con disfraz: a veces gana (bromista y fiestera, buenas papeletas).
    let wins = 0;
    for (let i = 0; i < 40; i++) {
      const x = World.createNew(PEREZ);
      isolate(x, ['a1']);
      goTo(x, 4, 10);
      const r = x.agent('a1')!;
      r.lotId = 'P';
      r.travel = undefined;
      x.feel(r, 'disfrazado');
      const f0 = x.household.funds;
      goTo(x, 4, 20);
      if (x.household.funds >= f0 + 100) wins++;
    }
    expect(wins).toBeGreaterThan(5);
    expect(wins).toBeLessThan(40);
  });

  it('Halloween: los niños piden caramelos y, si no hay nada en la despensa, os hacen un truco', () => {
    const w = World.createNew(PEREZ);
    isolate(w, ['a1', 'a2']);
    goTo(w, 19, 10);
    expect(w.hasEvent('halloween')).toBe(true);
    const leo = w.agent('a2')!;
    // Antes de las 18:00, aún no.
    expect(w.checkSelfAction(leo, 'trick_or_treat').reason).toMatch(/18:00/);
    // Rosa es adulta: no va pidiendo caramelos.
    expect(w.checkSelfAction(w.agent('a1')!, 'trick_or_treat').ok).toBe(false);
    goTo(w, 19, 18);
    expect(w.command('a2', 'trick_or_treat', { kind: 'agent', id: 'a2' })).toBe(true);
    w.tick(70);
    expect(hasEmotion(leo, 'caramelos')).toBe(true);
    // Trato: un puñado de la despensa.
    const p0 = w.household.pantry ?? 0;
    knockKnock(w);
    expect(w.household.pantry).toBe(p0 - 1);
    // Truco: despensa vacía.
    w.household.pantry = 0;
    knockKnock(w);
    expect(hasEmotion(w.agent('a1')!, 'gamberrada')).toBe(true);
    expect(problems(w)).toEqual([]);
  });

  it('un año entero con las fiestas, sin romper nada', () => {
    const w = World.createNew(PEREZ);
    w.tick(29 * 1440);
    expect(problems(w)).toEqual([]);
  }, 60_000);
});
