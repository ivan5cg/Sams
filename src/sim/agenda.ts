// La agenda de la familia: lo que viene hoy y mañana (turnos, colegio, eventos del barrio,
// facturas, cumpleaños, bebés y órdenes programadas). Puro: solo lee el mundo.
// Las reglas de los eventos son las mismas que en systems/calendar.ts (si cambian allí,
// hay que cambiarlas aquí: la prueba de la agenda lo comprueba simulando semanas enteras).

import { CAREERS } from '../data/careers';
import { ACTIONS } from '../data/actions';
import { SEASONS } from '../data/seasons';
import { lifeStage } from '../data/species';
import { MINUTES_PER_DAY } from './constants';
import { weeklyBill } from './systems/calendar';
import type { World } from './world';

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

/** Eventos fijos del calendario en un día (por número de día del juego). */
export function calendarEvents(day: number): { id: string; minute: number; icon: string; text: string }[] {
  const wd = (day - 1) % 7;
  const se = Math.floor((day - 1) / 7) % 4;
  const out: { id: string; minute: number; icon: string; text: string }[] = [];
  if (wd === 0) out.push({ id: 'estacion', minute: -1, icon: SEASONS[se].icon, text: `Empieza ${SEASONS[se].label.toLowerCase() === 'otoño' ? 'el otoño' : `la ${SEASONS[se].label.toLowerCase()}`}`.replace('la verano', 'el verano').replace('la invierno', 'el invierno') });
  if (se === 0 && wd >= 1 && wd <= 4) out.push({ id: 'campana', minute: -1, icon: '🗳️', text: 'Campaña electoral: militantes llamando a las puertas' });
  if (se === 0 && wd === 5) out.push({ id: 'sanisidro', minute: -1, icon: '🎩', text: 'San Isidro: chotis en el parque y en la plaza' });
  if (se === 0 && wd === 6) out.push({ id: 'elecciones', minute: -1, icon: '🗳️', text: 'Elecciones' });
  if (se === 1 && wd === 5) out.push({ id: 'verbena', minute: 19 * 60, icon: '🎆', text: 'Verbena en el parque (hasta la 1:00)' });
  if (se === 2 && (wd === 1 || wd === 2)) out.push({ id: 'ofertas', minute: -1, icon: '🥬', text: 'Días de la huerta: la compra, un 30% más barata' });
  if (se === 3 && wd < 6) out.push({ id: 'loteria_venta', minute: -1, icon: '🎫', text: 'Se vende lotería de Navidad (en el bar)' });
  if (se === 3 && wd === 6) {
    out.push({ id: 'navidad', minute: -1, icon: '🎄', text: 'Navidad' });
    out.push({ id: 'sorteo', minute: 12 * 60, icon: '🎶', text: 'Sorteo de la Lotería de Navidad' });
    out.push({ id: 'campanadas', minute: 23 * 60, icon: '🍇', text: 'Las doce campanadas' });
  }
  if (wd === 6) out.push({ id: 'derbi', minute: 19 * 60, icon: '⚽', text: 'Derbi Madrid–Atleti en el Bar Casa Paco' });
  return out;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Lo que viene hoy (`offset` 0) o mañana (1) para la familia del jugador. */
export function agendaFor(w: World, offset: 0 | 1): AgendaItem[] {
  const day = w.day + offset;
  const wd = (day - 1) % 7;
  const items: AgendaItem[] = [];
  const h = w.household;
  // Trabajo y colegio
  for (const m of w.members) {
    const job = m.job;
    const c = job && CAREERS[job.career];
    if (!job || !c || !c.days.includes(wd)) continue;
    const school = !!c.school;
    if (job.dayOff === day) {
      items.push({ minute: -1, icon: '🏖️', text: `${m.name} tiene el día libre`, kind: 'work', agentId: m.id });
      continue;
    }
    const done = offset === 0 && job.lastShiftDay === day;
    items.push({
      minute: c.start * 60,
      icon: c.icon,
      text: `${m.name}: ${school ? 'colegio' : c.levels[job.level - 1].title.toLowerCase()} de ${c.start}:00 a ${c.end}:00${done ? ' (ya ha ido)' : ''}`,
      kind: school ? 'school' : 'work',
      agentId: m.id,
    });
  }
  // Facturas (los lunes, menos el primero)
  if (wd === 0 && day > 1) {
    const business = w.members.filter((m) => m.job && CAREERS[m.job.career]?.business).length * 90;
    items.push({ minute: 0, icon: '🧾', text: `Facturas de la semana: §${weeklyBill(w, h) + business}${business ? ' (con la cuota de autónomos)' : ''}`, kind: 'bills' });
  }
  // Calendario del barrio
  for (const e of calendarEvents(day)) {
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
  if (h.expecting) {
    const due = h.expecting.due;
    if (Math.floor(due / MINUTES_PER_DAY) + 1 === day) {
      const parents = h.expecting.parents.map((id) => w.agent(id)?.name).filter(Boolean).join(' y ');
      items.push({ minute: Math.floor(due % MINUTES_PER_DAY), icon: '👶', text: `Llega el bebé${parents ? ` de ${parents}` : ''}`, kind: 'baby' });
    }
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
