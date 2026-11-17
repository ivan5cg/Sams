// Enfermedades y muertes que no son de viejo: se pillan solas (según la estación) o se pegan en la misma
// casa, se notan (cansan, dan hambre o ganas de ir al baño), se curan solas o con médico y medicinas, y
// algunas (la gripe en los mayores, la neumonía) pueden acabar mal. Además, de vez en cuando: un infarto,
// electrocutarse arreglando un aparato o, rarísimo, morirse de risa con un chiste.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { CATCH_CHANCE, HEART_ATTACK, ILLNESSES } from '../../data/illnesses';
import { ELECTRIC } from '../../data/seasons';
import { MINUTES_PER_DAY } from '../constants';
import { hasEmotion } from '../emotions';
import { hasTrait } from '../traits';
import type { Agent, NeedKey } from '../types';
import type { World } from '../world';
import { die } from './lifecycle';
import { skillLevel } from './skills';
import { poisonDeath } from './violence';

/** Cuánto más rápido baja una necesidad por estar malo. */
export function illnessDecay(a: Agent, k: NeedKey): number {
  const ill = a.illness && ILLNESSES[a.illness.id];
  return ill?.decay[k] ?? 1;
}

export function isSick(a: Agent): boolean {
  return !!a.illness;
}

/** Ponerse malo (si no lo estaba ya). Devuelve si ha caído. */
export function catchIllness(w: World, a: Agent, id: string, from?: Agent): boolean {
  const def = ILLNESSES[id];
  if (!def || a.kind !== 'person' || a.illness || a.role) return false;
  if (def.stages && !def.stages.includes(w.stageOf(a))) return false;
  a.illness = { id, since: w.state.minutes, until: w.state.minutes + def.days * MINUTES_PER_DAY };
  w.feel(a, 'enfermo', def.label.toLowerCase());
  if (w.isPlayerMember(a)) w.toast(`${a.name} se ha puesto malo/a: ${def.label.toLowerCase()}${from ? ` (se la ha pegado ${from.name})` : ''}. ${def.thought}`, def.icon, a.id);
  return true;
}

/** Curarse. */
function heal(w: World, a: Agent) {
  const ill = a.illness;
  if (!ill) return;
  const def = ILLNESSES[ill.id];
  a.illness = undefined;
  a.emotions = (a.emotions ?? []).filter((e) => e.id !== 'enfermo');
  // Una gripe mal curada se puede complicar.
  if (def?.worsens && !ill.treated && Math.random() < (w.stageOf(a) === 'elder' ? def.worsens.elder : def.worsens.chance)) {
    if (w.isPlayerMember(a)) w.toast(`La ${def.label.toLowerCase()} de ${a.name} se ha complicado. Hay que llamar al médico ya`, '🚑', a.id);
    catchIllness(w, a, def.worsens.into);
    return;
  }
  if (w.isPlayerMember(a)) w.toast(`${a.name} ya está bien de la ${def?.label.toLowerCase() ?? 'enfermedad'}. ¡Como nuevo/a!`, '💪', a.id);
}

/** Médico (por teléfono o en el centro de salud): tratada, se cura en la mitad de tiempo y es mucho menos peligrosa. */
export function seeDoctor(w: World, a: Agent): string | undefined {
  const ill = a.illness;
  if (!ill) return 'No está malo/a';
  if (ill.treated) return 'Ya tiene tratamiento';
  const def = ILLNESSES[ill.id];
  ill.treated = true;
  ill.until = w.state.minutes + Math.max(0.5, (ill.until - w.state.minutes) / MINUTES_PER_DAY / 2) * MINUTES_PER_DAY;
  if (w.isPlayerMember(a)) w.toast(`La médica le ha mandado reposo y medicinas a ${a.name}: la ${def.label.toLowerCase()} se cura antes`, '🩺', a.id);
  return undefined;
}

