// La agenda de la familia: lo que viene hoy y mañana (turnos, colegio, eventos del barrio,
// facturas, cumpleaños, bebés y órdenes programadas). Puro: solo lee el mundo.
// Las reglas de los eventos son las mismas que en systems/calendar.ts (si cambian allí,
// hay que cambiarlas aquí: la prueba de la agenda lo comprueba simulando semanas enteras).

import { schoolName } from '../data/education';
import { CAREERS, workDays } from '../data/careers';
import { ACTIONS } from '../data/actions';
import { SEASONS } from '../data/seasons';
import { lifeStage } from '../data/species';
import { MINUTES_PER_DAY } from './constants';
import { BILL_INFO, BILL_KINDS, billAmount, isEvicted, totalDebt } from './systems/bills';
import type { World } from './world';
import { HOLIDAY_HOURS } from './systems/holidays';
import { factsOf } from './feasts';
import type { GameDate } from './date';

export interface AgendaItem {
  /** Minuto del día (0-1439), o -1 si es para todo el día. */
  minute: number;
  icon: string;
  text: string;
  kind: 'work' | 'school' | 'event' | 'bills' | 'birthday' | 'baby' | 'order' | 'season';
  agentId?: string;
  /** Para las órdenes programadas: su id (para cancelarla). */
  orderId?: string;
}

