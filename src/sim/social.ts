// Relaciones: amistad, romance, parejas y familia.

import { lifeStage } from '../data/species';
import type { Agent, Rel, WorldState } from './types';

export const relKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function getRel(state: WorldState, a: string, b: string): Rel {
  return state.rels[relKey(a, b)] ?? { f: 0, r: 0 };
}

export function setRel(state: WorldState, a: string, b: string, rel: Rel) {
  state.rels[relKey(a, b)] = rel;
}

const clampF = (v: number) => Math.max(-100, Math.min(100, v));
const clampR = (v: number) => Math.max(0, Math.min(100, v));

export function changeRel(state: WorldState, a: string, b: string, df = 0, dr = 0): Rel {
  const rel = { ...getRel(state, a, b) };
  rel.f = clampF(rel.f + df);
  rel.r = clampR(rel.r + dr);
  setRel(state, a, b, rel);
  return rel;
}

/** Adultos (jóvenes adultos, adultos y ancianos): los únicos que pueden tener romance. */
export function isAdult(a: Agent): boolean {
  return a.kind === 'person' && ['young', 'adult', 'elder'].includes(lifeStage(a.species, a.ageDays).id);
}

export function canRomance(state: WorldState, a: Agent, b: Agent): boolean {
  return isAdult(a) && isAdult(b) && !getRel(state, a.id, b.id).kin;
}

/** Pareja actual de alguien (si tiene). */
export function partnerOf(state: WorldState, id: string): string | undefined {
  for (const [k, r] of Object.entries(state.rels)) {
    if (!r.status) continue;
    const [x, y] = k.split('|');
    if (x === id) return y;
    if (y === id) return x;
  }
  return undefined;
}

export function friendshipLabel(f: number): string {
  if (f <= -50) return 'Enemigos';
  if (f <= -15) return 'Mal rollo';
  if (f < 15) return 'Conocidos';
  if (f < 45) return 'Amigos';
  if (f < 75) return 'Buenos amigos';
  return 'Mejores amigos';
}

export function relLabel(rel: Rel, aKind: Agent['kind'], bKind: Agent['kind']): string {
  if (rel.status === 'married') return 'Casados 💍';
  if (rel.status === 'partner') return 'Pareja ❤️';
  if (rel.kin) return rel.f >= 0 ? 'Familia' : 'Familia (mal rollo)';
  if (aKind === 'pet' || bKind === 'pet') {
    if (rel.f >= 60) return 'Inseparables 🐾';
    if (rel.f >= 25) return 'Le tiene cariño';
    if (rel.f <= -25) return 'Le tiene manía';
    return 'Se conocen poco';
  }
  return friendshipLabel(rel.f);
}

/** Cambios de relación al terminar cada interacción social: [amistad, romance]. */
export const REL_EFFECTS: Record<string, [number, number]> = {
  chat: [4, 0],
  joke: [5, 0],
  hug: [4, 1],
  insult: [-15, -5],
  argue: [-10, -4],
  apologize: [12, 2],
  break_up: [-25, -50],
  divorce: [-30, -60],
  throw_party: [0, 0],
  train_pet: [3, 0],
  show_trick: [3, 0],
  flirt: [2, 8],
  kiss: [2, 10],
  ask_partner: [3, 5],
  propose: [5, 5],
  move_in: [3, 3],
  try_baby: [3, 6],
  niqui: [3, 8],
  feed_baby: [3, 0],
  change_diaper: [2, 0],
  rock_baby: [4, 0],
  play_baby: [4, 0],
  pet_animal: [4, 0],
  play_pet: [5, 0],
  walk_dog: [6, 0],
  bathe_pet: [1, 0],
  brush_capy: [3, 0],
  beg_affection: [3, 0],
  play_with_person: [4, 0],
  sniff: [2, 0],
  cuddle_capy: [4, 0],
  chase: [1, 0],
};

/** Acciones de romance. */
export const ROMANTIC = new Set(['flirt', 'kiss', 'ask_partner', 'propose', 'move_in', 'try_baby', 'niqui']);

/**
 * Probabilidad de que `t` acepte la interacción de `a`.
 * Depende de la relación: un beso a un desconocido sale mal casi siempre.
 */
