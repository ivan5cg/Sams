// Culebrones del barrio: historias entre vecinos que duran varios días (un lío, una guerra de
// vecinos, un romance con boda). Cada paso deja noticias, salseo y conversaciones, y la familia
// del jugador puede meterse: mediar o chivarse.

import { addSecret } from '../gossip';
import { MINUTES_PER_DAY } from '../constants';
import { PARK_LOT, squareOf } from '../neighborhood';
import { canRomance, changeRel, getRel, isAdult, partnerOf, relKey } from '../social';
import { forget } from '../emotions';
import type { Agent, Arc } from '../types';
import type { World } from '../world';
import { startEvent } from './calendar';
import { catchAffair } from './gossip';
import { moveToHousehold } from './lifecycle';
import { districtOf, startTravel } from './travel';
import { skillLevel } from './skills';

export const ARC_INFO: Record<Arc['kind'], { title: string; icon: string; steps: string[] }> = {
  lio: { title: 'Un lío en el barrio', icon: '🦌', steps: ['Rumores', 'Los pillan', 'Bronca en el parque', 'Separación', 'Mudanza'] },
  pelea: { title: 'Guerra de vecinos', icon: '💢', steps: ['Quejas por el ruido', 'Cartel en el portal', 'Bronca en la calle', 'Final'] },
  romance: { title: 'Amor en el barrio', icon: '💘', steps: ['Miradas en el bar', 'Novios', 'Pedida en la plaza', 'Boda en el parque'] },
};

/** Como mucho, tantos culebrones a la vez. */
const MAX_ACTIVE = 2;

const pick = <T>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];

export function activeArcs(w: World): Arc[] {
  return (w.state.arcs ?? []).filter((a) => !a.end);
}

/** El culebrón en marcha en el que sale alguien (si hay). */
export function arcOf(w: World, agentId: string): Arc | undefined {
  return activeArcs(w).find((a) => a.who.includes(agentId));
}

