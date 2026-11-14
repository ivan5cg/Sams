// Personajes dibujados a mano (personas y mascotas), mirando a la derecha con los pies en (0, 0).

import type Phaser from 'phaser';
import type { Agent, SpeciesId } from '../sim/types';
import { hash } from './art';
import { shade } from './iso';

type G = Phaser.GameObjects.Graphics;

const SKIN = [0xf6d2b0, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x6b4226];
const HAIR = [0x2b1a10, 0x111111, 0x6b3e1f, 0xb5651d, 0xe6c35c, 0x9c3d2a];
const PANTS = [0x34384a, 0x3d5a80, 0x5c4033, 0x2f4f4f, 0x4a4e69, 0x6c757d];
const DOG_COLORS = [0xc68642, 0xe0b170, 0x3b3b3b, 0xf2efe8, 0x8b5a2b];
const CAT_COLORS = [0xf0a04b, 0x9a9a9a, 0x2f2f2f, 0xf5f5f5, 0xc9a27a];

export interface PersonLook {
  skin: number;
  hair: number;
  hairStyle: 'short' | 'long' | 'bun' | 'curly' | 'ponytail';
  pants: number;
  shirt: number;
}

export function personLook(a: Agent, elder: boolean): PersonLook {
  const h = hash(a.id + a.name);
  const styles: PersonLook['hairStyle'][] = ['short', 'long', 'bun', 'curly', 'ponytail'];
  return {
    skin: SKIN[h % SKIN.length],
    hair: elder ? 0xd9d9d9 : HAIR[(h >>> 3) % HAIR.length],
    hairStyle: styles[(h >>> 6) % styles.length],
    pants: PANTS[(h >>> 9) % PANTS.length],
    shirt: a.color,
  };
}

/** Color de una mascota: el suyo, o uno según su nombre para que haya variedad. */
export function petColor(a: Agent): number {
  if (a.color !== 0x999999) return a.color;
  const h = hash(a.id + a.name);
  if (a.species === 'dog') return DOG_COLORS[h % DOG_COLORS.length];
  if (a.species === 'cat') return CAT_COLORS[h % CAT_COLORS.length];
  return a.color;
}

/** Una pierna (va en su propio gráfico para poder animar el paso). */
export function drawLeg(g: G, look: PersonLook, x: number) {
  g.fillStyle(look.pants, 1);
  g.fillRoundedRect(x, -16, 5, 14, 2);
  g.fillStyle(0x2a2a2a, 1);
  g.fillRoundedRect(x - 0.5, -3.5, 7, 3.5, 1.5);
}