/** Cada mañana: quién se pone malo, quién se cura, quién empeora y los sustos de verdad. */
export function dailyHealth(w: World) {
  const season = w.season;
  for (const a of [...w.state.agents]) {
    if (a.kind !== 'person' || a.role || a.travel?.arrive === Number.POSITIVE_INFINITY) continue;
    const st = w.stageOf(a);
    // Las enfermedades graves sin tratar pueden acabar mal.
    const ill = a.illness;
    if (ill) {
      const def = ILLNESSES[ill.id];
      const risk = (def?.deadly?.[st as keyof NonNullable<typeof def.deadly>] ?? 0) * (ill.treated ? 0.25 : 1);
      // Los vecinos también van al médico (no siempre a tiempo).
      if (!w.isPlayerMember(a) && risk && !ill.treated && Math.random() < 0.5) seeDoctor(w, a);
      if (risk && Math.random() < risk) {
        if (ill.id === 'envenenamiento') poisonDeath(w, a, ill.by);
        else die(w, a, 'illness', def.label.toLowerCase());
        continue;
      }
      if (w.state.minutes >= ill.until) heal(w, a);
      continue;
    }
    // Pillar algo.
    for (const [id, chances] of Object.entries(CATCH_CHANCE)) {
      if (Math.random() < chances[season] && catchIllness(w, a, id)) break;
    }
    // Infarto: los mayores y los adultos; más si comen mucho y no se mueven.
    const base = st === 'elder' ? HEART_ATTACK.elder : st === 'adult' ? HEART_ATTACK.adult : 0;
    if (base) {
      const risk = base * (hasTrait(a, 'gloton') ? 2 : 1) * (skillLevel(w, a, 'forma') >= 4 ? 0.5 : 1) * (hasEmotion(a, 'enfadado') ? 1.5 : 1);
      if (Math.random() < risk) die(w, a, 'heart');
    }
  }
}

/** Cada hora: lo que se pega en la misma parcela (menos si se va limpio). */
export function hourlyContagion(w: World) {
  const sick = w.state.agents.filter((a) => a.illness && !a.travel && ILLNESSES[a.illness.id]?.contagion);
  for (const s of sick) {
    const def = ILLNESSES[s.illness!.id];
    for (const o of w.agentsIn(s.lotId)) {
      if (o === s || o.kind !== 'person' || o.travel || o.illness || o.role) continue;
      const clean = o.needs.hygiene > 70 ? 0.6 : 1;
      if (Math.random() < def.contagion * clean) catchIllness(w, o, def.id, s);
    }
  }
}

/** Al terminar algunas cosas: comer algo en mal estado, arreglar un enchufe sin saber, un chiste demasiado bueno. */
export function riskyTask(w: World, a: Agent, actionId: string, objDef?: string) {
  // Cocinar sin tener ni idea (o la barbacoa del cuñado): alguna intoxicación.
  if ((actionId === 'cook' || actionId === 'bbq') && skillLevel(w, a, 'cocina') < 2 && Math.random() < 0.01) {
    for (const o of w.agentsIn(a.lotId)) if (o.kind === 'person' && Math.random() < 0.5) catchIllness(w, o, 'intoxicacion');
    catchIllness(w, a, 'intoxicacion');
  }
  // Arreglar un aparato eléctrico sin saber: calambrazo; rara vez, mortal.
  if (actionId === 'repair' && objDef && ELECTRIC.has(objDef) && skillLevel(w, a, 'logica') < 3) {
    const r = Math.random();
    if (r < 0.004) die(w, a, 'electric', objDef);
    else if (r < 0.06 && w.isPlayerMember(a)) w.toast(`¡Calambrazo! A ${a.name} le ha dado la corriente arreglando el aparato. Para la próxima, un técnico`, '⚡', a.id);
  }
}

/** Un chiste muy bueno (y alguien mayor, o con el corazón flojo) puede matar de risa. Rarísimo. */
export function jokeRisk(w: World, teller: Agent, listener: Agent) {
  if (listener.kind !== 'person' || listener.role) return;
  const chance = (w.stageOf(listener) === 'elder' ? 0.002 : 0.0002) * (hasTrait(teller, 'bromista') ? 2 : 1);
  if (Math.random() < chance) die(w, listener, 'laugh', teller.name);
}
