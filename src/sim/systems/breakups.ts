// Lo que viene después de romper: si viven bajo el mismo techo, uno de los dos se va a un piso de
// alquiler (lo puedes decidir tú desde el ordenador; si no, a los pocos días se va uno solo). Quien no lo
// supera echa de menos al ex durante días (mensajes a las tantas, hacerse el encontradizo... y alguna vez
// vuelven). Los solteros del barrio encuentran pareja nueva, y entonces llegan los celos hacia la nueva
// pareja del ex.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { addSecret } from '../gossip';
import { addRentalFlat } from '../neighborhood';
import { getRel, isAdult, partnerOf, relKey, setRel } from '../social';
import type { Agent, Household, Rel } from '../types';
import type { World } from '../world';
import { cantMoveOut } from './lifecycle';
import { money } from './money';
import { districtOf, startTravel } from './travel';

/** Días que aguantan bajo el mismo techo antes de que uno se vaya solo. */
export const EX_COHAB_DAYS = 3;
/** Probabilidad diaria de que un soltero del barrio encuentre pareja (más si acaba de romper). */
export const NEW_PARTNER = { single: 0.01, rebound: 0.05 };
/** Probabilidad diaria de superarlo, y de que haya escena. */
export const LONGING = { overIt: 0.07, scene: 0.15, reconcile: 0.3 };

/** Al romper: quién no lo supera, y desde cuándo están separados. */
export function onBreakUp(w: World, a: Agent, b: Agent, rel: Rel) {
  rel.split = w.day;
  for (const [x, y] of [[a, b], [b, a]] as const) {
    if (x.kind !== 'person') continue;
    // Quien quería más (o simplemente, quien tiene peor suerte) no lo supera.
    if (Math.random() < 0.6) x.longing = { who: y.id, since: w.day };
  }
}

/** ¿Puede irse de casa? (no deja a nadie sin un adulto, y es mayor de edad). */
export function moveOutReason(w: World, a: Agent): string | undefined {
  if (a.kind !== 'person' || !isAdult(a)) return 'Es menor de edad';
  const h = w.householdOf(a);
  if (!h) return 'No tiene casa';
  const others = h.memberIds.map((id) => w.agent(id)!).filter((x) => x && x.id !== a.id && x.kind === 'person');
  if (!others.length) return 'Vive solo/a: ya tiene su casa';
  if (!others.some((x) => isAdult(x))) return 'No puede dejar solos a los niños';
  return cantMoveOut(w, a);
}

/** Se va a vivir a un piso de alquiler (con su parte del dinero). */
export function moveOut(w: World, a: Agent): string | undefined {
  const why = moveOutReason(w, a);
  if (why) return why;
  const old = w.householdOf(a)!;
  const mine = old.id === w.household.id;
  const lotId = addRentalFlat(w.state, districtOf(w, old.lotId), a.name);
  w.rebuildGrid();
  const share = Math.max(0, Math.round(old.funds * 0.3));
  money(w, old, -share, 'ventas');
  const hid = `h${w.state.nextId++}`;
  w.state.lots.find((l) => l.id === lotId)!.householdId = hid;
  const next: Household = { id: hid, name: `${a.name} (piso)`, funds: share + 300, memberIds: [a.id], lotId, pantry: 10, ledger: [] };
  if (old.expecting?.mother === a.id) {
    next.expecting = old.expecting;
    old.expecting = undefined;
  }
  w.state.households.push(next);
  old.memberIds = old.memberIds.filter((id) => id !== a.id);
  a.householdId = hid;
  a.visitUntil = undefined;
  a.queue = [];
  // Ya no son «ex que viven juntos».
  for (const id of old.memberIds) {
    const r = w.state.rels[relKey(a.id, id)];
    if (r?.ex) r.ex = false;
  }
  if (!a.travel) startTravel(w, a, lotId);
  if (mine && w.state.activeAgentId === a.id) w.state.activeAgentId = w.members.find((m) => m.kind === 'person')?.id ?? w.members[0]?.id ?? a.id;
  w.toast(`${a.name} se va de casa a un piso de alquiler${share ? ` (se lleva §${share})` : ''}. Ahora es del barrio`, '📦', mine ? undefined : a.id);
  w.addNews(`${a.name} se ha ido de casa: ahora vive en un piso de alquiler`, [a.id]);
  return undefined;
}

