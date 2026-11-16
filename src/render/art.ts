// Dibujo vectorial del mundo: suelos, paredes y muebles en perspectiva isométrica.
// Todo se dibuja con formas (sin emojis) para que se vea igual en todos los móviles.

import type Phaser from 'phaser';
import { OBJECTS } from '../data/objects';
import type { TileType } from '../data/lot';
import { isoToScreen, shade } from './iso';

type G = Phaser.GameObjects.Graphics;
type Pt = { x: number; y: number };

/** Rectángulo en casillas. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** Mientras se dibuja un mueble girado: se trasponen las coordenadas alrededor de su esquina. */
let XF: { X: number; Y: number } | null = null;

/** Punto de la casilla (tx, ty) a `z` píxeles de altura. */
export function P(tx: number, ty: number, z = 0): Pt {
  const p = XF ? isoToScreen(XF.X + (ty - XF.Y), XF.Y + (tx - XF.X)) : isoToScreen(tx, ty);
  return { x: p.x, y: p.y - z };
}

/**
 * Dibuja algo de un mueble teniendo en cuenta si está girado: girar 90° en la vista isométrica es
 * trasponer x e y (las caras visibles siguen siendo las visibles; la huella pasa de w×h a h×w).
 */
export function withRotation(o: { x: number; y: number; rot?: number }, draw: () => void) {
  if (!o.rot) return draw();
  const prev = XF;
  XF = { X: o.x, Y: o.y };
  try {
    draw();
  } finally {
    XF = prev;
  }
}

export const WOOD = 0xa0703f;
export const WOOD_DARK = 0x6e4a2e;
export const WHITE = 0xf4f2ee;
export const DARK = 0x2c303b;

export const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// -----------------------------------------------------------------------------
// Primitivas
// -----------------------------------------------------------------------------

/** Bloque (prisma) de base `r`, desde la altura z0 hasta z1, con las caras visibles sombreadas. */
export function prism(g: G, r: Rect, z0: number, z1: number, color: number, opts: { top?: number; alpha?: number; outline?: boolean } = {}) {
  const A = P(r.x, r.y, z1), B = P(r.x + r.w, r.y, z1), C = P(r.x + r.w, r.y + r.h, z1), D = P(r.x, r.y + r.h, z1);
  const Bb = P(r.x + r.w, r.y, z0), Cb = P(r.x + r.w, r.y + r.h, z0), Db = P(r.x, r.y + r.h, z0);
  const alpha = opts.alpha ?? 1;
  if (z1 > z0) {
    g.fillStyle(shade(color, 0.82), alpha);
    g.fillPoints([Db, Cb, C, D], true);
    g.fillStyle(shade(color, 0.66), alpha);
    g.fillPoints([Cb, Bb, B, C], true);
  }
  g.fillStyle(opts.top ?? color, alpha);
  g.fillPoints([A, B, C, D], true);
  if (opts.outline !== false) {
    g.lineStyle(1, shade(color, 0.42), 0.45 * alpha);
    g.strokePoints([A, B, Bb, Cb, Db, D], true);
    if (z1 > z0) {
      g.lineBetween(C.x, C.y, Cb.x, Cb.y);
      g.lineStyle(1, 0xffffff, 0.12 * alpha);
      g.lineBetween(D.x, D.y, C.x, C.y);
      g.lineBetween(C.x, C.y, B.x, B.y);
    }
  }
}

/** Rombo plano a una altura (alfombras, tapas, agua...). */
export function flat(g: G, r: Rect, z: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillPoints([P(r.x, r.y, z), P(r.x + r.w, r.y, z), P(r.x + r.w, r.y + r.h, z), P(r.x, r.y + r.h, z)], true);
}

/** Punto sobre una cara visible del bloque: 'L' (la que mira hacia abajo-izquierda) o 'R' (abajo-derecha). */
export function facePoint(r: Rect, face: 'L' | 'R', u: number, z: number): Pt {
  return face === 'L' ? P(r.x + r.w * u, r.y + r.h, z) : P(r.x + r.w, r.y + r.h * (1 - u), z);
}

/** Rectángulo pintado sobre una cara (puertas, pantallas, libros, ventanas...). */
export function faceQuad(g: G, r: Rect, face: 'L' | 'R', u0: number, u1: number, z0: number, z1: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillPoints([facePoint(r, face, u0, z0), facePoint(r, face, u1, z0), facePoint(r, face, u1, z1), facePoint(r, face, u0, z1)], true);
}

function poleAt(g: G, tx: number, ty: number, z0: number, z1: number, color: number, width = 2) {
  const a = P(tx, ty, z0), b = P(tx, ty, z1);
  g.lineStyle(width, color, 1);
  g.lineBetween(a.x, a.y, b.x, b.y);
}

