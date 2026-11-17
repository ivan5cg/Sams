// Fin de semana fuera: se reserva entre semana en el ordenador, la familia se va el sábado
// por la mañana y vuelve el domingo por la noche, descansada y con buen recuerdo.

import { ECONOMY } from '../../data/economy';
import { MINUTES_PER_DAY } from '../constants';
import type { Agent } from '../types';
import type { World } from '../world';
import { money } from './money';
import { endTask } from './tasks';
import { priced } from './economy';

export const DESTINATIONS = ['Benidorm', 'la sierra de Madrid', 'Cuenca', 'la playa de Gandía', 'un pueblo de Ávila', 'Toledo', 'Peñíscola'];

/** Por qué no se puede reservar ahora (o nada si se puede). */
export function tripReason(w: World): string | undefined {
  if (w.household.trip) return 'Ya tenéis un viaje reservado';
  if (w.weekday > 3) return 'Se reserva de lunes a jueves, para el fin de semana';
  if (w.household.funds < priced(w, ECONOMY.trip)) return 'No hay dinero';
  return undefined;
}

/** Reserva el fin de semana de esta semana. */
export function bookTrip(w: World, a: Agent): boolean {
  const why = tripReason(w);
  if (why) {
    w.toast(why, '🧳', a.id);
    return false;
  }
  const weekStart = (w.day - 1 - w.weekday) * MINUTES_PER_DAY;
  const dest = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];
  w.household.trip = { start: weekStart + 5 * MINUTES_PER_DAY + 9 * 60, end: weekStart + 6 * MINUTES_PER_DAY + 21 * 60, dest };
  money(w, w.household, -priced(w, ECONOMY.trip), 'viajes');
  w.toast(`¡Reservado! Este fin de semana, a ${dest}. Salís el sábado a las 9:00`, '🧳');
  return true;
}

/** ¿Quién se va? Las personas y las mascotas que pueden viajar (las de jaula se quedan: las cuida la vecina). */
function travellers(w: World): Agent[] {
  return w.members.filter((m) => !m.home && !m.hidden);
}

/** Cada hora: salir el sábado y volver el domingo. */
export function tripsHour(w: World) {
  const h = w.household;
  const trip = h.trip;
  if (!trip || w.state.minutes < trip.start) return;
  if (w.state.minutes >= trip.end + 60) {
    // Por si algo falló: se olvida el viaje.
    h.trip = undefined;
    return;
  }
  const gone = travellers(w).filter((m) => !(m.travel?.reason === 'trip'));
  if (!gone.length) return;
  for (const m of gone) {
    endTask(w, m);
    m.queue = [];
    m.via = undefined;
    m.visitUntil = undefined;
    m.travel = { from: m.lotId, to: h.lotId, arrive: trip.end, reason: 'trip' };
  }
  w.toast(`¡Nos vamos a ${trip.dest}! Hasta el domingo por la noche`, '🧳');
  w.addNews(`la ${h.name} se ha ido el fin de semana a ${trip.dest}`, []);
}

/** Al volver del viaje: descansados, contentos y con algo que contar. */
export function backFromTrip(w: World, a: Agent) {
  const trip = w.householdOf(a)?.trip;
  for (const k of Object.keys(a.needs) as (keyof Agent['needs'])[]) a.needs[k] = Math.max(a.needs[k], 80);
  if (a.kind === 'person') w.feel(a, 'vacaciones', trip?.dest);
  const h = w.householdOf(a);
  if (h?.trip && !w.members.some((m) => m.travel?.reason === 'trip' && m !== a)) {
    w.toast(`¡De vuelta de ${h.trip.dest}! Morenos, descansados y con la maleta llena de ropa sucia`, '🏖️');
    h.trip = undefined;
  }
}
