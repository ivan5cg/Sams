// Mapas de las parcelas.
//   W = pared   . = suelo de madera   t = baldosa (baño)
//   g = césped  d = puerta (se puede pasar)   p = camino

export type TileType = 'wall' | 'wood' | 'tile' | 'grass' | 'door' | 'path';

export type LayoutId = 'house' | 'park' | 'studio' | 'super' | 'acai';

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
};

/** Planos de la casa según lo ampliada que esté (1, 2 o 3). */
export const HOUSE_SIZES: LotLayout[] = [LAYOUTS.house, parseLot(HOUSE2_MAP, { x: 5, y: 11 }, { x: 16, y: 6 }), parseLot(HOUSE3_MAP, { x: 5, y: 15 }, { x: 16, y: 6 })];

/** Ampliaciones: precio y lo que se gana. */
export const EXPANSIONS = [
  { size: 2, price: 6000, label: 'Habitación nueva junto al jardín', shiftX: 4 },
  { size: 3, price: 12000, label: 'Salón grande hacia la calle', shiftX: 0 },
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