/** Barrotes a lo largo de las aristas traseras o delanteras de un rectángulo. */
function bars(g: G, r: Rect, z0: number, z1: number, color: number, side: 'back' | 'front') {
  const A = { x: r.x, y: r.y }, B = { x: r.x + r.w, y: r.y }, C = { x: r.x + r.w, y: r.y + r.h }, D = { x: r.x, y: r.y + r.h };
  const edges = side === 'back' ? [[D, A], [A, B]] : [[D, C], [C, B]];
  g.lineStyle(1.2, color, 0.85);
  for (const [p, q] of edges) {
    const n = Math.max(3, Math.round(Math.hypot(q.x - p.x, q.y - p.y) * 7));
    for (let i = 0; i <= n; i++) {
      const tx = p.x + ((q.x - p.x) * i) / n, ty = p.y + ((q.y - p.y) * i) / n;
      const a = P(tx, ty, z0), b = P(tx, ty, z1);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    const a = P(p.x, p.y, z1), b = P(q.x, q.y, z1);
    g.lineStyle(2, color, 0.95);
    g.lineBetween(a.x, a.y, b.x, b.y);
    g.lineStyle(1.2, color, 0.85);
  }
}

function shadowUnder(g: G, cx: number, cy: number, w: number, alpha = 0.18) {
  const c = P(cx, cy);
  g.fillStyle(0x000000, alpha);
  g.fillEllipse(c.x, c.y, w, w * 0.48);
}

// -----------------------------------------------------------------------------
// Suelos y paredes
// -----------------------------------------------------------------------------

export interface LotStyle {
  wall: number;
  floor: number;
  /** Color de la baldosa (por defecto, blanca). */
  tile?: number;
  /** Color del césped (cambia con la estación). */
  grass?: number;
  /** Nieve en el suelo (invierno). */
  snow?: boolean;
}

const GRASS = 0x79b65a;
const TILE = 0xe3eaee;
const PATH = 0xd9cba6;

export function drawTile(g: G, t: TileType | 'carpet', x: number, y: number, style: LotStyle) {
  const h = hash(`${x},${y}`);
  const r = R(x, y, 1, 1);
  switch (t) {
    case 'wood':
    case 'door': {
      const base = shade(t === 'door' ? shade(style.floor, 0.85) : style.floor, 0.95 + ((h % 9) / 100));
      flat(g, r, 0, base);
      // Juntas de las tablas
      g.lineStyle(1, shade(base, 0.72), 0.55);
      for (const f of [0.34, 0.67]) {
        const a = P(x, y + f), b = P(x + 1, y + f);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
      const k = ((h >>> 4) % 3) / 3 + 0.15;
      const c0 = P(x + k, y, 0), c1 = P(x + k, y + 0.34, 0);
      g.lineBetween(c0.x, c0.y, c1.x, c1.y);
      break;
    }
    case 'carpet': {
      // Moqueta: color liso con algo de textura.
      flat(g, r, 0, shade(style.floor, 0.97 + ((h % 5) / 100)));
      g.fillStyle(shade(style.floor, 0.86), 0.5);
      for (let i = 0; i < 4; i++) {
        const c = P(x + (((h >>> (i * 4)) % 80) + 10) / 100, y + (((h >>> (i * 4 + 2)) % 80) + 10) / 100);
        g.fillCircle(c.x, c.y, 0.9);
      }
      break;
    }
    case 'tile': {
      const tc = style.tile ?? TILE;
      flat(g, r, 0, (x + y) % 2 ? tc : shade(tc, 0.93));
      g.lineStyle(1, 0xffffff, 0.55);
      g.strokePoints([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], true);
      break;
    }
    case 'path': {
      flat(g, r, 0, shade(PATH, 0.9));
      flat(g, R(x + 0.06, y + 0.06, 0.88, 0.88), 0, shade(PATH, 0.97 + ((h % 7) / 100)));
      g.lineStyle(1, shade(PATH, 0.75), 0.6);
      const a = P(x + 0.5, y + 0.06), b = P(x + 0.5, y + 0.94);
      g.lineBetween(a.x, a.y, b.x, b.y);
      break;
    }
    default: {
      // Césped con matas
      const grass = style.grass ?? GRASS;
      flat(g, r, 0, shade(grass, 0.93 + ((h % 12) / 100)));
      g.lineStyle(1, shade(grass, 0.7), 0.7);
      for (let i = 0; i < 3; i++) {
        const fx = (((h >>> (i * 5)) % 80) + 10) / 100, fy = (((h >>> (i * 5 + 3)) % 80) + 10) / 100;
        const c = P(x + fx, y + fy);
        g.lineBetween(c.x - 2, c.y, c.x - 1, c.y - 3);
        g.lineBetween(c.x + 1, c.y, c.x + 2, c.y - 3);
      }
      if (style.snow) {
        for (let i = 0; i < 4; i++) {
          const c = P(x + (((h >>> (i * 4)) % 90) + 5) / 100, y + (((h >>> (i * 4 + 2)) % 90) + 5) / 100);
          g.fillStyle(0xffffff, 0.85);
          g.fillEllipse(c.x, c.y, 6, 2.6);
        }
      } else if (h % 23 === 0) {
        const c = P(x + 0.5, y + 0.5);
        g.fillStyle([0xffffff, 0xf7d84a, 0xf28db2][h % 3], 0.9);
        g.fillCircle(c.x, c.y - 1, 1.6);
      }
    }
  }
}

/** Pared de una casilla, con zócalo, remate y (si toca) ventana o espejo en la cara que da al interior. */
export function drawWall(g: G, x: number, y: number, height: number, color: number, deco?: { face: 'L' | 'R'; kind: 'window' | 'mirror' | 'stripe' | 'tunnel'; color?: number }) {
  const r = R(x, y, 1, 1);
  prism(g, r, 0, height, color, { top: shade(color, 1.08) });
  // Zócalo
  faceQuad(g, r, 'L', 0, 1, 0, 4, shade(color, 0.6), 0.9);
  faceQuad(g, r, 'R', 0, 1, 0, 4, shade(color, 0.5), 0.9);
  if (deco && height > 30) {
    if (deco.kind === 'window') {
      faceQuad(g, r, deco.face, 0.18, 0.82, 18, 44, 0xffffff, 0.95);
      faceQuad(g, r, deco.face, 0.24, 0.76, 21, 41, 0x9fd4ee);
      faceQuad(g, r, deco.face, 0.24, 0.5, 31, 41, 0xc9ecfa, 0.7);
      faceQuad(g, r, deco.face, 0.48, 0.52, 21, 41, 0xffffff, 0.9);
      faceQuad(g, r, deco.face, 0.24, 0.76, 30, 32, 0xffffff, 0.9);
    } else if (deco.kind === 'tunnel') {
      // Ventana del vagón: túnel oscuro con alguna luz pasando
      faceQuad(g, r, deco.face, 0.08, 0.92, 22, 44, 0x1d2233);
      faceQuad(g, r, deco.face, 0.3, 0.38, 26, 40, 0xf2e6a6, 0.35);
      faceQuad(g, r, deco.face, 0, 1, 8, 12, deco.color ?? 0xe63946);
    } else if (deco.kind === 'stripe') {
      faceQuad(g, r, deco.face, 0, 1, 40, 48, deco.color ?? 0x2e8b57);
      faceQuad(g, r, deco.face, 0, 1, 37, 38.5, 0xf28c28);
    } else {
      faceQuad(g, r, deco.face, 0.08, 0.92, 8, 46, 0xbfa76a);
      faceQuad(g, r, deco.face, 0.12, 0.88, 10, 44, 0xd6e8f2);
      faceQuad(g, r, deco.face, 0.3, 0.42, 14, 40, 0xffffff, 0.35);
    }
  }
}

// -----------------------------------------------------------------------------
// Muebles y objetos
// -----------------------------------------------------------------------------

export interface ObjLike {
  def: string;
  x: number;
  y: number;
  rot?: number;
  stock?: number;
  dirt?: number;
  broken?: boolean;
}

type Art = (g: G, f: G, X: number, Y: number, o: ObjLike) => void;

const ART: Record<string, Art> = {
  bed: (g, f, X, Y) => {
    const c = OBJECTS.bed.color;
    shadowUnder(g, X + 1, Y + 0.5, 70, 0.12);
    prism(g, R(X + 0.04, Y + 0.08, 0.14, 0.84), 0, 30, WOOD_DARK);
    prism(g, R(X + 0.06, Y + 0.1, 1.88, 0.8), 0, 9, WOOD);
    prism(g, R(X + 0.1, Y + 0.14, 1.8, 0.72), 9, 15, WHITE);
    prism(g, R(X + 0.24, Y + 0.18, 0.3, 0.3), 15, 19, 0xffffff);
    prism(g, R(X + 0.24, Y + 0.52, 0.3, 0.3), 15, 19, 0xffffff);
    // Manta (por delante de quien duerme)
    prism(f, R(X + 0.66, Y + 0.12, 1.26, 0.76), 15, 18, c);
    flat(f, R(X + 0.66, Y + 0.12, 0.14, 0.76), 18.2, shade(c, 1.25));
  },
  sofa: (g, _f, X, Y, o) => {
    const c = OBJECTS[o.def].color;
    shadowUnder(g, X + 0.5, Y + 1, 46, 0.14);
    prism(g, R(X + 0.08, Y + 0.06, 0.84, 1.88), 0, 9, shade(c, 0.85));
    prism(g, R(X + 0.08, Y + 0.06, 0.26, 1.88), 9, 27, shade(c, 0.95));
    prism(g, R(X + 0.08, Y + 0.06, 0.84, 0.2), 9, 17, c);
    prism(g, R(X + 0.34, Y + 0.28, 0.58, 0.72), 9, 13, shade(c, 1.12));
    prism(g, R(X + 0.34, Y + 1.0, 0.58, 0.72), 9, 13, shade(c, 1.12));
    prism(g, R(X + 0.14, Y + 0.32, 0.22, 0.32), 13, 22, 0xf2d06b);
    prism(g, R(X + 0.08, Y + 1.74, 0.84, 0.2), 9, 17, c);
  },
  armchair: (g, _f, X, Y, o) => {
    const c = OBJECTS[o.def].color;
    shadowUnder(g, X + 0.5, Y + 0.5, 34, 0.14);
    prism(g, R(X + 0.12, Y + 0.12, 0.76, 0.76), 0, 9, shade(c, 0.85));
    prism(g, R(X + 0.12, Y + 0.12, 0.24, 0.76), 9, 26, shade(c, 0.95));
    prism(g, R(X + 0.12, Y + 0.12, 0.76, 0.18), 9, 17, c);
    prism(g, R(X + 0.36, Y + 0.3, 0.52, 0.42), 9, 13, shade(c, 1.12));
    prism(g, R(X + 0.12, Y + 0.7, 0.76, 0.18), 9, 17, c);
  },
  crib: (g, f, X, Y) => {
    const r = R(X + 0.1, Y + 0.1, 0.8, 0.8);
    shadowUnder(g, X + 0.5, Y + 0.5, 34, 0.14);
    for (const [px, py] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]]) poleAt(g, X + px, Y + py, 0, 8, 0xe7dccb, 2);
    prism(g, r, 6, 9, 0xf7f3ec);
    flat(g, R(X + 0.14, Y + 0.14, 0.72, 0.72), 9.5, 0xf7c9d8);
    bars(g, r, 9, 24, 0xf3ece0, 'back');
    bars(f, r, 9, 24, 0xf3ece0, 'front');
  },
  fridge: (g, _f, X, Y, o) => {
    const r = R(X + 0.14, Y + 0.14, 0.72, 0.72);
    shadowUnder(g, X + 0.5, Y + 0.5, 36, 0.16);
    prism(g, r, 0, 48, 0xe9eef1);
    faceQuad(g, r, 'L', 0, 1, 30, 31.2, 0xb4bec6);
    faceQuad(g, r, 'L', 0.8, 0.88, 33, 44, 0x7d868d);
    faceQuad(g, r, 'L', 0.8, 0.88, 14, 26, 0x7d868d);
    faceQuad(g, r, 'L', 0.22, 0.32, 37, 41, 0xe74c3c);
    faceQuad(g, r, 'L', 0.42, 0.5, 35, 39, 0xf2c14e);
    faceQuad(g, r, 'L', 0.2, 0.36, 18, 24, 0xffffff);
    if (o.broken) faceQuad(g, r, 'L', 0.05, 0.95, 46, 47.5, 0x555555);
  },
  toilet: (g, _f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 26, 0.14);
    prism(g, R(X + 0.28, Y + 0.12, 0.44, 0.2), 8, 26, WHITE);
    prism(g, R(X + 0.34, Y + 0.3, 0.32, 0.4), 0, 10, WHITE);
    const c = P(X + 0.5, Y + 0.56, 11);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(c.x, c.y, 20, 11);
    g.lineStyle(1, 0xb7c0c6, 0.8);
    g.strokeEllipse(c.x, c.y, 20, 11);
    g.fillStyle(0xbfe0ec, 1);
    g.fillEllipse(c.x, c.y + 0.5, 12, 6);
  },
  shower: (g, f, X, Y) => {
    const r = R(X + 0.06, Y + 0.06, 0.88, 0.88);
    prism(g, r, 0, 4, 0xdfe9ee);
    const d = P(X + 0.5, Y + 0.5, 4.2);
    g.fillStyle(0x9aa7ae, 1);
    g.fillEllipse(d.x, d.y, 5, 2.5);
    poleAt(g, X + 0.16, Y + 0.16, 4, 50, 0xa9b4bb, 2);
    const h = P(X + 0.3, Y + 0.3, 48);
    g.fillStyle(0xc4ced4, 1);
    g.fillEllipse(h.x, h.y, 10, 5);
    faceQuad(f, r, 'L', 0, 1, 4, 52, 0xbfe6f5, 0.22);
    faceQuad(f, r, 'R', 0, 1, 4, 52, 0xbfe6f5, 0.16);
    f.lineStyle(1.5, 0xd5e3ea, 0.9);
    const top = [facePoint(r, 'L', 0, 52), facePoint(r, 'L', 1, 52), facePoint(r, 'R', 1, 52)];
    f.strokePoints(top, false);
    const e = facePoint(r, 'L', 1, 4), e2 = facePoint(r, 'L', 1, 52);
    f.lineBetween(e.x, e.y, e2.x, e2.y);
  },
  bathtub: (g, f, X, Y) => {
    const r = R(X + 0.06, Y + 0.12, 0.88, 0.76);
    shadowUnder(g, X + 0.5, Y + 0.5, 40, 0.14);
    prism(g, r, 0, 13, WHITE);
    flat(g, R(X + 0.14, Y + 0.2, 0.72, 0.6), 13.2, 0xd5e9f2);
    poleAt(g, X + 0.12, Y + 0.5, 13, 20, 0xa9b4bb, 2);
    flat(f, R(X + 0.14, Y + 0.2, 0.72, 0.6), 10, 0x8fd0ef, 0.55);
  },
  tv: (g, _f, X, Y, o) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 34, 0.14);
    prism(g, R(X + 0.1, Y + 0.25, 0.8, 0.5), 0, 12, WOOD_DARK);
    const s = R(X + 0.12, Y + 0.44, 0.76, 0.1);
    prism(g, s, 12, 37, 0x1f2229);
    faceQuad(g, s, 'L', 0.06, 0.94, 14.5, 35, o.broken ? 0x3a3a3a : 0x2f5d8a);
    if (!o.broken) faceQuad(g, s, 'L', 0.1, 0.45, 26, 34, 0x5d93c4, 0.6);
  },
  computer: (g, _f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 36, 0.12);
    for (const [px, py] of [[0.1, 0.16], [0.9, 0.16], [0.1, 0.84], [0.9, 0.84]]) poleAt(g, X + px, Y + py, 0, 18, WOOD_DARK, 2.5);
    prism(g, R(X + 0.06, Y + 0.12, 0.88, 0.76), 18, 22, WOOD);
    const m = R(X + 0.3, Y + 0.26, 0.42, 0.08);
    poleAt(g, X + 0.51, Y + 0.3, 22, 26, DARK, 2);
    prism(g, m, 26, 40, DARK);
    faceQuad(g, m, 'L', 0.07, 0.93, 27.5, 38.5, 0x6fb6e8);
    flat(g, R(X + 0.3, Y + 0.5, 0.42, 0.16), 22.4, 0xd0d4d8);
  },
  bookshelf: (g, _f, X, Y) => {
    const r = R(X + 0.1, Y + 0.32, 0.8, 0.48);
    shadowUnder(g, X + 0.5, Y + 0.55, 34, 0.14);
    prism(g, r, 0, 46, WOOD);
    const colors = [0xd9534f, 0x4f8fd9, 0x52b788, 0xf2c14e, 0x9b5de5, 0xe76f51, 0x2a9d8f];
    let k = 3;
    for (const z of [3, 16, 29]) {
      faceQuad(g, r, 'L', 0.05, 0.95, z, z + 12, shade(WOOD, 0.55));
      let u = 0.08;
      while (u < 0.88) {
        const w = 0.07 + ((k * 7) % 5) * 0.012;
        const hgt = 8 + ((k * 3) % 4);
        faceQuad(g, r, 'L', u, Math.min(0.92, u + w), z, z + hgt, colors[k % colors.length]);
        u += w + 0.015;
        k++;
      }
    }
  },
  stereo: (g, _f, X, Y, o) => {
    const r = R(X + 0.22, Y + 0.32, 0.56, 0.38);
    shadowUnder(g, X + 0.5, Y + 0.5, 28, 0.14);
    prism(g, r, 0, 22, 0x2b2d38);
    for (const u of [0.25, 0.75]) {
      const c = facePoint(r, 'L', u, 9);
      g.fillStyle(0x15161c, 1);
      g.fillCircle(c.x, c.y, 4.6);
      g.fillStyle(0x4b4f63, 1);
      g.fillCircle(c.x, c.y, 2);
    }
    faceQuad(g, r, 'L', 0.32, 0.68, 16, 19.5, o.broken ? 0x444444 : 0x3ee6c1);
  },
  gamebox: (g, _f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 34, 0.14);
    prism(g, R(X + 0.12, Y + 0.3, 0.76, 0.5), 0, 12, 0xd9d4ce);
    const s = R(X + 0.16, Y + 0.48, 0.68, 0.08);
    prism(g, s, 12, 32, DARK);
    faceQuad(g, s, 'L', 0.07, 0.93, 14, 30, 0x7b4fd0);
    faceQuad(g, s, 'L', 0.2, 0.5, 20, 27, 0xf2c14e, 0.8);
    prism(g, R(X + 0.2, Y + 0.32, 0.22, 0.12), 12, 14.5, 0x111111);
  },
  guitar: (g, _f, X, Y) => {
    const c = P(X + 0.5, Y + 0.55);
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(c.x, c.y, 18, 8);
    g.lineStyle(3, 0x4a2c1a, 1);
    g.lineBetween(c.x, c.y - 22, c.x + 4, c.y - 44);
    g.fillStyle(0x2b1a10, 1);
    g.fillRect(c.x + 2.5, c.y - 48, 4, 6);
    g.fillStyle(0xb5651d, 1);
    g.fillEllipse(c.x, c.y - 9, 15, 13);
    g.fillEllipse(c.x + 0.5, c.y - 19, 11, 9);
    g.fillStyle(0x2b1a10, 1);
    g.fillCircle(c.x + 0.3, c.y - 14, 2.4);
    g.lineStyle(0.6, 0xf3e3c3, 0.8);
    g.lineBetween(c.x, c.y - 6, c.x + 4, c.y - 44);
  },
  easel: (g, _f, X, Y) => {
    const c = P(X + 0.5, Y + 0.5);
    g.lineStyle(2, WOOD_DARK, 1);
    g.lineBetween(c.x, c.y - 46, c.x - 10, c.y + 2);
    g.lineBetween(c.x, c.y - 46, c.x + 10, c.y + 2);
    g.lineBetween(c.x, c.y - 44, c.x + 1, c.y - 4);
    const r = R(X + 0.18, Y + 0.56, 0.64, 0.04);
    faceQuad(g, r, 'L', 0, 1, 14, 42, 0xfaf7f0);
    g.lineStyle(1, 0xbca98a, 1);
    g.strokePoints([facePoint(r, 'L', 0, 14), facePoint(r, 'L', 1, 14), facePoint(r, 'L', 1, 42), facePoint(r, 'L', 0, 42)], true);
    for (const [u, z, col] of [[0.3, 32, 0xe76f51], [0.6, 26, 0x4f8fd9], [0.45, 20, 0xf2c14e], [0.72, 35, 0x52b788]] as const) {
      const p = facePoint(r, 'L', u, z);
      g.fillStyle(col, 0.9);
      g.fillCircle(p.x, p.y, 3.2);
    }
    const t = facePoint(r, 'L', 0.5, 13);
    g.lineStyle(2.5, WOOD, 1);
    g.lineBetween(t.x - 13, t.y + 6, t.x + 13, t.y - 6);
  },
  treadmill: (g, _f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 40, 0.14);
    prism(g, R(X + 0.12, Y + 0.06, 0.76, 0.88), 0, 7, 0x3a3f4a);
    flat(g, R(X + 0.2, Y + 0.18, 0.6, 0.72), 7.2, 0x1d2026);
    poleAt(g, X + 0.18, Y + 0.12, 7, 34, 0x8a93a3, 2.5);
    poleAt(g, X + 0.82, Y + 0.12, 7, 34, 0x8a93a3, 2.5);
    prism(g, R(X + 0.14, Y + 0.06, 0.72, 0.12), 31, 37, 0x555c6b);
    flat(g, R(X + 0.4, Y + 0.08, 0.2, 0.08), 37.3, 0x3ee6c1);
  },
  chess: (g, _f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 30, 0.14);
    prism(g, R(X + 0.44, Y + 0.44, 0.12, 0.12), 0, 13, WOOD_DARK);
    prism(g, R(X + 0.14, Y + 0.14, 0.72, 0.72), 13, 16, WOOD);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) flat(g, R(X + 0.2 + i * 0.15, Y + 0.2 + j * 0.15, 0.15, 0.15), 16.2, (i + j) % 2 ? 0x3b2a1e : 0xf1e3c6);
    for (const [px, py, col] of [[0.27, 0.27, 0xffffff], [0.57, 0.27, 0xffffff], [0.42, 0.72, 0x111111], [0.72, 0.57, 0x111111]] as const) {
      const p = P(X + px, Y + py, 16);
      g.fillStyle(col, 1);
      g.fillEllipse(p.x, p.y - 2, 4, 5);
      g.fillCircle(p.x, p.y - 5, 1.7);
    }
  },
  mirror: (g, _f, X, Y) => {
    const r = R(X + 0.12, Y + 0.44, 0.76, 0.1);
    shadowUnder(g, X + 0.5, Y + 0.5, 30, 0.1);
    prism(g, r, 0, 46, 0xc9a227);
    faceQuad(g, r, 'L', 0.08, 0.92, 4, 42, 0xcfe6f2);
    faceQuad(g, r, 'L', 0.25, 0.38, 10, 38, 0xffffff, 0.45);
  },
  toybox: (g, _f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 30, 0.14);
    prism(g, R(X + 0.16, Y + 0.2, 0.68, 0.6), 0, 12, 0xe76f51, { top: 0xf4a261 });
    const t = P(X + 0.42, Y + 0.45, 12);
    g.fillStyle(0x9c6b3f, 1);
    g.fillEllipse(t.x, t.y - 5, 10, 11);
    g.fillCircle(t.x, t.y - 13, 4.5);
    g.fillCircle(t.x - 3.5, t.y - 17, 1.8);
    g.fillCircle(t.x + 3.5, t.y - 17, 1.8);
    g.fillStyle(0x111111, 1);
    g.fillCircle(t.x - 1.4, t.y - 13.5, 0.7);
    g.fillCircle(t.x + 1.4, t.y - 13.5, 0.7);
    const b = P(X + 0.68, Y + 0.62, 12);
    g.fillStyle(0x4f8fd9, 1);
    g.fillCircle(b.x, b.y - 3, 3.5);
  },
  pilates_mat: (g, _f, X, Y, o) => {
    const c = OBJECTS[o.def].color;
    flat(g, R(X + 0.18, Y + 0.06, 0.64, 0.88), 0.5, c);
    flat(g, R(X + 0.24, Y + 0.12, 0.52, 0.76), 0.6, shade(c, 1.12));
    prism(g, R(X + 0.18, Y + 0.04, 0.64, 0.1), 0, 4, shade(c, 0.85));
  },
  reformer: (g, _f, X, Y) => {
    shadowUnder(g, X + 1, Y + 0.5, 64, 0.12);
    prism(g, R(X + 0.06, Y + 0.28, 1.88, 0.44), 0, 7, 0xcfc8bc);
    flat(g, R(X + 0.12, Y + 0.33, 1.76, 0.34), 7.2, 0xb8b0a2);
    prism(g, R(X + 0.55, Y + 0.32, 0.75, 0.36), 7, 11, 0x4b4f63);
    prism(g, R(X + 0.45, Y + 0.36, 0.12, 0.28), 11, 13.5, 0x4b4f63);
    for (const py of [0.32, 0.68]) poleAt(g, X + 1.82, Y + py, 7, 22, 0x8a93a3, 2);
    const a = P(X + 1.82, Y + 0.32, 22), b = P(X + 1.82, Y + 0.68, 22);
    g.lineStyle(2.5, 0x8a93a3, 1);
    g.lineBetween(a.x, a.y, b.x, b.y);
  },
  desk: (g, _f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 40, 0.14);
    prism(g, R(X + 0.06, Y + 0.12, 0.88, 0.76), 0, 24, WOOD, { top: 0xe8d8c0 });
    const p = P(X + 0.3, Y + 0.35, 24);
    g.fillStyle(0xc0663e, 1);
    g.fillRect(p.x - 3, p.y - 5, 6, 5);
    g.fillStyle(0x4f9a42, 1);
    g.fillEllipse(p.x - 2, p.y - 9, 5, 8);
    g.fillEllipse(p.x + 2, p.y - 9, 5, 8);
  },
  plant: (g, _f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 22, 0.16);
    prism(g, R(X + 0.36, Y + 0.36, 0.28, 0.28), 0, 10, 0xc0663e, { top: 0x5a3c26 });
    const c = P(X + 0.5, Y + 0.5, 10);
    const leaf = (dx: number, dy: number, w: number, h: number, col: number) => {
      g.fillStyle(col, 1);
      g.fillEllipse(c.x + dx, c.y + dy, w, h);
    };
    leaf(-7, -6, 12, 7, 0x3f7a35);
    leaf(7, -6, 12, 7, 0x3f7a35);
    leaf(-4, -12, 8, 14, 0x4f9a42);
    leaf(4, -12, 8, 14, 0x4f9a42);
    leaf(0, -17, 7, 15, 0x67b356);
  },
  lamp: (g, _f, X, Y) => {
    const c = P(X + 0.5, Y + 0.5);
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(c.x, c.y, 16, 7);
    g.fillStyle(0x3a3a3a, 1);
    g.fillEllipse(c.x, c.y - 1, 10, 4.5);
    g.lineStyle(2, 0x3a3a3a, 1);
    g.lineBetween(c.x, c.y - 1, c.x, c.y - 36);
    g.fillStyle(0xf3d36b, 1);
    g.fillPoints([{ x: c.x - 9, y: c.y - 33 }, { x: c.x + 9, y: c.y - 33 }, { x: c.x + 5, y: c.y - 46 }, { x: c.x - 5, y: c.y - 46 }], true);
    g.fillStyle(0xfff3c4, 1);
    g.fillEllipse(c.x, c.y - 33, 18, 4);
  },
  rug: (g, _f, X, Y, o) => {
    const c = OBJECTS[o.def].color;
    flat(g, R(X + 0.04, Y + 0.04, 0.92, 0.92), 0.3, c);
    flat(g, R(X + 0.16, Y + 0.16, 0.68, 0.68), 0.4, 0xf2d06b);
    flat(g, R(X + 0.22, Y + 0.22, 0.56, 0.56), 0.5, shade(c, 1.15));
    flat(g, R(X + 0.4, Y + 0.4, 0.2, 0.2), 0.6, 0xf2d06b);
  },
  slippers: (g, _f, X, Y) => {
    const c = P(X + 0.5, Y + 0.5);
    for (const [dx, dy] of [[-4, 0], [4, 2]]) {
      g.fillStyle(0x5577aa, 1);
      g.fillEllipse(c.x + dx, c.y + dy, 9, 5);
      g.fillStyle(0x9fb7dd, 1);
      g.fillEllipse(c.x + dx + 1, c.y + dy - 0.5, 5, 2.5);
    }
  },
  puddle: (g, _f, X, Y) => {
    const c = P(X + 0.5, Y + 0.5);
    g.fillStyle(0xe8d55a, 0.75);
    g.fillEllipse(c.x, c.y, 34, 14);
    g.fillStyle(0xfff7b0, 0.6);
    g.fillEllipse(c.x - 6, c.y - 2, 10, 3);
  },
  bowl: (g, _f, X, Y, o) => {
    const c = P(X + 0.5, Y + 0.5);
    g.fillStyle(0x000000, 0.16);
    g.fillEllipse(c.x, c.y + 1, 22, 9);
    g.fillStyle(0xb83d3a, 1);
    g.fillEllipse(c.x, c.y - 1, 18, 8);
    g.fillStyle(0xd9534f, 1);
    g.fillEllipse(c.x, c.y - 3, 17, 7);
    g.fillStyle((o.stock ?? 0) > 0 ? 0x8b5a2b : 0x7a2e2c, 1);
    g.fillEllipse(c.x, c.y - 3, 12, 4);
  },
  dogbed: (g, _f, X, Y) => {
    const c = P(X + 0.5, Y + 0.5);
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(c.x, c.y + 1, 34, 15);
    g.fillStyle(0xa9824f, 1);
    g.fillEllipse(c.x, c.y - 2, 32, 15);
    g.fillStyle(0xf2e1c0, 1);
    g.fillEllipse(c.x + 1, c.y - 2, 22, 9);
  },
  ball: (g, _f, X, Y) => {
    const c = P(X + 0.5, Y + 0.5);
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(c.x, c.y, 10, 4);
    g.fillStyle(0xd4e157, 1);
    g.fillCircle(c.x, c.y - 4.5, 4.5);
    g.lineStyle(1, 0xffffff, 0.9);
    g.beginPath();
    g.arc(c.x - 4, c.y - 4.5, 4.5, -0.9, 0.9);
    g.strokePath();
  },
  tree: (g, _f, X, Y) => {
    const c = P(X + 0.5, Y + 0.5);
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(c.x, c.y + 1, 46, 18);
    prism(g, R(X + 0.44, Y + 0.44, 0.12, 0.12), 0, 24, 0x7a5230);
    const blob = (dx: number, dy: number, r: number, col: number) => {
      g.fillStyle(col, 1);
      g.fillCircle(c.x + dx, c.y + dy, r);
    };
    blob(0, -34, 17, 0x3f7a35);
    blob(-9, -40, 12, 0x4a8d3e);
    blob(9, -38, 12, 0x4a8d3e);
    blob(-2, -47, 11, 0x5aa34a);
    blob(-6, -44, 5, 0x7cc265);
    blob(5, -50, 4, 0x8fd174);
  },
  litterbox: (g, _f, X, Y, o) => {
    const r = R(X + 0.12, Y + 0.12, 0.76, 0.76);
    shadowUnder(g, X + 0.5, Y + 0.5, 32, 0.14);
    prism(g, r, 0, 8, 0x6c9bb5);
    flat(g, R(X + 0.2, Y + 0.2, 0.6, 0.6), 8.2, 0xe8d6a8);
    if ((o.dirt ?? 0) >= 2) {
      for (const [px, py] of [[0.35, 0.4], [0.6, 0.55], [0.45, 0.68]]) {
        const p = P(X + px, Y + py, 8.5);
        g.fillStyle(0x7a5230, 1);
        g.fillEllipse(p.x, p.y, 4, 2.5);
      }
    }
  },
  scratcher: (g, _f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 30, 0.16);
    prism(g, R(X + 0.15, Y + 0.15, 0.7, 0.7), 0, 5, 0xb0a090);
    const post = R(X + 0.4, Y + 0.4, 0.2, 0.2);
    prism(g, post, 5, 40, 0xd8c39a);
    for (let z = 8; z < 40; z += 6) {
      faceQuad(g, post, 'L', 0, 1, z, z + 2, 0xb8a072);
      faceQuad(g, post, 'R', 0, 1, z, z + 2, 0x9c8760);
    }
    prism(g, R(X + 0.2, Y + 0.2, 0.6, 0.6), 40, 44, 0x9c6b3f);
    const a = P(X + 0.76, Y + 0.76, 40);
    g.lineStyle(1, 0x555555, 1);
    g.lineBetween(a.x, a.y, a.x, a.y + 12);
    g.fillStyle(0xe74c3c, 1);
    g.fillCircle(a.x, a.y + 14, 2.5);
  },
  cage: (g, f, X, Y) => {
    const r = R(X + 0.05, Y + 0.05, 1.9, 0.9);
    shadowUnder(g, X + 1, Y + 0.5, 70, 0.12);
    prism(g, r, 0, 7, 0x4a90d9);
    flat(g, R(X + 0.12, Y + 0.12, 1.76, 0.76), 7.2, 0xe9d8a6);
    prism(g, R(X + 1.35, Y + 0.25, 0.45, 0.5), 7, 16, 0xd98c4a, { top: 0xb5653a });
    bars(g, r, 7, 24, 0xdde3ea, 'back');
    bars(f, r, 7, 24, 0xdde3ea, 'front');
  },
  hammock: (g, _f, X, Y, o) => {
    const c = OBJECTS[o.def].color;
    const p1 = P(X + 0.15, Y + 0.5), p2 = P(X + 0.85, Y + 0.5);
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, 40, 14);
    g.lineStyle(3, 0x6b4a2b, 1);
    g.lineBetween(p1.x, p1.y, p1.x, p1.y - 28);
    g.lineBetween(p2.x, p2.y, p2.x, p2.y - 28);
    g.fillStyle(c, 1);
    g.beginPath();
    g.moveTo(p1.x, p1.y - 26);
    g.lineTo(p2.x, p2.y - 26);
    g.lineTo((p1.x + p2.x) / 2 + 4, (p1.y + p2.y) / 2 - 12);
    g.lineTo((p1.x + p2.x) / 2 - 4, (p1.y + p2.y) / 2 - 12);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, shade(c, 1.3), 0.8);
    g.lineBetween(p1.x + 4, p1.y - 22, p2.x - 4, p2.y - 22);
  },
  pond: (g, _f, X, Y) => {
    const pts = [P(X + 0.12, Y + 0.12), P(X + 1.88, Y + 0.12), P(X + 1.88, Y + 1.88), P(X + 0.12, Y + 1.88)];
    g.fillStyle(0x8a7a5a, 1);
    g.fillPoints(pts.map((p) => ({ x: p.x, y: p.y + 3 })), true);
    g.fillStyle(0x3d8fcf, 1);
    g.fillPoints(pts, true);
    const inner = [P(X + 0.3, Y + 0.3), P(X + 1.7, Y + 0.3), P(X + 1.7, Y + 1.7), P(X + 0.3, Y + 1.7)];
    g.fillStyle(0x56a8e0, 1);
    g.fillPoints(inner, true);
    const c = P(X + 1, Y + 1);
    g.fillStyle(0xffffff, 0.3);
    g.fillEllipse(c.x - 10, c.y - 4, 24, 6);
    g.fillEllipse(c.x + 14, c.y + 6, 14, 4);
    g.fillStyle(0x4f9a42, 1);
    g.fillEllipse(c.x + 12, c.y - 8, 12, 5);
    g.fillStyle(0xf28db2, 1);
    g.fillCircle(c.x + 13, c.y - 10, 2);
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      const e = i < 6 ? P(X + 0.12 + 1.76 * (t * 2), Y + 1.92) : P(X + 1.92, Y + 0.12 + 1.76 * ((t - 0.5) * 2));
      g.fillStyle(i % 2 ? 0x9aa0a6 : 0xb7bcc1, 1);
      g.fillEllipse(e.x, e.y, 9, 5);
    }
  },
  strawbed: (g, _f, X, Y) => {
    const c = P(X + 0.5, Y + 0.5);
    g.fillStyle(0xd9b54f, 1);
    g.fillEllipse(c.x, c.y, 38, 17);
    g.fillStyle(0xeccb6b, 1);
    g.fillEllipse(c.x, c.y - 1, 30, 12);
    g.lineStyle(1, 0xb8932f, 0.9);
    for (let i = -3; i <= 3; i++) g.lineBetween(c.x + i * 4, c.y - 3, c.x + i * 4 + 3, c.y + 2);
  },
  grave: (g, _f, X, Y) => {
    const c = P(X + 0.5, Y + 0.5);
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(c.x, c.y, 26, 10);
    const r = R(X + 0.32, Y + 0.42, 0.36, 0.14);
    prism(g, r, 0, 16, 0x9aa0a6);
    const top = facePoint(r, 'L', 0.5, 16);
    g.fillStyle(0xa9afb5, 1);
    g.fillEllipse(top.x + 2, top.y - 1, 15, 8);
    const m = facePoint(r, 'L', 0.5, 9);
    g.lineStyle(1.5, 0x5d6268, 1);
    g.lineBetween(m.x, m.y - 4, m.x, m.y + 4);
    g.lineBetween(m.x - 3, m.y - 1.5, m.x + 3, m.y - 1.5);
    for (const [dx, col] of [[-9, 0xf28db2], [-6, 0xffffff], [9, 0xf7d84a]] as const) {
      g.fillStyle(col, 1);
      g.fillCircle(c.x + dx, c.y + 3, 1.8);
    }
  },
  bench: (g, _f, X, Y, o) => {
    const c = OBJECTS[o.def].color;
    shadowUnder(g, X + 0.5, Y + 0.5, 34, 0.14);
    for (const px of [0.15, 0.85]) {
      poleAt(g, X + px, Y + 0.35, 0, 12, 0x3a3a3a, 2);
      poleAt(g, X + px, Y + 0.68, 0, 12, 0x3a3a3a, 2);
      poleAt(g, X + px, Y + 0.3, 12, 26, 0x3a3a3a, 2);
    }
    for (let i = 0; i < 3; i++) prism(g, R(X + 0.08, Y + 0.32 + i * 0.13, 0.84, 0.1), 11, 13, c);
    for (let i = 0; i < 2; i++) prism(g, R(X + 0.08, Y + 0.24, 0.84, 0.06), 16 + i * 6, 19.5 + i * 6, c);
  },
  swings: (g, _f, X, Y, o) => {
    const d = OBJECTS[o.def];
    const a1 = P(X + 0.1, Y + 0.5), a2 = P(X + 1.9, Y + 0.5);
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse((a1.x + a2.x) / 2, (a1.y + a2.y) / 2, 70, 22);
    g.lineStyle(4, d.color, 1);
    for (const a of [a1, a2]) {
      g.lineBetween(a.x - 7, a.y + 2, a.x, a.y - d.height);
      g.lineBetween(a.x + 7, a.y - 1, a.x, a.y - d.height);
    }
    g.lineBetween(a1.x, a1.y - d.height, a2.x, a2.y - d.height);
    for (const fr of [0.33, 0.67]) {
      const top = { x: a1.x + (a2.x - a1.x) * fr, y: a1.y + (a2.y - a1.y) * fr - d.height };
      g.lineStyle(1.2, 0x555555, 1);
      g.lineBetween(top.x - 4, top.y, top.x - 4, top.y + d.height - 12);
      g.lineBetween(top.x + 4, top.y, top.x + 4, top.y + d.height - 12);
      g.fillStyle(0x2c2c2c, 1);
      g.fillRect(top.x - 6, top.y + d.height - 13, 12, 3);
    }
  },
  foodcart: (g, _f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 40, 0.16);
    const r = R(X + 0.1, Y + 0.22, 0.8, 0.56);
    prism(g, r, 5, 26, 0xe74c3c, { top: 0xf3ece0 });
    faceQuad(g, r, 'L', 0, 1, 14, 18, 0xffffff);
    for (const u of [0.2, 0.8]) {
      const w = facePoint(r, 'L', u, 4);
      g.fillStyle(0x222222, 1);
      g.fillCircle(w.x, w.y, 4);
      g.fillStyle(0x888888, 1);
      g.fillCircle(w.x, w.y, 1.5);
    }
    const hd = P(X + 0.5, Y + 0.5, 26);
    g.fillStyle(0xe2b06a, 1);
    g.fillEllipse(hd.x, hd.y - 2, 14, 5);
    g.fillStyle(0xb5462d, 1);
    g.fillEllipse(hd.x, hd.y - 3.5, 15, 3);
    for (const [px, py] of [[0.14, 0.26], [0.86, 0.26], [0.14, 0.74], [0.86, 0.74]]) poleAt(g, X + px, Y + py, 26, 42, 0xdddddd, 1.5);
    for (let i = 0; i < 6; i++) flat(g, R(X + 0.04 + i * 0.153, Y + 0.16, 0.153, 0.68), 42, i % 2 ? 0xffffff : 0xe74c3c);
  },
  // --- Mercadona ---
  super_fridge: (g, _f, X, Y) => {
    const r = R(X + 0.05, Y + 0.12, 1.9, 0.72);
    shadowUnder(g, X + 1, Y + 0.5, 60, 0.12);
    prism(g, r, 0, 46, 0xe8eef1, { top: 0xd4dde3 });
    const prods = [0xffffff, 0xf2c14e, 0x4f8fd9, 0xe76f51, 0xfaf3e6, 0x52b788];
    for (const [z0, z1] of [[6, 16], [19, 29], [32, 41]]) {
      faceQuad(g, r, 'L', 0.03, 0.97, z0 - 2, z1 + 1, 0xcfd8de);
      for (let i = 0; i < 9; i++) faceQuad(g, r, 'L', 0.05 + i * 0.1, 0.13 + i * 0.1, z0, z1 - ((i * 3) % 4), prods[(i + z0) % prods.length]);
    }
    faceQuad(g, r, 'L', 0, 1, 2, 44, 0xbfe6f5, 0.22);
    faceQuad(g, r, 'L', 0, 1, 44, 46, 0x6fb6e8);
  },
  super_shelf: (g, _f, X, Y) => {
    const r = R(X + 0.05, Y + 0.25, 2.9, 0.5);
    shadowUnder(g, X + 1.5, Y + 0.5, 90, 0.1);
    prism(g, r, 0, 34, 0xc7cfd6, { top: 0xb0b9c1 });
    const cols = [0xd9534f, 0xf2c14e, 0x52b788, 0x4f8fd9, 0xe76f51, 0x9b5de5, 0xffffff, 0x8b5a2b];
    let k = 1;
    for (const z of [3, 13, 23]) {
      faceQuad(g, r, 'L', 0.01, 0.99, z - 1, z, 0x8a939b);
      let u = 0.02;
      while (u < 0.96) {
        const w = 0.035 + ((k * 7) % 4) * 0.008;
        faceQuad(g, r, 'L', u, Math.min(0.98, u + w), z, z + 6 + ((k * 5) % 3), cols[k % cols.length]);
        u += w + 0.006;
        k++;
      }
    }
    for (const z of [3, 13, 23]) {
      let u = 0.05;
      while (u < 0.95) {
        faceQuad(g, r, 'R', u, u + 0.2, z, z + 7, cols[(k++) % cols.length]);
        u += 0.25;
      }
    }
    // Cartel de oferta
    faceQuad(g, r, 'L', 0.42, 0.58, 30, 34, 0xf2c14e);
  },
  fruit_stand: (g, _f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 34, 0.14);
    prism(g, R(X + 0.1, Y + 0.12, 0.8, 0.76), 0, 14, 0x9c6b3f, { top: 0x7a5230 });
    const fruits: [number, number, number][] = [[0.3, 0.3, 0xf28c28], [0.5, 0.3, 0xf28c28], [0.7, 0.3, 0xf28c28], [0.3, 0.55, 0xd62828], [0.5, 0.55, 0xd62828], [0.7, 0.55, 0x8ac926], [0.35, 0.78, 0xffd23f], [0.6, 0.78, 0xffd23f]];
    for (const [fx, fy, col] of fruits) {
      const p = P(X + fx, Y + fy, 15);
      g.fillStyle(col, 1);
      g.fillCircle(p.x, p.y - 2, 3.2);
      g.fillStyle(0xffffff, 0.4);
      g.fillCircle(p.x - 1, p.y - 3, 1);
    }
  },
  checkout: (g, f, X, Y) => {
    const r = R(X + 0.06, Y + 0.28, 1.88, 0.44);
    shadowUnder(g, X + 1, Y + 0.5, 64, 0.12);
    // Cajera, detrás del mostrador
    const c = P(X + 1.45, Y + 0.18);
    g.fillStyle(0x2e8b57, 1);
    g.fillRoundedRect(c.x - 7, c.y - 30, 14, 18, 5);
    g.fillStyle(0xf1c27d, 1);
    g.fillCircle(c.x, c.y - 37, 7);
    g.fillStyle(0x3b2314, 1);
    g.slice(c.x, c.y - 38, 7.6, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(0x222222, 1);
    g.fillCircle(c.x + 3, c.y - 37.5, 1);
    prism(f, r, 0, 18, 0xdedede, { top: 0xc4c4c4 });
    flat(f, R(X + 0.1, Y + 0.34, 1.1, 0.32), 18.2, 0x2c2c2c);
    prism(f, R(X + 1.3, Y + 0.34, 0.3, 0.3), 18, 28, 0x3a3f4a);
    faceQuad(f, R(X + 1.3, Y + 0.34, 0.3, 0.3), 'L', 0.1, 0.9, 21, 27, 0x6fe0a0);
  },
  carts: (g, _f, X, Y) => {
    const base = P(X + 0.5, Y + 0.5);
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(base.x, base.y, 30, 12);
    for (let i = 0; i < 3; i++) {
      const ox = base.x - 6 + i * 5, oy = base.y - i * 2;
      g.lineStyle(1.4, 0x8a939b, 1);
      g.strokeRect(ox - 9, oy - 18, 16, 10);
      for (let j = 1; j < 4; j++) g.lineBetween(ox - 9 + j * 4, oy - 18, ox - 9 + j * 4, oy - 8);
      g.lineBetween(ox + 7, oy - 18, ox + 11, oy - 22);
      g.fillStyle(0x333333, 1);
      g.fillCircle(ox - 6, oy - 2, 1.6);
      g.fillCircle(ox + 4, oy - 2, 1.6);
      g.lineBetween(ox - 6, oy - 8, ox - 6, oy - 3);
      g.lineBetween(ox + 4, oy - 8, ox + 4, oy - 3);
    }
  },
  // --- Açaí ---
  acai_counter: (g, f, X, Y) => {
    const r = R(X + 0.05, Y + 0.3, 2.9, 0.6);
    shadowUnder(g, X + 1.5, Y + 0.6, 90, 0.12);
    // Dependiente con gorra morada, detrás de la barra
    const c = P(X + 1.1, Y + 0.12);
    g.fillStyle(0x7b4fd0, 1);
    g.fillRoundedRect(c.x - 7, c.y - 30, 14, 18, 5);
    g.fillStyle(0xd9a066, 1);
    g.fillCircle(c.x, c.y - 37, 7);
    g.fillStyle(0x5b2a86, 1);
    g.slice(c.x, c.y - 39, 7.6, Math.PI, 0, false);
    g.fillPath();
    g.fillRect(c.x - 2, c.y - 41, 11, 2.5);
    g.fillStyle(0x222222, 1);
    g.fillCircle(c.x - 3, c.y - 36.5, 1);
    g = f;
    prism(g, r, 0, 24, 0xf4f2ee, { top: 0xc9a27a });
    faceQuad(g, r, 'L', 0, 1, 6, 9, 0x7b4fd0);
    for (let i = 0; i < 4; i++) {
      const p = P(X + 0.45 + i * 0.6, Y + 0.45, 24);
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(p.x, p.y - 2, 13, 6);
      g.fillStyle(0x5b2a86, 1);
      g.fillEllipse(p.x, p.y - 3, 10, 4);
      for (const [dx, col] of [[-2.5, 0xffd23f], [1, 0xd62828], [3.5, 0xf2e1c0]] as const) {
        g.fillStyle(col, 1);
        g.fillCircle(p.x + dx, p.y - 3.5, 1.3);
      }
    }
    // Batidora
    const b = P(X + 2.6, Y + 0.3, 24);
    g.fillStyle(0x3a3f4a, 1);
    g.fillRect(b.x - 3, b.y - 4, 6, 4);
    g.fillStyle(0xd3c2ef, 0.85);
    g.fillRect(b.x - 2.5, b.y - 14, 5, 10);
  },
  cafe_table: (g, f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 34, 0.12);
    // Silla de atrás (detrás de la mesa) y silla de delante (en la capa de delante)
    const chair = (gg: G, cx: number, cy: number, back: 'n' | 's') => {
      prism(gg, R(cx - 0.14, cy - 0.14, 0.28, 0.28), 9, 12, 0xc9a27a, { top: 0xdcb88f });
      for (const [lx, ly] of [[-0.11, -0.11], [0.09, 0.09], [-0.11, 0.09], [0.09, -0.11]]) prism(gg, R(cx + lx, cy + ly, 0.03, 0.03), 0, 9, 0x8a939b);
      if (back === 'n') prism(gg, R(cx - 0.14, cy - 0.16, 0.28, 0.05), 12, 24, 0xc9a27a);
      else prism(gg, R(cx - 0.14, cy + 0.11, 0.28, 0.05), 12, 24, 0xc9a27a);
    };
    chair(g, X + 0.5, Y + 0.16, 'n');
    const p = P(X + 0.5, Y + 0.5);
    g.lineStyle(2, 0x8a939b, 1);
    g.lineBetween(p.x, p.y, p.x, p.y - 14);
    g.fillStyle(0xd9c3a5, 1);
    g.fillEllipse(p.x, p.y - 15, 26, 12);
    g.fillStyle(0xe8d6bd, 1);
    g.fillEllipse(p.x, p.y - 16, 24, 10);
    g.fillStyle(0x6b8e4e, 1);
    g.fillCircle(p.x, p.y - 19, 2.2);
    chair(f, X + 0.5, Y + 0.86, 's');
  },
  neon_sign: (g, _f, X, Y) => {
    const r = R(X + 0.1, Y + 0.42, 0.8, 0.12);
    shadowUnder(g, X + 0.5, Y + 0.5, 30, 0.1);
    prism(g, r, 0, 46, 0x2d2540);
    const c = facePoint(r, 'L', 0.5, 28);
    g.lineStyle(2.5, 0xff5dc8, 1);
    g.beginPath();
    g.arc(c.x, c.y, 8, 0, Math.PI, false);
    g.strokePath();
    g.lineBetween(c.x - 9, c.y, c.x + 9, c.y);
    g.lineStyle(2, 0x9b8cff, 1);
    for (const [dx, dy] of [[-4, -4], [0, -6], [4, -4]]) g.strokeCircle(c.x + dx, c.y + dy, 2);
    g.lineStyle(2, 0x5df2ff, 1);
    const t = facePoint(r, 'L', 0.5, 40);
    g.lineBetween(t.x - 10, t.y + 2, t.x + 10, t.y - 3);
  },
  // --- Metro ---
  metro_seat: (g, _f, X, Y) => {
    const r = R(X + 0.05, Y + 0.2, 1.9, 0.6);
    shadowUnder(g, X + 1, Y + 0.5, 60, 0.1);
    prism(g, R(X + 0.1, Y + 0.25, 1.8, 0.5), 0, 8, 0x9aa3ad);
    prism(g, r, 8, 13, 0x3d6db5, { top: 0x4f82cf });
    prism(g, R(X + 0.05, Y + 0.12, 1.9, 0.14), 13, 30, 0x355f9e);
    for (let i = 0; i < 6; i++) faceQuad(g, R(X + 0.05, Y + 0.12, 1.9, 0.14), 'L', i / 6 + 0.02, i / 6 + 0.1, 16, 28, 0xf2c14e, 0.5);
  },
  metro_pole: (g, _f, X, Y) => {
    const b = P(X + 0.5, Y + 0.5);
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(b.x, b.y, 12, 5);
    g.fillStyle(0xd0d4d8, 1);
    g.fillRect(b.x - 1.6, b.y - 62, 3.2, 62);
    g.fillStyle(0xffffff, 0.6);
    g.fillRect(b.x - 1, b.y - 62, 1, 62);
  },
  metro_sign: (g, _f, X, Y) => {
    const r = R(X + 0.15, Y + 0.05, 0.7, 0.1);
    prism(g, r, 10, 46, 0xffffff);
    // El plano: líneas de colores con estaciones
    const cols = [0x0074c8, 0xfdc300, 0x9b5de5, 0xe63946];
    cols.forEach((c, i) => faceQuad(g, r, 'L', 0.1, 0.9, 16 + i * 7, 18 + i * 7, c));
    faceQuad(g, r, 'L', 0.05, 0.95, 40, 45, 0xe63946);
  },
  // --- Plaza ---
  fountain: (g, _f, X, Y) => {
    shadowUnder(g, X + 1, Y + 1, 70, 0.12);
    prism(g, R(X + 0.05, Y + 0.05, 1.9, 1.9), 0, 8, 0xb8c2cc, { top: 0x6fb6e8 });
    flat(g, R(X + 0.2, Y + 0.2, 1.6, 1.6), 8.2, 0x7cc6f0);
    prism(g, R(X + 0.8, Y + 0.8, 0.4, 0.4), 8, 20, 0xb8c2cc);
    prism(g, R(X + 0.6, Y + 0.6, 0.8, 0.8), 20, 23, 0xc9d3dc, { top: 0x7cc6f0 });
    const t = P(X + 1, Y + 1, 30);
    g.fillStyle(0xbfe6ff, 0.85);
    for (const [dx, dy] of [[-6, 4], [6, 4], [0, -2], [-3, 8], [3, 8]]) g.fillCircle(t.x + dx, t.y + dy, 1.8);
  },
  churreria: (g, f, X, Y) => {
    const r = R(X + 0.08, Y + 0.25, 1.84, 0.6);
    shadowUnder(g, X + 1, Y + 0.6, 64, 0.12);
    // Churrero detrás
    const c = P(X + 1.1, Y + 0.12);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(c.x - 7, c.y - 30, 14, 18, 5);
    g.fillStyle(0xe0ac69, 1);
    g.fillCircle(c.x, c.y - 37, 7);
    g.fillStyle(0xffffff, 1);
    g.fillRect(c.x - 6, c.y - 47, 12, 6);
    prism(f, r, 0, 22, 0xf2e6c9, { top: 0xd9c3a5 });
    faceQuad(f, r, 'L', 0, 1, 22, 26, 0xd62828);
    for (let i = 0; i < 6; i++) faceQuad(f, r, 'L', i / 6, i / 6 + 0.08, 26, 36, i % 2 ? 0xffffff : 0xd62828);
    const p = P(X + 0.6, Y + 0.45, 22);
    f.fillStyle(0xc68642, 1);
    for (let i = 0; i < 4; i++) f.fillRoundedRect(p.x - 8 + i * 4, p.y - 3, 3, 8, 1.5);
    const cup = P(X + 1.5, Y + 0.45, 22);
    f.fillStyle(0xffffff, 1);
    f.fillRect(cup.x - 3, cup.y - 6, 6, 6);
    f.fillStyle(0x5a3825, 1);
    f.fillEllipse(cup.x, cup.y - 6, 6, 2);
  },
  // --- Bar ---
  bar_counter: (g, f, X, Y) => {
    const r = R(X + 0.05, Y + 0.3, 2.9, 0.6);
    shadowUnder(g, X + 1.5, Y + 0.6, 90, 0.12);
    // Paco, el del bar, con su delantal
    const c = P(X + 1.8, Y + 0.12);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(c.x - 7, c.y - 30, 14, 18, 5);
    g.fillStyle(0x2b2d42, 1);
    g.fillRect(c.x - 6, c.y - 24, 12, 12);
    g.fillStyle(0xd9a066, 1);
    g.fillCircle(c.x, c.y - 37, 7);
    g.fillStyle(0x222222, 1);
    g.fillRect(c.x - 4, c.y - 34.5, 8, 2);
    // Botellas en la pared
    for (let i = 0; i < 7; i++) {
      const b = P(X + 0.3 + i * 0.38, Y + 0.08, 30);
      g.fillStyle([0x2d6a4f, 0x8b2e3c, 0xc9a227, 0x3a4a7a][i % 4], 1);
      g.fillRect(b.x - 2, b.y - 10, 4, 10);
      g.fillRect(b.x - 1, b.y - 13, 2, 3);
    }
    prism(f, r, 0, 24, 0x8b5a2b, { top: 0xb8875a });
    faceQuad(f, r, 'L', 0, 1, 3, 7, 0x5a3a1c);
    // Grifo de cerveza y unas cañas
    const t = P(X + 0.6, Y + 0.55, 24);
    f.fillStyle(0xd0d4d8, 1);
    f.fillRect(t.x - 1.5, t.y - 14, 3, 14);
    f.fillStyle(0xe63946, 1);
    f.fillCircle(t.x, t.y - 15, 3);
    for (const dx of [0.95, 1.25, 2.3]) {
      const q = P(X + dx, Y + 0.6, 24);
      f.fillStyle(0xf2b134, 0.95);
      f.fillRect(q.x - 2.5, q.y - 8, 5, 8);
      f.fillStyle(0xffffff, 1);
      f.fillRect(q.x - 2.5, q.y - 9.5, 5, 2);
    }
    // Plato de bravas
    const pl = P(X + 1.8, Y + 0.6, 24);
    f.fillStyle(0xffffff, 1);
    f.fillEllipse(pl.x, pl.y - 1, 12, 5);
    f.fillStyle(0xe76f51, 1);
    for (const dx of [-3, 0, 3]) f.fillRect(pl.x + dx - 1.5, pl.y - 3, 3, 3);
  },
  slot_machine: (g, _f, X, Y) => {
    const r = R(X + 0.15, Y + 0.2, 0.7, 0.55);
    shadowUnder(g, X + 0.5, Y + 0.5, 30, 0.14);
    prism(g, r, 0, 44, 0x2b2d42, { top: 0x3a3f55 });
    faceQuad(g, r, 'L', 0.1, 0.9, 26, 38, 0xf2c14e);
    for (let i = 0; i < 3; i++) faceQuad(g, r, 'L', 0.15 + i * 0.25, 0.35 + i * 0.25, 28, 36, 0xffffff);
    faceQuad(g, r, 'L', 0.15, 0.85, 12, 18, 0xe63946);
    faceQuad(g, r, 'L', 0.1, 0.9, 40, 44, 0x9b5de5);
  },
  bar_tv: (g, _f, X, Y) => {
    const r = R(X + 0.1, Y + 0.4, 0.8, 0.2);
    prism(g, R(X + 0.45, Y + 0.45, 0.1, 0.1), 0, 30, 0x555555);
    prism(g, r, 30, 50, 0x222222);
    faceQuad(g, r, 'L', 0.06, 0.94, 32, 48, 0x2d6a4f);
    faceQuad(g, r, 'L', 0.48, 0.52, 32, 48, 0xffffff, 0.8);
  },
  mus_table: (g, _f, X, Y) => {
    shadowUnder(g, X + 0.5, Y + 0.5, 34, 0.12);
    prism(g, R(X + 0.45, Y + 0.45, 0.1, 0.1), 0, 14, 0x5a3a1c);
    prism(g, R(X + 0.08, Y + 0.08, 0.84, 0.84), 14, 16, 0x6b4a2c, { top: 0x2d6a4f });
    for (const [cx, cy] of [[0.35, 0.4], [0.6, 0.55], [0.45, 0.65]]) flat(g, R(X + cx, Y + cy, 0.12, 0.16), 16.2, 0xffffff);
  },
  flowers: (g, _f, X, Y) => {
    const c = P(X + 0.5, Y + 0.5);
    const h = hash(`${X},${Y}`);
    const cols = [0xf28db2, 0xf7d84a, 0x9b5de5, 0xe74c3c, 0xffffff];
    for (let i = 0; i < 7; i++) {
      const dx = (((h >>> (i * 3)) % 22) - 11), dy = (((h >>> (i * 2)) % 10) - 5);
      g.lineStyle(1, 0x3f7a35, 1);
      g.lineBetween(c.x + dx, c.y + dy, c.x + dx, c.y + dy - 7);
      g.fillStyle(cols[(h + i) % cols.length], 1);
      g.fillCircle(c.x + dx, c.y + dy - 8, 2.3);
    }
  },
};

