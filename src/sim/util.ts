// Pequeñas utilidades de la simulación.

import { sizeOf } from '../data/objects';
import { emotionMood } from './emotions';
import { hasTrait } from './traits';
import { NEED_KEYS, type Agent, type PlacedObject, type Vec } from './types';

export const clamp = (v: number) => Math.max(0, Math.min(100, v));

export const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Ánimo general (0-100) a partir de las necesidades. */
export function moodScore(a: Agent): number {
  const vals = NEED_KEYS.map((k) => a.needs[k]);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  // Los optimistas lo ven todo un poco mejor; los gruñones, un poco peor.
  const temper = hasTrait(a, 'optimista') ? 6 : hasTrait(a, 'grunon') ? -4 : 0;
  return avg - vals.filter((v) => v < 20).length * 12 + temper + emotionMood(a);
}

/** Centro de un objeto en coordenadas de casilla. */
export function objectCenter(o: PlacedObject): Vec {
  const d = sizeOf(o);
  return { x: o.x + (d.w - 1) / 2, y: o.y + (d.h - 1) / 2 };
}
