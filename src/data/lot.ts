// Mapas de las parcelas.
//   W = pared   . = suelo de madera   t = baldosa (baño)
//   g = césped  d = puerta (se puede pasar)   p = camino

export type TileType = 'wall' | 'wood' | 'tile' | 'grass' | 'door' | 'path';

export type LayoutId = 'house' | 'park' | 'studio' | 'super' | 'acai' | 'metro' | 'plaza' | 'bar' | 'library' | 'gym' | 'market';

const HOUSE_MAP = [
  'WWWWWWWWWWWggg',
  'WtttW.....Wggg',
  'WtttW.....Wggg',
  'WtttW.....Wggg',
  'WWdWW.....Wggg',
  'W.........dggg',
  'W.........Wggg',
  'W.........Wggg',
  'W.........Wggg',
  'W.........Wggg',
  'WWWWWdWWWWWggg',
  'gggggggggggggg',
];

// Casa ampliada: una habitación nueva hacia el jardín (el jardín se corre a la derecha).
const HOUSE2_MAP = [
  'WWWWWWWWWWWWWWWggg',
  'WtttW.....W...Wggg',
  'WtttW.....W...Wggg',
  'WtttW.....W...Wggg',
  'WWdWW.....W...Wggg',
  'W.........d...dggg',
  'W.........W...Wggg',
  'W.........W...Wggg',
  'W.........W...Wggg',
  'W.........W...Wggg',
  'WWWWWdWWWWWWWWWggg',
  'gggggggggggggggggg',
];

// Casa ampliada dos veces: además, un salón grande hacia la calle.
const HOUSE3_MAP = [
  'WWWWWWWWWWWWWWWggg',
  'WtttW.....W...Wggg',
  'WtttW.....W...Wggg',
  'WtttW.....W...Wggg',
  'WWdWW.....W...Wggg',
  'W.........d...dggg',
  'W.........W...Wggg',
  'W.........W...Wggg',
  'W.........W...Wggg',
  'W.........W...Wggg',
  'WWWWWdWWWWWWdWWggg',
  'W.............Wggg',
  'W.............Wggg',
  'W.............Wggg',
  'WWWWWdWWWWWWWWWggg',
  'gggggggggggggggggg',
];

const PARK_MAP = [
  'ggggggggpggggggg',
  'ggggggggpggggggg',
  'ggggggggpggggggg',
  'ggggggggpggggggg',
  'ggggggggpggggggg',
  'ggggggggpggggggg',
  'ggggggggpggggggg',
  'pppppppppppppppp',
  'ggggggggpggggggg',
  'ggggggggpggggggg',
  'ggggggggpggggggg',
  'ggggggggpggggggg',
  'ggggggggpggggggg',
  'ggggggggpggggggg',
];

const STUDIO_MAP = [
  'WWWWWWWWWWWW',
  'W..........W',
  'W..........W',
  'W..........W',
  'W..........W',
  'W..........W',
  'W..........W',
  'W..........W',
  'WWWWWdWWWWWW',
  'pppppppppppp',
];

const SUPER_MAP = [
  'WWWWWWWWWWWWWW',
  'Wtttttttttttt' + 'W',
  'Wtttttttttttt' + 'W',
  'Wtttttttttttt' + 'W',
  'Wtttttttttttt' + 'W',
  'Wtttttttttttt' + 'W',
  'Wtttttttttttt' + 'W',
  'Wtttttttttttt' + 'W',
  'Wtttttttttttt' + 'W',
  'WWWWWddWWWWWWW',
  'pppppppppppppp',
];

const ACAI_MAP = [
  'WWWWWWWWWWWW',
  'W..........W',
  'W..........W',
  'W..........W',
  'W..........W',
  'W..........W',
  'W..........W',
  'WWWWdWWWWWWW',
  'pppppppppppp',
];