/** Cada mañana: los ex que aún viven juntos, quien no lo supera, y los solteros que encuentran pareja. */
export function dailyBreakups(w: World) {
  // Ex bajo el mismo techo: a los pocos días, uno se va.
  for (const [k, rel] of Object.entries(w.state.rels)) {
    if (!rel.ex || rel.split === undefined || w.day - rel.split < EX_COHAB_DAYS) continue;
    const [x, y] = k.split('|').map((id) => w.agent(id));
    if (!x || !y || x.householdId !== y.householdId) continue;
    // Se va el que no está al mando (o el primero que pueda).
    const leaver = [x, y].sort((p, q) => Number(p.id === w.state.activeAgentId) - Number(q.id === w.state.activeAgentId)).find((p) => !moveOutReason(w, p));
    if (leaver) {
      w.toast(`${x.name} y ${y.name} no se aguantan más bajo el mismo techo`, '💢');
      moveOut(w, leaver);
    } else rel.split = undefined; // nadie puede irse (niños a cargo): siguen juntos
  }
  for (const a of [...w.state.agents]) {
    if (a.kind !== 'person') continue;
    const ex = a.longing ? w.agent(a.longing.who) : undefined;
    if (a.longing && !ex) a.longing = undefined;
    if (a.longing && ex) longingDay(w, a, ex);
  }
  matchmaking(w);
}

const SCENES = [
  (a: Agent, ex: Agent) => `${a.name} le ha escrito a ${ex.name} a las tres de la mañana: «¿Estás despierto/a?»`,
  (a: Agent, ex: Agent) => `${a.name} se ha hecho el encontradizo con ${ex.name} en la puerta del Mercadona. Tres veces`,
  (a: Agent, ex: Agent) => `${a.name} sigue mirando las fotos de ${ex.name} en el móvil`,
  (a: Agent, ex: Agent) => `${a.name} le ha devuelto a ${ex.name} una caja con sus cosas... y una carta de cuatro páginas`,
];

