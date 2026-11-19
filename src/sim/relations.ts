// Tipos de relación y desgaste. Las etiquetas salen de cómo se llevan (amistad, romance, estado), de la
// familia (padres, hijos, hermanos), del trabajo (compañeros, y el que se odia) y de dos pactos que se
// eligen: mejores amigos y persona non grata. Sin atención (charlas, abrazos, regalos, besos), las
// amistades se enfrían y las parejas entran en crisis y rompen.

import { CAREERS } from '../data/careers';
import { getRel, isAdult, partnerOf, relKey } from './social';
import type { Agent, Rel } from './types';
import type { World } from './world';
import { onBreakUp } from './systems/breakups';

export interface RelTag {
  id: string;
  icon: string;
  label: string;
}

/** Días sin un detalle a partir de los cuales se empieza a notar. */
export const NEGLECT = { friends: 4, couple: 3, best: 6 };
/** Romance por debajo del cual la pareja está en crisis, y por debajo del cual rompe. */
export const COUPLE = { crisis: 35, breakup: 15 };

const tag = (id: string, icon: string, label: string): RelTag => ({ id, icon, label });

function kinTag(a: Agent, b: Agent): RelTag {
  if (b.parents?.includes(a.id)) return tag('hijo', '👶', b.sex === 'm' ? 'Su hijo' : b.sex === 'f' ? 'Su hija' : 'Su hijo/a');
  if (a.parents?.includes(b.id)) return tag('padre', '🧓', b.sex === 'f' ? 'Su madre' : 'Su padre');
  if (a.parents?.some((p) => b.parents?.includes(p))) return tag('hermano', '👫', b.sex === 'f' ? 'Su hermana' : 'Su hermano');
  return tag('familia', '🏠', 'Familia');
}

/** ¿Son compañeros de trabajo (o de clase)? */
export function coworkers(a: Agent, b: Agent): 'trabajo' | 'clase' | null {
  if (!a.job || !b.job || a.job.career !== b.job.career) return null;
  return CAREERS[a.job.career]?.school ? 'clase' : 'trabajo';
}

/** Qué son el uno para el otro (de lo más importante a lo menos). */
export function relTags(w: World, a: Agent, b: Agent): RelTag[] {
  const rel = getRel(w.state, a.id, b.id);
  const out: RelTag[] = [];
  if (a.kind === 'pet' || b.kind === 'pet') {
    if (rel.f >= 60) out.push(tag('inseparables', '🐾', 'Inseparables'));
    else if (rel.f >= 25) out.push(tag('carino', '🐾', 'Le tiene cariño'));
    else if (rel.f <= -25) out.push(tag('mania', '😾', 'Le tiene manía'));
    else out.push(tag('poco', '🐾', 'Se conocen poco'));
    return out;
  }
  if (rel.kin) out.push(b.parents || a.parents ? kinTag(a, b) : tag('familia', '🏠', 'Familia'));
  if (rel.status === 'married') out.push(tag('esposos', '💍', b.sex === 'f' ? 'Su mujer' : b.sex === 'm' ? 'Su marido' : 'Casados'));
  else if (rel.status === 'partner') out.push(tag('novios', '❤️', b.sex === 'f' ? 'Su novia' : b.sex === 'm' ? 'Su novio' : 'Pareja'));
  if (rel.affair) out.push(tag('amantes', '🔥', 'Amantes'));
  if (rel.ex || rel.split !== undefined) out.push(tag('ex', '💔', a.longing?.who === b.id ? 'Ex (no lo ha superado)' : 'Ex'));
  // La nueva pareja de su ex (y si aún no lo ha superado, rival).
  if (a.longing && partnerOf(w.state, a.longing.who) === b.id) out.push(tag('rival', '😤', 'La nueva pareja de su ex'));
  if (!rel.status && !rel.affair && !rel.kin && rel.r >= 25) out.push(tag('interes', '😍', 'Interés romántico'));
  if (rel.banned) out.push(tag('nongrata', '🚫', rel.banned === a.id ? 'Persona non grata (vetada por ti)' : 'Te tiene vetado/a en su casa'));
  if (rel.best) out.push(tag('mejores', '🫶', 'Mejores amigos'));
  else if (!rel.kin) {
    if (rel.f <= -50) out.push(tag('enemigos', '⚔️', 'Enemigos'));
    else if (rel.f <= -15) out.push(tag('malrollo', '😒', 'Mal rollo'));
    else if (rel.f >= 45) out.push(tag('buenos', '😊', 'Buenos amigos'));
    else if (rel.f >= 15) out.push(tag('amigos', '🙂', 'Amigos'));
  }
  const co = coworkers(a, b);
  if (co === 'trabajo') out.push(rel.f <= -30 ? tag('companero_odio', '😤', 'Compañero/a de trabajo (lo odias)') : tag('companero', '💼', 'Compañero/a de trabajo'));
  if (co === 'clase') out.push(tag('clase', '🎒', 'Compañero/a de clase'));
  if (!out.length) out.push(tag('conocidos', '👋', 'Conocidos'));
  return out;
}

/** La etiqueta principal (para la ficha y las conversaciones). */
export function mainTag(w: World, a: Agent, b: Agent): RelTag {
  return relTags(w, a, b)[0];
}

/** Un detalle entre los dos: cuenta como atención (la relación no se desgasta). */
export function attend(w: World, a: Agent, b: Agent) {
  const rel = w.state.rels[relKey(a.id, b.id)];
  if (rel) rel.last = w.day;
}

