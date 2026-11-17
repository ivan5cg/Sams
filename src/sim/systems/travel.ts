// Barrio: viajes entre parcelas (andando o en metro), llegadas y visitas.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { ACTIONS } from '../../data/actions';
import { CAREERS, workDays } from '../../data/careers';
import { lifeStage } from '../../data/species';
import { MINUTES_PER_DAY, RIDE_MINUTES, TRAVEL_MINUTES } from '../constants';
import { METRO_LOT, PARK_LOT, stationOf } from '../neighborhood';
import { findPath, isWalkable } from '../pathfinding';
import type { Agent, Household, Vec } from '../types';
import { rand } from '../util';
import type { World } from '../world';
import { finishShift } from './jobs';
import { petGreeting } from './pets';
import { closedReason, onArriveShopping } from './shopping';
import { deliverFood } from './street';
import { endTask } from './tasks';
import { wishEvent } from './wishes';
import { backFromTrip } from './trips';

export function canTravel(w: World, a: Agent, lotId: string): { ok: boolean; reason?: string } {
  if (a.travel) return { ok: false, reason: 'Ya va de camino' };
  if (a.lotId === lotId) return { ok: false, reason: 'Ya está aquí' };
  if (a.home) return { ok: false, reason: 'Vive en su jaula' };
  if (a.hidden) return { ok: false, reason: 'Está fuera' };
  if (a.current && ACTIONS[a.current.actionId].forced) return { ok: false, reason: 'No puede moverse ahora' };
  const closed = closedReason(w, lotId);
  if (closed) return { ok: false, reason: closed };
  return { ok: true };
}

/** Manda a uno o varios agentes a otra parcela del barrio. */
export function travel(w: World, agentIds: string[], lotId: string): boolean {
  const group = agentIds.map((id) => w.agent(id)!).filter((a) => a && canTravel(w, a, lotId).ok);
  if (!group.length) return false;
  for (const a of group) startTravel(w, a, lotId);
  const lot = w.lotById(lotId);
  const names = group.map((a) => a.name).join(', ');
  if (group.some((a) => w.isPlayerMember(a))) {
    w.toast(`${names} ${group.length > 1 ? 'van' : 'va'} a: ${lot.householdId === w.household.id ? 'casa' : lot.name}`, '🚶');
  }
  return true;
}

/** Barrio de una parcela: Madrid, Alcorcón o el metro. */
export function districtOf(w: World, lotId: string): string {
  return w.lotById(lotId)?.district ?? 'madrid';
}

/** ¿Hace falta coger el metro para ir de una parcela a otra? */
export function needsMetro(w: World, from: string, to: string): boolean {
  const a = districtOf(w, from), b = districtOf(w, to);
  return a !== b && a !== 'metro' && b !== 'metro';
}

/** Echa a andar hacia otra parcela. Entre barrios (Madrid, Alcorcón, Getafe) se va en metro (salvo `direct`: trabajo, cole). */
export function startTravel(w: World, a: Agent, to: string, direct = false) {
  endTask(w, a);
  a.queue = [];
  a.via = undefined;
  let mins = TRAVEL_MINUTES;
  if (!direct && needsMetro(w, a.lotId, to)) {
    a.via = to;
    to = METRO_LOT;
    mins = 8;
  } else if (districtOf(w, a.lotId) === 'metro') {
    mins = 8;
  }
  w.emit({ type: 'door', lotId: a.lotId });
  a.travel = { from: a.lotId, to, arrive: w.state.minutes + mins };
  a.hidden = false;
}

/** Minutos que se tarda en ir a una parcela (para el mapa). */
export function travelMinutes(w: World, from: string, to: string): number {
  return needsMetro(w, from, to) ? 8 + RIDE_MINUTES + 8 : TRAVEL_MINUTES;
}

export function arrive(w: World, a: Agent) {
  const { to, reason, mood } = a.travel!;
  a.travel = undefined;
  if (reason === 'trip') backFromTrip(w, a);
  else if (reason) finishShift(w, a, reason, mood ?? 50);
  a.lotId = to;
  w.emit({ type: 'door', lotId: to });
  a.pos = freeSpotNear(w, to, w.layoutOf(to).entrance);
  a.path = [];
  a.current = null;
  if (!w.isPlayerMember(a) && to !== w.householdOf(a)?.lotId) {
    // Un vecino que llega de visita o al parque se queda un rato.
    if (!a.visitUntil) a.visitUntil = w.state.minutes + rand(90, 180);
  }
  if (to === w.householdOf(a)?.lotId) a.visitUntil = undefined;
  wishEvent(w, a, { lotKind: w.lotById(to).kind, layout: w.lotById(to).layout });
  onArriveShopping(w, a, to);
  if (to === w.householdOf(a)?.lotId) petGreeting(w, a);
  if (to === METRO_LOT && a.via) {
    a.rideUntil = w.state.minutes + RIDE_MINUTES;
    if (w.isPlayerMember(a) && a.kind === 'person') w.toastOnce(`${a.id}:metro`, `${a.name} sube al metro: Línea 10 hasta Puerta del Sur y MetroSur hasta ${stationOf(w.lotById(a.via).district)}`, '🚇', 30);
    if (w.isPlayerMember(a) && a.kind === 'person' && Math.random() < 0.7) w.rapQueue.push(a.id);
  }
  if (a.role === 'glovo') deliverFood(w, a);
  if (a.role === 'militante' && to === w.household.lotId) w.toastOnce('militantes', `¡Llaman a la puerta! Es ${a.name}, militante del PSOE, que viene a pedir el voto`, '🌹', 600);
}

