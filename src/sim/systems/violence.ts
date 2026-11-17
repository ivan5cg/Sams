// Enemistades que acaban mal. Con un enemigo se puede uno liar a mamporros (gana quien está en forma; el que
// pierde acaba magullado y, a veces, muerto) o, con un enemigo acérrimo, echarle algo en la comida (mejor
// cuanto más se sabe de cocina; si sale mal, sospecha). Si muere alguien, la policía puede pillar al culpable
// (más con testigos): días a la sombra y adiós al trabajo; si no, remordimientos y murmuraciones. Los
// enemigos del barrio también pueden buscarte bronca, aunque es raro: entonces es defensa propia.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { MINUTES_PER_DAY } from '../constants';
import { addSecret } from '../gossip';
import { getRel, isAdult, relKey } from '../social';
import { hasTrait } from '../traits';
import type { Agent } from '../types';
import type { World } from '../world';
import { catchIllness } from './illness';
import { die } from './lifecycle';
import { skillLevel } from './skills';
import { endTask } from './tasks';

/** Umbrales de amistad: para liarse a mamporros, para envenenar y para que un vecino te busque bronca. */
export const HATE = { fight: -50, poison: -70, npcAttack: -70 };
/** Probabilidad de morir en una pelea (el que pierde), y si es mayor. */
export const FIGHT_DEATH = { base: 0.03, elder: 0.1 };
/** Días de cárcel si te pillan. */
export const JAIL_DAYS = 10;

const fighter = (w: World, a: Agent) => {
  const st = w.stageOf(a);
  return skillLevel(w, a, 'forma') + Math.random() * 6 + (st === 'elder' ? -3 : st === 'teen' ? -1 : 1) + (hasTrait(a, 'deportista') ? 2 : 0);
};

/** Testigos: quien esté en la misma parcela (sin contar a los dos). */
function witnesses(w: World, a: Agent, b: Agent): Agent[] {
  return w.agentsIn(a.lotId).filter((o) => o !== a && o !== b && o.kind === 'person' && !o.travel && !o.hidden);
}

/** Una pelea. `aggressor` empieza; si es el otro el que gana y mata, es defensa propia. */
export function fight(w: World, aggressor: Agent, victim: Agent) {
  const loud = w.isPlayerMember(aggressor) || w.isPlayerMember(victim);
  const seen = witnesses(w, aggressor, victim);
  const aWins = fighter(w, aggressor) >= fighter(w, victim);
  const [winner, loser] = aWins ? [aggressor, victim] : [victim, aggressor];
  const key = relKey(aggressor.id, victim.id);
  const rel = getRel(w.state, aggressor.id, victim.id);
  w.state.rels[key] = { ...rel, f: Math.max(-100, rel.f - 20), best: false };
  loser.needs.energy = Math.max(0, loser.needs.energy - 40);
  loser.needs.fun = Math.max(0, loser.needs.fun - 20);
  w.feel(loser, 'magullado', winner.name);
  w.feel(winner, 'enfadado', loser.name);
  if (loud) w.toast(`¡Mamporros! ${aggressor.name} y ${victim.name} se han liado a tortas. Gana ${winner.name}`, '🥊');
  w.addNews(`${aggressor.name} y ${victim.name} se han peleado a puñetazos`, [aggressor.id, victim.id]);
  const deadly = w.stageOf(loser) === 'elder' ? FIGHT_DEATH.elder : FIGHT_DEATH.base;
  if (Math.random() < deadly) {
    die(w, loser, 'fight', winner.name);
    // Si muere el que buscó la pelea, el otro se defendía.
    if (loser !== aggressor) crime(w, winner, loser, seen.length);
    else if (loud) w.toast(`La policía lo tiene claro: ${winner.name} se defendía. Defensa propia`, '👮');
  }
}

