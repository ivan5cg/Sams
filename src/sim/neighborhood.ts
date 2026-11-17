import { PET_TRAITS } from '../data/pets';
import { STREET_NPCS } from '../data/street';
// Creación del barrio: las 9 familias vecinas, sus casas y el parque.

import { ACAI_OBJECTS, HOUSE_OBJECTS, LAYOUTS, PARK_OBJECTS, STUDIO_OBJECTS, SUPER_OBJECTS, type ObjectPlacement, METRO_OBJECTS, PLAZA_OBJECTS, BAR_OBJECTS, LIBRARY_OBJECTS, GYM_OBJECTS, MARKET_OBJECTS, CERRO_OBJECTS, PADEL_OBJECTS } from '../data/lot';
import { CAREER_SKILL } from '../data/skills';
import { OBJECTS } from '../data/objects';
import { JOB_CAREERS } from '../data/careers';
import { SPECIES, lifeStage } from '../data/species';
import { CLOTHES } from '../data/looks';
import { isAdult, relKey, setRel } from './social';
import { NEED_KEYS, type Agent, type Household, type Lot, type Needs, type SpeciesId, type WorldState } from './types';

export { CLOTHES };

export const PLAYER_LOT = 'L0';
export const PARK_LOT = 'P';
export const STUDIO_LOT = 'G';
export const SUPER_LOT = 'M';
export const ACAI_LOTS = ['A1', 'A2'];
export const METRO_LOT = 'MT';
export const PLAZA_LOT = 'PL';
export const BAR_LOT = 'BR';
export const ALCORCON_HOMES = ['AL1', 'AL2', 'AL3'];
export const LIBRARY_LOT = 'BI';
export const GYM_LOT = 'GY';
export const MARKET_LOT = 'MK';
export const CERRO_LOT = 'GP';
export const PADEL_LOT = 'PD';
export const GETAFE_HOMES = ['GE1', 'GE2', 'GE3'];

/** Dónde queda la gente de cada barrio (para una boda, San Isidro, la cabalgata...). */
export function squareOf(district: string): string {
  return district === 'alcorcon' ? PLAZA_LOT : district === 'getafe' ? CERRO_LOT : PARK_LOT;
}

/** Estación de metro de cada barrio. */
export function stationOf(district: string | undefined): string {
  return district === 'alcorcon' ? 'Alcorcón Central' : district === 'getafe' ? 'Getafe Central' : 'Madrid';
}
export const NEIGHBOUR_COUNT = 9;

const SURNAMES = ['López', 'Martín', 'Sánchez', 'Romero', 'Navarro', 'Torres', 'Díaz', 'Moreno', 'Gil', 'Ruiz', 'Ortega', 'Molina', 'Castro', 'Vega', 'Ramos', 'Herrera', 'Iglesias', 'Cano'];
const FIRST_NAMES = [
  'Ana', 'Carlos', 'Elena', 'Javier', 'Marta', 'Pablo', 'Sara', 'Diego', 'Laura', 'Hugo', 'Irene', 'Álvaro',
  'Nerea', 'Raúl', 'Carmen', 'Adrián', 'Lucas', 'Paula', 'Andrés', 'Alba', 'Sergio', 'Noa', 'Iker', 'Julia',
  'Marcos', 'Rocío', 'Daniel', 'Vega', 'Teo', 'Olivia', 'Bruno', 'Clara', 'Gonzalo', 'Inés', 'Mario', 'Lola',
  // Con Getafe hay más vecinos: más nombres (si no, acaban con un número detrás).
  'Rubén', 'Patricia', 'Fernando', 'Beatriz', 'Jorge', 'Cristina', 'Alberto', 'Silvia', 'Óscar', 'Natalia',
  'Víctor', 'Eva', 'Ignacio', 'Sonia', 'Tomás', 'Celia', 'Héctor', 'Maite',
];
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
    ...(SPECIES[p.species].kind === 'pet' ? { petTrait: PET_TRAITS[Math.floor(Math.random() * PET_TRAITS.length)].id } : {}),
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

