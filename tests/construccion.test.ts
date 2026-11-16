import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { isolate } from './helpers';

describe('construcción y pulido (fase 6)', () => {
  it('comprar: cuesta dinero, ocupa su sitio y se puede usar', () => {
    const w = World.createNew();
    const f0 = w.household.funds;
    expect(w.canPlace('stereo', 4, 7).ok).toBe(true);
    expect(w.buy('stereo', 4, 7)).toBe(true);
    expect(w.household.funds).toBe(f0 - 150);
    const stereo = w.objectsIn('L0').find((o) => o.def === 'stereo')!;
    expect(w.grid[7][4]).toBe(false);
    isolate(w, ['a1']);
    w.agent('a1')!.needs.fun = 30;
    w.command('a1', 'dance', { kind: 'object', id: stereo.id });
    w.tick(40);
    expect(w.agent('a1')!.needs.fun).toBeGreaterThan(45);
  });

  it('no se puede colocar sobre paredes, puertas, otros muebles ni bloquear el paso', () => {
    const w = World.createNew();
    expect(w.canPlace('plant', 0, 0).reason).toBe('Hay una pared');
    expect(w.canPlace('plant', 2, 4).reason).toBe('Tapa una puerta');
    expect(w.canPlace('plant', 1, 5).ok).toBe(false); // la nevera
    expect(w.canPlace('plant', 5, 11).reason).toBe('Tapa la entrada');
    // El pasillo del baño: (2,3) es la única casilla delante de la puerta del baño
    expect(w.canPlace('plant', 2, 3).ok).toBe(false);
    // Las alfombras se pueden pisar: no bloquean nada
    expect(w.canPlace('rug', 2, 3).ok).toBe(true);
  });

  it('sin dinero no se compra', () => {
    const w = World.createNew();
    w.household.funds = 10;
    expect(w.buy('bathtub', 4, 7)).toBe(false);
    expect(w.objectsIn('L0').some((o) => o.def === 'bathtub')).toBe(false);
  });

  it('mover y vender (se recupera el 70%), pero no lo que se está usando o donde vive alguien', () => {
    const w = World.createNew();
    const plant = w.objectsIn('L0').find((o) => o.def === 'plant')!;
    expect(w.moveObject(plant.id, 4, 7)).toBe(true);
    expect([plant.x, plant.y]).toEqual([4, 7]);
    const f0 = w.household.funds;
    expect(w.sellObject(plant.id)).toBe(true);
    expect(w.household.funds).toBe(f0 + Math.floor(25 * 0.7));
    const gp = w.adopt('guineapig')!;
    expect(w.sellObject(gp.home!)).toBe(false);
    const fridge = w.objectsIn('L0').find((o) => o.def === 'fridge')!;
    w.agent('a1')!.current = { id: 'x', actionId: 'eat', byPlayer: true, phase: 'acting', remaining: 10, targetObjectId: fridge.id };
    expect(w.cantTouch(fridge)).toBe('Alguien lo está usando');
  });

  it('solo se construye en casa', () => {
    const w = World.createNew();
    expect(w.canBuildHere()).toBe(true);
    w.travel(['a1'], 'P');
    w.tick(20);
    expect(w.canBuildHere()).toBe(false);
    expect(w.buy('plant', 4, 7)).toBe(false);
  });

  it('si se vende la tele, no se puede ver la tele', () => {
    const w = World.createNew();
    const tv = w.objectsIn('L0').find((o) => o.def === 'tv')!;
    const sofa = w.objectsIn('L0').find((o) => o.def === 'sofa')!;
    w.sellObject(tv.id);
    expect(w.checkObjectAction(w.agent('a1')!, sofa, 'watch_tv').reason).toBe('No hay tele');
  });

  it('lo que se rompe no se usa hasta que alguien lo arregla', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const shower = w.objectsIn('L0').find((o) => o.def === 'shower')!;
    shower.broken = true;
    const lucia = w.agent('a1')!;
    expect(w.checkObjectAction(lucia, shower, 'shower').reason).toBe('Está roto');
    expect(w.optionsFor('a1', { kind: 'object', id: shower.id }).map((o) => o.def.id)).toContain('repair');
    w.command('a1', 'repair', { kind: 'object', id: shower.id });
    w.tick(60);
    expect(shower.broken).toBe(false);
    expect(w.optionsFor('a1', { kind: 'object', id: shower.id }).map((o) => o.def.id)).not.toContain('repair');
  });

  it('la decoración alegra el ambiente', () => {
    const w1 = World.createNew();
    const w2 = World.createNew();
    for (const w of [w1, w2]) {
      isolate(w, ['a1']);
      const a = w.agent('a1')!;
      a.pos = { x: 4, y: 7 };
      a.needs.fun = 50;
      a.current = { id: 'quieta', actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    }
    w2.buy('lamp', 3, 7);
    w2.buy('rug', 4, 8);
    w1.tick(60);
    w2.tick(60);
    expect(w2.agent('a1')!.needs.fun).toBeGreaterThan(w1.agent('a1')!.needs.fun + 2);
  });
});