// Un vagón del metro (Línea 10 → MetroSur), con el andén delante.
const METRO_MAP = [
  'WWWWWWWWWWWWWWWWWW',
  'Wtttttttttttttttt' + 'W',
  'Wtttttttttttttttt' + 'W',
  'Wtttttttttttttttt' + 'W',
  'Wtttttttttttttttt' + 'W',
  'WWWdWWWWWWWWWWdWWW',
  'pppppppppppppppppp',
];

// La plaza de Alcorcón: bancos, fuente, churrería y árboles.
const PLAZA_MAP = [
  'gggppppppppppggg',
  'gppppppppppppppg',
  'pppppppppppppppp',
  'pppppppppppppppp',
  'pppppppppppppppp',
  'pppppppppppppppp',
  'pppppppppppppppp',
  'pppppppppppppppp',
  'pppppppppppppppp',
  'pppppppppppppppp',
  'gppppppppppppppg',
  'gggppppppppppggg',
];

// El bar de toda la vida.
const BAR_MAP = [
  'WWWWWWWWWWWW',
  'W..........W',
  'W..........W',
  'W..........W',
  'W..........W',
  'W..........W',
  'W..........W',
  'WWWWWdWWWWWW',
  'pppppppppppp',
];

const CHAR: Record<string, TileType> = { W: 'wall', '.': 'wood', t: 'tile', g: 'grass', d: 'door', p: 'path' };

export interface LotLayout {
  w: number;
  h: number;
  /** tiles[y][x] */
  tiles: TileType[][];
  /** Por dónde se entra y se sale de la parcela. */
  entrance: { x: number; y: number };
  /** Un sitio del jardín (donde aparecen las mascotas de exterior). */
  garden?: { x: number; y: number };
}

export function parseLot(rows: string[], entrance: { x: number; y: number }, garden?: { x: number; y: number }): LotLayout {
  const tiles = rows.map((r) => [...r].map((c) => CHAR[c] ?? 'grass'));
  return { w: rows[0].length, h: rows.length, tiles, entrance, ...(garden ? { garden } : {}) };
}

export const LAYOUTS: Record<LayoutId, LotLayout> = {
  house: parseLot(HOUSE_MAP, { x: 5, y: 11 }, { x: 11, y: 6 }),
  park: parseLot(PARK_MAP, { x: 8, y: 13 }),
  studio: parseLot(STUDIO_MAP, { x: 5, y: 9 }),
  super: parseLot(SUPER_MAP, { x: 5, y: 10 }),
  acai: parseLot(ACAI_MAP, { x: 4, y: 8 }),
  metro: parseLot(METRO_MAP, { x: 3, y: 6 }),
  plaza: parseLot(PLAZA_MAP, { x: 8, y: 11 }),
  bar: parseLot(BAR_MAP, { x: 5, y: 8 }),
  // Los sitios de la fase 5: la biblioteca y el gimnasio, salas como la del pilates y la del bar;
  // el mercadillo, al aire libre como la plaza.
  library: parseLot(STUDIO_MAP, { x: 5, y: 9 }),
  gym: parseLot(BAR_MAP, { x: 5, y: 8 }),
  market: parseLot(PLAZA_MAP, { x: 8, y: 11 }),
};

/** Cambia algunas casillas de un plano: [x, y, carácter]. */
function patchMap(rows: string[], edits: [number, number, string][]): string[] {
  return rows.map((r, y) => [...r].map((c, x) => edits.find((e) => e[0] === x && e[1] === y)?.[2] ?? c).join(''));
}

/** Variante de la primera ampliación: la habitación nueva, con un baño propio al fondo. */
const BANO: [number, number, string][] = [
  ...[11, 12, 13].flatMap((x) => [1, 2, 3].map((y) => [x, y, 't'] as [number, number, string])),
  [11, 4, 'W'], [12, 4, 'd'], [13, 4, 'W'],
];
/** Variante de la segunda ampliación: en vez de un salón, dos dormitorios. */
const DORMITORIOS: [number, number, string][] = [[7, 11, 'W'], [7, 12, 'd'], [7, 13, 'W']];

