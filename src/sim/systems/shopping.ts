// La compra: despensa, horarios de las tiendas, Mercadona y pedidos a domicilio.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { placeClosedReason } from './places';
import { ACTIONS } from '../../data/actions';
import { MINUTES_PER_DAY, PANTRY_MAX } from '../constants';
import { SUPER_LOT } from '../neighborhood';
import type { Agent, Household } from '../types';
import type { World } from '../world';
import { checkObjectAction } from './checks';
import { command } from './tasks';
import { busySoon, goHome, startTravel, travel } from './travel';
import { priced } from './economy';

/** La familia dueña de la nevera de esa parcela (si es una casa). */
export function pantryOwner(w: World, lotId: string): Household | undefined {
  const lot = w.lotById(lotId);
  if (lot?.kind !== 'home') return undefined;
  return w.state.households.find((h) => h.id === lot.householdId);
}

/** Si la tienda de esa parcela está cerrada a esta hora, el motivo. */
export function closedReason(w: World, lotId: string): string | undefined {
  const layout = w.lotById(lotId)?.layout;
  const m = w.state.minutes % MINUTES_PER_DAY;
  if (layout === 'super' && (m < 9 * 60 || m >= 21 * 60 + 30)) return 'Está cerrado (abre de 9:00 a 21:30)';
  if (layout === 'acai' && (m < 10 * 60 || m >= 22 * 60)) return 'Está cerrado (abre de 10:00 a 22:00)';
  return placeClosedReason(layout, w.state.minutes, w.weekday);
}

/** A la hora de cerrar, todo el mundo a la calle (y a casa). */
export function closingTime(w: World) {
  for (const lot of w.state.lots) {
    if (lot.kind !== 'venue' || !closedReason(w, lot.id)) continue;
    const inside = w.agentsIn(lot.id).filter((a) => !a.travel);
    if (inside.some((a) => w.isPlayerMember(a))) w.toast(`${lot.name} cierra: ¡a casa!`, '🔒');
    for (const a of inside) {
      a.errand = undefined;
      goHome(w, a);
    }
  }
}

/** Lo que se compra: a la bolsa (y a casa) o pedido a domicilio. */
export function shopping(w: World, a: Agent, actionId: string) {
  const h = w.householdOf(a);
  if (!h) return;
  const mine = w.isPlayerMember(a);
  if (actionId === 'shop_small' || actionId === 'shop_big') {
    const n = actionId === 'shop_big' ? 20 : 8;
    a.carrying = (a.carrying ?? 0) + n;
    if (mine) w.toast(`${a.name} ha hecho la compra: ${n} raciones para casa`, '🛒');
    if (a.errand === 'compra') {
      a.errand = undefined;
      if (a.lotId !== h.lotId) startTravel(w, a, h.lotId);
    }
  }
  if (actionId === 'order_groceries') {
    h.delivery = { at: w.state.minutes + 4 * 60, amount: 8 };
    if (mine) w.toast('Pedido hecho: la compra llegará en unas 4 horas', '📦');
  }
}

export function checkDelivery(w: World) {
  for (const h of w.state.households) {
    if (!h.delivery || w.state.minutes < h.delivery.at) continue;
    h.pantry = Math.min(PANTRY_MAX, (h.pantry ?? 0) + h.delivery.amount);
    if (h.id === w.household.id) w.toast(`¡Ha llegado la compra a domicilio! (+${h.delivery.amount} raciones)`, '📦');
    h.delivery = undefined;
  }
}

/** Al llegar a casa con la compra se llena la nevera; al llegar al súper a hacer un recado, a la caja. */
export function onArriveShopping(w: World, a: Agent, to: string) {
  const h = w.householdOf(a);
  if (!h) return;
  if (a.carrying && to === h.lotId) {
    h.pantry = Math.min(PANTRY_MAX, (h.pantry ?? 0) + a.carrying);
    if (w.isPlayerMember(a)) w.toast(`${a.name} ha llenado la nevera (${h.pantry} raciones)`, '🧊');
    a.carrying = 0;
  }
  if (a.errand === 'compra' && w.lotById(to)?.layout === 'super') {
    const action = h.funds >= 300 ? 'shop_big' : 'shop_small';
    const checkout = w.objectsIn(to).find((o) => o.def === 'checkout' && checkObjectAction(w, a, o, action).ok);
    if (!checkout || !command(w, a.id, action, { kind: 'object', id: checkout.id })) {
      a.errand = undefined;
      w.toast(`${a.name} no ha podido hacer la compra`, '🛒');
      startTravel(w, a, h.lotId);
    }
  }
}

export function groceryErrand(w: World) {
  const h = w.household;
  if ((h.pantry ?? 0) > 3 || h.delivery || closedReason(w, SUPER_LOT) || w.state.familyGone) return;
  if (w.members.some((m) => m.errand || m.carrying || m.travel?.to === SUPER_LOT)) return;
  if (h.funds < priced(w, ACTIONS.shop_small.cost ?? 0)) {
    // Sin dinero no hay compra: se avisa una vez al día, no cada hora.
    if ((h.pantry ?? 0) <= 0 && w.noMoneyWarned !== w.day) {
      w.noMoneyWarned = w.day;
      w.toast('La nevera está vacía y no hay dinero para la compra. ¡A buscar curro!', '💸');
    }
    return;
  }
  const who = w.members.find(
    (m) => m.kind === 'person' && ['teen', 'young', 'adult', 'elder'].includes(w.stageOf(m)) && !w.isActive(m) && m.lotId === h.lotId && !m.travel && !m.hidden && !busySoon(w, m, 2) && !(m.current && ACTIONS[m.current.actionId].forced),
  );
  if (!who) {
    w.toastOnce('pantry-empty', 'La nevera está casi vacía: id al Mercadona o pedid la compra por el ordenador', '🧊', 360);
    return;
  }
  who.errand = 'compra';
  travel(w, [who.id], SUPER_LOT);
  w.toast(`${who.name} se va al Mercadona a hacer la compra`, '🛒');
}
