import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { madridHomes, problems } from './helpers';

const DAY = 1440;

describe('resistencia: 8 semanas de juego sin renderizar', () => {
  it('pasan todas las estaciones (dos veces), Navidad y elecciones, y todo sigue sano', () => {
    const w = World.createNew();
    // Nadie a los mandos: toda la familia va por su cuenta, como los vecinos.
    w.state.activeAgentId = 'nadie';
    const seen = new Set<string>();
    const errors: string[] = [];
    /** Desde cuándo hace cada uno lo que está haciendo. */
    const since = new Map<string, { task: string; from: number }>();
    for (let hour = 0; hour < 56 * 24; hour++) {
      w.tick(60);
      const now = w.state.minutes;
      for (const e of w.activeEvents()) seen.add(e.id);
      seen.add(`estacion${w.season}`);
      // Si la familia se extingue, se sigue con otra (como haría el jugador).
      if (w.state.familyGone) {
        const next = w.state.households.find((h) => h.id !== w.household.id && !h.okupa);
        if (next) w.continueWith(next.id);
        w.state.activeAgentId = 'nadie';
        w.state.speed = 1;
      }
      for (const p of problems(w)) errors.push(`día ${w.day} ${w.clock}: ${p}`);
      if (madridHomes(w.state.households).length !== 10) errors.push(`día ${w.day}: ${madridHomes(w.state.households).length} familias en Madrid`);
      for (const a of w.state.agents) {
        // Nadie se queda colgado en un viaje...
        if (a.travel && Number.isFinite(a.travel.arrive) && now - a.travel.arrive > 5) errors.push(`día ${w.day}: ${a.name} no llega nunca a ${a.travel.to}`);
        // ...ni haciendo lo mismo más de un día entero.
        const cur = a.current?.id ?? '';
        const prev = since.get(a.id);
        if (!prev || prev.task !== cur) since.set(a.id, { task: cur, from: now });
        else if (cur && now - prev.from > DAY) {
          errors.push(`día ${w.day}: ${a.name} lleva más de un día con ${a.current?.actionId}`);
          since.set(a.id, { task: cur, from: now });
        }
      }
      if (errors.length > 20) break;
    }
    expect(errors.slice(0, 20)).toEqual([]);
    expect(w.day).toBeGreaterThanOrEqual(57);
    for (const id of ['estacion0', 'estacion1', 'estacion2', 'estacion3', 'navidad', 'campana', 'sanisidro', 'verbena']) expect(seen.has(id), id).toBe(true);
  }, 120_000);
});
