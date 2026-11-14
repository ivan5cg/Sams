import { HOUSE_OBJECTS, START_OBJECTS } from '../data/lot';
import { OBJECTS } from '../data/objects';
import { SAVE_VERSION } from '../sim/world';
import { PLAYER_LOT, generateNeighborhood, setupFamilyLife } from '../sim/neighborhood';
import { setRel } from '../sim/social';
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
        lotId: PLAYER_LOT,
        ...o,
        ...(d.maxStock ? { stock: 2 } : {}),
        ...(d.maxDirt ? { dirt: 0 } : {}),
      });
    }
  },
  // v2 → v3: llega el barrio. Todo lo que había pasa a estar en la casa del jugador.
  2: (s) => {
    for (const a of s.agents) a.lotId = PLAYER_LOT;
    for (const o of s.objects) o.lotId = PLAYER_LOT;
    for (const h of s.households) h.lotId = PLAYER_LOT;
    s.lots = [{ id: PLAYER_LOT, name: 'Vuestra casa', kind: 'home', layout: 'house', householdId: s.playerHouseholdId }];
    s.rels = {};
    generateNeighborhood(s);
  },
  // v3 → v4: relaciones, trabajos y colegio.
  3: (s) => {
    s.rels = s.rels ?? {};
    for (const h of s.households) {
      const members = h.memberIds.map((id) => s.agents.find((a) => a.id === id)!).filter(Boolean);
      const player = h.id === s.playerHouseholdId;
      if (player) {
        const people = members.filter((m) => m.kind === 'person');
        if (people.length >= 2) setRel(s, people[0].id, people[1].id, { f: 70, r: 75, status: 'partner' });
      }
      setupFamilyLife(s, members, { jobs: !player });
    }
  },
  // v5 → v6: modo construcción (sin cambios de formato: solo campos nuevos opcionales).
  5: () => {},
  // v4 → v5: ciclo de vida. Cada casa recibe sus cunas.
  4: (s) => {
    s.aging = s.aging ?? 'normal';
    for (const lot of s.lots) {
      if (lot.kind !== 'home') continue;
      const here = s.objects.filter((o) => o.lotId === lot.id);
      for (const p of HOUSE_OBJECTS.filter((x) => x.def === 'crib')) {
        if (here.some((o) => o.def === 'crib' && o.x === p.x && o.y === p.y)) continue;
        if (overlaps(here, p.def, p.x, p.y)) continue;
        s.objects.push({ id: `o${s.nextId++}`, lotId: lot.id, ...p });
      }
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
