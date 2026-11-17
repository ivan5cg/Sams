// Recibos de la familia del jugador: alquiler (día 1), luz y agua (día 5) y la cuota de autónomos (día 1).
// Se pagan solos si hay dinero (domiciliados); si no, quedan pendientes y se reintentan cada día.
// Sin pagar: a los 10 días cortan la luz o el agua; el alquiler trae carta del casero (10 días), burofax
// (20) y desahucio (30): la familia se queda en la calle (en el parque) hasta que paga y vuelve a alquilar.
// Los vecinos pagan aparte, cada semana (calendar.ts).
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { ECONOMY } from '../../data/economy';
import { CAREERS } from '../../data/careers';
import { ELECTRIC } from '../../data/seasons';
import { squareOf } from '../neighborhood';
import type { Agent, BillKind, Debt, Household } from '../types';
import type { World } from '../world';
import { money } from './money';
import { endTask } from './tasks';
import { districtOf, startTravel } from './travel';

export const BILL_INFO: Record<BillKind, { icon: string; label: string; day: number }> = {
  alquiler: { icon: '🏠', label: 'Alquiler', day: 1 },
  autonomos: { icon: '🧾', label: 'Cuota de autónomos', day: 1 },
  luz: { icon: '💡', label: 'Luz', day: 5 },
  agua: { icon: '🚿', label: 'Agua', day: 5 },
};
export const BILL_KINDS = Object.keys(BILL_INFO) as BillKind[];

/** Cosas que necesitan agua corriente. */
export const WATER_ACTIONS = new Set(['shower', 'bath', 'soak', 'toilet', 'wash_up']);

/** Plazos (en días desde que vence un recibo). */
export const DEADLINES = { cut: 10, landlordLetter: 10, burofax: 20, eviction: 30 };

/** Días que tiene cada mes, para pasar de semanal a mensual. */
const MONTH = 30 / 7;

function houseSize(w: World, h: Household): number {
  return Math.max(1, Math.min(3, w.lotById(h.lotId)?.size ?? 1));
}

/** Lo que cuesta al mes cada recibo (las cifras semanales de la economía, pasadas a mes). */
export function billAmount(w: World, h: Household, kind: BillKind): number {
  const b = ECONOMY.bills;
  const ms = h.memberIds.map((id) => w.agent(id)!).filter(Boolean);
  const people = ms.filter((m) => m.kind === 'person').length;
  const pets = ms.filter((m) => m.kind === 'pet').length;
  const objs = w.objectsIn(h.lotId);
  const base = b.base[houseSize(w, h) - 1];
  switch (kind) {
    case 'alquiler':
      return Math.round(ECONOMY.mortgage[houseSize(w, h) - 1] * MONTH);
    case 'autonomos':
      return Math.round(ECONOMY.autonomos * MONTH) * ms.filter((m) => m.job && CAREERS[m.job.career]?.business).length;
    case 'luz': {
      const apps = objs.filter((o) => ELECTRIC.has(o.def)).length;
      const lux = objs.filter((o) => o.q === 3).length;
      return Math.round((base * 0.6 + b.perAppliance * apps + b.perLuxury * lux + 12 * people) * MONTH);
    }
    case 'agua':
      return Math.round((base * 0.4 + (b.perPerson - 12) * people + b.perPet * pets) * MONTH);
  }
}

const state = (h: Household) => (h.bills = h.bills ?? { debts: [] });

export function debtsOf(h: Household): Debt[] {
  return h.bills?.debts ?? [];
}

export function totalDebt(h: Household): number {
  return debtsOf(h).reduce((n, d) => n + d.amount, 0);
}

export function isEvicted(w: World, h: Household = w.household): boolean {
  return !!h.bills?.evicted;
}

/** ¿Hay luz en esta parcela? (apagones y cortes por no pagar). */
export function hasPower(w: World, lotId: string): boolean {
  if (w.hasEvent('apagon', lotId)) return false;
  const h = w.household;
  return !(lotId === h.lotId && h.bills?.cut?.luz);
}

/** ¿Hay agua en esta parcela? */
export function hasWater(w: World, lotId: string): boolean {
  const h = w.household;
  return !(lotId === h.lotId && h.bills?.cut?.agua);
}

