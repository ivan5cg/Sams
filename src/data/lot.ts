// Parcela de la familia del jugador.
//   W = pared   . = suelo de madera   t = baldosa (baño)
//   g = césped  d = puerta (se puede pasar)

export type TileType = 'wall' | 'wood' | 'tile' | 'grass' | 'door';

export const LOT_MAP = [
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

const CHAR: Record<string, TileType> = { W: 'wall', '.': 'wood', t: 'tile', g: 'grass', d: 'door' };

export interface LotLayout {
  w: number;
  h: number;
  /** tiles[y][x] */
  tiles: TileType[][];
}

export function parseLot(rows: string[] = LOT_MAP): LotLayout {
  const tiles = rows.map((r) => [...r].map((c) => CHAR[c] ?? 'grass'));
  return { w: rows[0].length, h: rows.length, tiles };
}

/** Por dónde se sale y se entra de la parcela. */
export const ENTRANCE = { x: 5, y: 11 };

export const START_OBJECTS: { def: string; x: number; y: number }[] = [
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
];
