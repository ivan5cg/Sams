// Conversión entre coordenadas de casilla y de pantalla (isométrico 2:1).

export const TILE_W = 64;
export const TILE_H = 32;

/** Esquina superior de la casilla (tx, ty) en coordenadas del mundo. */
export function isoToScreen(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx - ty) * (TILE_W / 2), y: (tx + ty) * (TILE_H / 2) };
}

/** Centro de la casilla con coordenadas (tx, ty) (las del agente). */
export function tileCenter(tx: number, ty: number) {
  return isoToScreen(tx + 0.5, ty + 0.5);
}

export function screenToTile(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}

export function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}