const HOUSE_PLANS: Record<string, LotLayout> = {
  '1': LAYOUTS.house,
  '2:jardin': parseLot(HOUSE2_MAP, { x: 5, y: 11 }, { x: 16, y: 6 }),
  '2:bano': parseLot(patchMap(HOUSE2_MAP, BANO), { x: 5, y: 11 }, { x: 16, y: 6 }),
  '3:jardin+salon': parseLot(HOUSE3_MAP, { x: 5, y: 15 }, { x: 16, y: 6 }),
  '3:jardin+dormitorios': parseLot(patchMap(HOUSE3_MAP, DORMITORIOS), { x: 5, y: 15 }, { x: 16, y: 6 }),
  '3:bano+salon': parseLot(patchMap(HOUSE3_MAP, BANO), { x: 5, y: 15 }, { x: 16, y: 6 }),
  '3:bano+dormitorios': parseLot(patchMap(HOUSE3_MAP, [...BANO, ...DORMITORIOS]), { x: 5, y: 15 }, { x: 16, y: 6 }),
};

/** Plano de la casa según lo ampliada que esté (1, 2 o 3) y las plantillas elegidas en cada reforma. */
export function houseLayout(size: number, plans: string[] = []): LotLayout {
  const s = Math.max(1, Math.min(3, size));
  if (s === 1) return HOUSE_PLANS['1'];
  const p = [plans[0] ?? 'jardin', plans[1] ?? 'salon'].slice(0, s - 1);
  return HOUSE_PLANS[`${s}:${p.join('+')}`] ?? HOUSE_PLANS[s === 2 ? '2:jardin' : '3:jardin+salon'];
}

/** Planos por tamaño con las plantillas de siempre (compatibilidad). */
export const HOUSE_SIZES: LotLayout[] = [houseLayout(1), houseLayout(2), houseLayout(3)];

/** Ampliaciones: para cada tamaño, las plantillas que se pueden elegir. */
export const EXPANSIONS = [
  { size: 2, plan: 'jardin', price: 6000, label: 'Habitación nueva junto al jardín', shiftX: 4 },
  { size: 2, plan: 'bano', price: 7500, label: 'Habitación con baño propio', shiftX: 4 },
  { size: 3, plan: 'salon', price: 12000, label: 'Salón grande hacia la calle', shiftX: 0 },
  { size: 3, plan: 'dormitorios', price: 13000, label: 'Dos dormitorios hacia la calle', shiftX: 0 },
];

/** Entrada de la casa (todas las casas comparten plano). */
export const ENTRANCE = LAYOUTS.house.entrance;

export const isOutdoor = (t: TileType | undefined) => t === 'grass' || t === 'path';

export type ObjectPlacement = { def: string; x: number; y: number };

export const HOUSE_OBJECTS: ObjectPlacement[] = [
  { def: 'toilet', x: 1, y: 1 },
  { def: 'shower', x: 3, y: 1 },
  { def: 'bed', x: 8, y: 1 },
  { def: 'bookshelf', x: 5, y: 1 },
  { def: 'fridge', x: 1, y: 5 },
  { def: 'sofa', x: 6, y: 7 },
  { def: 'tv', x: 9, y: 7 },
  { def: 'plant', x: 9, y: 9 },
  { def: 'bowl', x: 3, y: 9 },
  { def: 'dogbed', x: 1, y: 9 },
  { def: 'ball', x: 12, y: 3 },
  { def: 'tree', x: 12, y: 7 },
  { def: 'computer', x: 7, y: 1 },
  { def: 'slippers', x: 6, y: 3 },
  { def: 'litterbox', x: 1, y: 7 },
  { def: 'scratcher', x: 9, y: 6 },
  { def: 'cage', x: 7, y: 9 },
  { def: 'hammock', x: 9, y: 4 },
  { def: 'bowl', x: 13, y: 5 },
  { def: 'pond', x: 12, y: 9 },
  { def: 'strawbed', x: 12, y: 1 },
  { def: 'crib', x: 6, y: 1 },
  { def: 'crib', x: 9, y: 3 },
];