/** Dibuja un objeto. `f` recibe lo que va por delante de quien lo usa (manta, barrotes, agua...). */
export function drawObjectArt(g: G, f: G, o: ObjLike): boolean {
  const art = ART[o.def];
  if (!art) return false;
  withRotation(o, () => art(g, f, o.x, o.y, o));
  return true;
}

/** Objetos que se pintan bajo los personajes (a ras de suelo). */
export const GROUND_ART = new Set(['pond', 'rug', 'pilates_mat', 'puddle', 'strawbed']);


/** Brillo de pantalla (tele, consola, ordenador, equipo de música) cuando alguien la usa. */
export const SCREEN_GLOW: Record<string, (g: G, X: number, Y: number) => void> = {
  tv: (g, X, Y) => faceQuad(g, R(X + 0.12, Y + 0.44, 0.76, 0.1), 'L', 0.06, 0.94, 14.5, 35, 0xbfe6ff),
  gamebox: (g, X, Y) => faceQuad(g, R(X + 0.16, Y + 0.48, 0.68, 0.08), 'L', 0.07, 0.93, 14, 30, 0xe3c8ff),
  computer: (g, X, Y) => faceQuad(g, R(X + 0.3, Y + 0.26, 0.42, 0.08), 'L', 0.07, 0.93, 27.5, 38.5, 0xdff3ff),
  stereo: (g, X, Y) => faceQuad(g, R(X + 0.22, Y + 0.32, 0.56, 0.38), 'L', 0.32, 0.68, 16, 19.5, 0xb8fff0),
};
