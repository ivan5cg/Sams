import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { agendaFor, calendarEvents } from '../src/sim/agenda';
import { SPECIES, lifeStage } from '../src/data/species';
import { isolate } from './helpers';

describe('agenda de la familia', () => {
  it('turnos, facturas del lunes y el calendario del barrio', () => {
    const w = World.createNew();
    w.setJob(w.agent('a2')!, 'oficina');
    const today = agendaFor(w, 0);
    // El cambio de estación sale en su día (21 de junio: empieza el verano).
    expect(calendarEvents(w.dateOf(92)).map((e) => e.text)).toContain('Empieza el verano');
    expect(today.some((i) => i.kind === 'work' && i.agentId === 'a2')).toBe(true);
    expect(today.some((i) => i.kind === 'bills')).toBe(false); // el primer lunes no hay facturas
    // Una semana después, el lunes llegan las facturas.
    w.state.minutes += 7 * 1440;
    expect(agendaFor(w, 0).some((i) => i.kind === 'bills')).toBe(true);
    // Ordenado por hora, con lo de todo el día primero.
    const mins = agendaFor(w, 0).map((i) => i.minute);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });

  // Tres temporadas con fiestas: mayo y junio, otoño, y Navidad y Reyes.
  for (const [from, days, ids] of [
    ['2027-05-10', 46, ['campana', 'sanisidro', 'verbena']],
    ['2027-10-01', 32, ['ofertas', 'halloween']],
    ['2027-12-20', 19, ['navidad', 'cabalgata', 'reyes']],
  ] as const) {
    it(`los eventos que anuncia la agenda pasan de verdad ese día (desde el ${from})`, () => {
      const w = World.createNew(undefined, { start: from });
      w.state.activeAgentId = 'nadie';
      const seen = new Map<number, Set<string>>();
      for (let h = 0; h < days * 24; h++) {
        w.tick(60);
        const s = seen.get(w.day) ?? new Set<string>();
        for (const e of w.activeEvents()) s.add(e.id);
        seen.set(w.day, s);
      }
      const all = new Set<string>();
      for (let day = 1; day <= days; day++) {
        const predicted = calendarEvents(w.dateOf(day)).map((e) => e.id).filter((id) => (ids as readonly string[]).includes(id));
        for (const id of predicted) {
          all.add(id);
          expect(seen.get(day)?.has(id), `${from} + ${day - 1} días: ${id}`).toBe(true);
        }
      }
      // Y todas las fiestas de la temporada salen en la agenda.
      expect([...all].sort()).toEqual([...ids].sort());
    }, 60_000);
  }

  it('cumpleaños y bebés en camino', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    const stages = SPECIES.human.stages;
    const cur = stages.findIndex((s) => s.id === lifeStage('human', lucia.ageDays).id);
    lucia.ageDays = stages[cur].until - 1;
    expect(agendaFor(w, 1).some((i) => i.kind === 'birthday' && i.agentId === 'a1')).toBe(true);
    w.household.expecting = { parents: ['a1', 'a2'], due: w.state.minutes + 1440 };
    expect(agendaFor(w, 1).some((i) => i.kind === 'baby' && i.text.includes('Lucía'))).toBe(true);
  });

  it('una orden programada se da sola a su hora', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const tv = w.objectsIn('L0').find((o) => w.objDef(o).actions.includes('watch_tv'))!;
    const now = w.state.minutes % 1440;
    const order = w.scheduleOrder('a1', 'watch_tv', { kind: 'object', id: tv.id }, now + 90);
    expect(order).toBeTruthy();
    expect(agendaFor(w, 0).some((i) => i.kind === 'order')).toBe(true);
    w.tick(80);
    const lucia = w.agent('a1')!;
    expect([lucia.current, ...lucia.queue].some((t) => t?.actionId === 'watch_tv')).toBe(false);
    w.tick(15);
    expect([lucia.current, ...lucia.queue].some((t) => t?.actionId === 'watch_tv')).toBe(true);
    expect(w.state.schedule).toEqual([]);
  });

  it('una hora que ya ha pasado hoy se programa para mañana, y se puede cancelar', () => {
    const w = World.createNew();
    const fridge = w.objectsIn('L0').find((o) => o.def === 'fridge')!;
    const o = w.scheduleOrder('a2', 'cook', { kind: 'object', id: fridge.id }, 6 * 60)!;
    expect(Math.floor(o.at / 1440)).toBe(Math.floor(w.state.minutes / 1440) + 1);
    expect(agendaFor(w, 1).some((i) => i.orderId === o.id)).toBe(true);
    w.cancelOrder(o.id);
    expect(w.state.schedule).toEqual([]);
  });
});
