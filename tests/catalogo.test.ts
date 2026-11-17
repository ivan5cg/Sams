import { describe, expect, it } from 'vitest';
import { CATALOG, OBJECTS } from '../src/data/objects';
import { ACTIONS } from '../src/data/actions';
import { usesOf } from '../src/ui/catalog';
import { World } from '../src/sim/world';
import { fullNeeds, isolate, problems } from './helpers';

describe('catálogo de muebles', () => {
  it('todo lo que se vende tiene descripción, precio y acciones que existen', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(48);
    for (const d of CATALOG) {
      expect(d.desc, d.id).toBeTruthy();
      expect(d.price, d.id).toBeGreaterThan(0);
      for (const a of d.actions) expect(ACTIONS[a], `${d.id}: ${a}`).toBeTruthy();
    }
  });

  it('dice para qué sirve cada mueble', () => {
    const tub = usesOf(OBJECTS.hot_tub);
    expect(tub.people.join()).toContain('jacuzzi');
    expect(tub.needs).toEqual(expect.arrayContaining(['hygiene', 'fun']));
    expect(usesOf(OBJECTS.bowl).pets.length).toBeGreaterThan(0);
    expect(usesOf(OBJECTS.rug).people).toEqual([]);
  });

  it('los muebles nuevos se compran, se colocan y se usan', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.household.funds = 10_000;
    const lucia = w.agent('a1')!;
    // Un sitio libre para cada uno.
    const place = (def: string) => {
      const lay = w.layoutOf('L0');
      for (let y = 0; y < lay.h; y++) for (let x = 0; x < lay.w; x++) if (w.canPlace(def, x, y).ok) return w.buy(def, x, y);
      return null;
    };
    for (const def of ['wardrobe', 'dining_table', 'aquarium', 'karaoke', 'single_bed']) expect(place(def), def).toBeTruthy();
    const ward = w.objectsIn('L0').find((o) => o.def === 'wardrobe')!;
    const color0 = lucia.color;
    fullNeeds(lucia);
    expect(w.command('a1', 'change_clothes', { kind: 'object', id: ward.id })).toBe(true);
    w.tick(30);
    expect(lucia.color).not.toBe(color0);
    const fish = w.objectsIn('L0').find((o) => o.def === 'aquarium')!;
    lucia.needs.fun = 30;
    expect(w.command('a1', 'watch_fish', { kind: 'object', id: fish.id })).toBe(true);
    w.tick(40);
    expect(lucia.needs.fun).toBeGreaterThan(30);
    expect(problems(w)).toEqual([]);
  });
});