/** Cuerpo de una persona (sin piernas). Devuelve la altura de la cabeza. */
export function drawPersonBody(g: G, look: PersonLook): number {
  // Brazo de atrás
  g.fillStyle(shade(look.shirt, 0.75), 1);
  g.fillRoundedRect(-10.5, -32, 4.5, 14, 2);
  g.fillStyle(shade(look.skin, 0.9), 1);
  g.fillCircle(-8.3, -17.5, 2.3);
  // Tronco
  g.fillStyle(look.shirt, 1);
  g.fillRoundedRect(-8, -34, 16, 20, 6);
  g.fillStyle(0x000000, 0.12);
  g.fillRoundedRect(2, -33, 6, 18, { tl: 0, tr: 5, bl: 0, br: 5 });
  g.fillStyle(look.pants, 1);
  g.fillRect(-8, -17, 16, 3);
  // Brazo de delante
  g.fillStyle(shade(look.shirt, 0.9), 1);
  g.fillRoundedRect(3.5, -32, 4.5, 14, 2);
  g.fillStyle(look.skin, 1);
  g.fillCircle(5.8, -17.5, 2.3);
  // Cuello y cabeza
  g.fillStyle(shade(look.skin, 0.9), 1);
  g.fillRect(-2, -37, 4, 4);
  const hy = -45;
  if (look.hairStyle === 'long') {
    g.fillStyle(look.hair, 1);
    g.fillRoundedRect(-10, hy - 3, 8, 17, 3);
  }
  if (look.hairStyle === 'ponytail') {
    g.fillStyle(look.hair, 1);
    g.fillRoundedRect(-13.5, hy - 2, 5, 11, 2.5);
  }
  g.fillStyle(look.skin, 1);
  g.fillCircle(0, hy, 8.5);
  g.fillStyle(shade(look.skin, 0.88), 1);
  g.fillCircle(-2.5, hy + 0.5, 2);
  // Ojos y mejilla
  g.fillStyle(0x222222, 1);
  g.fillEllipse(3.6, hy - 0.5, 2, 2.6);
  g.fillEllipse(6.9, hy - 0.5, 1.6, 2.4);
  g.fillStyle(0xf28d8d, 0.45);
  g.fillCircle(5.2, hy + 3.2, 1.8);
  g.lineStyle(1, 0x7a3b2e, 0.8);
  g.lineBetween(4.6, hy + 4.4, 6.6, hy + 4.2);
  // Pelo
  g.fillStyle(look.hair, 1);
  g.slice(0, hy - 0.5, 9.2, Math.PI, 0, false);
  g.fillPath();
  g.fillRect(-9.2, hy - 1, 5, 6);
  if (look.hairStyle === 'bun') g.fillCircle(-5, hy - 9, 4.5);
  if (look.hairStyle === 'curly') {
    for (let i = 0; i < 7; i++) {
      const ang = Math.PI + (i / 6) * Math.PI;
      g.fillCircle(Math.cos(ang) * 8.5, hy + Math.sin(ang) * 8.5, 3.4);
    }
  }
  if (look.hairStyle === 'short') {
    g.fillTriangle(1, hy - 9, 9, hy - 4, 3, hy - 3);
  }
  return hy - 9;
}

/** Bebé envuelto en su mantita. */
export function drawBaby(g: G, look: PersonLook): number {
  g.fillStyle(look.shirt, 1);
  g.fillEllipse(-1, -7, 18, 11);
  g.fillStyle(shade(look.shirt, 1.2), 1);
  g.fillEllipse(-3, -8, 10, 6);
  g.fillStyle(look.skin, 1);
  g.fillCircle(6, -12, 5.5);
  g.fillStyle(0x222222, 1);
  g.fillCircle(8, -12.5, 0.8);
  g.fillStyle(look.hair, 1);
  g.fillCircle(5, -17, 1.6);
  return -20;
}