/** Minuto absoluto de dentro de `days` días a las `hour`. */
function at(w: World, days: number, hour: number): number {
  const dayStart = Math.floor(w.state.minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  return dayStart + days * MINUTES_PER_DAY + hour * 60;
}

/** Vecinos adultos que pueden protagonizar algo (ni la familia del jugador ni la gente de la calle). */
function cast(w: World): Agent[] {
  return w.state.agents.filter((a) => a.kind === 'person' && !a.role && isAdult(a) && w.stageOf(a) !== 'elder' && !w.isPlayerMember(a) && !arcOf(w, a.id));
}

/** Empieza un culebrón (o devuelve null si no hay con quién). Se puede forzar quiénes. */
export function startArc(w: World, kind: Arc['kind'], who?: string[]): Arc | null {
  let ids = who;
  if (!ids) {
    const people = cast(w);
    if (kind === 'lio') {
      const x = pick(people.filter((p) => partnerOf(w.state, p.id) && !w.isPlayerMember(w.agent(partnerOf(w.state, p.id))!)));
      const p = x && w.agent(partnerOf(w.state, x.id));
      const y = x && p && pick(people.filter((c) => c !== x && c !== p && c.householdId !== x.householdId && canRomance(w.state, x, c) && !getRel(w.state, x.id, c.id).kin));
      if (!x || !p || !y) return null;
      ids = [x.id, y.id, p.id];
    } else if (kind === 'pelea') {
      const a = pick(people);
      const b = a && pick(people.filter((c) => c.householdId !== a.householdId && !getRel(w.state, a.id, c.id).status));
      if (!a || !b) return null;
      ids = [a.id, b.id];
    } else {
      const singles = people.filter((p) => !partnerOf(w.state, p.id));
      const a = pick(singles);
      const b = a && pick(singles.filter((c) => c.householdId !== a.householdId && canRomance(w.state, a, c) && !getRel(w.state, a.id, c.id).kin));
      if (!a || !b) return null;
      ids = [a.id, b.id];
    }
  }
  const arc: Arc = { id: w.newId('c'), kind, step: 0, who: ids, next: at(w, 1, 17), day: w.day };
  w.state.arcs = [...(w.state.arcs ?? []), arc];
  runStep(w, arc);
  return arc;
}

/** Cada día: a veces empieza un culebrón nuevo. */
export function dailyArcs(w: World) {
  if (!w.wishesEnabled || activeArcs(w).length >= MAX_ACTIVE || Math.random() > 0.35) return;
  const kinds: Arc['kind'][] = ['lio', 'pelea', 'romance'];
  for (const k of kinds.sort(() => Math.random() - 0.5)) if (startArc(w, k)) return;
}

/** Cada hora: los culebrones avanzan cuando les toca (y durante una boda, fiesta en el parque). */
export function arcsHour(w: World) {
  if (w.hasEvent('boda')) for (const a of w.agentsIn(PARK_LOT)) if (a.kind === 'person' && !a.role) w.feel(a, 'fiesta', undefined, 4);
  for (const arc of activeArcs(w)) {
    // Si alguien ya no está, o ha entrado en la familia del jugador, la historia se queda ahí.
    if (arc.who.some((id) => !w.agent(id) || w.isPlayerMember(w.agent(id)!))) {
      finish(w, arc, 'se quedó a medias');
      continue;
    }
    if (w.state.minutes < arc.next) continue;
    arc.step++;
    runStep(w, arc);
  }
  // Solo se guardan los últimos acabados.
  const done = (w.state.arcs ?? []).filter((a) => a.end);
  if (done.length > 8) w.state.arcs = (w.state.arcs ?? []).filter((a) => !a.end || done.slice(-8).includes(a));
}

function finish(w: World, arc: Arc, how: string) {
  arc.end = { day: w.day, how };
}

/** Lleva a los dos a un sitio público (si pueden ir) para que se vea la escena. */
function meet(w: World, a: Agent, b: Agent, lotId: string) {
  for (const x of [a, b]) {
    if (x.travel || x.hidden || x.lotId === lotId || w.isPlayerMember(x)) continue;
    startTravel(w, x, lotId);
    x.visitUntil = w.state.minutes + 15 + 150;
  }
}

/** Lo que pasa en el paso actual. */
function runStep(w: World, arc: Arc) {
  const [x, y, p] = arc.who.map((id) => w.agent(id)!) as [Agent, Agent, Agent | undefined];
  if (arc.kind === 'lio') {
    const partner = p!;
    switch (arc.step) {
      case 0: {
        const rel = w.state.rels[relKey(x.id, y.id)] ?? (w.state.rels[relKey(x.id, y.id)] = { f: 0, r: 0 });
        rel.affair = true;
        changeRel(w.state, x.id, y.id, 20, 40);
        const gossips = w.state.agents.filter((c) => c.role === 'chismosa').map((c) => c.id);
        addSecret(w.state, { kind: 'lio', text: `${x.name} tiene un lío con ${y.name}, y ${partner.name} no sabe nada`, about: [x.id, y.id, partner.id], known: [x.id, y.id, ...gossips], juicy: 3, day: w.day });
        arc.next = at(w, 1, 17);
        return;
      }
      case 1:
        catchAffair(w, x, y, partner, 'pillado');
        arc.next = at(w, 1, 18);
        return;
      case 2: {
        const lot = squareOf(districtOf(w, partner.lotId));
        meet(w, partner, x, lot);
        w.feel(partner, 'enfadado', x.name);
        w.feel(x, 'enfadado', partner.name);
        w.say(partner.id, '¡Sinvergüenza! ¡Delante de todo el barrio!');
        w.say(x.id, '¡Que no es lo que parece!');
        w.addNews(`bronca monumental entre ${partner.name} y ${x.name}: se ha enterado medio barrio`, [x.id, partner.id]);
        w.toast(`Bronca monumental entre ${partner.name} y ${x.name} en ${w.lotById(lot).kind === 'park' ? 'el parque' : 'la plaza'}`, '💢', partner.id);
        arc.next = at(w, 1, 12);
        return;
      }
      case 3: {
        const rel = w.state.rels[relKey(x.id, partner.id)];
        if (rel?.status) {
          const married = rel.status === 'married';
          rel.status = undefined;
          if (x.householdId === partner.householdId) rel.ex = true;
          w.addNews(married ? `${partner.name} y ${x.name} se divorcian. Él/ella se queda con el piso` : `${partner.name} ha dejado a ${x.name}`, [x.id, partner.id]);
        }
        w.feel(partner, 'corazon_roto', x.name);
        arc.next = at(w, 2, 11);
        return;
      }
      default: {
        // Se muda con su amante (si cabe) o se queda durmiendo en el sofá de un amigo.
        const to = w.householdOf(y);
        if (to && to.id !== x.householdId && to.memberIds.length < 6 && x.householdId === partner.householdId) {
          moveToHousehold(w, x, to);
          w.addNews(`${x.name} ha hecho las maletas y se ha ido a vivir con ${y.name}`, [x.id, y.id]);
          finish(w, arc, 'mudanza');
        } else {
          w.addNews(`${x.name} duerme en el sofá de un amigo desde lo de ${y.name}`, [x.id]);
          finish(w, arc, 'cada uno por su lado');
        }
      }
    }
    return;
  }
  if (arc.kind === 'pelea') {
    const fam = (a: Agent) => w.householdOf(a)?.name ?? 'el vecino';
    switch (arc.step) {
      case 0:
        changeRel(w.state, x.id, y.id, -15);
        w.addNews(`en ${fam(x)} se quejan del ruido de ${y.name}: dicen que pone reguetón a las tres de la mañana`, [x.id, y.id]);
        arc.next = at(w, 1, 10);
        return;
      case 1:
        changeRel(w.state, x.id, y.id, -10);
        w.addNews(`ha aparecido un cartel en el portal: «A quien ponga la música a las 3, se la desenchufo». Firmado: ${x.name}`, [x.id, y.id]);
        arc.next = at(w, 1, 18);
        return;
      case 2: {
        const lot = squareOf(districtOf(w, x.lotId));
        meet(w, x, y, lot);
        w.feel(x, 'enfadado', y.name);
        w.feel(y, 'enfadado', x.name);
        w.say(x.id, '¡Que hay gente que madruga!');
        w.say(y.id, '¡Pues cómprese unos tapones!');
        w.addNews(`${x.name} y ${y.name} han tenido una bronca en la calle por lo del ruido`, [x.id, y.id]);
        arc.next = at(w, 1, 13);
        return;
      }
      default:
        if (Math.random() < 0.5) {
          changeRel(w.state, x.id, y.id, 35);
          forget(x, 'enfadado');
          forget(y, 'enfadado');
          w.addNews(`${x.name} y ${y.name} han hecho las paces con unas cañas en el Bar Casa Paco`, [x.id, y.id]);
          finish(w, arc, 'paces');
        } else {
          changeRel(w.state, x.id, y.id, -30);
          w.addNews(`${x.name} y ${y.name} ya no se hablan. Se cruzan en la escalera y miran al suelo`, [x.id, y.id]);
          finish(w, arc, 'no se hablan');
        }
    }
    return;
  }
  // Romance
  switch (arc.step) {
    case 0:
      changeRel(w.state, x.id, y.id, 10, 25);
      w.addNews(`${x.name} y ${y.name} no paran de mirarse en el Bar Casa Paco`, [x.id, y.id]);
      arc.next = at(w, 1, 20);
      return;
    case 1: {
      const rel = w.state.rels[relKey(x.id, y.id)] ?? (w.state.rels[relKey(x.id, y.id)] = { f: 0, r: 0 });
      rel.status = 'partner';
      changeRel(w.state, x.id, y.id, 10, 20);
      w.feel(x, 'enamorado', y.name);
      w.feel(y, 'enamorado', x.name);
      w.addNews(`${x.name} y ${y.name} están saliendo. ¡Ya era hora!`, [x.id, y.id]);
      arc.next = at(w, 2, 19);
      return;
    }
    case 2:
      w.addNews(`${x.name} le ha pedido matrimonio a ${y.name} en la plaza, de rodillas y con el anillo de su abuela`, [x.id, y.id]);
      w.feel(x, 'enamorado', y.name);
      w.feel(y, 'enamorado', x.name);
      arc.next = at(w, 1, 17);
      return;
    default: {
      const rel = w.state.rels[relKey(x.id, y.id)];
      if (rel) rel.status = 'married';
      w.feel(x, 'boda', y.name);
      w.feel(y, 'boda', x.name);
      startEvent(w, 'boda', 5 * 60, PARK_LOT);
      meet(w, x, y, PARK_LOT);
      w.addNews(`${x.name} y ${y.name} se han casado en el parque. Hubo arroz, lágrimas y pasodoble`, [x.id, y.id]);
      w.toast(`¡Boda en el parque! ${x.name} y ${y.name} se casan hoy: estáis invitados`, '💒');
      finish(w, arc, 'boda');
    }
  }
}

/** ¿Se puede mediar con `t`? (en un lío ya destapado o en una guerra de vecinos). */
export function canMediate(w: World, t: Agent): boolean {
  const arc = arcOf(w, t.id);
  return !!arc && ((arc.kind === 'lio' && arc.step >= 1 && arc.step <= 3) || (arc.kind === 'pelea' && arc.step <= 2));
}

/** ¿Hay algo que contarle a `t`? (le están poniendo los cuernos y aún no lo sabe). */
export function canSnitch(w: World, t: Agent): boolean {
  const arc = arcOf(w, t.id);
  return !!arc && arc.kind === 'lio' && arc.step === 0 && arc.who[2] === t.id;
}

/** Mediar: con buena mano (carisma), se arregla. */
export function mediate(w: World, a: Agent, t: Agent) {
  const arc = arcOf(w, t.id);
  if (!arc || !canMediate(w, t)) return;
  const chance = Math.min(0.9, 0.4 + 0.08 * skillLevel(w, a, 'carisma'));
  const [x, y, p] = arc.who.map((id) => w.agent(id)!);
  if (Math.random() >= chance) {
    changeRel(w.state, a.id, t.id, -5);
    w.toast(`${a.name} ha intentado poner paz, pero ${t.name} no quiere ni oír hablar del tema`, '🙄', a.id);
    return;
  }
  const [u, v] = arc.kind === 'lio' ? [x, p!] : [x, y];
  const rel = w.state.rels[relKey(u.id, v.id)] ?? (w.state.rels[relKey(u.id, v.id)] = { f: 0, r: 0 });
  if (arc.kind === 'lio') {
    if (!rel.status) rel.status = 'partner';
    rel.ex = false;
    const affair = w.state.rels[relKey(x.id, y.id)];
    if (affair) affair.affair = false;
  }
  rel.f = Math.max(rel.f, 30);
  forget(u, 'enfadado');
  forget(v, 'enfadado');
  w.feel(u, 'reconciliados', v.name);
  w.feel(v, 'reconciliados', u.name);
  changeRel(w.state, a.id, t.id, 10);
  w.addNews(`gracias a ${a.name}, ${u.name} y ${v.name} han hecho las paces`, [u.id, v.id, a.id]);
  w.toast(`¡${a.name} ha conseguido que ${u.name} y ${v.name} hagan las paces!`, '🕊️', a.id);
  finish(w, arc, `paces gracias a ${a.name}`);
}

/** Chivarse: se lo cuentas a quien engañan y el lío salta antes de tiempo. */
export function snitch(w: World, a: Agent, t: Agent) {
  const arc = arcOf(w, t.id);
  if (!arc || !canSnitch(w, t)) return;
  const [x, y] = arc.who.map((id) => w.agent(id)!);
  catchAffair(w, x, y, t, 'chivatazo', a);
  arc.step = 1;
  arc.next = at(w, 1, 18);
}
