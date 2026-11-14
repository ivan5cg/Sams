// Mapas de las parcelas.
//   W = pared   . = suelo de madera   t = baldosa (baño)
//   g = césped  d = puerta (se puede pasar)   p = camino

export type TileType = 'wall' | 'wood' | 'tile' | 'grass' | 'door' | 'path';

export type LayoutId = 'house' | 'park';

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

const CHAR: Record<string, TileType> = { W: 'wall', '.': 'wood', t: 'tile', g: 'grass', d: 'door', p: 'path' };

export interface LotLayout {
  w: number;
  h: number;
  /** tiles[y][x] */
  tiles: TileType[][];
  /** Por dónde se entra y se sale de la parcela. */
  entrance: { x: number; y: number };
}

export function parseLot(rows: string[], entrance: { x: number; y: number }): LotLayout {
  const tiles = rows.map((r) => [...r].map((c) => CHAR[c] ?? 'grass'));
  return { w: rows[0].length, h: rows.length, tiles, entrance };
}

export const LAYOUTS: Record<LayoutId, LotLayout> = {
  house: parseLot(HOUSE_MAP, { x: 5, y: 11 }),
  park: parseLot(PARK_MAP, { x: 8, y: 13 }),
};

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
