// Rasgos de personalidad: qué tiene cada uno y cómo le afecta.

import { TRAITS, TRAIT_BY_ID, type TraitDef } from '../data/traits';
import type { Agent, NeedKey } from './types';

const hashStr = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Rasgos de una persona (se asignan la primera vez, siempre los mismos para cada personaje). */
export function traitsOf(a: Agent): TraitDef[] {
  if (a.kind !== 'person') return [];
  if (!a.traits) {
    const h = hashStr(`${a.id}:${a.name}:rasgos`);
    const first = h % TRAITS.length;
    let second = (h >>> 5) % TRAITS.length;
    if (second === first) second = (second + 1) % TRAITS.length;
    // Gruñón y optimista a la vez no tiene mucho sentido
    const ids = [TRAITS[first].id, TRAITS[second].id];
    if (ids.includes('grunon') && ids.includes('optimista')) ids[1] = 'bromista';
    a.traits = ids;
  }
  return a.traits.map((id) => TRAIT_BY_ID[id]).filter(Boolean);
}

export function hasTrait(a: Agent, id: string): boolean {
  return a.kind === 'person' && traitsOf(a).some((t) => t.id === id);
}

/** Cuánto más rápido (o lento) le baja una necesidad por su forma de ser. */
export function traitDecay(a: Agent, need: NeedKey): number {
  let m = 1;
  for (const t of traitsOf(a)) m *= t.decay?.[need] ?? 1;
  return m;
}

/** Cuánto le apetece una acción por su forma de ser (para la autonomía). */
export function traitAffinity(a: Agent, actionId: string): number {
  let m = 1;
  for (const t of traitsOf(a)) m *= t.likesActions?.[actionId] ?? 1;
  return m;
}
