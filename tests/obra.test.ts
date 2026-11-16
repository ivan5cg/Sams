import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { PAINT_PRICE } from '../src/data/paint';
import { houseLayout } from '../src/data/lot';
import { roomsOf, roomAt } from '../src/sim/rooms';
import { reachable } from '../src/sim/pathfinding';
import { isolate } from './helpers';

/** Un sitio libre donde cabe `def` (girado o no). */
function spot(w: World, def: string, rot?: 1) {
  const lay = w.layoutOf('L0');
  for (let y = 1; y < lay.h - 1; y++) for (let x = 1; x < lay.w - 1; x++) if (w.canPlace(def, x, y, undefined, rot).ok) return { x, y };
  throw new Error(`No cabe ${def}`);
}

describe('obra: girar, deshacer, pintar y reformas a elegir', () => {
  it('una cama girada ocupa 1×2 en vez de 2×1 y se usa desde los lados nuevos', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const p = spot(w, 'bed', 1);
    expect(w.buy('bed', p.x, p.y, 2, 1)).toBe(true);
    const bed = w.state.objects.at(-1)!;
    expect(bed.rot).toBe(1);
    expect(w.objectAt('L0', p.x, p.y + 1)?.id).toBe(bed.id);
    expect(w.objectAt('L0', p.x + 1, p.y)?.id).not.toBe(bed.id);
    for (const t of w.interactTiles(bed)) expect(w.objectAt('L0', t.x, t.y)?.id).not.toBe(bed.id);
    expect(w.grid[p.y + 1][p.x]).toBe(false);
  });

  it('girar un mueble donde está, y deshacerlo', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const p = spot(w, 'sofa');
    w.buy('sofa', p.x, p.y);
    const sofa = w.state.objects.at(-1)!;
    const rotated = w.rotateObject(sofa.id);
    if (rotated) {
      expect(sofa.rot).toBe(1);
      expect(w.undoBuild()).toBe(true);
      expect(sofa.rot).toBeUndefined();
    } else {
      // Si girado no cabe, se queda como estaba.
      expect(sofa.rot).toBeUndefined();
    }
  });

  it('deshacer: una compra devuelve el dinero y una venta recupera el mueble', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const f0 = w.household.funds;
    const p = spot(w, 'plant');
    w.buy('plant', p.x, p.y);
    expect(w.household.funds).toBeLessThan(f0);
    expect(w.lastUndo()?.kind).toBe('buy');
    expect(w.undoBuild()).toBe(true);
    expect(w.household.funds).toBe(f0);
    expect(w.state.objects.some((o) => o.def === 'plant' && o.x === p.x && o.y === p.y)).toBe(false);
    const tv = w.objectsIn('L0').find((o) => o.def === 'tv')!;
    expect(w.sellObject(tv.id)).toBe(true);
    expect(w.undoBuild()).toBe(true);
    expect(w.objectsIn('L0').some((o) => o.def === 'tv' && o.x === tv.x && o.y === tv.y)).toBe(true);
    expect(w.household.funds).toBe(f0);
    expect(w.undoBuild()).toBe(false);
  });

  it('pintar una habitación y cambiarle el suelo (y deshacerlo)', () => {
    const w = World.createNew();
    const lay = w.layoutOf('L0');
    expect(roomsOf(lay).rooms.length).toBe(2); // baño y salón-cocina
    const room = roomAt(lay, 6, 6)!;
    const f0 = w.household.funds;
    expect(w.paintRoom(room, { wall: 0xa9cbe6 })).toBe(true);
    expect(w.paintRoom(room, { floor: 'nogal' })).toBe(true);
    expect(w.lotById('L0').paint?.[room]).toEqual({ wall: 0xa9cbe6, floor: 'nogal' });
    expect(w.household.funds).toBe(f0 - PAINT_PRICE.wall - PAINT_PRICE.floor);
    expect(w.paintRoom(room, { floor: 'no_existe' })).toBe(false);
    expect(w.undoBuild()).toBe(true);
    expect(w.lotById('L0').paint?.[room]).toEqual({ wall: 0xa9cbe6 });
    expect(w.household.funds).toBe(f0 - PAINT_PRICE.wall);
  });

  it('reformas a elegir: con baño propio y con dos dormitorios, todo accesible', () => {
    for (const [p2, p3] of [['jardin', 'salon'], ['bano', 'dormitorios'], ['bano', 'salon'], ['jardin', 'dormitorios']]) {
      const lay = houseLayout(3, [p2, p3]);
      const grid = lay.tiles.map((row) => row.map((t) => t !== 'wall'));
      const reach = reachable(grid, lay.entrance);
      for (let y = 0; y < lay.h; y++) for (let x = 0; x < lay.w; x++) if (grid[y][x]) expect(reach.has(`${x},${y}`), `${p2}+${p3}: ${x},${y}`).toBe(true);
    }
    expect(roomsOf(houseLayout(2, ['bano'])).rooms.length).toBe(roomsOf(houseLayout(2, ['jardin'])).rooms.length + 1);
    expect(roomsOf(houseLayout(3, ['jardin', 'dormitorios'])).rooms.length).toBe(roomsOf(houseLayout(3, ['jardin', 'salon'])).rooms.length + 1);
    const w = World.createNew();
    w.household.funds = 50_000;
    expect(w.nextExpansions().map((e) => e.plan)).toEqual(['jardin', 'bano']);
    expect(w.expandHouse('bano')).toBe(true);
    expect(w.lotById('L0').plans).toEqual(['bano']);
    expect(w.layoutOf('L0').tiles[2][12]).toBe('tile');
    expect(w.expandHouse('dormitorios')).toBe(true);
    expect(w.layoutOf('L0').tiles[12][7]).toBe('door');
    expect(w.nextExpansions()).toEqual([]);
  });
});