/** Los próximos recibos (para la agenda y el panel): fecha y cuánto. */
export function upcomingBills(w: World, days = 40): { day: number; kind: BillKind; amount: number }[] {
  const h = w.household;
  const out: { day: number; kind: BillKind; amount: number }[] = [];
  for (let day = w.day + 1; day <= w.day + days; day++) {
    const d = w.dateOf(day).d;
    for (const k of BILL_KINDS) {
      if (BILL_INFO[k].day !== d) continue;
      const amount = billAmount(w, h, k);
      if (amount > 0) out.push({ day, kind: k, amount });
    }
  }
  return out;
}

/** Cada mañana: llegan los recibos que tocan, se reintentan los pendientes y llegan las consecuencias. */
export function dailyBills(w: World) {
  const h = w.household;
  if (w.state.familyGone || h.okupa) return;
  const s = state(h);
  const d = w.date.d;
  // Los del día.
  for (const k of BILL_KINDS) {
    if (BILL_INFO[k].day !== d || isEvicted(w) && k === 'alquiler') continue;
    if (isEvicted(w) && (k === 'luz' || k === 'agua')) continue;
    const amount = billAmount(w, h, k);
    if (amount <= 0) continue;
    if (h.funds >= amount) {
      money(w, h, -amount, k === 'alquiler' ? 'alquiler' : k === 'autonomos' ? 'autonomos' : 'facturas');
      w.toast(`${BILL_INFO[k].icon} Recibo de ${BILL_INFO[k].label.toLowerCase()}: −§${amount} (domiciliado)`, '🧾');
      if (k === 'autonomos') for (const m of w.members) if (m.job && CAREERS[m.job.career]?.business) w.feel(m, 'cuota');
    } else {
      s.debts.push({ id: w.newId('r'), kind: k, amount, due: w.day });
      w.toast(`¡No hay dinero para el recibo de ${BILL_INFO[k].label.toLowerCase()} (§${amount})! Queda pendiente`, '⚠️');
    }
  }
  // Los pendientes, si ya hay dinero (el banco lo vuelve a intentar).
  for (const debt of [...s.debts].sort((a, b) => a.due - b.due)) {
    if (h.funds >= debt.amount + reconnectFee(w, debt.kind)) payDebt(w, debt.id, true);
  }
  consequences(w);
}

/** Lo que cuesta volver a dar de alta un servicio cortado. */
function reconnectFee(w: World, kind: BillKind): number {
  const cut = w.household.bills?.cut;
  return (kind === 'luz' && cut?.luz) || (kind === 'agua' && cut?.agua) ? ECONOMY.reconnect : 0;
}

function consequences(w: World) {
  const h = w.household;
  const s = state(h);
  const oldest = (k: BillKind) => Math.min(...s.debts.filter((x) => x.kind === k).map((x) => x.due), Infinity);
  const late = (k: BillKind) => (Number.isFinite(oldest(k)) ? w.day - oldest(k) : -1);
  s.warned = s.warned ?? {};
  const once = (key: string, text: string, icon: string) => {
    if (s.warned![key]) return;
    s.warned![key] = w.day;
    w.toast(text, icon);
  };
  for (const k of ['luz', 'agua'] as const) {
    const days = late(k);
    if (days < 0 || s.cut?.[k]) continue;
    if (days >= DEADLINES.cut) {
      s.cut = { ...s.cut, [k]: w.day };
      if (k === 'luz') {
        for (const a of w.agentsIn(h.lotId)) {
          const cur = a.current && w.object(a.current.targetObjectId);
          if (cur && ELECTRIC.has(cur.def)) endTask(w, a);
        }
        w.toast('¡Os han cortado la luz por no pagar! Sin tele, sin ordenador y a oscuras. Pagad el recibo para que la vuelvan a dar', '🔌');
      } else {
        w.toast('¡Os han cortado el agua por no pagar! Ni ducha ni cisterna. Pagad el recibo para que la vuelvan a dar', '🚱');
      }
      for (const m of w.members) if (m.kind === 'person') w.feel(m, 'corte');
      w.addNews(`a la ${h.name} le han cortado ${k === 'luz' ? 'la luz' : 'el agua'}`, []);
    } else if (days >= DEADLINES.cut - 5) {
      once(`aviso-${k}`, `Aviso de la compañía ${k === 'luz' ? 'de la luz' : 'del agua'}: si no pagáis, cortan el servicio en ${DEADLINES.cut - days} días`, '📨');
    }
  }
  const rent = late('alquiler');
  if (rent < 0) {
    delete s.warned['carta'];
    delete s.warned['burofax'];
  } else if (!s.evicted) {
    if (rent >= DEADLINES.eviction) evict(w);
    else if (rent >= DEADLINES.burofax) once('burofax', `Burofax del casero: o pagáis el alquiler en ${DEADLINES.eviction - rent} días, u os desahucian`, '📮');
    else if (rent >= DEADLINES.landlordLetter) once('carta', 'Carta del casero: «Me debéis el alquiler. No me hagáis ir al juzgado»', '✉️');
  }
  // Las deudas agobian (y la calle, más).
  if (s.debts.length) for (const m of w.members) if (m.kind === 'person' && !m.travel) w.feel(m, 'deudas', undefined, 24);
  if (s.evicted) for (const m of w.members) if (m.kind === 'person') w.feel(m, 'en_la_calle', undefined, 24);
}

