import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import { madridHomes, problems, saveAt } from './helpers';

/** Todas las versiones de guardado anteriores a la actual. */
const OLD_VERSIONS = Array.from({ length: SAVE_VERSION - 1 }, (_, i) => i + 1);

describe('migraciones: cada versión antigua llega a la actual y se juega', () => {
  for (const v of OLD_VERSIONS) {
    it(`versión ${v} → ${SAVE_VERSION}`, () => {
      const old = saveAt(v);
      // Pasa por JSON, como una partida de verdad guardada en IndexedDB o importada.
      const m = migrate(JSON.parse(JSON.stringify(old)));
      expect(m.version).toBe(SAVE_VERSION);
      const w = new World(m);
      // La familia del jugador sigue ahí, con sus mascotas.
      expect(w.members.map((a) => a.name)).toEqual(['Lucía', 'Mateo', 'Toby', 'Misi']);
      // Llega todo lo que se ha ido añadiendo: el barrio, las tiendas, Alcorcón...
      expect(madridHomes(w.state.households)).toHaveLength(10);
      for (const layout of ['park', 'studio', 'super', 'acai', 'metro', 'plaza', 'bar']) {
        expect(w.state.lots.some((l) => l.layout === layout), layout).toBe(true);
      }
      expect(w.state.agents.some((a) => a.role === 'rapero')).toBe(true);
      expect(w.state.households.every((h) => typeof h.pantry === 'number')).toBe(true);
      expect(w.state.aging).toBe('normal');
      expect(problems(w)).toEqual([]);
      // Y se puede jugar un día entero sin errores.
      w.state.activeAgentId = 'nadie';
      w.tick(1440);
      expect(problems(w)).toEqual([]);
      // Se vuelve a guardar y a cargar igual.
      const again = new World(migrate(JSON.parse(serialize(w.state))));
      expect(again.state.agents.length).toBe(w.state.agents.length);
    });
  }

  it('una partida de una versión futura se rechaza con un mensaje claro', () => {
    const st = JSON.parse(serialize(World.createNew().state));
    st.version = SAVE_VERSION + 1;
    expect(() => migrate(st)).toThrow(/más nueva/);
  });
});
