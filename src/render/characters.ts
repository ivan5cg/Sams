// Personajes dibujados a mano (personas y mascotas), mirando a la derecha con los pies en (0, 0).

import type Phaser from 'phaser';
import type { Agent, SpeciesId } from '../sim/types';
import { hash } from './art';
import { shade } from './iso';
import { HAIR, HAIR_STYLES, PANTS, SKIN } from '../data/looks';

type G = Phaser.GameObjects.Graphics;

const DOG_COLORS = [0xc68642, 0xe0b170, 0x3b3b3b, 0xf2efe8, 0x8b5a2b];
const CAT_COLORS = [0xf0a04b, 0x9a9a9a, 0x2f2f2f, 0xf5f5f5, 0xc9a27a];

export interface PersonLook {
  skin: number;
  hair: number;
  hairStyle: 'short' | 'long' | 'bun' | 'curly' | 'ponytail';
  pants: number;
  shirt: number;
  /** Complexión (ancho del cuerpo). */
  build: number;
  /** Gafas, barba o bigote. */
  extra: 'none' | 'glasses' | 'beard' | 'mustache';
  elder: boolean;
}

export function personLook(a: Agent, elder: boolean): PersonLook {
  const h = hash(a.id + a.name);
  const styles: PersonLook['hairStyle'][] = [...HAIR_STYLES];
  // Lo elegido en el creador de familia manda; si no, sale del nombre.
  const look = a.look;
  return {
    skin: look?.skin ?? SKIN[h % SKIN.length],
    hair: elder ? 0xd9d9d9 : (look?.hair ?? HAIR[(h >>> 3) % HAIR.length]),
    hairStyle: (look?.hairStyle as PersonLook['hairStyle'] | undefined) ?? styles[(h >>> 6) % styles.length],
    pants: PANTS[(h >>> 9) % PANTS.length],
    shirt: a.color,
    build: [0.88, 1, 1, 1.15][(h >>> 12) % 4],
    extra: (['none', 'none', 'glasses', 'beard', 'mustache', 'none'] as const)[(h >>> 15) % 6],
    elder,
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
  const b = look.build ?? 1;
  // Bastón de los mayores
  if (look.elder) {
    g.lineStyle(2, 0x5a3a1c, 1);
    g.lineBetween(9, -17, 11, 0);
  }
  // Brazo de atrás
  g.fillStyle(shade(look.shirt, 0.75), 1);
  g.fillRoundedRect(-10.5 * b, -32, 4.5, 14, 2);
  g.fillStyle(shade(look.skin, 0.9), 1);
  g.fillCircle(-8.3 * b, -17.5, 2.3);
  // Tronco
  g.fillStyle(look.shirt, 1);
  g.fillRoundedRect(-8 * b, -34, 16 * b, 20, 6);
  g.fillStyle(0x000000, 0.12);
  g.fillRoundedRect(2 * b, -33, 6 * b, 18, { tl: 0, tr: 5, bl: 0, br: 5 });
  // Cuello de la camiseta y bolsillo
  g.fillStyle(shade(look.shirt, 0.8), 1);
  g.fillRoundedRect(-3, -34.5, 6, 2.5, 1);
  g.fillStyle(look.pants, 1);
  g.fillRect(-8 * b, -17, 16 * b, 3);
  // Brazo de delante
  g.fillStyle(shade(look.shirt, 0.9), 1);
  g.fillRoundedRect(3.5 * b, -32, 4.5, 14, 2);
  g.fillStyle(look.skin, 1);
  g.fillCircle(5.8 * b, -17.5, 2.3);
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
  // Oreja
  g.fillStyle(shade(look.skin, 0.85), 1);
  g.fillEllipse(-1.5, hy + 0.5, 3, 4);
  if (look.extra === 'beard') {
    g.fillStyle(look.hair, 1);
    g.slice(2, hy + 2, 7.5, 0, Math.PI, false);
    g.fillPath();
  }
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

/** Complementos de la gente de la calle (y la gorra de chulapo en San Isidro). Se dibujan sobre el cuerpo. */
export function drawAccessory(g: G, kind: string) {
  const hy = -45;
  switch (kind) {
    case 'rapero':
      // Gorra hacia atrás y cadena
      g.fillStyle(0xe63946, 1);
      g.slice(0, hy - 2, 9.6, Math.PI, 0, false);
      g.fillPath();
      g.fillRect(-14, hy - 3, 7, 2.5);
      g.lineStyle(1.5, 0xf2c14e, 1);
      g.strokeCircle(0, -28, 4.5);
      break;
    case 'vendedor':
      // Caja de chuches colgada
      g.fillStyle(0xc9a66b, 1);
      g.fillRect(-9, -26, 18, 9);
      for (let i = 0; i < 5; i++) {
        g.fillStyle([0xe63946, 0xf2c14e, 0x52b788, 0x9b5de5, 0xff8fab][i], 1);
        g.fillCircle(-7 + i * 3.5, -27, 1.8);
      }
      g.lineStyle(1, 0x8b5a2b, 1);
      g.lineBetween(-8, -26, -5, -36);
      g.lineBetween(8, -26, 5, -36);
      break;
    case 'musico':
      // Acordeón
      g.fillStyle(0xd62828, 1);
      g.fillRect(-11, -30, 8, 13);
      g.fillRect(3, -30, 8, 13);
      g.fillStyle(0x222222, 1);
      for (let i = 0; i < 4; i++) g.fillRect(-3 + i * 1.6, -30, 0.8, 13);
      g.fillStyle(0xffffff, 1);
      g.fillRect(-10, -28, 2, 9);
      break;
    case 'glovo':
      // Mochila amarilla
      g.fillStyle(0xffc244, 1);
      g.fillRoundedRect(-17, -40, 12, 15, 2);
      g.fillStyle(0x2b2d42, 1);
      g.fillRect(-15, -35, 8, 1.5);
      break;
    case 'militante':
      // Una rosa y folletos
      g.fillStyle(0xffffff, 1);
      g.fillRect(4, -25, 7, 5);
      g.lineStyle(1.2, 0x2d6a4f, 1);
      g.lineBetween(7, -24, 9, -34);
      g.fillStyle(0xd62828, 1);
      g.fillCircle(9.5, -35, 2.6);
      break;
    case 'chismosa':
      // Bolso de mano
      g.fillStyle(0x5a3a1c, 1);
      g.fillRoundedRect(4, -24, 7, 6, 1.5);
      g.lineStyle(1, 0x5a3a1c, 1);
      g.strokeCircle(7.5, -25, 2.5);
      break;
    case 'chulapo':
      // Parpusa de cuadros
      g.fillStyle(0x6b6f76, 1);
      g.slice(0, hy - 3, 9.4, Math.PI, 0, false);
      g.fillPath();
      g.fillStyle(0x2b2d42, 1);
      g.fillRect(2, hy - 4, 10, 2.2);
      g.fillStyle(0xffffff, 0.35);
      for (let i = -6; i <= 6; i += 4) g.fillRect(i, hy - 10, 1.4, 6);
      break;
  }
}

export type Expression = 'normal' | 'feliz' | 'triste' | 'enfadado' | 'enamorado' | 'borracho' | 'dormido' | 'parpadeo' | 'sorpresa';

/** Ojos, cejas y boca (en su propia capa para cambiar la expresión sin redibujar a la persona). */
export function drawFace(g: G, look: PersonLook, e: Expression) {
  const hy = -45;
  const eye = 0x222222;
  if (e === 'dormido' || e === 'parpadeo' || e === 'borracho') {
    g.lineStyle(1.3, eye, 1);
    g.lineBetween(2.6, hy - 0.3, 4.6, hy - 0.3);
    g.lineBetween(6, hy - 0.3, 7.8, hy - 0.3);
  } else if (e === 'enamorado') {
    g.fillStyle(0xe63946, 1);
    for (const x of [3.6, 6.9]) {
      g.fillCircle(x - 0.6, hy - 1, 1);
      g.fillCircle(x + 0.6, hy - 1, 1);
      g.fillTriangle(x - 1.5, hy - 0.7, x + 1.5, hy - 0.7, x, hy + 1.2);
    }
  } else {
    const big = e === 'sorpresa' ? 1.3 : 1;
    g.fillStyle(eye, 1);
    g.fillEllipse(3.6, hy - 0.5, 2 * big, 2.6 * big);
    g.fillEllipse(6.9, hy - 0.5, 1.6 * big, 2.4 * big);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(3.9, hy - 1.2, 0.5);
  }
  // Cejas
  g.lineStyle(1.1, shade(look.hair, 0.8), 0.9);
  if (e === 'enfadado') {
    g.lineBetween(2.4, hy - 4.2, 4.8, hy - 2.8);
    g.lineBetween(8.2, hy - 4.2, 6, hy - 2.8);
  } else if (e === 'triste') {
    g.lineBetween(2.4, hy - 2.8, 4.8, hy - 4);
    g.lineBetween(8.2, hy - 2.8, 6, hy - 4);
  }
  // Mofletes
  g.fillStyle(e === 'borracho' || e === 'enamorado' ? 0xe63946 : 0xf28d8d, e === 'borracho' ? 0.6 : 0.45);
  g.fillCircle(5.2, hy + 3.2, e === 'borracho' ? 2.4 : 1.8);
  // Boca
  g.lineStyle(1.1, 0x7a3b2e, 0.9);
  if (e === 'feliz' || e === 'enamorado') {
    g.beginPath();
    g.arc(5.6, hy + 3.2, 2.2, 0.2, Math.PI - 0.2, false);
    g.strokePath();
  } else if (e === 'triste' || e === 'enfadado') {
    g.beginPath();
    g.arc(5.6, hy + 6.2, 2, Math.PI + 0.3, -0.3, false);
    g.strokePath();
  } else if (e === 'sorpresa') {
    g.fillStyle(0x7a3b2e, 1);
    g.fillCircle(5.6, hy + 4.6, 1.3);
  } else if (e === 'borracho') {
    g.lineBetween(4.2, hy + 4.6, 7, hy + 3.6);
  } else {
    g.lineBetween(4.6, hy + 4.4, 6.6, hy + 4.2);
  }
  if (look.extra === 'mustache') {
    g.fillStyle(look.hair, 1);
    g.fillRoundedRect(3.2, hy + 2.3, 5, 1.6, 0.8);
  }
  if (look.extra === 'glasses') {
    g.lineStyle(1, 0x222222, 1);
    g.strokeCircle(3.6, hy - 0.5, 2.2);
    g.strokeCircle(7.1, hy - 0.5, 2);
    g.lineBetween(5.8, hy - 0.6, 5.1, hy - 0.6);
  }
}

/** Cabeza vista de espaldas (cuando camina hacia el fondo): se ve el pelo, no la cara. */
export function drawBackHead(g: G, look: PersonLook) {
  const hy = -45;
  g.fillStyle(look.hair, 1);
  g.fillCircle(0.5, hy - 0.5, 8.8);
  g.fillStyle(shade(look.hair, 1.15), 0.5);
  g.fillCircle(-1.5, hy - 3, 3);
}

/** Lo que lleva en la mano según lo que hace (sartén, móvil, libro, caña...). */
export function drawProp(g: G, kind: string) {
  const hx = 6.5, hy = -18;
  switch (kind) {
    case 'pan':
      g.fillStyle(0x333333, 1);
      g.fillEllipse(hx + 6, hy - 1, 10, 4);
      g.fillRect(hx, hy - 1.5, 4, 1.5);
      g.fillStyle(0xf2c14e, 1);
      g.fillCircle(hx + 6, hy - 2, 1.6);
      break;
    case 'phone':
      g.fillStyle(0x222222, 1);
      g.fillRoundedRect(hx - 1, hy - 8, 4, 7, 1);
      g.fillStyle(0x7cc6f0, 1);
      g.fillRect(hx - 0.3, hy - 7.2, 2.6, 5);
      break;
    case 'book':
      g.fillStyle(0x8b2e3c, 1);
      g.fillRect(hx - 1, hy - 7, 7, 6);
      g.fillStyle(0xffffff, 1);
      g.fillRect(hx + 2.3, hy - 6.5, 0.6, 5);
      break;
    case 'beer':
      g.fillStyle(0xf2b134, 0.95);
      g.fillRect(hx - 0.5, hy - 7, 4, 6);
      g.fillStyle(0xffffff, 1);
      g.fillRect(hx - 0.5, hy - 8.3, 4, 1.6);
      break;
    case 'cup':
      g.fillStyle(0xffffff, 1);
      g.fillRect(hx - 0.5, hy - 5, 4, 4);
      g.fillStyle(0x5a3825, 1);
      g.fillRect(hx - 0.5, hy - 5, 4, 1);
      break;
    case 'brush':
      g.lineStyle(1.4, 0x8b5a2b, 1);
      g.lineBetween(hx, hy, hx + 6, hy - 8);
      g.fillStyle(0xe63946, 1);
      g.fillCircle(hx + 6.5, hy - 8.5, 1.4);
      break;
    case 'cards':
      g.fillStyle(0xffffff, 1);
      g.fillRect(hx - 1, hy - 6, 3, 4.5);
      g.fillRect(hx + 1, hy - 6.5, 3, 4.5);
      g.fillStyle(0xe63946, 1);
      g.fillRect(hx + 2, hy - 5.5, 1, 1);
      break;
    case 'mic':
      g.fillStyle(0x333333, 1);
      g.fillRect(hx, hy - 6, 1.6, 6);
      g.fillCircle(hx + 0.8, hy - 7, 2);
      break;
  }
}
