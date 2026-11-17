import { HOUSE_OBJECTS, START_OBJECTS } from '../data/lot';
import { OBJECTS, sizeOf } from '../data/objects';
import { PET_TRAITS } from '../data/pets';
import { SAVE_VERSION } from '../sim/world';
import { PLAYER_LOT, addAlcorcon, addGetafe, addPlaces, addShops, addStudio, generateNeighborhood, giveSkills, setupFamilyLife } from '../sim/neighborhood';
import { setRel } from '../sim/social';
import type { PlacedObject, WorldState } from '../sim/types';
import { validateState } from './validate';
import { sexOfName } from '../data/names';
import { startFor, todayISO } from '../sim/date';

export function serialize(state: WorldState): string {
  return JSON.stringify(state);
}

function overlaps(objects: PlacedObject[], def: string, x: number, y: number): boolean {
  const d = OBJECTS[def];
  return objects.some((o) => {
    const od = sizeOf(o);
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
  // v22 → v23: rupturas (quién no lo supera, cuándo lo dejaron): campos nuevos opcionales.
  22: () => {},
  // v21 → v22: peleas, envenenamientos y cárcel (campos nuevos opcionales).
  21: () => {},
  // v20 → v21: tipos de relación y desgaste. Se empieza a contar desde hoy (nadie rompe de golpe).
  20: (s) => {
    const today = Math.floor(s.minutes / 1440) + 1;
    for (const rel of Object.values(s.rels ?? {})) rel.last = rel.last ?? today;
  },
  // v19 → v20: enfermedades (campo nuevo opcional).
  19: () => {},
  // v18 → v19: sexo de cada persona (según el nombre) y ciclo menstrual (empieza solo, al vuelo).
  18: (s) => {
    for (const a of s.agents) if (a.kind === 'person' && !a.sex) a.sex = sexOfName(a.name);
  },
  // v17 → v18: la familia paga recibos al mes (alquiler, luz y agua) y puede deber: campo nuevo opcional.
  17: () => {},
  // v16 → v17: calendario de verdad. La partida sigue «hoy»: el día en que se va coincide con la fecha real.
  16: (s) => {
    s.calendarStart = startFor(todayISO(), Math.floor(s.minutes / 1440) + 1);
  },
  // v15 → v16: más aspecto editable (pantalón y gafas, barba o bigote): campos nuevos opcionales.
  15: () => {},
  // v14 → v15: Getafe (tercer barrio, en MetroSur).
  14: (s) => addGetafe(s),
  // v13 → v14: biblioteca, gimnasio y mercadillo del domingo.
  13: (s) => addPlaces(s),
  // v12 → v13: aspecto elegido en el creador de familia (campo nuevo opcional: nada que convertir).
  12: () => {},
  // v11 → v12: muebles girados, pintura por habitación, reformas a elegir y culebrones del barrio.
  11: (s) => {
    s.arcs = s.arcs ?? [];
  },
  // v10 → v11: órdenes programadas, logros y retos (y el registro de movimientos, que empieza vacío).
  10: (s) => {
    s.schedule = s.schedule ?? [];
    s.feats = s.feats ?? { got: {}, counts: {}, challenges: {} };
  },
  // v9 → v10: Alcorcón, el metro, la gente de la calle y el salseo.
  9: (s) => {
    addAlcorcon(s);
    s.secrets = s.secrets ?? [];
  },
  // v8 → v9: emociones, metas de vida, mascotas con carácter, estaciones (todo son campos nuevos opcionales).
  8: (s) => {
    s.events = s.events ?? [];
    for (const a of s.agents) {
      if (a.kind === 'pet' && !a.petTrait) a.petTrait = PET_TRAITS[Math.floor(Math.random() * PET_TRAITS.length)].id;
    }
  },
  // v7 → v8: el Mercadona, los locales de açaí y la despensa.
  7: (s) => {
    addShops(s);
    for (const h of s.households) h.pantry = h.pantry ?? 15;
  },
  // v6 → v7: habilidades y estudio de pilates.
  6: (s) => {
    addStudio(s);
    for (const a of s.agents) if (a.householdId !== s.playerHouseholdId && a.kind === 'person') giveSkills(a);
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
  validateState(s);
  return s;
}