/** Habilidades de un vecino adulto: algo de lo que pide su trabajo y un poco de otra cosa. */
export function giveSkills(p: Agent) {
  if (p.skills || !isAdult(p)) return;
  p.skills = {};
  const main = p.job ? CAREER_SKILL[p.job.career] : undefined;
  if (main) p.skills[main] = Math.round(rand(1, 2 + (p.job?.level ?? 1)));
  const extra = pick(['cocina', 'musica', 'forma', 'logica', 'carisma', 'arte']);
  p.skills[extra] = Math.max(p.skills[extra] ?? 0, Math.round(rand(0, 4)));
}

/** El estudio de pilates del barrio. */
export function addStudio(state: WorldState) {
  if (state.lots.some((l) => l.id === STUDIO_LOT)) return;
  state.lots.push({ id: STUDIO_LOT, name: 'Estudio de pilates', kind: 'venue', layout: 'studio', style: { wall: 0xf2efe9, floor: 0xd9c3a5 } });
  placeObjects(state, STUDIO_LOT, STUDIO_OBJECTS);
}

/** El Mercadona y los locales de açaí. */
export function addShops(state: WorldState) {
  if (!state.lots.some((l) => l.id === SUPER_LOT)) {
    state.lots.push({ id: SUPER_LOT, name: 'Mercadona', kind: 'venue', layout: 'super', style: { wall: 0xf4f4ef, floor: 0xe3eaee } });
    placeObjects(state, SUPER_LOT, SUPER_OBJECTS);
  }
  const acais = [
    { id: ACAI_LOTS[0], name: 'Açaí Bowl & Co', style: { wall: 0xe6d4f2, floor: 0xead9c6 } },
    { id: ACAI_LOTS[1], name: 'Açaí Tropical', style: { wall: 0xcfeee3, floor: 0xe2cfb0 } },
  ];
  for (const a of acais) {
    if (state.lots.some((l) => l.id === a.id)) continue;
    state.lots.push({ id: a.id, name: a.name, kind: 'venue', layout: 'acai', style: a.style });
    placeObjects(state, a.id, ACAI_OBJECTS);
  }
}

/** Alcorcón: plaza, bar, tres casas (una okupada) y el metro para llegar. Y la gente de la calle. */
export function addAlcorcon(state: WorldState) {
  for (const l of state.lots) l.district = l.district ?? 'madrid';
  if (!state.lots.some((l) => l.id === METRO_LOT)) {
    state.lots.push({ id: METRO_LOT, name: 'Metro (Línea 10 → MetroSur)', kind: 'venue', layout: 'metro', district: 'metro', style: { wall: 0xe8e8e4, floor: 0xb7bcc2 } });
    placeObjects(state, METRO_LOT, METRO_OBJECTS);
  }
  if (!state.lots.some((l) => l.id === PLAZA_LOT)) {
    state.lots.push({ id: PLAZA_LOT, name: 'Plaza de Alcorcón', kind: 'park', layout: 'plaza', district: 'alcorcon' });
    placeObjects(state, PLAZA_LOT, PLAZA_OBJECTS);
  }
  if (!state.lots.some((l) => l.id === BAR_LOT)) {
    state.lots.push({ id: BAR_LOT, name: 'Bar Casa Paco', kind: 'venue', layout: 'bar', district: 'alcorcon', style: { wall: 0xe9dcc0, floor: 0xb8a48a } });
    placeObjects(state, BAR_LOT, BAR_OBJECTS);
  }
  ALCORCON_HOMES.forEach((lotId, i) => {
    if (state.lots.some((l) => l.id === lotId)) return;
    state.lots.push({ id: lotId, name: '', kind: 'home', layout: 'house', district: 'alcorcon', style: { wall: WALLS[(i + 4) % WALLS.length], floor: FLOORS[(i + 2) % FLOORS.length] } });
    placeObjects(state, lotId, HOUSE_OBJECTS);
    if (i === ALCORCON_HOMES.length - 1) generateOkupas(state, lotId);
    else generateFamily(state, lotId);
  });
  addStreetNpcs(state);
}