/** Mascotas (de lado, mirando a la derecha). Devuelve la altura de la cabeza. */
export const PET_ART: Partial<Record<SpeciesId, (g: G, color: number) => number>> = {
  dog: (g, c) => {
    const dark = shade(c, 0.72), light = shade(c, 1.18);
    g.lineStyle(3, c, 1);
    g.lineBetween(-12, -13, -17, -22);
    g.fillStyle(dark, 1);
    for (const x of [-10, -5.5]) g.fillRoundedRect(x, -8, 3.5, 8, 1.5);
    g.fillStyle(c, 1);
    g.fillEllipse(0, -12, 27, 13);
    g.fillStyle(light, 1);
    g.fillEllipse(4, -9, 12, 6);
    g.fillStyle(c, 1);
    for (const x of [4.5, 9]) g.fillRoundedRect(x, -8, 3.5, 8, 1.5);
    g.fillStyle(0xd9534f, 1);
    g.fillRect(8, -18, 4, 3);
    g.fillStyle(c, 1);
    g.fillCircle(13, -20, 7);
    g.fillStyle(light, 1);
    g.fillEllipse(19, -17.5, 9, 6);
    g.fillStyle(0x1a1a1a, 1);
    g.fillCircle(23, -18.5, 1.8);
    g.fillCircle(15, -22, 1.2);
    g.fillStyle(dark, 1);
    g.fillEllipse(10, -18, 5, 10);
    return -30;
  },
  cat: (g, c) => {
    const dark = shade(c, 0.72), light = shade(c, 1.15);
    g.lineStyle(2.5, c, 1);
    g.beginPath();
    g.moveTo(-10, -11);
    g.lineTo(-15, -16);
    g.lineTo(-15, -24);
    g.lineTo(-12, -28);
    g.strokePath();
    g.fillStyle(dark, 1);
    for (const x of [-8, -4]) g.fillRoundedRect(x, -7, 2.8, 7, 1.2);
    g.fillStyle(c, 1);
    g.fillEllipse(0, -10, 22, 10);
    g.fillStyle(light, 1);
    g.fillEllipse(3, -8, 10, 5);
    g.fillStyle(c, 1);
    for (const x of [4, 7.5]) g.fillRoundedRect(x, -7, 2.8, 7, 1.2);
    g.fillCircle(11, -17, 5.8);
    g.fillTriangle(7, -20, 8.5, -27, 12, -21.5);
    g.fillTriangle(11.5, -22, 15.5, -27, 16, -19.5);
    g.fillStyle(0xf2a0a8, 1);
    g.fillTriangle(8.6, -21, 9.3, -25, 11, -21.5);
    g.fillStyle(0x3a5f2a, 1);
    g.fillEllipse(13.5, -18, 1.8, 2.4);
    g.fillStyle(0xf2a0a8, 1);
    g.fillCircle(16.5, -15.8, 1);
    g.lineStyle(0.6, 0xffffff, 0.8);
    g.lineBetween(16, -15, 21, -16);
    g.lineBetween(16, -14.5, 21, -13.5);
    return -28;
  },
  capybara: (g) => {
    g.fillStyle(0x6b4423, 1);
    for (const x of [-14, -6, 6, 13]) g.fillRoundedRect(x, -7, 5, 7, 2);
    g.fillStyle(0xa0703c, 1);
    g.fillEllipse(-2, -15, 42, 22);
    g.fillStyle(0xb98450, 1);
    g.fillEllipse(-4, -19, 30, 10);
    g.fillStyle(0xa0703c, 1);
    g.fillRoundedRect(9, -30, 18, 16, 6);
    g.fillStyle(0x8a5e30, 1);
    g.fillRoundedRect(21, -25, 9, 10, 4);
    g.fillCircle(12, -30, 3);
    g.fillStyle(0x1b1209, 1);
    g.fillCircle(20, -24, 1.8);
    g.fillCircle(28, -21, 1.3);
    return -38;
  },
  guineapig: (g) => {
    g.fillStyle(0xfaf3e6, 1);
    g.fillEllipse(0, -7, 24, 14);
    g.fillStyle(0xe08a3c, 1);
    g.fillEllipse(-6, -9, 11, 10);
    g.fillStyle(0x5a3a22, 1);
    g.fillEllipse(6, -9, 9, 9);
    g.fillStyle(0xf0b8a8, 1);
    g.fillCircle(5, -14, 2.5);
    g.fillStyle(0x111111, 1);
    g.fillCircle(8, -9, 1.5);
    g.fillStyle(0xf7a7b4, 1);
    g.fillCircle(12, -6, 1.2);
    return -18;
  },
  ferret: (g) => {
    g.fillStyle(0x4a3424, 1);
    g.fillEllipse(-19, -7, 14, 5);
    for (const x of [-11, -4, 5, 11]) g.fillRoundedRect(x, -5, 3, 5, 1);
    g.fillStyle(0xe8d8b0, 1);
    g.fillEllipse(0, -8, 32, 10);
    g.fillEllipse(17, -11, 13, 10);
    g.fillStyle(0x6b4a33, 1);
    g.fillEllipse(18, -12, 10, 4);
    g.fillCircle(14, -16, 2.2);
    g.fillStyle(0x111111, 1);
    g.fillCircle(19, -12, 1.4);
    g.fillStyle(0xf2a0a8, 1);
    g.fillCircle(23, -10, 1.2);
    return -22;
  },
};
