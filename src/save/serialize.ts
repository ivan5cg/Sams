import { START_OBJECTS } from '../data/lot';
import { OBJECTS } from '../data/objects';
import { SAVE_VERSION } from '../sim/world';
import type { PlacedObject, WorldState } from '../sim/types';

export function serialize(state: WorldState): string {
  return JSON.stringify(state);
}

function overlaps(objects: PlacedObject[], def: string, x: number, y: number): boolean {
  const d = OBJECTS[def];
  return objects.some((o) => {
    const od = OBJECTS[o.def];
    return x < o.x + od.w && x + d.w > o.x && y < o.y + od.h && y + d.h > o.y;
  });
}

/** Cada paso convierte una partida de la versión N a la N+1. */
const MIGRATIONS: Record<number, (s: WorldState) => void> = {
  // v1 → v2: llegan los objetos de las nuevas mascotas (si hay sitio libre).
  1: (s) => {
    for (const o of START_OBJECTS) {
      if (s.objects.some((x) => x.def === o.def && x.x === o.x && x.y === o.y)) continue;
      if (overlaps(s.objects, o.def, o.x, o.y)) continue;
      const d = OBJECTS[o.def];
      s.objects.push({
        id: `o${s.nextId++}`,
        ...o,
        ...(d.maxStock ? { stock: 2 } : {}),
        ...(d.maxDirt ? { dirt: 0 } : {}),
      });
    }
  },
};

/**
 * Convierte una partida guardada de cualquier versión anterior a la actual.
 * Cada vez que cambie el formato: subir SAVE_VERSION y añadir un paso en MIGRATIONS.
 */
export function migrate(data: unknown): WorldState {
  const d = data as Partial<WorldState> | null;
  if (!d || typeof d !== 'object' || typeof d.version !== 'number' || !Array.isArray(d.agents) || !Array.isArray(d.households)) {
    throw new Error('El archivo no es una partida de Sams');
  }
  if (d.version > SAVE_VERSION) {
    throw new Error('Esta partida es de una versión más nueva del juego');
  }
  const s = d as WorldState;
  while (s.version < SAVE_VERSION) {
    MIGRATIONS[s.version]?.(s);
    s.version++;
  }
  return s;
}