/** Nombre antiguo (fases 1 y 2), usado por la migración de partidas. */
export const START_OBJECTS = HOUSE_OBJECTS;

export const STUDIO_OBJECTS: ObjectPlacement[] = [
  { def: 'reformer', x: 1, y: 1 },
  { def: 'reformer', x: 4, y: 1 },
  { def: 'reformer', x: 7, y: 1 },
  { def: 'toilet', x: 10, y: 1 },
  { def: 'pilates_mat', x: 2, y: 4 },
  { def: 'pilates_mat', x: 4, y: 4 },
  { def: 'pilates_mat', x: 6, y: 4 },
  { def: 'pilates_mat', x: 8, y: 4 },
  { def: 'pilates_mat', x: 2, y: 6 },
  { def: 'pilates_mat', x: 4, y: 6 },
  { def: 'pilates_mat', x: 6, y: 6 },
  { def: 'pilates_mat', x: 8, y: 6 },
  { def: 'desk', x: 9, y: 7 },
  { def: 'plant', x: 10, y: 4 },
  { def: 'plant', x: 1, y: 7 },
];

export const SUPER_OBJECTS: ObjectPlacement[] = [
  { def: 'super_fridge', x: 1, y: 1 },
  { def: 'super_fridge', x: 4, y: 1 },
  { def: 'super_fridge', x: 7, y: 1 },
  { def: 'super_fridge', x: 10, y: 1 },
  { def: 'super_shelf', x: 2, y: 4 },
  { def: 'super_shelf', x: 6, y: 4 },
  { def: 'super_shelf', x: 2, y: 6 },
  { def: 'super_shelf', x: 6, y: 6 },
  { def: 'fruit_stand', x: 11, y: 4 },
  { def: 'fruit_stand', x: 11, y: 6 },
  { def: 'checkout', x: 2, y: 8 },
  { def: 'checkout', x: 9, y: 8 },
  { def: 'carts', x: 12, y: 8 },
  { def: 'plant', x: 12, y: 1 },
];

export const ACAI_OBJECTS: ObjectPlacement[] = [
  { def: 'acai_counter', x: 6, y: 1 },
  { def: 'neon_sign', x: 2, y: 1 },
  { def: 'cafe_table', x: 2, y: 4 },
  { def: 'cafe_table', x: 5, y: 4 },
  { def: 'cafe_table', x: 8, y: 4 },
  { def: 'cafe_table', x: 7, y: 6 },
  { def: 'plant', x: 10, y: 1 },
  { def: 'plant', x: 1, y: 6 },
  { def: 'plant', x: 10, y: 6 },
];

export const PARK_OBJECTS: ObjectPlacement[] = [
  { def: 'toilet', x: 1, y: 1 },
  { def: 'foodcart', x: 4, y: 5 },
  { def: 'bench', x: 7, y: 3 },
  { def: 'bench', x: 9, y: 5 },
  { def: 'bench', x: 7, y: 10 },
  { def: 'swings', x: 11, y: 10 },
  { def: 'pond', x: 12, y: 2 },
  { def: 'tree', x: 2, y: 3 },
  { def: 'tree', x: 5, y: 1 },
  { def: 'tree', x: 14, y: 6 },
  { def: 'tree', x: 3, y: 11 },
  { def: 'tree', x: 13, y: 13 },
  { def: 'ball', x: 4, y: 9 },
  { def: 'flowers', x: 10, y: 1 },
  { def: 'flowers', x: 6, y: 12 },
  { def: 'flowers', x: 1, y: 9 },
];

export const METRO_OBJECTS: ObjectPlacement[] = [
  { def: 'metro_seat', x: 1, y: 1 },
  { def: 'metro_seat', x: 5, y: 1 },
  { def: 'metro_seat', x: 9, y: 1 },
  { def: 'metro_seat', x: 13, y: 1 },
  { def: 'metro_seat', x: 6, y: 4 },
  { def: 'metro_seat', x: 10, y: 4 },
  { def: 'metro_pole', x: 4, y: 3 },
  { def: 'metro_pole', x: 8, y: 2 },
  { def: 'metro_pole', x: 12, y: 3 },
  { def: 'metro_sign', x: 16, y: 1 },
];

