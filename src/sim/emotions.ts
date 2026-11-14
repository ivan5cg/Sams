// Emociones activas de cada personaje: se suman al ánimo y cambian lo que le apetece hacer.

import { EMOTIONS, type EmotionDef } from '../data/emotions';
import type { Agent } from './types';

/** Emociones vigentes (las caducadas se limpian cada hora). */
export function emotionsOf(a: Agent): { def: EmotionDef; until: number; about?: string }[] {
  return (a.emotions ?? []).map((e) => ({ def: EMOTIONS[e.id], until: e.until, about: e.about })).filter((e) => !!e.def);
}

/**
 * `a` siente `id` (por algo o alguien). Si ya la sentía, se renueva.
 * Devuelve true si es nueva.
 */
export function feel(a: Agent, id: string, now: number, about?: string, hours?: number): boolean {
  const def = EMOTIONS[id];
  if (!def) return false;
  a.emotions = a.emotions ?? [];
  const until = now + (hours ?? def.hours) * 60;
  const had = a.emotions.find((e) => e.id === id);
  if (had) {
    had.until = Math.max(had.until, until);
    if (about) had.about = about;
    return false;
  }
  a.emotions.push({ id, until, ...(about ? { about } : {}) });
  // Como mucho 6 a la vez: se olvida la más floja.
  if (a.emotions.length > 6) {
    a.emotions.sort((x, y) => Math.abs(EMOTIONS[y.id]?.value ?? 0) - Math.abs(EMOTIONS[x.id]?.value ?? 0));
    a.emotions.length = 6;
  }
  return true;
}

export function forget(a: Agent, id: string) {
  if (a.emotions) a.emotions = a.emotions.filter((e) => e.id !== id);
}

export function pruneEmotions(a: Agent, now: number) {
  if (a.emotions?.length) a.emotions = a.emotions.filter((e) => e.until > now && EMOTIONS[e.id]);
}

/** Lo que suman al ánimo (con tope, para que una sola cosa no lo decida todo). */
export function emotionMood(a: Agent): number {
  let s = 0;
  for (const e of a.emotions ?? []) s += EMOTIONS[e.id]?.value ?? 0;
  return Math.max(-35, Math.min(35, s));
}

/** Cuánto le apetece una acción según cómo se siente. */
export function emotionAffinity(a: Agent, actionId: string): number {
  let m = 1;
  for (const e of a.emotions ?? []) m *= EMOTIONS[e.id]?.likes?.[actionId] ?? 1;
  return m;
}

export function hasEmotion(a: Agent, id: string): boolean {
  return !!a.emotions?.some((e) => e.id === id);
}