/** ¿`b` tiene prohibida la entrada en casa de `a` (o al revés)? */
export function isBanned(w: World, guest: Agent, hostHouseholdId: string): boolean {
  const host = w.state.households.find((h) => h.id === hostHouseholdId);
  if (!host) return false;
  return host.memberIds.some((id) => getRel(w.state, id, guest.id).banned === id);
}

/** Cada mañana: el desgaste de lo que no se cuida. Solo las relaciones de la familia del jugador avisan. */
export function dailyRelations(w: World) {
  for (const [k, rel] of Object.entries(w.state.rels)) {
    const [xId, yId] = k.split('|');
    const x = w.agent(xId);
    const y = w.agent(yId);
    if (!x || !y) continue;
    const idle = w.day - (rel.last ?? w.day);
    const mine = w.isPlayerMember(x) || w.isPlayerMember(y);
    rel.last = rel.last ?? w.day;
    if (rel.kin) continue;
    // Amistades: se enfrían poco a poco; mucho más si nadie da señales.
    if (Math.abs(rel.f) > 5) rel.f -= Math.sign(rel.f) * (rel.f > 0 && idle > NEGLECT.friends ? 1.5 : 0.5);
    if (rel.best && idle > NEGLECT.best && rel.f < 55) {
      rel.best = false;
      if (mine) w.toast(`${x.name} y ${y.name} ya no son mejores amigos: hace mucho que no se ven`, '💔');
    }
    // Romance sin pareja: se apaga solo.
    if (!rel.status && !rel.affair) {
      rel.r = Math.max(0, rel.r - 1);
      continue;
    }
    // Parejas: los vecinos que viven juntos se cuidan solos; las de la familia del jugador, si no hay
    // detalles en unos días, se desgastan hasta la crisis y la ruptura.
    if (!mine) {
      rel.r = Math.max(0, rel.r - 0.5);
      continue;
    }
    if (idle <= NEGLECT.couple) continue;
    rel.r = Math.max(0, rel.r - (rel.status === 'married' ? 2 : 3));
    if (rel.status && rel.r < COUPLE.breakup) breakUp(w, x, y, rel);
    else if (rel.status && rel.r < COUPLE.crisis && rel.crisis === undefined) {
      rel.crisis = w.day;
      w.toast(`${x.name} y ${y.name} están en crisis: hace días que no hay ni un detalle. Un abrazo, un beso, un regalo...`, '⚠️');
      for (const p of [x, y]) if (p.kind === 'person') w.feel(p, 'crisis', p === x ? y.name : x.name);
    } else if (rel.r >= COUPLE.crisis) rel.crisis = undefined;
  }
}

/** Ruptura (o divorcio) por desgaste. */
export function breakUp(w: World, x: Agent, y: Agent, rel: Rel) {
  const married = rel.status === 'married';
  rel.status = undefined;
  rel.crisis = undefined;
  rel.r = Math.min(rel.r, 10);
  rel.f = Math.min(rel.f, 10);
  if (x.householdId === y.householdId) rel.ex = true;
  onBreakUp(w, x, y, rel);
  for (const p of [x, y]) if (p.kind === 'person') w.feel(p, 'corazon_roto', p === x ? y.name : x.name);
  w.toast(married ? `${x.name} y ${y.name} se divorcian: el amor se ha ido apagando de no cuidarlo` : `${x.name} y ${y.name} lo han dejado: tanto tiempo sin un detalle pasa factura`, '💔');
  w.addNews(married ? `${x.name} y ${y.name} se han divorciado` : `${x.name} y ${y.name} lo han dejado`, [x.id, y.id]);
}

const COWORKER_GOOD = ['te ha invitado a un café', 'te ha cubierto delante del jefe', 'te ha traído rosquillas', 'se ha reído con tus chistes'];
const COWORKER_BAD = ['te ha robado el táper de la nevera', 'se ha llevado el mérito de tu trabajo', 'ha calentado pescado en el microondas', 'te ha puesto verde delante del jefe'];

/** Al acabar el turno: a veces pasa algo con un compañero de trabajo. */
export function coworkerDay(w: World, a: Agent) {
  if (!a.job || CAREERS[a.job.career]?.school || Math.random() > 0.25) return;
  const mates = w.state.agents.filter((o) => o !== a && o.kind === 'person' && !o.role && isAdult(o) && coworkers(a, o) === 'trabajo');
  if (!mates.length) return;
  const o = mates[Math.floor(Math.random() * mates.length)];
  const rel = getRel(w.state, a.id, o.id);
  // Quien ya te cae mal, más bien hace de las suyas.
  const good = Math.random() < (rel.f <= -30 ? 0.25 : rel.f >= 30 ? 0.8 : 0.6);
  const key = relKey(a.id, o.id);
  w.state.rels[key] = { ...rel, f: Math.max(-100, Math.min(100, rel.f + (good ? 6 : -9))), last: w.day };
  if (w.isPlayerMember(a)) {
    const list = good ? COWORKER_GOOD : COWORKER_BAD;
    w.toast(`En el trabajo, ${o.name} ${list[Math.floor(Math.random() * list.length)].replace('te ', `a ${a.name} le `).replace('tus', 'sus')}`, good ? '☕' : '😤', a.id);
  }
}

/** Para las pruebas y el panel: quién es su pareja ahora. */
export function partnerName(w: World, a: Agent): string | undefined {
  const p = partnerOf(w.state, a.id);
  return p ? w.agent(p)?.name : undefined;
}
