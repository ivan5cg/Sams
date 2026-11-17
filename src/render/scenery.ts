// Lo que rodea a cada parcela: edificios (Madrid clásico o ladrillo de Alcorcón), árboles,
// farolas y coches aparcados. Es decorado: se dibuja una vez y se convierte en imagen fija.

import type Phaser from 'phaser';
import type { LotLayout } from '../data/lot';
import type { Lot } from '../sim/types';
import { P, faceQuad, flat, hash, prism } from './art';
import { shade } from './iso';

type G = Phaser.GameObjects.Graphics;
type Rect = { x: number; y: number; w: number; h: number };

const MADRID = [0xeadcc0, 0xe2c08f, 0xe9c9b5, 0xd8cfc0, 0xf0e2c8];
const BRICK = [0xa65a3a, 0xb56a43, 0x9c4f33, 0xc07a52];

/** Un edificio con ventanas en la cara que da a la parcela. */
function building(g: G, r: Rect, face: 'L' | 'R', height: number, seed: number, brick: boolean) {
  const col = brick ? BRICK[seed % BRICK.length] : MADRID[seed % MADRID.length];
  prism(g, r, 0, height, col, { top: brick ? 0x8a8f96 : 0xb5603f });
  const len = face === 'L' ? r.w : r.h;
  const cols = Math.max(2, Math.round(len * 1.6));
  // Bajo: portal o tienda con toldo
  faceQuad(g, r, face, 0, 1, 0, 6, shade(col, 0.75));
  for (let floor = 0; floor * 28 + 34 < height - 8; floor++) {
    const z0 = 26 + floor * 28;
    for (let c = 0; c < cols; c++) {
      const u0 = (c + 0.22) / cols, u1 = (c + 0.78) / cols;
      const lit = hash(`${seed}:${floor}:${c}`) % 5 === 0;
      faceQuad(g, r, face, u0 - 0.02, u1 + 0.02, z0 - 1, z0 + 17, 0xffffff, brick ? 0.5 : 0.85);
      faceQuad(g, r, face, u0, u1, z0, z0 + 16, lit ? 0x6a7a8c : 0x3b4656);
      if (brick) {
        // Toldo verde (o naranja) a media altura de algunas ventanas
        if ((seed + floor + c) % 3 === 0) faceQuad(g, r, face, u0 - 0.02, u1 + 0.02, z0 + 13, z0 + 18, (seed + c) % 2 ? 0x2d6a4f : 0xd9822b);
      } else {
        // Balcón de forja
        faceQuad(g, r, face, u0 - 0.04, u1 + 0.04, z0 - 2, z0 + 4, 0x2b2d35, 0.85);
      }
    }
    // Tendedero con ropa de colores
    if (brick && (seed + floor) % 4 === 1) {
      for (let k = 0; k < 6; k++) faceQuad(g, r, face, 0.15 + k * 0.1, 0.2 + k * 0.1, z0 + 2, z0 + 7, [0xe63946, 0xffffff, 0x4f8fd9, 0xf2c14e][k % 4]);
    }
  }
  // Portal
  if (seed % 2 === 0) faceQuad(g, r, face, 0.42, 0.58, 0, 18, 0x5a3a1c);
  else faceQuad(g, r, face, 0.1, 0.9, 12, 16, brick ? 0x2d6a4f : 0x8b2e3c);
}

function tree(g: G, x: number, y: number, seed: number, autumn: boolean) {
  const b = P(x, y);
  g.fillStyle(0x000000, 0.14);
  g.fillEllipse(b.x, b.y, 26, 11);
  g.fillStyle(0x6b4a2c, 1);
  g.fillRect(b.x - 2.5, b.y - 24, 5, 24);
  const leaves = autumn ? [0xd9822b, 0xc9a227, 0xb5653a] : [0x4f8a3a, 0x5b9a45, 0x3f7a30];
  const c = leaves[seed % 3];
  g.fillStyle(shade(c, 0.85), 1);
  g.fillCircle(b.x - 6, b.y - 30, 11);
  g.fillCircle(b.x + 7, b.y - 31, 10);
  g.fillStyle(c, 1);
  g.fillCircle(b.x, b.y - 38, 13);
  g.fillStyle(shade(c, 1.15), 1);
  g.fillCircle(b.x - 3, b.y - 42, 5);
}

function car(g: G, x: number, y: number, seed: number) {
  const col = [0xe63946, 0x3d6db5, 0xf2f2f2, 0x2b2d35, 0xf2c14e, 0x52b788][seed % 6];
  const r = { x, y, w: 1.7, h: 0.8 };
  g.fillStyle(0x000000, 0.2);
  const s = P(x + 0.85, y + 0.45);
  g.fillEllipse(s.x, s.y, 56, 18);
  prism(g, r, 2, 11, col, { top: shade(col, 1.1) });
  prism(g, { x: x + 0.4, y: y + 0.1, w: 0.9, h: 0.6 }, 11, 18, shade(col, 0.95), { top: shade(col, 1.15) });
  faceQuad(g, { x: x + 0.4, y: y + 0.1, w: 0.9, h: 0.6 }, 'L', 0.08, 0.92, 12, 17, 0x9fc3dd);
  for (const u of [0.18, 0.82]) {
    const w = P(x + 1.7 * u, y + 0.8, 2);
    g.fillStyle(0x222222, 1);
    g.fillCircle(w.x, w.y, 3.5);
  }
}

