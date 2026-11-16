// Movimiento: rutas, orientación y casillas desde las que se usa un objeto.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { SPECIES } from '../../data/species';
import { findPath, isWalkable, pathLength } from '../pathfinding';
import type { Agent, PlacedObject, Vec } from '../types';
import type { World } from '../world';
import { sizeOf } from '../../data/objects';

export function face(_w: World, a: Agent, p: Vec) {
  const sx = p.x - p.y - (a.pos.x - a.pos.y);
  if (Math.abs(sx) > 0.01) a.facing = sx > 0 ? 1 : -1;
}

/** Mueve al agente por su ruta. Devuelve true al llegar. */
export function moveAlong(w: World, a: Agent, dt: number): boolean {
  let budget = SPECIES[a.species].speed * dt;
  while (budget > 0 && a.path.length) {
    const next = a.path[0];
    const dx = next.x - a.pos.x, dy = next.y - a.pos.y;
    const d = Math.hypot(dx, dy);
    face(w, a, next);
    if (d <= budget) {
      a.pos = { x: next.x, y: next.y };
      a.path.shift();
      budget -= d;
    } else {
      a.pos = { x: a.pos.x + (dx / d) * budget, y: a.pos.y + (dy / d) * budget };
      budget = 0;
    }
  }
  return a.path.length === 0;
}

export function neighbours(w: World, lotId: string, x: number, y: number): Vec[] {
  const grid = w.gridOf(lotId);
  const out: Vec[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    if (isWalkable(grid, x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
  }
  return out;
}

/** Casillas desde las que se puede usar un objeto. */
export function interactTiles(w: World, o: PlacedObject): Vec[] {
  if (w.objDef(o).walkable) return [{ x: o.x, y: o.y }];
  const d = sizeOf(o);
  const grid = w.gridOf(o.lotId);
  const out: Vec[] = [];
  for (let y = o.y - 1; y <= o.y + d.h; y++) {
    for (let x = o.x - 1; x <= o.x + d.w; x++) {
      const inside = x >= o.x && x < o.x + d.w && y >= o.y && y < o.y + d.h;
      const diagonal = (x < o.x || x >= o.x + d.w) && (y < o.y || y >= o.y + d.h);
      if (!inside && !diagonal && isWalkable(grid, x, y)) out.push({ x, y });
    }
  }
  return out;
}

export function bestPath(w: World, a: Agent, tiles: Vec[]): { path: Vec[]; goal: Vec } | null {
  const grid = w.gridOf(a.lotId);
  let best: { path: Vec[]; goal: Vec; len: number } | null = null;
  for (const goal of tiles) {
    const path = findPath(grid, a.pos, goal);
    if (!path) continue;
    const len = pathLength(path, a.pos);
    if (!best || len < best.len) best = { path, goal, len };
  }
  return best;
}
