// Creación del barrio: las 9 familias vecinas, sus casas y el parque.

import { HOUSE_OBJECTS, LAYOUTS, PARK_OBJECTS, type ObjectPlacement } from '../data/lot';
import { OBJECTS } from '../data/objects';
import { SPECIES } from '../data/species';
import { NEED_KEYS, type Agent, type Lot, type Needs, type SpeciesId, type WorldState } from './types';

export const PLAYER_LOT = 'L0';
export const PARK_LOT = 'P';
export const NEIGHBOUR_COUNT = 9;

const SURNAMES = ['López', 'Martín', 'Sánchez', 'Romero', 'Navarro', 'Torres', 'Díaz', 'Moreno', 'Gil', 'Ruiz', 'Ortega', 'Molina'];
const FIRST_NAMES = [
  'Ana', 'Carlos', 'Elena', 'Javier', 'Marta', 'Pablo', 'Sara', 'Diego', 'Laura', 'Hugo', 'Irene', 'Álvaro',
  'Nerea', 'Raúl', 'Carmen', 'Adrián', 'Lucas', 'Paula', 'Andrés', 'Alba', 'Sergio', 'Noa', 'Iker', 'Julia',
  'Marcos', 'Rocío', 'Daniel', 'Vega', 'Teo', 'Olivia', 'Bruno', 'Clara', 'Gonzalo', 'Inés', 'Mario', 'Lola',
];
const CLOTHES = [0xe0607e, 0x4f8fd9, 0x52b788, 0xf4a261, 0x9b5de5, 0xe76f51, 0x2a9d8f, 0xf2c14e, 0x6d6875, 0x48cae4];
const WALLS = [0xe9e1d4, 0xf1d3c2, 0xd9e4dd, 0xe8dcc0, 0xd6d2e8, 0xf0e2b6, 0xcfe0e8, 0xe6cfd8, 0xdcdcdc];
const FLOORS = [0xc89f6e, 0xb88a5a, 0xd4b48c, 0xa47551, 0xc7a27a, 0xb5936b, 0xd9bf99, 0x9c6f4a, 0xc49a6c];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const randomNeeds = (min = 55, max = 90): Needs =>
  Object.fromEntries(NEED_KEYS.map((k) => [k, Math.round(rand(min, max))])) as Needs;

export function makeAgent(p: { id: string; name: string; species: SpeciesId; ageDays: number; color: number; householdId: string; lotId: string; x: number; y: number }): Agent {
  return {
    id: p.id,
    name: p.name,
    species: p.species,
    kind: SPECIES[p.species].kind,
    ageDays: p.ageDays,
    color: p.color,
    householdId: p.householdId,
    lotId: p.lotId,
    needs: randomNeeds(),
    pos: { x: p.x, y: p.y },
    path: [],
    queue: [],
    current: null,
    facing: 1,
    hidden: false,
  };
}

export function placeObjects(state: WorldState, lotId: string, placements: ObjectPlacement[]) {
  for (const o of placements) {
    const d = OBJECTS[o.def];
    state.objects.push({
      id: `o${state.nextId++}`,
      lotId,
      ...o,
      ...(d.maxStock ? { stock: 2 } : {}),
      ...(d.maxDirt ? { dirt: 0 } : {}),
    });
  }
}

/** Una casilla libre del interior de una casa, para colocar a alguien. */
export function randomIndoorTile(): { x: number; y: number } {
  const free = [
    [6, 2], [7, 3], [8, 3], [6, 5], [7, 5], [8, 5], [3, 6], [4, 6], [5, 6], [7, 6], [8, 6], [3, 7], [4, 7], [8, 8], [2, 2],
  ];
  const [x, y] = pick(free);
  return { x, y };
}

/** Añade al estado el parque y las 9 familias vecinas con sus casas. */
export function generateNeighborhood(state: WorldState) {
  const usedNames = new Set(state.agents.map((a) => a.name));
  const takeName = (pool: string[]) => {
    const free = pool.filter((n) => !usedNames.has(n));
    const n = free.length ? pick(free) : `${pick(pool)} ${state.nextId}`;
    usedNames.add(n);
    return n;
  };

  state.lots.push({ id: PARK_LOT, name: 'Parque del barrio', kind: 'park', layout: 'park' });
  placeObjects(state, PARK_LOT, PARK_OBJECTS);

  // Al menos una mascota de cada especie en el barrio.
  const petPool: SpeciesId[] = shuffle(['dog', 'cat', 'guineapig', 'ferret', 'capybara']);
  const surnames = shuffle(SURNAMES.filter((s) => !state.households.some((h) => h.name.includes(s))));

  for (let i = 1; i <= NEIGHBOUR_COUNT; i++) {
    const lotId = `L${i}`;
    const hid = `h${i + 1}`;
    const surname = surnames[i - 1];
    const lot: Lot = {
      id: lotId,
      name: `Casa de los ${surname}`,
      kind: 'home',
      layout: 'house',
      householdId: hid,
      style: { wall: WALLS[(i - 1) % WALLS.length], floor: FLOORS[(i - 1) % FLOORS.length] },
    };
    state.lots.push(lot);
    placeObjects(state, lotId, HOUSE_OBJECTS);

    const members: Agent[] = [];
    // 1 a 4 personas: uno o dos adultos y quizá hijos.
    const adults = Math.random() < 0.7 ? 2 : 1;
    const kids = Math.floor(rand(0, adults === 2 ? 3 : 2));
    const adultAge = Math.round(rand(22, 70));
    for (let k = 0; k < adults; k++) {
      const pos = randomIndoorTile();
      members.push(makeAgent({ id: `a${state.nextId++}`, name: takeName(FIRST_NAMES), species: 'human', ageDays: adultAge + Math.round(rand(-4, 4)), color: pick(CLOTHES), householdId: hid, lotId, ...pos }));
    }
    for (let k = 0; k < kids; k++) {
      const pos = randomIndoorTile();
      members.push(makeAgent({ id: `a${state.nextId++}`, name: takeName(FIRST_NAMES), species: 'human', ageDays: Math.round(rand(4, 19)), color: pick(CLOTHES), householdId: hid, lotId, ...pos }));
    }
    // 0 a 2 mascotas.
    const pets = petPool.length ? Math.max(1, Math.floor(rand(0, 2.5))) : Math.floor(rand(0, 2.5));
    let hasCage = false;
    for (let k = 0; k < pets; k++) {
      let species: SpeciesId = petPool.shift() ?? pick<SpeciesId>(['dog', 'cat', 'cat', 'dog', 'guineapig', 'ferret', 'capybara']);
      if (species === 'guineapig' && hasCage) species = 'cat';
      const sp = SPECIES[species];
      const pet = makeAgent({ id: `a${state.nextId++}`, name: takeName(sp.names), species, ageDays: Math.round(rand(sp.stages[0].until, sp.stages[1].until)), color: 0x999999, householdId: hid, lotId, ...(sp.outdoor ? { x: 11, y: 6 } : randomIndoorTile()) });
      if (sp.habitat) {
        const cage = state.objects.find((o) => o.lotId === lotId && o.def === sp.habitat)!;
        pet.home = cage.id;
        pet.pos = { x: cage.x, y: cage.y };
        hasCage = true;
      }
      members.push(pet);
    }
    for (const m of members) m.abstract = true;
    state.agents.push(...members);
    state.households.push({ id: hid, name: `Familia ${surname}`, funds: Math.round(rand(800, 4000)), memberIds: members.map((m) => m.id), lotId });
  }
}

export function layoutOf(lot: Lot) {
  return LAYOUTS[lot.layout];
}
