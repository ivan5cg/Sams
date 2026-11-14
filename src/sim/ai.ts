// Autonomía por "utilidad": cada objeto y cada persona anuncian lo que ofrecen
// y el agente elige lo que más le compensa según sus necesidades y la distancia.

import { ACTIONS, SELF_ACTIONS, SOCIAL_ACTIONS } from '../data/actions';
import type { World } from './world';
import { NEED_KEYS, type Agent, type Needs } from './types';

export interface Choice {
  actionId: string;
  targetObjectId?: string;
  targetAgentId?: string;
}

const URGENT = 20;

/** Cuánto pesa subir una necesidad según lo baja que esté (curva cuadrática). */
export function needWeight(v: number): number {
  const w = ((100 - v) / 100) ** 2;
  return v < URGENT ? w + 0.5 : w;
}

/** Beneficio de aplicar `effects` durante `duration` minutos sobre `needs`. */
export function benefit(needs: Needs, effects: Partial<Needs>, duration: number, onlyUrgent = false): number {
  let s = 0;
  for (const k of NEED_KEYS) {
    const e = effects[k];
    if (!e) continue;
    if (e > 0) {
      if (onlyUrgent && needs[k] >= URGENT) continue;
      s += Math.min(e * duration, 100 - needs[k]) * needWeight(needs[k]);
    } else if (!onlyUrgent) {
      s += e * duration * 0.05;
    }
  }
  return s;
}

export function chooseAutonomous(world: World, a: Agent, urgentOnly: boolean): Choice | null {
  const options: { choice: Choice; score: number }[] = [];
  const distFactor = (x: number, y: number) => 1 / (1 + Math.hypot(x - a.pos.x, y - a.pos.y) / 15);
  const jitter = () => 0.85 + Math.random() * 0.3;

  // Objetos (de la parcela en la que está)
  for (const o of world.objectsIn(a.lotId)) {
    const od = world.objDef(o);
    for (const actionId of od.actions) {
      const def = ACTIONS[actionId];
      if (def.playerOnly || !def.actors.includes(a.kind)) continue;
      if (!world.checkObjectAction(a, o, actionId).ok) continue;
      let score = benefit(a.needs, def.effects, def.duration, urgentOnly);
      if (!urgentOnly) {
        if (def.baseScore) score += def.baseScore;
        // Cuidar de las mascotas: rellenar comida si alguna tiene hambre...
        if (def.refill && !o.stock) {
          const hungryPet = world.state.agents.some((p) => p.kind === 'pet' && p.householdId === a.householdId && p.needs.hunger < 70);
          score += hungryPet ? 25 : 4;
        }
        // ...y limpiar jaulas y areneros cuando empiezan a oler.
        if (def.cleans && (o.dirt ?? 0) >= 2) score += 6 * (o.dirt ?? 0);
      }
      if (score <= 0) continue;
      options.push({ choice: { actionId, targetObjectId: o.id }, score: score * distFactor(o.x, o.y) * jitter() });
    }
  }

  // Cosas que hace por sí mismo (siesta del gato, danza del hurón...)
  for (const def of SELF_ACTIONS) {
    if (!world.checkSelfAction(a, def.id).ok) continue;
    const score = benefit(a.needs, def.effects, def.duration, urgentOnly) * 0.8;
    if (score > 0) options.push({ choice: { actionId: def.id }, score: score * jitter() });
  }

  // Interacciones con otros (quien vive en una jaula no sale a buscarlas)
  for (const t of a.home ? [] : world.agentsIn(a.lotId)) {
    if (t === a || t.hidden) continue;
    const tc = t.current;
    if (tc && (tc.byPlayer || tc.passiveOf || !ACTIONS[tc.actionId].interruptible)) continue;
    for (const def of SOCIAL_ACTIONS) {
      if (def.playerOnly || !world.checkSocialAction(a, t, def.id).ok) continue;
      let score = benefit(a.needs, def.effects, def.duration, urgentOnly);
      // Las personas también cuidan de las mascotas de casa (pasear, bañar...).
      if (!urgentOnly && a.kind === 'person' && t.kind === 'pet' && t.householdId === a.householdId && def.partnerEffects) {
        score += 0.6 * benefit(t.needs, def.partnerEffects, def.duration);
      }
      if (score <= 0) continue;
      options.push({ choice: { actionId: def.id, targetAgentId: t.id }, score: score * distFactor(t.pos.x, t.pos.y) * jitter() });
    }
  }

  options.sort((x, y) => y.score - x.score);
  const top = options.slice(0, 3).filter((o) => o.score >= 1.5);
  if (!top.length) return null;
  // Elección ponderada entre las mejores para que no sean robots.
  const weights = top.map((o) => o.score ** 2);
  let r = Math.random() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) return top[i].choice;
  }
  return top[0].choice;
}