/** Echarle algo en la comida: con cocina, más fácil. Si no sale, se da cuenta. */
export function poison(w: World, a: Agent, t: Agent): boolean {
  const loud = w.isPlayerMember(a) || w.isPlayerMember(t);
  const ok = Math.random() < 0.3 + 0.05 * skillLevel(w, a, 'cocina');
  if (!ok) {
    const key = relKey(a.id, t.id);
    const rel = getRel(w.state, a.id, t.id);
    w.state.rels[key] = { ...rel, f: Math.max(-100, rel.f - 30) };
    w.feel(t, 'insultado', a.name);
    if (loud) w.toast(`A ${t.name} le ha sabido raro el plato que le ha preparado ${a.name}... y no se lo ha comido. Sospecha`, '🤨');
    return false;
  }
  // El veneno quita cualquier otra cosa que tuviera (y se apunta quién lo sirvió).
  t.illness = undefined;
  catchIllness(w, t, 'envenenamiento');
  const ill: Agent['illness'] = (t as { illness?: Agent['illness'] }).illness;
  if (ill) ill.by = a.id;
  if (w.isPlayerMember(a)) w.toast(`${a.name} le ha servido a ${t.name} un plato «especial». A ver qué pasa...`, '🍲');
  return true;
}

/** Ha muerto alguien por culpa de `killer`: ¿lo pilla la policía? */
export function crime(w: World, killer: Agent, victim: Agent, seen: number) {
  if (!w.agent(killer.id)) return;
  const caught = Math.random() < Math.min(0.95, 0.35 + 0.15 * seen);
  const mine = w.isPlayerMember(killer);
  if (caught) {
    endTask(w, killer);
    killer.queue = [];
    killer.travel = { from: killer.lotId, to: w.householdOf(killer)?.lotId ?? killer.lotId, arrive: w.state.minutes + JAIL_DAYS * MINUTES_PER_DAY, reason: 'jail' };
    if (killer.job && isAdult(killer)) killer.job = undefined;
    w.toast(`La policía ha detenido a ${killer.name} por la muerte de ${victim.name}: ${JAIL_DAYS} días a la sombra (y adiós al trabajo)`, '👮', killer.id);
    w.addNews(`han detenido a ${killer.name} por lo de ${victim.name}`, [killer.id, victim.id]);
    for (const m of w.state.agents) if (m.householdId === killer.householdId && m !== killer && m.kind === 'person') w.feel(m, 'verguenza', killer.name);
  } else {
    w.feel(killer, 'remordimientos', victim.name, 72);
    if (mine) w.toast(`Nadie sospecha de ${killer.name}... de momento. Pero la conciencia no se calla`, '😶');
    const gossips = w.state.agents.filter((a) => a.role === 'chismosa').map((a) => a.id);
    addSecret(w.state, { kind: 'lio', text: `Dicen que ${killer.name} tuvo algo que ver con lo de ${victim.name}...`, about: [killer.id, victim.id], known: gossips, juicy: 3, day: w.day });
  }
}

/** Al morir envenenado: la culpa es de quien le sirvió el plato. */
export function poisonDeath(w: World, victim: Agent, byId: string | undefined) {
  const killer = byId ? w.agent(byId) : undefined;
  die(w, victim, 'poison', killer?.name);
  if (killer) crime(w, killer, victim, 0);
}

/** Cada hora: algún enemigo del barrio le busca bronca a alguien de la familia (raro). */
export function hourlyGrudges(w: World) {
  for (const m of w.members) {
    if (m.kind !== 'person' || m.travel || !isAdult(m) && w.stageOf(m) !== 'teen') continue;
    for (const o of w.agentsIn(m.lotId)) {
      if (o === m || o.kind !== 'person' || o.role || o.travel || w.isPlayerMember(o) || !isAdult(o)) continue;
      if (getRel(w.state, m.id, o.id).f > HATE.npcAttack) continue;
      if (Math.random() < 0.02 * (hasTrait(o, 'grunon') ? 2 : 1)) {
        endTask(w, m);
        fight(w, o, m);
        return;
      }
    }
  }
}

/** Al volver de la cárcel. */
export function backFromJail(w: World, a: Agent) {
  w.feel(a, 'verguenza', a.name);
  if (w.isPlayerMember(a)) w.toast(`${a.name} sale de la cárcel. Toca empezar de cero (y buscar trabajo)`, '🚪', a.id);
}
