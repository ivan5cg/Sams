// Pintura de paredes y suelos (modo construcción → 🎨).

export const WALL_COLORS: { id: string; label: string; color: number }[] = [
  { id: 'blanco', label: 'Blanco roto', color: 0xe9e1d4 },
  { id: 'crema', label: 'Crema', color: 0xf1e3c2 },
  { id: 'albero', label: 'Amarillo albero', color: 0xf0cf72 },
  { id: 'terracota', label: 'Terracota', color: 0xd38a63 },
  { id: 'rosa', label: 'Rosa palo', color: 0xe9b8bd },
  { id: 'menta', label: 'Verde menta', color: 0xb5dcc3 },
  { id: 'cielo', label: 'Azul cielo', color: 0xa9cbe6 },
  { id: 'perla', label: 'Gris perla', color: 0xc7c9cf },
];

export type FloorKind = 'wood' | 'tile' | 'carpet';

export const FLOORS: { id: string; label: string; kind: FloorKind; color: number }[] = [
  { id: 'roble', label: 'Parqué de roble', kind: 'wood', color: 0xc89f6e },
  { id: 'haya', label: 'Parqué de haya', kind: 'wood', color: 0xe0c08a },
  { id: 'nogal', label: 'Parqué de nogal', kind: 'wood', color: 0x8a5a3a },
  { id: 'baldosa', label: 'Baldosa blanca', kind: 'tile', color: 0xe3eaee },
  { id: 'hidraulica', label: 'Baldosa hidráulica', kind: 'tile', color: 0xd59a7c },
  { id: 'terrazo', label: 'Terrazo de la abuela', kind: 'tile', color: 0xcfc6b8 },
  { id: 'moqueta', label: 'Moqueta beige', kind: 'carpet', color: 0xd9c7a7 },
  { id: 'moqueta_azul', label: 'Moqueta azul', kind: 'carpet', color: 0x5b7fb5 },
];

export const FLOOR_BY_ID = Object.fromEntries(FLOORS.map((f) => [f.id, f]));

/** Lo que cuesta pintar una habitación o cambiarle el suelo. */
export const PAINT_PRICE = { wall: 40, floor: 80 };
