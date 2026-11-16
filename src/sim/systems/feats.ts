// Logros y retos: contadores de la familia y comprobación cada hora.

import { ACHIEVEMENTS, CHALLENGES } from '../../data/feats';
import type { Feats } from '../types';
import type { World } from '../world';
import { money } from './money';

/** Premio por cumplir un reto. */
export const CHALLENGE_REWARD = 1000;

function feats(w: World): Feats {
  const f = (w.state.feats = w.state.feats ?? { got: {}, counts: {}, challenges: {} });
  f.got = f.got ?? {};
  f.counts = f.counts ?? {};
  f.challenges = f.challenges ?? {};
  return f;
}

/** Suma a un contador de la familia (y al de los retos activos). */
export function countFeat(w: World, key: string, n = 1) {
  const f = feats(w);
  f.counts[key] = (f.counts[key] ?? 0) + n;
  for (const c of Object.values(f.challenges)) if (!c.done && !c.failed) c.counts[key] = (c.counts[key] ?? 0) + n;
}

export function startChallenge(w: World, id: string) {
  const def = CHALLENGES.find((c) => c.id === id);
  if (!def) return;
  feats(w).challenges[id] = { since: w.state.minutes, counts: {} };
  w.toast(`Reto aceptado: ${def.label}. ${def.desc}`, def.icon);
}

export function dropChallenge(w: World, id: string) {
  delete feats(w).challenges[id];
}

/** Cada hora: ¿algún logro nuevo, algún reto cumplido o perdido? */
export function checkFeats(w: World) {
  if (w.state.familyGone) return;
  const f = feats(w);
  // Noche de Navidad sin números rojos.
  if (w.hasEvent('navidad') && w.hour === 23 && w.household.funds >= 0 && f.counts.navidad_day !== w.day) {
    f.counts.navidad_day = w.day;
    countFeat(w, 'navidad_ok');
  }
  for (const a of ACHIEVEMENTS) {
    if (f.got[a.id] !== undefined || !a.done({ w, counts: f.counts, since: 0 })) continue;
    f.got[a.id] = w.day;
    w.toast(`¡Logro conseguido! ${a.label}`, '🏆');
  }
  for (const def of CHALLENGES) {
    const c = f.challenges[def.id];
    if (!c || c.done || c.failed) continue;
    const ctx = { w, counts: c.counts, since: c.since };
    const why = def.failed?.(ctx);
    if (why) {
      c.failed = why;
      w.toast(`Reto perdido: ${def.label} (${why.toLowerCase()})`, '💔');
    } else if (def.done(ctx)) {
      c.done = w.day;
      money(w, w.household, CHALLENGE_REWARD, 'premios');
      w.toast(`¡Reto cumplido! ${def.label} (+§${CHALLENGE_REWARD})`, '🏆');
      w.addNews(`la ${w.household.name} ha superado el reto «${def.label}»`, []);
    }
  }
}