/** Una casilla libre (sin nadie encima) cerca de un punto, para no aparecer unos encima de otros. */
export function freeSpotNear(w: World, lotId: string, p: Vec): Vec {
  const grid = w.gridOf(lotId);
  const taken = new Set(w.agentsIn(lotId).map((a) => `${Math.round(a.pos.x)},${Math.round(a.pos.y)}`));
  for (let r = 0; r <= 3; r++) {
    const spots: Vec[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = p.x + dx, y = p.y + dy;
        if (isWalkable(grid, x, y) && !taken.has(`${x},${y}`) && findPath(grid, p, { x, y })) spots.push({ x, y });
      }
    }
    if (spots.length) return spots[Math.floor(Math.random() * spots.length)];
  }
  return { ...p };
}

/** Invitar a una familia vecina a casa. */
export function canInvite(w: World, householdId: string): { ok: boolean; reason?: string } {
  const h = w.state.households.find((x) => x.id === householdId);
  if (!h || h.id === w.household.id) return { ok: false };
  if (!w.members.some((m) => m.lotId === w.household.lotId && !m.travel && m.kind === 'person')) return { ok: false, reason: 'No hay nadie en casa' };
  if (w.hour >= 21 || w.hour < 8) return { ok: false, reason: 'Es muy tarde' };
  const free = availableVisitors(w, h);
  if (!free.length) return { ok: false, reason: 'No pueden ahora' };
  return { ok: true };
}

export function invite(w: World, householdId: string): boolean {
  const check = canInvite(w, householdId);
  const h = w.state.households.find((x) => x.id === householdId);
  if (!check.ok || !h) {
    if (check.reason) w.toast(check.reason, '📞');
    return false;
  }
  sendVisit(w, h, w.household.lotId, true);
  return true;
}

export function availableVisitors(w: World, h: Household): Agent[] {
  return h.memberIds
    .map((id) => w.agent(id)!)
    .filter((a) => a && a.kind === 'person' && a.lotId === h.lotId && !a.travel && lifeStage(a.species, a.ageDays).id !== 'baby' && !busySoon(w, a, 3));
}

/** Tiene que ir a trabajar o a clase ahora o en las próximas `hours` horas. */
export function busySoon(w: World, a: Agent, hours: number): boolean {
  const job = a.job;
  if (!job || job.lastShiftDay === w.day) return false;
  const c = CAREERS[job.career];
  if (!c || !workDays(job).includes(w.weekday)) return false;
  const m = w.state.minutes % MINUTES_PER_DAY;
  return m < c.end * 60 && m + hours * 60 >= c.start * 60;
}

/** Algunos miembros de una familia vecina van a otra parcela (y quizá su perro). */
export function sendVisit(w: World, h: Household, lotId: string, toPlayer: boolean) {
  const people = availableVisitors(w, h);
  if (!people.length) return;
  const n = Math.min(people.length, Math.random() < 0.5 ? 1 : 2);
  const group = people.sort(() => Math.random() - 0.5).slice(0, n);
  const dog = h.memberIds.map((id) => w.agent(id)!).find((a) => a.species === 'dog' && a.lotId === h.lotId && !a.travel);
  // El perro va al parque o de visita, pero no a clase de pilates.
  if (dog && (lotId === PARK_LOT || w.lotById(lotId)?.kind === 'home') && Math.random() < 0.6) group.push(dog);
  const until = Math.min(w.state.minutes + TRAVEL_MINUTES + rand(120, 240), endOfVisits(w));
  for (const a of group) {
    startTravel(w, a, lotId);
    a.visitUntil = until;
  }
  const people2 = group.filter((a) => a.kind === 'person');
  if (toPlayer) w.toast(`¡Llaman a la puerta! ${people2.map((a) => a.name).join(' y ')} (${h.name}) ${people2.length > 1 ? 'vienen' : 'viene'} de visita`, '🔔');
}

/** Las visitas se acaban como muy tarde a las 22:00. */
export function endOfVisits(w: World): number {
  const dayStart = Math.floor(w.state.minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  return dayStart + 22 * 60;
}

export function goHome(w: World, a: Agent) {
  a.visitUntil = undefined;
  if (a.role) {
    // La gente de la calle vuelve a su sitio (o desaparece, si es un rider o una militante).
    if (a.role === 'glovo' || a.role === 'militante') {
      a.hidden = true;
      a.current = null;
      a.lotId = a.post ?? a.lotId;
    } else if (a.post && a.lotId !== a.post) startTravel(w, a, a.post);
    return;
  }
  const home = w.householdOf(a)?.lotId;
  if (home && home !== a.lotId) startTravel(w, a, home);
}