export function acceptChance(state: WorldState, a: Agent, t: Agent, actionId: string): number {
  const rel = getRel(state, a.id, t.id);
  const otherPartner = partnerOf(state, t.id);
  const taken = otherPartner !== undefined && otherPartner !== a.id;
  switch (actionId) {
    case 'joke':
      return 0.75 + rel.f / 400;
    case 'hug':
      return rel.f >= 25 || rel.status || rel.kin ? 0.97 : 0.35 + rel.f / 100;
    case 'flirt': {
      const p = 0.2 + Math.max(0, rel.f) / 200 + rel.r / 120;
      return taken ? p * 0.3 : p;
    }
    case 'kiss':
      if (rel.status) return 0.97;
      return rel.r >= 40 ? (taken ? 0.25 : 0.55 + rel.r / 200) : 0.08;
    case 'ask_partner':
      if (taken) return 0.05;
      return rel.r >= 55 && rel.f >= 35 ? 0.85 : 0.12;
    case 'propose':
      return rel.r >= 75 ? 0.88 : 0.15;
    case 'move_in':
      return rel.r >= 60 ? 0.9 : 0.3;
    case 'niqui':
      if (rel.status) return 0.92;
      return taken ? 0.3 : rel.r >= 70 ? 0.7 : 0.1;
    case 'try_baby':
      return rel.r >= 50 ? 0.92 : 0.4;
    case 'apologize':
      // Perdonar cuesta más cuanto peor está la cosa.
      return Math.max(0.25, Math.min(0.95, 0.65 + rel.f / 150));
    default:
      return 1;
  }
}

export const REJECT_TEXT: Record<string, string> = {
  joke: 'no le ha hecho gracia el chiste de',
  hug: 'no ha querido el abrazo de',
  flirt: 'ha pasado de los coqueteos de',
  kiss: 'le ha hecho la cobra a',
  ask_partner: 'no quiere salir con',
  propose: 'ha dicho que NO a la pedida de mano de',
  move_in: 'no quiere irse a vivir con',
  try_baby: 'aún no se siente preparado/a para tener un bebé con',
  niqui: 'no está de humor para ñiqui ñiqui con',
  apologize: 'no acepta las disculpas de',
};

/** Recuerdos: lo que se cuenta de cada uno ({by} = quien lo hizo, {other} = a quien). */
export const MEMORY_TEXT: Record<string, { icon: string; text: string; bad?: boolean }> = {
  insulto: { icon: '🤬', text: '{by} insultó a {other}', bad: true },
  pelea: { icon: '💢', text: '{by} y {other} tuvieron una bronca', bad: true },
  celos: { icon: '😤', text: '{by} coqueteó con otra persona delante de {other}', bad: true },
  ruptura: { icon: '💔', text: '{by} cortó con {other}', bad: true },
  divorcio: { icon: '📄', text: '{by} pidió el divorcio a {other}', bad: true },
  cobra: { icon: '😳', text: '{by} le hizo la cobra a {other}' },
  rechazo: { icon: '🎃', text: '{by} le dio calabazas a {other}' },
  perdon: { icon: '🕊️', text: '{by} pidió perdón a {other}' },
  primer_beso: { icon: '💋', text: 'El primer beso de {by} y {other}' },
  boda: { icon: '💍', text: 'La boda de {by} y {other}' },
  fiesta: { icon: '🥳', text: 'La fiesta de {by}, con {other}' },
  favor: { icon: '🤝', text: '{by} echó una mano a {other}' },
};

/** Lo que `t` le hizo a `a` y aún no le ha perdonado (si hay algo). */
export function grudgeOf(rel: Rel, aId: string, tId: string, today: number): string | undefined {
  const mem = rel.mem ?? [];
  for (let i = mem.length - 1; i >= 0; i--) {
    const m = mem[i];
    if (m.k === 'perdon' && m.by === tId) return undefined;
    if (MEMORY_TEXT[m.k]?.bad && (m.by === tId || m.k === 'pelea') && today - m.d <= 10) return m.k;
  }
  void aId;
  return undefined;
}