/** Los sitios de la fase 5 en Madrid: biblioteca, gimnasio y mercadillo del domingo. */
export function addPlaces(state: WorldState) {
  const places = [
    { id: LIBRARY_LOT, name: 'Biblioteca municipal', kind: 'venue' as const, layout: 'library' as const, style: { wall: 0xeee6d6, floor: 0xa47551 }, objects: LIBRARY_OBJECTS },
    { id: GYM_LOT, name: 'Gimnasio Músculo Castizo', kind: 'venue' as const, layout: 'gym' as const, style: { wall: 0xdfe3e8, floor: 0x5c6470 }, objects: GYM_OBJECTS },
    { id: MARKET_LOT, name: 'Mercadillo del domingo', kind: 'venue' as const, layout: 'market' as const, style: undefined, objects: MARKET_OBJECTS },
  ];
  for (const p of places) {
    if (state.lots.some((l) => l.id === p.id)) continue;
    state.lots.push({ id: p.id, name: p.name, kind: p.kind, layout: p.layout, district: 'madrid', ...(p.style ? { style: p.style } : {}) });
    placeObjects(state, p.id, p.objects);
  }
}

/** Getafe (MetroSur, como Alcorcón): el parque del Cerro de los Ángeles, el club de pádel y tres casas. */
export function addGetafe(state: WorldState) {
  if (!state.lots.some((l) => l.id === CERRO_LOT)) {
    state.lots.push({ id: CERRO_LOT, name: 'Cerro de los Ángeles', kind: 'park', layout: 'park', district: 'getafe' });
    placeObjects(state, CERRO_LOT, CERRO_OBJECTS);
  }
  if (!state.lots.some((l) => l.id === PADEL_LOT)) {
    state.lots.push({ id: PADEL_LOT, name: 'Club de pádel El Cuñado', kind: 'venue', layout: 'padel', district: 'getafe' });
    placeObjects(state, PADEL_LOT, PADEL_OBJECTS);
  }
  GETAFE_HOMES.forEach((lotId, i) => {
    if (state.lots.some((l) => l.id === lotId)) return;
    state.lots.push({ id: lotId, name: '', kind: 'home', layout: 'house', district: 'getafe', style: { wall: WALLS[(i + 6) % WALLS.length], floor: FLOORS[(i + 5) % FLOORS.length] } });
    placeObjects(state, lotId, HOUSE_OBJECTS);
    generateFamily(state, lotId);
  });
}

/** Unos okupas en una casa que llevaba años vacía. */
export function generateOkupas(state: WorldState, lotId: string): Household {
  const hid = `h${state.nextId++}`;
  const lot = state.lots.find((l) => l.id === lotId)!;
  lot.name = 'Casa okupada';
  lot.householdId = hid;
  const used = new Set(state.agents.map((a) => a.name));
  const names = ['Iker', 'Lore', 'Rubén', 'Ainhoa', 'Dani', 'Nerea', 'Edu', 'Yoli'].filter((n) => !used.has(n));
  const members: Agent[] = [];
  for (let k = 0; k < 3; k++) {
    members.push(makeAgent({ id: `a${state.nextId++}`, name: names[k] ?? `Okupa ${k + 1}`, species: 'human', ageDays: Math.round(rand(21, 34)), color: pick(CLOTHES), householdId: hid, lotId, ...randomIndoorTile() }));
  }
  members.push(makeAgent({ id: `a${state.nextId++}`, name: 'Canelo', species: 'dog', ageDays: 10, color: 0x999999, householdId: hid, lotId, ...randomIndoorTile() }));
  for (const m of members) m.abstract = true;
  state.agents.push(...members);
  const h: Household = { id: hid, name: 'Los okupas', funds: 150, memberIds: members.map((m) => m.id), lotId, pantry: 15, okupa: true };
  state.households.push(h);
  setupFamilyLife(state, members, { jobs: false });
  // Entre ellos son amigos (no pareja), y el perro es de todos.
  for (const a of members) for (const b of members) if (a !== b && a.kind === 'person' && b.kind === 'person') setRel(state, a.id, b.id, { f: 60, r: 0 });
  return h;
}