/** Farola: el poste va en el decorado; la luz, en `glow` (se enciende de noche). */
function lamp(g: G, glow: G, x: number, y: number) {
  const b = P(x, y);
  g.fillStyle(0x000000, 0.15);
  g.fillEllipse(b.x, b.y, 10, 4);
  g.fillStyle(0x2b2d35, 1);
  g.fillRect(b.x - 1.5, b.y - 58, 3, 58);
  g.fillRect(b.x - 1.5, b.y - 58, 10, 2.5);
  g.fillStyle(0x3a3f4a, 1);
  g.fillTriangle(b.x + 4, b.y - 57, b.x + 12, b.y - 57, b.x + 8, b.y - 62);
  g.fillStyle(0xffe9a8, 1);
  g.fillCircle(b.x + 8, b.y - 54, 2.4);
  for (const [r, a] of [[30, 0.07], [18, 0.12], [9, 0.25]] as const) {
    glow.fillStyle(0xffd27a, a);
    glow.fillCircle(b.x + 8, b.y - 54, r);
  }
  glow.fillStyle(0xffd27a, 0.12);
  glow.fillEllipse(b.x + 8, b.y, 70, 26);
}

/** Decorado alrededor de la parcela. */
export function drawSurroundings(g: G, glow: G, lot: Lot, lay: LotLayout, season: string) {
  const { w, h } = lay;
  const seed = hash(lot.id);
  const autumn = season === 'otono';
  if (lot.layout === 'metro') {
    // Estación: andén oscuro, pared de azulejos y el cartel
    flat(g, { x: -6, y: -6, w: w + 12, h: h + 12 }, 0, 0x3a3f4a);
    const wall = { x: -2, y: -1.2, w: w + 4, h: 0.6 };
    prism(g, wall, 0, 120, 0xe8e8e4, { top: 0x2b2d35 });
    for (let i = 0; i < 8; i++) faceQuad(g, wall, 'L', 0, 1, 10 + i * 12, 11 + i * 12, 0xd0d0cc);
    faceQuad(g, wall, 'L', 0.3, 0.7, 70, 92, 0x0074c8);
    faceQuad(g, wall, 'L', 0.32, 0.68, 74, 88, 0xffffff);
    return;
  }
  const brick = lot.district === 'alcorcon' || lot.district === 'getafe';
  const park = lot.layout === 'park' || lot.layout === 'plaza' || lot.layout === 'market' || lot.layout === 'padel';
  const gap = park ? 4 : 1.5;
  // Edificios: detrás (cara L hacia la parcela) y a la izquierda (cara R), de lejos a cerca.
  const blocks: { r: Rect; face: 'L' | 'R'; hgt: number; s: number }[] = [];
  let x = -5;
  let i = 0;
  while (x < w + 6) {
    const bw = 2.5 + (hash(`${seed}:b${i}`) % 3);
    blocks.push({ r: { x, y: -gap - 3.4, w: bw - 0.1, h: 3.2 }, face: 'L', hgt: 90 + (hash(`${seed}:h${i}`) % 4) * 26, s: seed + i });
    x += bw;
    i++;
  }
  let y = -gap - 3.4 + 3.3;
  while (y < h - 1) {
    const bh = 2.5 + (hash(`${seed}:c${i}`) % 3);
    blocks.push({ r: { x: -gap - 3.4, y, w: 3.2, h: Math.min(bh - 0.1, h - 1 - y) }, face: 'R', hgt: 90 + (hash(`${seed}:k${i}`) % 4) * 26, s: seed + i * 7 });
    y += bh;
    i++;
  }
  blocks.sort((a, b) => a.r.x + a.r.y - (b.r.x + b.r.y));
  for (const b of blocks) if (b.r.h > 0.5) building(g, b.r, b.face, b.hgt, b.s, brick);
  // Acera trasera y lateral
  flat(g, { x: -gap, y: -gap, w: w + gap + 4, h: gap - 0.2 }, 0, 0xcfc9bc, 0.7);
  flat(g, { x: -gap, y: -gap, w: gap - 0.2, h: h + gap }, 0, 0xcfc9bc, 0.7);
  // Árboles a la derecha
  for (let k = 0; k < Math.ceil(h / 3); k++) tree(g, w + 1.6 + (k % 2) * 1.4, 1 + k * 3, seed + k, autumn);
  if (park) for (let k = 0; k < Math.ceil(w / 4); k++) tree(g, 1 + k * 4, -1.6, seed + k * 3, autumn);
  // Farolas y coches aparcados en la calle de delante
  if (lot.layout !== 'park') {
    for (let lx = -4; lx < w + 6; lx += 5) lamp(g, glow, lx, h + 0.3);
    for (let k = 0; k < 3; k++) if (hash(`${seed}:car${k}`) % 3 !== 0) car(g, -3 + k * ((w + 6) / 3), h + 0.75, seed + k);
  } else {
    for (let lx = 1; lx < w; lx += 6) lamp(g, glow, lx, -0.6);
  }
}

/** Color del cielo y del tinte de luz según la hora (amanecer rosa, atardecer naranja, noche azul). */
export function skyAt(hour: number): { sky: number; tint: number; alpha: number } {
  if (hour < 5.5 || hour >= 22) return { sky: 0x0e1630, tint: 0x0b1640, alpha: 0.42 };
  if (hour < 7) return { sky: 0x6b5b8e, tint: 0x5b3b6e, alpha: 0.42 - ((hour - 5.5) / 1.5) * 0.3 };
  if (hour < 8.5) return { sky: 0xf2b5a0, tint: 0xff9a8b, alpha: 0.2 * (1 - (hour - 7) / 1.5) };
  if (hour < 18) return { sky: 0x9ccbe8, tint: 0xffffff, alpha: 0 };
  if (hour < 20) return { sky: 0xf2a65a, tint: 0xff7a2a, alpha: 0.06 + ((hour - 18) / 2) * 0.2 };
  return { sky: 0x2a2f5a, tint: 0x2a1f5a, alpha: 0.26 + ((hour - 20) / 2) * 0.16 };
}
