import type { Vec } from './types';

/** walkable[y][x] */
export type Grid = boolean[][];

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

export function isWalkable(grid: Grid, x: number, y: number): boolean {
  return inBounds(grid, x, y) && grid[y][x];
}

/**
 * A* en cuadrícula con 8 direcciones (sin cortar esquinas).
 * Devuelve las casillas a recorrer sin incluir la de inicio, o null si no hay camino.
 */
export function findPath(grid: Grid, from: Vec, to: Vec): Vec[] | null {
  const w = grid[0].length;
  const sx = Math.round(from.x), sy = Math.round(from.y);
  const tx = to.x, ty = to.y;
  if (!isWalkable(grid, tx, ty)) return null;
  if (sx === tx && sy === ty) return [];

  const key = (x: number, y: number) => y * w + x;
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const open: { k: number; f: number }[] = [];
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  const start = key(sx, sy);
  g.set(start, 0);
  open.push({ k: start, f: h(sx, sy) });
  const closed = new Set<number>();

  while (open.length) {
    // La parcela es pequeña: buscar el mínimo de forma lineal es suficiente.
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { k } = open.splice(bi, 1)[0];
    if (closed.has(k)) continue;
    closed.add(k);
    const cx = k % w, cy = Math.floor(k / w);
    if (cx === tx && cy === ty) {
      const path: Vec[] = [];
      let cur = k;
      while (cur !== start) {
        path.push({ x: cur % w, y: Math.floor(cur / w) });
        cur = came.get(cur)!;
      }
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      // La casilla de inicio puede no ser transitable (p. ej. si se coloca algo encima).
      if (!isWalkable(grid, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!isWalkable(grid, cx + dx, cy) || !isWalkable(grid, cx, cy + dy))) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = g.get(k)! + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, k);
        open.push({ k: nk, f: ng + h(nx, ny) });
      }
    }
  }
  return null;
}

/** Casillas a las que se puede llegar desde `start` (8 direcciones, sin cortar esquinas). */
export function reachable(grid: Grid, start: Vec): Set<string> {
  const seen = new Set<string>();
  if (!isWalkable(grid, start.x, start.y)) return seen;
  const stack: Vec[] = [start];
  seen.add(`${start.x},${start.y}`);
  while (stack.length) {
    const { x, y } = stack.pop()!;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !isWalkable(grid, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!isWalkable(grid, x + dx, y) || !isWalkable(grid, x, y + dy))) continue;
      seen.add(k);
      stack.push({ x: nx, y: ny });
    }
  }
  return seen;
}

export function pathLength(path: Vec[], from: Vec): number {
  let len = 0;
  let prev = from;
  for (const p of path) {
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}
