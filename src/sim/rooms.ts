// Habitaciones de un plano: zonas de suelo interior separadas por paredes y puertas.
// Sirven para pintar paredes y cambiar suelos habitación a habitación.

import type { LotLayout } from '../data/lot';

export interface Room {
  /** Id estable: la primera casilla de la habitación (de arriba abajo y de izquierda a derecha). */
  id: string;
  tiles: { x: number; y: number }[];
}

const cache = new WeakMap<LotLayout, { rooms: Room[]; at: Map<string, string> }>();

const interior = (t: string | undefined) => t === 'wood' || t === 'tile';

export function roomsOf(layout: LotLayout): { rooms: Room[]; at: Map<string, string> } {
  const hit = cache.get(layout);
  if (hit) return hit;
  const at = new Map<string, string>();
  const rooms: Room[] = [];
  for (let y = 0; y < layout.h; y++) {
    for (let x = 0; x < layout.w; x++) {
      if (!interior(layout.tiles[y][x]) || at.has(`${x},${y}`)) continue;
      const id = `r${x}_${y}`;
      const room: Room = { id, tiles: [] };
      const stack = [{ x, y }];
      at.set(`${x},${y}`, id);
      while (stack.length) {
        const p = stack.pop()!;
        room.tiles.push(p);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = p.x + dx, ny = p.y + dy;
          if (!interior(layout.tiles[ny]?.[nx]) || at.has(`${nx},${ny}`)) continue;
          at.set(`${nx},${ny}`, id);
          stack.push({ x: nx, y: ny });
        }
      }
      rooms.push(room);
    }
  }
  const out = { rooms, at };
  cache.set(layout, out);
  return out;
}

/** La habitación de una casilla (si es suelo interior). */
export function roomAt(layout: LotLayout, x: number, y: number): string | undefined {
  return roomsOf(layout).at.get(`${x},${y}`);
}

/** La habitación cuyo color lleva una pared: la de delante (las caras que se ven miran hacia +x y +y). */
export function wallRoom(layout: LotLayout, x: number, y: number): string | undefined {
  return roomAt(layout, x, y + 1) ?? roomAt(layout, x + 1, y) ?? roomAt(layout, x, y - 1) ?? roomAt(layout, x - 1, y);
}