/** Paga un recibo pendiente (con el reenganche si el servicio estaba cortado). Devuelve el motivo si no se puede. */
export function payDebt(w: World, id: string, auto = false): string | undefined {
  const h = w.household;
  const s = state(h);
  const debt = s.debts.find((x) => x.id === id);
  if (!debt) return 'Ese recibo ya está pagado';
  const fee = reconnectFee(w, debt.kind);
  if (h.funds < debt.amount + fee) return 'No hay dinero suficiente';
  money(w, h, -(debt.amount + fee), debt.kind === 'alquiler' ? 'alquiler' : debt.kind === 'autonomos' ? 'autonomos' : 'facturas');
  s.debts = s.debts.filter((x) => x !== debt);
  w.toast(`${auto ? 'El banco ha cobrado por fin' : 'Pagado'} el recibo de ${BILL_INFO[debt.kind].label.toLowerCase()}: −§${debt.amount}${fee ? ` (+§${fee} de reenganche)` : ''}`, '✅');
  // Si ya no se debe nada de un servicio cortado, vuelve.
  for (const k of ['luz', 'agua'] as const) {
    if (s.cut?.[k] && !s.debts.some((x) => x.kind === k)) {
      delete s.cut[k];
      w.toast(k === 'luz' ? '¡Se hizo la luz! Ya vuelve a haber corriente en casa' : '¡Vuelve el agua! A la ducha, todo el mundo', k === 'luz' ? '💡' : '🚿');
    }
  }
  return undefined;
}

/** Paga todo lo que se pueda, de lo más antiguo a lo más nuevo. */
export function payAll(w: World): number {
  let paid = 0;
  for (const d of [...debtsOf(w.household)].sort((a, b) => a.due - b.due)) if (!payDebt(w, d.id)) paid++;
  return paid;
}

/** Desahucio: la familia se va a la calle (los bebés y las mascotas, con la abuela). */
export function evict(w: World) {
  const h = w.household;
  const s = state(h);
  const square = squareOf(districtOf(w, h.lotId));
  const away: string[] = [];
  for (const m of w.members) {
    const baby = m.kind === 'person' && w.stageOf(m) === 'baby';
    if (m.kind === 'pet' || baby) {
      // Con la abuela: fuera de la partida hasta que vuelva a haber casa.
      endTask(w, m);
      m.queue = [];
      m.travel = { from: m.lotId, to: h.lotId, arrive: Number.POSITIVE_INFINITY };
      away.push(m.id);
      continue;
    }
    if (m.travel?.to === h.lotId) m.travel.to = square;
    else if (!m.travel && m.lotId === h.lotId) startTravel(w, m, square);
  }
  // Las visitas, a su casa.
  for (const a of w.agentsIn(h.lotId)) if (!w.isPlayerMember(a) && !a.travel) a.visitUntil = w.state.minutes;
  s.evicted = { since: w.day, away };
  delete s.warned?.['burofax'];
  w.toast('¡DESAHUCIO! Os echan de casa por no pagar el alquiler. Los peques y las mascotas, con la abuela; vosotros, a la calle', '🚨');
  w.addNews(`han desahuciado a la ${h.name}: ahora duermen en el parque`, []);
  for (const m of w.members) if (m.kind === 'person' && !away.includes(m.id)) w.feel(m, 'desahuciado');
}

