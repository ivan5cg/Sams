// Fiestas de la fase 5: Reyes (regalos, roscón con haba y cabalgata), Carnaval (disfraces y
// concurso en el desfile) y Halloween (truco o trato). Las fechas son las de verdad (ver feasts.ts):
// Reyes el 6 de enero (la cabalgata, la tarde del 5), Carnaval el sábado de Carnaval y Halloween el 31
// de octubre. Lo que pasa cada día y cada hora, aquí.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { MINUTES_PER_DAY } from '../constants';
import type { GameDate } from '../date';
import { factsOf } from '../feasts';
import { hasEmotion } from '../emotions';
import { CERRO_LOT, PARK_LOT, PLAZA_LOT, squareOf } from '../neighborhood';
import { isAdult } from '../social';
import { hasTrait } from '../traits';
import type { Agent } from '../types';
import type { ActionOption, World } from '../world';
import { ACTIONS } from '../../data/actions';
import { ECONOMY } from '../../data/economy';
import { money } from './money';
import { hasEvent, startEvent } from './calendar';
import { districtOf, sendVisit } from './travel';
import { priced } from './economy';

export type HolidayId = 'reyes' | 'carnaval' | 'halloween';

/** La fiesta de una fecha, si la hay. */
export function holidayOf(g: GameDate): HolidayId | null {
  const f = factsOf(g);
  if (f.reyes) return 'reyes';
  if (f.carnaval) return 'carnaval';
  if (f.halloween) return 'halloween';
  return null;
}

/** Horas de los actos de cada fiesta. */
export const HOLIDAY_HOURS = { cabalgata: 17, desfile: 18, concurso: 20, trucoDesde: 18, trucoHasta: 22, timbre: 19 };

/** Acciones que solo existen en su fiesta (fuera de ella, ni se ven en el menú). */
export const HOLIDAY_ACTIONS: Record<string, HolidayId> = { eat_roscon: 'reyes', costume: 'carnaval', trick_or_treat: 'halloween' };

const kids = (w: World) => w.members.filter((m) => m.kind === 'person' && ['child', 'teen'].includes(w.stageOf(m)));
const people = (w: World) => w.members.filter((m) => m.kind === 'person' && w.stageOf(m) !== 'baby');

/** Por qué no se puede hacer una acción de fiesta ahora (o nada si se puede). */
export function holidayReason(w: World, a: Agent, actionId: string): ActionOption | null {
  const def = ACTIONS[actionId];
  const fiesta = HOLIDAY_ACTIONS[actionId];
  if (!fiesta) return null;
  if (!hasEvent(w, fiesta)) return { def, ok: false };
  if (actionId === 'costume') {
    if (hasEmotion(a, 'disfrazado')) return { def, ok: false, reason: 'Ya va disfrazado/a' };
    if ((w.householdOf(a)?.funds ?? 0) < priced(w, ECONOMY.costume)) return { def, ok: false, reason: 'No hay dinero' };
  }
  if (actionId === 'trick_or_treat') {
    if (w.hour < HOLIDAY_HOURS.trucoDesde || w.hour >= HOLIDAY_HOURS.trucoHasta) return { def, ok: false, reason: `De ${HOLIDAY_HOURS.trucoDesde}:00 a ${HOLIDAY_HOURS.trucoHasta}:00` };
    if (hasEmotion(a, 'caramelos')) return { def, ok: false, reason: 'Ya tiene la bolsa llena' };
    if (w.lotById(a.lotId)?.kind !== 'home') return { def, ok: false, reason: 'Se sale desde casa' };
  }
  if (actionId === 'eat_roscon' && hasEmotion(a, 'roscon')) return { def, ok: false, reason: 'Ya se ha comido su trozo' };
  return null;
}

