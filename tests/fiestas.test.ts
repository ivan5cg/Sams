import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { calendarEvents } from '../src/sim/agenda';
import { holidayOf, knockKnock } from '../src/sim/systems/holidays';
import { hasEmotion } from '../src/sim/emotions';
import type { FamilySpec } from '../src/sim/family';
import { fullNeeds, goToDate, isolate, problems } from './helpers';
import { carnivalOf, dateOfDay } from '../src/sim/date';

const PEREZ: FamilySpec = {
  surname: 'Pérez',
  people: [
    { name: 'Rosa', stage: 'adult', traits: ['bromista', 'fiestero'], color: 0x52b788 },
    { name: 'Leo', stage: 'child', traits: ['friki', 'gloton'], color: 0x48cae4 },
  ],
  couple: false,
  pets: [],
};

/** Partida que empieza unos días antes de una fiesta. */
const startingOn = (start: string) => World.createNew(PEREZ, { start });

const fridge = (w: World) => w.objectsIn(w.household.lotId).find((o) => o.def === 'fridge')!;

describe('fiestas nuevas', () => {
  it('las fechas de verdad: Reyes el 6 de enero, Carnaval antes de Cuaresma y Halloween el 31 de octubre', () => {
    const on = (iso: string) => dateOfDay(iso, 1);
    expect(holidayOf(on('2027-01-06'))).toBe('reyes');
    expect(holidayOf(on('2027-10-31'))).toBe('halloween');
    // Carnaval se mueve con la Pascua: en 2027 cae el 6 de febrero; en 2028, el 26.
    expect(carnivalOf(2027)).toEqual({ m: 2, d: 6 });
    expect(carnivalOf(2028)).toEqual({ m: 2, d: 26 });
    expect(holidayOf(on('2027-02-06'))).toBe('carnaval');
    // En todo un año, cada fiesta una sola vez.
    const year = Array.from({ length: 365 }, (_, i) => holidayOf(dateOfDay('2027-01-01', i + 1))).filter(Boolean);
    expect(year.sort()).toEqual(['carnaval', 'halloween', 'reyes']);
    // Y salen en la agenda (la cabalgata, la víspera).
    expect(calendarEvents(on('2027-01-05')).map((e) => e.id)).toContain('cabalgata');
    expect(calendarEvents(on('2027-01-06')).map((e) => e.id)).toContain('reyes');
    expect(calendarEvents(on('2027-02-06')).map((e) => e.id)).toEqual(expect.arrayContaining(['carnaval', 'desfile']));
    expect(calendarEvents(on('2027-10-31')).map((e) => e.id)).toEqual(expect.arrayContaining(['halloween', 'truco']));
  });

  it('fuera de su día, lo de fiesta ni se ve en el menú', () => {
    const w = World.createNew();
    expect(w.optionsFor('a1', { kind: 'object', id: fridge(w).id }).map((o) => o.def.id)).not.toContain('eat_roscon');
    expect(w.optionsFor('a1', { kind: 'agent', id: 'a1' }).map((o) => o.def.id)).not.toContain('costume');
  });

  it('Reyes: regalos para los niños, roscón con figurita o haba, y cabalgata en el parque', () => {
    const w = startingOn('2027-12-28');
    isolate(w, ['a1', 'a2']);
    // La víspera, por la tarde, la cabalgata.
    goToDate(w, '2028-01-05', 17);
    expect(w.hasEvent('cabalgata')).toBe(true);
    goToDate(w, '2028-01-06', 9);
    expect(w.hasEvent('reyes')).toBe(true);
    expect(hasEmotion(w.agent('a2')!, 'reyes')).toBe(true);
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
    expect(problems(w)).toEqual([]);
  });

  it('Carnaval: disfrazarse cuesta §15 y el concurso del desfile puede dar premio', () => {
    const w = startingOn('2027-02-01');
    isolate(w, ['a1']);
    goToDate(w, '2027-02-06', 10);
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
      const x = startingOn('2027-02-01');
      isolate(x, ['a1']);
      goToDate(x, '2027-02-06', 10);
      const r = x.agent('a1')!;
      r.lotId = 'P';
      r.travel = undefined;
      x.feel(r, 'disfrazado');
      const f0 = x.household.funds;
      goToDate(x, '2027-02-06', 20);
      if (x.household.funds >= f0 + 100) wins++;
    }
    expect(wins).toBeGreaterThan(5);
    expect(wins).toBeLessThan(40);
  });

  it('Halloween: los niños piden caramelos y, si no hay nada en la despensa, os hacen un truco', () => {
    const w = startingOn('2027-10-25');
    isolate(w, ['a1', 'a2']);
    goToDate(w, '2027-10-31', 10);
    expect(w.hasEvent('halloween')).toBe(true);
    const leo = w.agent('a2')!;
    // Antes de las 18:00, aún no.
    expect(w.checkSelfAction(leo, 'trick_or_treat').reason).toMatch(/18:00/);
    // Rosa es adulta: no va pidiendo caramelos.
    expect(w.checkSelfAction(w.agent('a1')!, 'trick_or_treat').ok).toBe(false);
    goToDate(w, '2027-10-31', 18);
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

  it('un mes entero, sin romper nada', () => {
    const w = World.createNew(PEREZ);
    w.tick(29 * 1440);
    expect(problems(w)).toEqual([]);
  }, 60_000);
});