/** Echar de menos al ex: escenas, celos de su nueva pareja, superarlo o volver. */
function longingDay(w: World, a: Agent, ex: Agent) {
  const loud = w.isPlayerMember(a) || w.isPlayerMember(ex);
  const rival = partnerOf(w.state, ex.id);
  const newPartner = rival && rival !== a.id ? w.agent(rival) : undefined;
  w.feel(a, 'no_superado', ex.name, 24);
  // Celos de la nueva pareja del ex (una vez, al enterarse).
  if (newPartner && a.longing!.rival !== newPartner.id) {
    a.longing!.rival = newPartner.id;
    w.feel(a, 'celos', newPartner.name);
    const r = getRel(w.state, a.id, newPartner.id);
    setRel(w.state, a.id, newPartner.id, { ...r, f: Math.max(-100, r.f - 25) });
    if (loud) w.toast(`${a.name} no lleva nada bien que ${ex.name} salga ahora con ${newPartner.name}. Celos`, '😤', a.id);
    addSecret(w.state, { kind: 'lio', text: `${a.name} no ha superado lo de ${ex.name}, y ahora ${ex.name} sale con ${newPartner.name}`, about: [a.id, ex.id, newPartner.id], known: [], juicy: 2, day: w.day });
  }
  // Superarlo (antes si hay otra persona en su vida).
  const ownNew = partnerOf(w.state, a.id);
  if (Math.random() < LONGING.overIt * (ownNew ? 3 : 1)) {
    a.longing = undefined;
    a.emotions = (a.emotions ?? []).filter((e) => e.id !== 'no_superado');
    if (loud) w.toast(`${a.name} por fin ha pasado página con ${ex.name}`, '🌱', a.id);
    return;
  }
  if (Math.random() >= LONGING.scene) return;
  // Si los dos se echan de menos y ninguno tiene a nadie: a veces vuelven.
  if (ex.longing?.who === a.id && !newPartner && !ownNew && Math.random() < LONGING.reconcile) {
    const rel = getRel(w.state, a.id, ex.id);
    setRel(w.state, a.id, ex.id, { ...rel, status: 'partner', r: Math.max(rel.r, 55), f: Math.max(rel.f, 30), ex: false, split: undefined, last: w.day, crisis: undefined });
    a.longing = undefined;
    ex.longing = undefined;
    for (const p of [a, ex]) p.emotions = (p.emotions ?? []).filter((e) => e.id !== 'no_superado' && e.id !== 'corazon_roto');
    w.feel(a, 'enamorado', ex.name);
    w.feel(ex, 'enamorado', a.name);
    if (loud) w.toast(`¡${a.name} y ${ex.name} han vuelto! Lo suyo no estaba superado`, '💞');
    w.addNews(`${a.name} y ${ex.name} han vuelto. Otra vez`, [a.id, ex.id]);
    return;
  }
  // Si no, una escena (y al ex le agobia).
  const text = SCENES[Math.floor(Math.random() * SCENES.length)](a, ex);
  w.feel(ex, 'agobiado_ex', a.name);
  if (newPartner && Math.random() < 0.4) {
    const r = getRel(w.state, a.id, newPartner.id);
    setRel(w.state, a.id, newPartner.id, { ...r, f: Math.max(-100, r.f - 10) });
    if (loud) w.toast(`${a.name} ha puesto verde a ${newPartner.name}, la nueva pareja de ${ex.name}, delante de medio barrio`, '🌶️', a.id);
    return;
  }
  if (loud) w.toast(text, '📱', a.id);
}

/** Los solteros del barrio (y los recién separados, más) encuentran pareja entre ellos. */
function matchmaking(w: World) {
  const single = (x: Agent) => x.kind === 'person' && !x.role && !w.isPlayerMember(x) && ['young', 'adult'].includes(w.stageOf(x)) && !partnerOf(w.state, x.id) && !x.travel?.reason;
  const pool = w.state.agents.filter(single);
  for (const a of pool) {
    const rebound = !a.longing && recentlySplit(w, a);
    if (Math.random() >= (rebound ? NEW_PARTNER.rebound : NEW_PARTNER.single)) continue;
    const options = pool.filter((b) => b !== a && single(b) && b.householdId !== a.householdId && !getRel(w.state, a.id, b.id).kin && !getRel(w.state, a.id, b.id).banned);
    if (!options.length) continue;
    const b = options[Math.floor(Math.random() * options.length)];
    const rel = getRel(w.state, a.id, b.id);
    setRel(w.state, a.id, b.id, { ...rel, f: Math.max(rel.f, 40), r: Math.max(rel.r, 60), status: 'partner', last: w.day });
    const famous = w.members.some((m) => Math.abs(getRel(w.state, m.id, a.id).f) >= 15 || Math.abs(getRel(w.state, m.id, b.id).f) >= 15 || m.longing?.who === a.id || m.longing?.who === b.id);
    if (famous) w.toast(`${a.name} y ${b.name} están saliendo juntos`, '💑');
    w.addNews(`${a.name} y ${b.name} están saliendo`, [a.id, b.id]);
  }
}

/** ¿Ha roto con alguien hace poco? */
function recentlySplit(w: World, a: Agent): boolean {
  return Object.entries(w.state.rels).some(([k, r]) => r.split !== undefined && w.day - r.split < 20 && k.split('|').includes(a.id));
}

/** Para las pruebas: cuántos días quedan para que los ex que viven juntos se separen. */
export function daysUntilMoveOut(w: World, rel: Rel): number {
  return rel.split === undefined ? Infinity : Math.max(0, EX_COHAB_DAYS - (w.day - rel.split));
}