/** Eventos fijos del calendario en una fecha (las mismas reglas que la simulación: ver feasts.ts). */
export function calendarEvents(g: GameDate): { id: string; minute: number; icon: string; text: string }[] {
  const f = factsOf(g);
  const out: { id: string; minute: number; icon: string; text: string }[] = [];
  const se = SEASONS[g.season];
  if (f.seasonStart) out.push({ id: 'estacion', minute: -1, icon: se.icon, text: `Empieza ${se.id === 'primavera' ? 'la primavera' : `el ${se.label.toLowerCase()}`}` });
  if (f.campaign) out.push({ id: 'campana', minute: -1, icon: '🗳️', text: 'Campaña electoral: militantes llamando a las puertas' });
  if (f.sanIsidro) out.push({ id: 'sanisidro', minute: -1, icon: '🎩', text: 'San Isidro: chotis en el parque y en la plaza' });
  if (f.elections) out.push({ id: 'elecciones', minute: -1, icon: '🗳️', text: 'Elecciones' });
  if (f.verbena) out.push({ id: 'verbena', minute: 19 * 60, icon: '🎆', text: `${g.m === 6 ? 'San Juan: v' : g.m === 8 && g.d === 15 ? 'La Paloma: v' : 'V'}erbena en el parque (hasta la 1:00)` });
  if (f.ofertasStart) out.push({ id: 'ofertas', minute: -1, icon: '🥬', text: 'Días de la huerta (hoy y mañana): la compra, un 30% más barata' });
  if (f.lotterySale) out.push({ id: 'loteria_venta', minute: -1, icon: '🎫', text: 'Se vende lotería de Navidad (en la caja del Mercadona)' });
  if (f.lotteryDraw) out.push({ id: 'sorteo', minute: 12 * 60, icon: '🎶', text: 'Sorteo de la Lotería de Navidad' });
  if (f.christmasEve) out.push({ id: 'nochebuena', minute: 21 * 60, icon: '🎄', text: 'Nochebuena: cena en familia' });
  if (f.christmas) out.push({ id: 'navidad', minute: -1, icon: '🎄', text: 'Navidad' });
  if (f.newYearsEve) out.push({ id: 'campanadas', minute: 23 * 60, icon: '🍇', text: 'Nochevieja: las doce campanadas' });
  if (f.cabalgata) out.push({ id: 'cabalgata', minute: HOLIDAY_HOURS.cabalgata * 60, icon: '🐪', text: 'Cabalgata de Reyes en el parque' });
  if (f.reyes) out.push({ id: 'reyes', minute: -1, icon: '👑', text: 'Reyes: regalos y roscón (¡ojo con el haba!)' });
  if (f.carnaval) {
    out.push({ id: 'carnaval', minute: -1, icon: '🎭', text: 'Carnaval: disfrázate (tocándote a ti mismo)' });
    out.push({ id: 'desfile', minute: HOLIDAY_HOURS.desfile * 60, icon: '🎉', text: `Desfile en el parque; concurso de disfraces a las ${HOLIDAY_HOURS.concurso}:00` });
  }
  if (f.halloween) {
    out.push({ id: 'halloween', minute: -1, icon: '🎃', text: 'Halloween' });
    out.push({ id: 'truco', minute: HOLIDAY_HOURS.trucoDesde * 60, icon: '🍬', text: 'Truco o trato por las casas (que haya algo en la despensa)' });
  }
  // Los mercadillos de cada semana (de 9:00 a 14:30).
  if (g.wd === 6) out.push({ id: 'mercadillo', minute: 9 * 60, icon: '🏺', text: 'El Rastro (hasta las 14:30): comprar barato, regatear y vender lo vuestro' });
  if (g.wd === 5) out.push({ id: 'mercadillo_alcorcon', minute: 9 * 60, icon: '🏺', text: 'Mercadillo de Alcorcón (hasta las 14:30)' });
  if (g.wd === 2) out.push({ id: 'mercadillo_getafe', minute: 9 * 60, icon: '🏺', text: 'Mercadillo de Getafe (hasta las 14:30)' });
  if (g.wd === 6) out.push({ id: 'derbi', minute: 19 * 60, icon: '⚽', text: 'Derbi Madrid–Atleti en el Bar Casa Paco' });
  return out;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Lo que viene hoy (`offset` 0) o mañana (1) para la familia del jugador. */
export function agendaFor(w: World, offset: 0 | 1): AgendaItem[] {
  const day = w.day + offset;
  const date = w.dateOf(day);
  const wd = date.wd;
  const items: AgendaItem[] = [];
  const h = w.household;
  // Trabajo y colegio
  for (const m of w.members) {
    const job = m.job;
    const c = job && CAREERS[job.career];
    if (!job || !c || !workDays(job).includes(wd)) continue;
    const school = !!c.school;
    if (job.dayOff === day) {
      items.push({ minute: -1, icon: '🏖️', text: `${m.name} tiene el día libre`, kind: 'work', agentId: m.id });
      continue;
    }
    const done = offset === 0 && job.lastShiftDay === day;
    items.push({
      minute: c.start * 60,
      icon: c.icon,
      text: `${m.name}: ${school ? schoolName(w.stageOf(m), job.career).toLowerCase() : c.levels[job.level - 1].title.toLowerCase()} de ${c.start}:00 a ${c.end}:00${done ? ' (ya ha ido)' : ''}`,
      kind: school ? 'school' : 'work',
      agentId: m.id,
    });
  }
  // Recibos del mes (alquiler el 1; luz y agua el 5) y lo que se debe.
  if (offset === 0 && totalDebt(h)) items.push({ minute: -1, icon: '⚠️', text: `Recibos sin pagar: §${totalDebt(h)}${isEvicted(w) ? ' · ¡estáis en la calle!' : ''}`, kind: 'bills' });
  for (const k of BILL_KINDS) {
    if (BILL_INFO[k].day !== date.d) continue;
    const amount = billAmount(w, h, k);
    if (amount > 0) items.push({ minute: 0, icon: BILL_INFO[k].icon, text: `Recibo: ${BILL_INFO[k].label.toLowerCase()}, §${amount}`, kind: 'bills' });
  }
  // Calendario del barrio
  for (const e of calendarEvents(date)) {
    if (e.id === 'sorteo' && !w.state.lottery?.length) continue;
    items.push({ minute: e.minute, icon: e.icon, text: e.text, kind: e.id === 'estacion' ? 'season' : 'event' });
  }
  // Cumpleaños: quien cambia de etapa ese día
  const step = w.state.aging === 'off' ? 0 : w.state.aging === 'fast' ? 2 : 1;
  if (step) {
    for (const m of w.members) {
      const ageThatDay = m.ageDays + step * offset;
      const before = lifeStage(m.species, ageThatDay - step);
      const after = lifeStage(m.species, ageThatDay);
      if (before.id !== after.id) items.push({ minute: 0, icon: '🎂', text: `${m.name} pasa a ${after.label.toLowerCase()}`, kind: 'birthday', agentId: m.id });
    }
  }
  // Bebés en camino
  if (h.expecting && h.expecting.known !== false) {
    const due = h.expecting.due;
    if (Math.floor(due / MINUTES_PER_DAY) + 1 === day) {
      const parents = h.expecting.parents.map((id) => w.agent(id)?.name).filter(Boolean).join(' y ');
      items.push({ minute: Math.floor(due % MINUTES_PER_DAY), icon: '👶', text: `Llega el bebé${parents ? ` de ${parents}` : ''}`, kind: 'baby' });
    }
  }
  // Fin de semana fuera
  const trip = h.trip;
  if (trip) {
    if (Math.floor(trip.start / MINUTES_PER_DAY) + 1 === day) items.push({ minute: Math.floor(trip.start % MINUTES_PER_DAY), icon: '🧳', text: `Salida hacia ${trip.dest}`, kind: 'event' });
    if (Math.floor(trip.end / MINUTES_PER_DAY) + 1 === day) items.push({ minute: Math.floor(trip.end % MINUTES_PER_DAY), icon: '🏠', text: `Vuelta de ${trip.dest}`, kind: 'event' });
  }
  // Órdenes programadas
  for (const o of w.state.schedule ?? []) {
    if (Math.floor(o.at / MINUTES_PER_DAY) + 1 !== day) continue;
    const a = w.agent(o.agentId);
    const def = ACTIONS[o.actionId];
    if (!a || !def) continue;
    items.push({ minute: Math.floor(o.at % MINUTES_PER_DAY), icon: '⏰', text: `${a.name}: ${def.label.toLowerCase()}`, kind: 'order', agentId: a.id, orderId: o.id });
  }
  return items.sort((x, y) => x.minute - y.minute);
}

/** «08:00», o «Todo el día». */
export function agendaTime(minute: number): string {
  return minute < 0 ? 'Todo el día' : hhmm(minute);
}