/** Vendedor, rapero y músico del metro, vecinas cotillas, militantes y riders. */
export function addStreetNpcs(state: WorldState) {
  for (const n of STREET_NPCS) {
    if (state.agents.some((a) => a.role === n.role && a.name === n.name)) continue;
    const lay = layoutOf(state.lots.find((l) => l.id === n.post)!);
    const a = makeAgent({ id: `a${state.nextId++}`, name: n.name, species: 'human', ageDays: n.ageDays, color: n.color, householdId: 'calle', lotId: n.post, x: lay.entrance.x, y: Math.max(0, lay.entrance.y - 2) });
    a.role = n.role;
    a.post = n.post;
    a.abstract = true;
    // Los riders y las militantes solo aparecen cuando toca.
    if (n.role === 'glovo' || n.role === 'militante') a.hidden = true;
    a.traits = n.role === 'chismosa' ? ['cotilla', 'grunon'] : n.role === 'rapero' ? ['fiestero', 'bromista'] : n.role === 'militante' ? ['optimista', 'cotilla'] : ['optimista', 'perezoso'];
    state.agents.push(a);
  }
}

/** Nombre y color de ropa para un recién nacido. */
export function newbornLooks(state: WorldState): { name: string; color: number } {
  const used = new Set(state.agents.map((a) => a.name));
  const free = FIRST_NAMES.filter((n) => !used.has(n));
  return { name: free.length ? pick(free) : `${pick(FIRST_NAMES)} ${state.nextId}`, color: pick(CLOTHES) };
}

/** Añade al estado el parque y las 9 familias vecinas con sus casas. */
export function generateNeighborhood(state: WorldState) {
  state.lots.push({ id: PARK_LOT, name: 'Parque del barrio', kind: 'park', layout: 'park' });
  placeObjects(state, PARK_LOT, PARK_OBJECTS);
  addStudio(state);
  addShops(state);

  // Al menos una mascota de cada especie en el barrio.
  const petPool: SpeciesId[] = shuffle(['dog', 'cat', 'guineapig', 'ferret', 'capybara']);
  for (let i = 1; i <= NEIGHBOUR_COUNT; i++) {
    const lotId = `L${i}`;
    state.lots.push({
      id: lotId,
      name: '',
      kind: 'home',
      layout: 'house',
      style: { wall: WALLS[(i - 1) % WALLS.length], floor: FLOORS[(i - 1) % FLOORS.length] },
    });
    placeObjects(state, lotId, HOUSE_OBJECTS);
    generateFamily(state, lotId, petPool);
  }
}