/** Lo que hace falta para volver a alquilar la casa: lo que se debe del alquiler más un mes de fianza. */
export function rentBackCost(w: World): number {
  const h = w.household;
  return debtsOf(h).filter((d) => d.kind === 'alquiler').reduce((n, d) => n + d.amount, 0) + billAmount(w, h, 'alquiler');
}

/** Volver a casa tras el desahucio. Devuelve el motivo si no se puede. */
export function rentBack(w: World): string | undefined {
  const h = w.household;
  const s = state(h);
  if (!s.evicted) return 'No estáis desahuciados';
  const cost = rentBackCost(w);
  if (h.funds < cost) return `Hacen falta §${cost} (lo que se debe del alquiler y un mes de fianza)`;
  money(w, h, -cost, 'alquiler');
  s.debts = s.debts.filter((d) => d.kind !== 'alquiler');
  const away = s.evicted.away;
  delete s.evicted;
  delete s.warned?.['carta'];
  // Vuelven los de la abuela.
  for (const id of away) {
    const a = w.agent(id);
    if (a?.travel && !Number.isFinite(a.travel.arrive)) a.travel.arrive = w.state.minutes + 30;
  }
  for (const m of w.members) {
    if (m.kind === 'person') {
      m.emotions = (m.emotions ?? []).filter((e) => e.id !== 'en_la_calle' && e.id !== 'desahuciado');
      if (!m.travel && m.lotId !== h.lotId) startTravel(w, m, h.lotId);
    }
  }
  w.toast(`¡Otra vez con casa! Pagado el alquiler atrasado y la fianza (−§${cost}). Los peques y las mascotas vuelven de casa de la abuela`, '🏠');
  w.addNews(`la ${h.name} ha vuelto a su casa`, []);
  return undefined;
}

/** Ayuda de los servicios sociales: una vez cada 30 días, si hay deudas o estáis en la calle. */
export function aidReason(w: World): string | undefined {
  const s = w.household.bills;
  if (!s?.evicted && !s?.debts.length) return 'Solo si tenéis recibos sin pagar';
  if (s.aid !== undefined && w.day - s.aid < 30) return `Ya os ayudaron hace poco (otra vez dentro de ${30 - (w.day - s.aid)} días)`;
  return undefined;
}

export function askAid(w: World): string | undefined {
  const why = aidReason(w);
  if (why) return why;
  const h = w.household;
  state(h).aid = w.day;
  money(w, h, ECONOMY.socialAid, 'ayudas');
  w.toast(`Los servicios sociales os dan una ayuda de §${ECONOMY.socialAid}. Algo es algo`, '🤝');
  return undefined;
}

/** Al llegar a casa estando desahuciados: la puerta está precintada, a la calle. */
export function homeRedirect(w: World, a: Agent, to: string): string {
  const h = w.householdOf(a);
  if (!h || h.id !== w.household.id || !isEvicted(w, h) || to !== h.lotId) return to;
  if (a.kind === 'person' && w.isPlayerMember(a)) w.toastOnce(`${a.id}:precinto`, `${a.name} llega a casa... pero está precintada. Vuelta a la calle`, '🚧', 600);
  return squareOf(districtOf(w, h.lotId));
}

/** Acciones de la calle: solo quien no tiene casa (dormir en el banco, el comedor social). */
export const STREET_ACTIONS = new Set(['sleep_bench', 'free_meal']);

export function billsReason(w: World, a: Agent, actionId: string, lotId: string): { ok: false; reason?: string } | null {
  if (STREET_ACTIONS.has(actionId) && !(w.isPlayerMember(a) && isEvicted(w))) return { ok: false };
  if (WATER_ACTIONS.has(actionId) && !hasWater(w, lotId)) return { ok: false, reason: 'No hay agua: os la han cortado' };
  return null;
}

/** Días que lleva la familia en la calle. */
export function daysOnStreet(w: World): number {
  const e = w.household.bills?.evicted;
  return e ? w.day - e.since : 0;
}