/** Por la mañana: lo que trae el día de fiesta. */
export function holidayDay(w: World) {
  const fiesta = holidayOf(w.date);
  if (!fiesta) return;
  startEvent(w, fiesta, MINUTES_PER_DAY);
  if (fiesta === 'reyes') {
    // Los Reyes Magos: regalos para los pequeños; a algún mayor, carbón (dulce).
    for (const k of kids(w)) w.feel(k, 'reyes');
    const adults = people(w).filter((m) => isAdult(m));
    const naughty = adults.find((m) => hasTrait(m, 'cunado') || hasTrait(m, 'grunon'));
    w.toast(
      kids(w).length
        ? `¡Han venido los Reyes Magos! Los pequeños abren los regalos en pijama${naughty ? `. A ${naughty.name} le han traído carbón (dulce)` : ''}`
        : `¡Han venido los Reyes! ${naughty ? `A ${naughty.name} le han traído carbón (dulce). Por algo será` : 'Calcetines para todos, como cada año'}`,
      '👑',
    );
    for (const m of adults) if (m !== naughty) w.feel(m, 'reyes', undefined, 8);
    w.toast('Hay roscón de Reyes en la nevera. ¡Ojo con el haba!', '🥯');
    w.addNews('el barrio entero ha desayunado roscón de Reyes', []);
  }
  if (fiesta === 'carnaval') {
    w.toast(`¡Es Carnaval! Disfrázate (§${priced(w, ECONOMY.costume)}, tocándote a ti mismo) y a las ${HOLIDAY_HOURS.desfile}:00, desfile en el parque con concurso de disfraces`, '🎭');
    w.addNews('hay gente disfrazada de cualquier cosa por todo el barrio', []);
  }
  if (fiesta === 'halloween') {
    w.toast(`Halloween: a partir de las ${HOLIDAY_HOURS.trucoDesde}:00, truco o trato por las casas. Que haya algo en la despensa...`, '🎃');
  }
}

/** Vecinos al parque (o a la plaza, los de Alcorcón) para un acto de fiesta. */
function crowd(w: World, share: number) {
  for (const hh of w.state.households) {
    if (hh.id === w.household.id || Math.random() > share) continue;
    sendVisit(w, hh, squareOf(districtOf(w, hh.lotId)), false);
  }
}

const atParty = (a: Agent) => !a.travel && (a.lotId === PARK_LOT || a.lotId === PLAZA_LOT || a.lotId === CERRO_LOT);

/** Cada hora: cabalgata, desfile y concurso, y los niños llamando al timbre. */
export function holidayHour(w: World) {
  const h = w.hour;
  // La cabalgata, la tarde del 5 de enero (la víspera de Reyes).
  if (w.facts.cabalgata || hasEvent(w, 'cabalgata')) {
    if (w.facts.cabalgata && h === HOLIDAY_HOURS.cabalgata) {
      startEvent(w, 'cabalgata', 3 * 60);
      crowd(w, 0.6);
      w.toast(`¡La cabalgata de Reyes! Melchor, Gaspar y Baltasar tiran caramelos en el parque hasta las ${HOLIDAY_HOURS.cabalgata + 3}:00`, '🐪');
    }
    if (hasEvent(w, 'cabalgata')) for (const a of w.state.agents) if (a.kind === 'person' && !a.role && atParty(a)) w.feel(a, 'caramelos');
  }
  if (hasEvent(w, 'carnaval')) {
    if (h === HOLIDAY_HOURS.desfile) {
      startEvent(w, 'desfile', 3 * 60);
      crowd(w, 0.5);
      w.toast('¡Empieza el desfile de Carnaval en el parque! A las 20:00, concurso de disfraces', '🎭');
    }
    if (hasEvent(w, 'desfile')) for (const a of w.state.agents) if (a.kind === 'person' && !a.role && atParty(a)) w.feel(a, 'fiesta', undefined, 4);
    if (h === HOLIDAY_HOURS.concurso) costumeContest(w);
  }
  if (hasEvent(w, 'halloween') && h === HOLIDAY_HOURS.timbre && !w.state.familyGone) knockKnock(w);
}