export const PLAZA_OBJECTS: ObjectPlacement[] = [
  { def: 'fountain', x: 7, y: 5 },
  { def: 'bench', x: 3, y: 3 },
  { def: 'bench', x: 4, y: 8 },
  { def: 'bench', x: 11, y: 3 },
  { def: 'churreria', x: 11, y: 8 },
  { def: 'tree', x: 1, y: 1 },
  { def: 'tree', x: 14, y: 1 },
  { def: 'tree', x: 1, y: 10 },
  { def: 'tree', x: 14, y: 10 },
  { def: 'flowers', x: 6, y: 2 },
  { def: 'flowers', x: 10, y: 6 },
  { def: 'lamp', x: 2, y: 6 },
  { def: 'lamp', x: 13, y: 5 },
];

export const LIBRARY_OBJECTS: ObjectPlacement[] = [
  { def: 'bookshelf', x: 1, y: 1 },
  { def: 'bookshelf', x: 3, y: 1 },
  { def: 'bookshelf', x: 5, y: 1 },
  { def: 'bookshelf', x: 7, y: 1 },
  { def: 'study_table', x: 2, y: 4 },
  { def: 'study_table', x: 5, y: 4 },
  { def: 'study_table', x: 2, y: 6 },
  { def: 'study_table', x: 5, y: 6 },
  { def: 'chess', x: 8, y: 4 },
  { def: 'armchair', x: 9, y: 2 },
  { def: 'toilet', x: 10, y: 1 },
  { def: 'desk', x: 9, y: 7 },
  { def: 'plant', x: 1, y: 7 },
];

export const GYM_OBJECTS: ObjectPlacement[] = [
  { def: 'treadmill', x: 1, y: 1 },
  { def: 'treadmill', x: 2, y: 1 },
  { def: 'treadmill', x: 3, y: 1 },
  { def: 'weights', x: 5, y: 1 },
  { def: 'weights', x: 7, y: 1 },
  { def: 'punching_bag', x: 9, y: 2 },
  { def: 'punching_bag', x: 9, y: 4 },
  { def: 'pilates_mat', x: 3, y: 4 },
  { def: 'pilates_mat', x: 5, y: 4 },
  { def: 'toilet', x: 10, y: 1 },
  { def: 'desk', x: 8, y: 6 },
  { def: 'plant', x: 1, y: 6 },
];

/** El mercadillo del domingo, en una explanada con puestos. */
export const MARKET_OBJECTS: ObjectPlacement[] = [
  { def: 'stall_fruit', x: 3, y: 3 },
  { def: 'stall_clothes', x: 7, y: 3 },
  { def: 'stall_junk', x: 11, y: 3 },
  { def: 'stall_fruit', x: 4, y: 7 },
  { def: 'stall_clothes', x: 10, y: 7 },
  { def: 'churreria', x: 7, y: 8 },
  { def: 'bench', x: 1, y: 5 },
  { def: 'bench', x: 14, y: 5 },
  { def: 'tree', x: 1, y: 1 },
  { def: 'tree', x: 14, y: 1 },
  { def: 'tree', x: 1, y: 10 },
  { def: 'tree', x: 14, y: 10 },
  { def: 'lamp', x: 2, y: 9 },
  { def: 'lamp', x: 13, y: 9 },
];

export const BAR_OBJECTS: ObjectPlacement[] = [
  { def: 'bar_counter', x: 2, y: 1 },
  { def: 'slot_machine', x: 9, y: 1 },
  { def: 'bar_tv', x: 10, y: 3 },
  { def: 'mus_table', x: 3, y: 4 },
  { def: 'mus_table', x: 7, y: 4 },
  { def: 'toilet', x: 1, y: 6 },
  { def: 'plant', x: 10, y: 6 },
];
