import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate } from '../src/save/serialize';
import { dateOfDay, dayOfDate, easter, electionDayOf, isISODate, seasonOf, todayISO } from '../src/sim/date';
import { TEST_TODAY } from './setup';
import { goToDate, problems, saveAt } from './helpers';

describe('calendario de verdad', () => {
  it('cada día de juego es un día del calendario, con su día de la semana', () => {
    const d1 = dateOfDay('2026-11-17', 1);
    expect(d1).toEqual({ y: 2026, m: 11, d: 17, wd: 1, season: 2 }); // martes, otoño
    expect(dateOfDay('2026-11-17', 15)).toMatchObject({ m: 12, d: 1, wd: 1 });
    expect(dateOfDay('2026-12-30', 3)).toMatchObject({ y: 2027, m: 1, d: 1, wd: 4 }); // cambio de año
    expect(dateOfDay('2028-02-28', 2)).toMatchObject({ m: 2, d: 29 }); // bisiesto
    // Con cambio de hora por medio, nada se descuadra.
    expect(dateOfDay('2027-03-27', 2)).toMatchObject({ m: 3, d: 28, wd: 6 });
    expect(dayOfDate('2026-11-17', 2026, 12, 25)).toBe(39);
  });

  it('las estaciones caen en su fecha', () => {
    expect(seasonOf(3, 20)).toBe(3);
    expect(seasonOf(3, 21)).toBe(0);
    expect(seasonOf(6, 21)).toBe(1);
    expect(seasonOf(9, 22)).toBe(1);
    expect(seasonOf(9, 23)).toBe(2);
    expect(seasonOf(12, 21)).toBe(3);
    expect(seasonOf(1, 15)).toBe(3);
  });

  it('Pascua y las elecciones (último domingo de mayo)', () => {
    expect(easter(2026)).toEqual({ m: 4, d: 5 });
    expect(easter(2027)).toEqual({ m: 3, d: 28 });
    expect(electionDayOf(2027)).toBe(30);
    expect(electionDayOf(2026)).toBe(31);
  });

  it('una partida nueva empieza hoy; y se puede empezar otro día', () => {
    expect(todayISO()).toBe(TEST_TODAY);
    const w = World.createNew();
    expect(w.state.calendarStart).toBe(TEST_TODAY);
    expect(w.date).toMatchObject({ y: 2027, m: 3, d: 22, wd: 0, season: 0 });
    const x = World.createNew(undefined, { start: '2026-11-17' });
    expect(x.weekday).toBe(1);
    expect(x.seasonDef.id).toBe('otono');
    goToDate(x, '2026-12-21');
    expect(x.seasonDef.id).toBe('invierno');
    expect(x.weekIndex).toBe(5); // la semana empieza en lunes
  });

  it('una partida de antes sigue «hoy»: el día en que iba coincide con la fecha real', () => {
    const old = saveAt(16);
    old.minutes = 30 * 1440 + 600; // iba por el día 31
    const m = migrate(old);
    expect(isISODate(m.calendarStart)).toBe(true);
    const w = new World(m);
    expect(w.day).toBe(31);
    expect(w.date).toMatchObject({ y: 2027, m: 3, d: 22 });
    expect(problems(w)).toEqual([]);
    // Una fecha rota no se carga.
    expect(() => migrate({ ...JSON.parse(JSON.stringify(m)), calendarStart: '2027-02-30' })).toThrow();
  });
});
