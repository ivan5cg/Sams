// El dinero: todo ingreso o gasto pasa por aquí y queda apuntado por categorías
// (esta semana y la anterior), para el registro de movimientos del perfil.

import { ECONOMY } from '../../data/economy';
import { ELECTRIC } from '../../data/seasons';
import type { Household } from '../types';
import type { World } from '../world';

/** Suma (o resta, si `amount` es negativo) dinero a una familia y lo apunta. */
export function money(w: World, h: Household | undefined, amount: number, cat: string) {
  if (!h || !amount) return;
  h.funds += amount;
  const week = w.weekIndex;
  const ledger = (h.ledger = h.ledger ?? []);
  let cur = ledger[ledger.length - 1];
  if (!cur || cur.week !== week) {
    cur = { week, in: {}, out: {} };
    ledger.push(cur);
    while (ledger.length > 2) ledger.shift();
  }
  const side = amount > 0 ? cur.in : cur.out;
  side[cat] = (side[cat] ?? 0) + Math.abs(amount);
}

/** Tamaño de la casa de una familia (1 a 3). */
function houseSize(w: World, h: Household): number {
  return Math.max(1, Math.min(3, w.lotById(h.lotId)?.size ?? 1));
}

/** Facturas de la semana: según la casa (tamaño, electrodomésticos, lujo) y quién vive en ella. */
export function weeklyBill(w: World, h: Household): number {
  if (h.okupa) return 0;
  const b = ECONOMY.bills;
  const ms = h.memberIds.map((id) => w.agent(id)!).filter(Boolean);
  const objs = w.objectsIn(h.lotId);
  const appliances = objs.filter((o) => ELECTRIC.has(o.def)).length;
  const luxury = objs.filter((o) => o.q === 3).length;
  return (
    b.base[houseSize(w, h) - 1] +
    b.perPerson * ms.filter((m) => m.kind === 'person').length +
    b.perPet * ms.filter((m) => m.kind === 'pet').length +
    b.perAppliance * appliances +
    b.perLuxury * luxury
  );
}

/** Hipoteca de la semana (las reformas la suben; los okupas no pagan). */
export function weeklyMortgage(w: World, h: Household): number {
  return h.okupa ? 0 : ECONOMY.mortgage[houseSize(w, h) - 1];
}