/** Crea una familia nueva y la instala en una casa (vacía) del barrio. */
export function generateFamily(state: WorldState, lotId: string, petPool: SpeciesId[] = []) {
  const usedNames = new Set(state.agents.map((a) => a.name));
  const takeName = (pool: string[]) => {
    const free = pool.filter((n) => !usedNames.has(n));
    const n = free.length ? pick(free) : `${pick(pool)} ${state.nextId}`;
    usedNames.add(n);
    return n;
  };
  const usedSurnames = new Set(state.households.map((h) => h.name.replace('Familia ', '')));
  const freeSurnames = SURNAMES.filter((x) => !usedSurnames.has(x));
  const surname = freeSurnames.length ? pick(freeSurnames) : `${pick(SURNAMES)}-${pick(SURNAMES)}`;
  const hid = `h${state.nextId++}`;
  const lot = state.lots.find((l) => l.id === lotId)!;
  lot.name = `Casa de los ${surname}`;
  lot.householdId = hid;

  const adults: Agent[] = [];
  const kids: Agent[] = [];
  const pets: Agent[] = [];
  // 1 a 4 personas: uno o dos adultos y quizá hijos.
  const nAdults = Math.random() < 0.7 ? 2 : 1;
  const nKids = Math.floor(rand(0, nAdults === 2 ? 3 : 2));
  const adultAge = Math.round(rand(22, 70));
  for (let k = 0; k < nAdults; k++) {
    adults.push(makeAgent({ id: `a${state.nextId++}`, name: takeName(FIRST_NAMES), species: 'human', ageDays: adultAge + Math.round(rand(-4, 4)), color: pick(CLOTHES), householdId: hid, lotId, ...randomIndoorTile() }));
  }
  for (let k = 0; k < nKids; k++) {
    kids.push(makeAgent({ id: `a${state.nextId++}`, name: takeName(FIRST_NAMES), species: 'human', ageDays: Math.round(rand(4, 19)), color: pick(CLOTHES), householdId: hid, lotId, ...randomIndoorTile() }));
  }
  // 0 a 2 mascotas (al menos una mientras queden especies por repartir).
  const nPets = petPool.length ? Math.max(1, Math.floor(rand(0, 2.5))) : Math.floor(rand(0, 2.5));
  // Si la jaula de esa casa ya está ocupada (mascotas que se quedaron), no hay sitio para otra cobaya.
  let hasCage = state.agents.some((a) => a.home && state.objects.some((o) => o.id === a.home && o.lotId === lotId));
  for (let k = 0; k < nPets; k++) {
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
    pets.push(pet);
  }
  const members = [...adults, ...kids, ...pets];
  for (const m of members) m.abstract = true;
  state.agents.push(...members);
  const household = { id: hid, name: `Familia ${surname}`, funds: Math.round(rand(800, 4000)), memberIds: members.map((m) => m.id), lotId, pantry: 15 };
  state.households.push(household);
  setupFamilyLife(state, members, { jobs: true });
  return household;
}

/**
 * Relaciones iniciales dentro de una familia (pareja, padres e hijos, mascotas)
 * y trabajos/colegio.
 */
export function setupFamilyLife(state: WorldState, members: Agent[], opts: { jobs: boolean }) {
  const people = members.filter((m) => m.kind === 'person');
  const adults = people.filter((p) => isAdult(p));
  const young = people.filter((p) => !isAdult(p));
  const set = (a: Agent, b: Agent, rel: { f: number; r?: number; status?: 'partner' | 'married'; kin?: boolean }) => {
    if (state.rels[relKey(a.id, b.id)]) return;
    setRel(state, a.id, b.id, { r: 0, ...rel });
  };
  if (adults.length >= 2) set(adults[0], adults[1], { f: Math.round(rand(55, 85)), r: Math.round(rand(60, 90)), status: Math.random() < 0.6 ? 'married' : 'partner' });
  for (const k of young) for (const p of adults) set(k, p, { f: Math.round(rand(40, 80)), kin: true });
  for (let i = 0; i < young.length; i++) for (let j = i + 1; j < young.length; j++) set(young[i], young[j], { f: Math.round(rand(10, 60)), kin: true });
  for (const pet of members.filter((m) => m.kind === 'pet')) for (const p of people) set(pet, p, { f: Math.round(rand(35, 70)) });

  if (!opts.jobs) return;
  for (const p of people) {
    const stage = lifeStage(p.species, p.ageDays).id;
    if (stage === 'child' || stage === 'teen') p.job = { career: 'school', level: 1, perf: Math.round(rand(30, 70)) };
    else if (stage !== 'elder' && stage !== 'baby' && Math.random() < 0.85) {
      p.job = { career: pick(JOB_CAREERS).id, level: 1 + Math.floor(Math.random() * Math.random() * 4), perf: Math.round(rand(0, 60)) };
    }
    giveSkills(p);
  }
}

export function layoutOf(lot: Lot) {
  return LAYOUTS[lot.layout];
}