/** El concurso de disfraces: solo entra quien esté disfrazado en el desfile. */
export function costumeContest(w: World) {
  const entrants = w.members.filter((m) => hasEmotion(m, 'disfrazado') && atParty(m));
  if (!entrants.length) {
    w.toastOnce('concurso', 'El concurso de disfraces lo ha ganado un señor disfrazado de bombona de butano', '🏆', 600);
    return;
  }
  // Cuanta más gracia (y más arte), más fácil ganar.
  const best = entrants.reduce((x, y) => (score(w, y) > score(w, x) ? y : x));
  if (Math.random() < 0.3 + 0.08 * entrants.length + (hasTrait(best, 'bromista') ? 0.15 : 0)) {
    money(w, w.household, priced(w, ECONOMY.costumePrize), 'premios');
    w.feel(best, 'premio_disfraz');
    w.toast(`¡${best.name} gana el concurso de disfraces! Premio de §${priced(w, ECONOMY.costumePrize)} y foto en el periódico del barrio`, '🏆', best.id);
    w.addNews(`${best.name} ha ganado el concurso de disfraces de Carnaval`, [best.id]);
  } else {
    w.toast(`El jurado ha dado el premio a unos de Alcorcón disfrazados de paella. ${best.name} dice que estaba comprado`, '🥈', best.id);
  }
}

function score(w: World, a: Agent) {
  return (a.skills?.arte ?? 0) + (a.skills?.carisma ?? 0) + (hasTrait(a, 'bromista') ? 3 : 0) + (hasTrait(a, 'fiestero') ? 2 : 0) + (w.stageOf(a) === 'child' ? 2 : 0);
}

/** Halloween: los niños del barrio llaman a la puerta. Con algo en la despensa, trato; si no, truco. */
export function knockKnock(w: World) {
  const h = w.household;
  const home = w.agentsIn(h.lotId).filter((m) => m.householdId === h.id && m.kind === 'person' && !m.travel);
  if (!home.length) {
    w.toast('Los niños del barrio han llamado a vuestra puerta por Halloween, pero no había nadie', '🎃');
    return;
  }
  if ((h.pantry ?? 0) >= 1) {
    h.pantry = (h.pantry ?? 0) - 1;
    for (const m of home) w.feel(m, 'fiesta', undefined, 3);
    w.toast('¡Truco o trato! Los niños del barrio se llevan un puñado de caramelos de vuestra despensa', '🍬');
  } else {
    for (const m of home) w.feel(m, 'gamberrada');
    w.toast('¡Truco o trato! Como no había ni un caramelo, os han llenado la puerta de papel higiénico', '🧻');
    w.addNews(`a la ${h.name} le han hecho un truco en Halloween por no dar caramelos`, []);
  }
}

/** Al terminar una acción de fiesta. */
export function holidayTask(w: World, a: Agent, actionId: string) {
  const mine = w.isPlayerMember(a);
  if (actionId === 'costume') {
    const hh = w.householdOf(a);
    if (hh) money(w, hh, -priced(w, ECONOMY.costume), 'ropa');
    w.feel(a, 'disfrazado');
    const what = COSTUMES[Math.floor(Math.random() * COSTUMES.length)];
    if (mine) w.toast(`${a.name} se ha disfrazado de ${what}`, '🎭', a.id);
  }
  if (actionId === 'trick_or_treat') {
    w.feel(a, 'caramelos');
    if (mine) w.toast(`${a.name} vuelve con la bolsa llena de caramelos. Y con un susto en el cuerpo del 3ºB`, '🎃', a.id);
  }
  if (actionId === 'eat_roscon') {
    w.feel(a, 'roscon');
    const r = Math.random();
    // En cada trozo puede salir la figurita (corona para todo el día) o el haba (le toca pagar).
    if (r < 0.2) {
      w.feel(a, 'rey_roscon');
      if (mine) w.toast(`¡A ${a.name} le ha salido la figurita! Rey/reina de la casa por hoy, con corona y todo`, '👑', a.id);
    } else if (r < 0.4) {
      const hh = w.householdOf(a);
      if (hh) money(w, hh, -priced(w, ECONOMY.roscon), 'compra');
      if (mine) w.toast(`A ${a.name} le ha salido el haba: le toca pagar el roscón (−§${priced(w, ECONOMY.roscon)})`, '🫘', a.id);
    }
  }
}

const COSTUMES = ['pirata', 'Drácula', 'bombona de butano', 'Chiquito de la Calzada', 'tomate de La Tomatina', 'astronauta', 'fantasma con sábana de la abuela', 'superhéroe de barrio', 'aceituna', 'la Cibeles'];
