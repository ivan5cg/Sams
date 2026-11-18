// Los sitios nuevos de la fase 5: la biblioteca (lógica y deberes, en silencio), el gimnasio
// (pesas y saco de boxeo para desfogarse) y los mercadillos de cada semana (El Rastro los domingos,
// Alcorcón los sábados y Getafe los miércoles): barato, y regateando, más; muebles de segunda mano
// y un puesto para vender lo vuestro. Horarios, precios con rebaja y lo que pasa al terminar cada cosa.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { ECONOMY } from '../../data/economy';
import { CATALOG, OBJECTS, canRotate, priceOf } from '../../data/objects';
import { MINUTES_PER_DAY } from '../constants';
import { forget, hasEmotion } from '../emotions';
import { ALCORCON_MARKET_LOT, CLOTHES, GETAFE_MARKET_LOT, MARKET_LOT } from '../neighborhood';
import { hasTrait } from '../traits';
import type { Agent, Lot, PlacedObject } from '../types';
import type { World } from '../world';
import { money } from './money';
import { skillLevel } from './skills';
import { startTravel } from './travel';
import { priced } from './economy';
import { canPlace, cantTouch } from './build';
import { pantryOwner } from './shopping';

/** Lo que se compra en el mercadillo (y se puede regatear). */
export const MARKET_BUYS = new Set(['market_food', 'market_clothes', 'rummage', 'buy_secondhand']);

/** Cada mercadillo, un día de la semana (0 = lunes... 6 = domingo), de 9:00 a 14:30. */
export const MARKETS: Record<string, { wd: number; days: string; district: string }> = {
  [MARKET_LOT]: { wd: 6, days: 'los domingos', district: 'madrid' },
  [ALCORCON_MARKET_LOT]: { wd: 5, days: 'los sábados', district: 'alcorcon' },
  [GETAFE_MARKET_LOT]: { wd: 2, days: 'los miércoles', district: 'getafe' },
};
export const MARKET_HOURS = { open: 9 * 60, close: 14 * 60 + 30 };

/** El mercadillo de un barrio. */
export function marketOf(district: string | undefined): string {
  return Object.keys(MARKETS).find((id) => MARKETS[id].district === district) ?? MARKET_LOT;
}

/** Horario de cada sitio nuevo (o nada si no es uno de ellos). */
export function placeClosedReason(lot: Pick<Lot, 'id' | 'name' | 'layout'> | undefined, minutes: number, wd: number): string | undefined {
  const layout = lot?.layout;
  const m = minutes % MINUTES_PER_DAY;
  if (layout === 'library') {
    if (wd === 6) return 'Los domingos, la biblioteca está cerrada';
    if (m < 9 * 60 || m >= 21 * 60) return 'Está cerrada (abre de 9:00 a 21:00)';
  }
  if (layout === 'gym' && (m < 7 * 60 || m >= 23 * 60)) return 'Está cerrado (abre de 7:00 a 23:00)';
  if (layout === 'padel' && (m < 8 * 60 || m >= 23 * 60)) return 'Las pistas, de 8:00 a 23:00';
  if (layout === 'market') {
    const mk = MARKETS[lot!.id] ?? MARKETS[MARKET_LOT];
    if (wd !== mk.wd || m < MARKET_HOURS.open || m >= MARKET_HOURS.close) return `${lot!.name || 'El mercadillo'} solo se pone ${mk.days}, de 9:00 a 14:30`;
  }
  return undefined;
}

// --- Muebles de segunda mano ---

/** Lo que cuesta un mueble de segunda mano (respecto a nuevo). */
export const SECONDHAND_RATIO = 0.5;

export interface SecondhandOffer {
  id: string;
  def: string;
  q: 1 | 2 | 3;
  /** Precio sin regatear. */
  price: number;
  sold: boolean;
}

/** Números al azar, pero siempre los mismos para la misma semilla (el género del día no cambia al mirarlo). */
function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Los cuatro muebles de segunda mano que hay hoy en ese mercadillo (los de mascotas, no). */
export function secondhandOffers(w: World, lotId: string): SecondhandOffer[] {
  let seed = w.day * 7919;
  for (const ch of lotId) seed = seed * 31 + ch.charCodeAt(0);
  const rnd = seeded(seed);
  const pool = CATALOG.filter((d) => d.category !== 'mascotas' && (d.price ?? 0) >= 30);
  const sold = w.state.marketSold?.day === w.day ? w.state.marketSold.ids : [];
  const out: SecondhandOffer[] = [];
  while (out.length < 4 && pool.length) {
    const d = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    const r = rnd();
    const q: 1 | 2 | 3 = d.tiers ? (r < 0.2 ? 3 : r < 0.6 ? 2 : 1) : 2;
    const id = `${lotId}:${out.length}`;
    out.push({ id, def: d.id, q, price: Math.max(1, Math.round(priced(w, priceOf(d, q)) * SECONDHAND_RATIO)), sold: sold.includes(id) });
  }
  return out;
}

/** Un hueco en casa para un mueble (si no cabe derecho, girado). */
function freeSpot(w: World, defId: string): { x: number; y: number; rot?: 1 } | undefined {
  const lay = w.layoutOf(w.household.lotId);
  const rots: (1 | undefined)[] = canRotate(defId) ? [undefined, 1] : [undefined];
  for (const rot of rots) {
    for (let y = 1; y < lay.h - 1; y++) {
      for (let x = 1; x < lay.w - 1; x++) if (canPlace(w, defId, x, y, undefined, rot).ok) return { x, y, ...(rot ? { rot } : {}) };
    }
  }
  return undefined;
}

/** Por qué no se puede comprar ese mueble ahora (o nada si se puede). */
export function secondhandReason(w: World, a: Agent, offerId: string): string | undefined {
  const offer = secondhandOffers(w, a.lotId).find((o) => o.id === offerId);
  if (!offer) return 'Ya no está';
  if (offer.sold) return 'Vendido';
  if (!w.isPlayerMember(a)) return 'No es para vuestra casa';
  if ((w.householdOf(a)?.funds ?? 0) < marketPrice(a, 'buy_secondhand', offer.price)) return 'No hay dinero';
  if (!freeSpot(w, offer.def)) return 'No cabe en casa';
  return undefined;
}

/** Comprar un mueble de segunda mano: lo pagas y te lo llevan a casa (al primer hueco que haya). */
function buySecondhand(w: World, a: Agent, offerId: string | undefined) {
  const mine = w.isPlayerMember(a);
  const offer = offerId ? secondhandOffers(w, a.lotId).find((o) => o.id === offerId) : undefined;
  const why = offerId ? secondhandReason(w, a, offerId) : 'Ya no está';
  if (!offer || why) {
    if (mine) w.toast(`${a.name} no se lo ha podido llevar: ${(why ?? 'ya no está').toLowerCase()}`, '🪑', a.id);
    return;
  }
  const spot = freeSpot(w, offer.def)!;
  const price = marketPrice(a, 'buy_secondhand', offer.price);
  money(w, w.household, -price, 'compra');
  const d = OBJECTS[offer.def];
  w.state.objects.push({ id: `o${w.state.nextId++}`, def: offer.def, lotId: w.household.lotId, x: spot.x, y: spot.y, ...(spot.rot ? { rot: spot.rot } : {}), ...(d.tiers ? { q: offer.q } : {}), ...(d.maxStock ? { stock: 2 } : {}), ...(d.maxDirt ? { dirt: 0 } : {}), used: true });
  w.rebuildGrid();
  const sold = w.state.marketSold?.day === w.day ? w.state.marketSold.ids : [];
  w.state.marketSold = { day: w.day, ids: [...sold, offer.id] };
  w.feel(a, 'chollo');
  if (mine) w.toast(`De segunda mano: ${d.name.toLowerCase()} por §${price}. La furgoneta de un primo de ${a.name} lo deja en casa`, '🪑', a.id);
}

// --- Vender en el puesto ---

/** Lo que dan en el mercadillo por un mueble de casa: más que vendiéndolo desde la obra, y más con carisma. */
export function stallPrice(w: World, a: Agent, o: PlacedObject): number {
  const d = OBJECTS[o.def];
  const bonus = 0.02 * skillLevel(w, a, 'carisma') + (hasTrait(a, 'cunado') ? 0.05 : 0);
  // Lo que ya era de segunda mano se vende como tal (si no, sería un negocio redondo).
  let ratio = o.used ? Math.min(SECONDHAND_RATIO, 0.35 + bonus) : Math.min(1, 0.8 + bonus);
  if (o.broken) ratio /= 2;
  return Math.floor(priced(w, priceOf(d, o.q ?? 2)) * ratio);
}

/** Los muebles de vuestra casa que se pueden llevar al puesto. */
export function stallGoods(w: World): PlacedObject[] {
  return w.objectsIn(w.household.lotId).filter((o) => OBJECTS[o.def].price && !cantTouch(w, o));
}

function sellAtStall(w: World, a: Agent, objectId: string | undefined) {
  const mine = w.isPlayerMember(a);
  const o = objectId ? w.object(objectId) : undefined;
  if (!o || !mine || !stallGoods(w).includes(o)) {
    if (mine) w.toast(`${a.name} no ha podido venderlo: ya no está en casa (o lo están usando)`, '🏷️', a.id);
    return;
  }
  const price = stallPrice(w, a, o);
  const d = OBJECTS[o.def];
  money(w, w.household, price, 'ventas');
  w.state.objects = w.state.objects.filter((x) => x !== o);
  w.rebuildGrid();
  const buyers = ['una señora que lo quiere para el pueblo', 'un guiri encantado', 'un anticuario que dice que «no vale nada» y lo paga igual', 'una pareja que se acaba de mudar'];
  if (mine) w.toast(`${a.name} lo ha vendido en el puesto: ${d.name.toLowerCase()}, +§${price}. Se lo lleva ${buyers[Math.floor(Math.random() * buyers.length)]}`, '🏷️', a.id);
}

/** Raciones que se llevan los dulces caseros. */
export const HOMEMADE_PORTIONS = 4;

/** Lo que se saca con los dulces caseros: más con repostería (y algo con cocina). */
export function homemadePrice(w: World, a: Agent): number {
  return priced(w, HOMEMADE_PORTIONS * (6 + 2 * skillLevel(w, a, 'reposteria') + skillLevel(w, a, 'cocina')));
}

/** Por qué no puede vender dulces (o nada si puede). */
export function homemadeReason(w: World, a: Agent): string | undefined {
  const h = w.householdOf(a);
  if (!h || (h.pantry ?? 0) < HOMEMADE_PORTIONS) return `Hacen falta ${HOMEMADE_PORTIONS} raciones en la nevera de casa`;
  return undefined;
}

function sellHomemade(w: World, a: Agent) {
  const h = w.householdOf(a);
  const mine = w.isPlayerMember(a);
  if (!h || homemadeReason(w, a)) return;
  // Las raciones salen de casa (la despensa de su familia, esté donde esté).
  const owner = pantryOwner(w, h.lotId) ?? h;
  owner.pantry = Math.max(0, (owner.pantry ?? 0) - HOMEMADE_PORTIONS);
  const price = homemadePrice(w, a);
  money(w, h, price, 'ventas');
  w.feel(a, 'orgulloso', 'sus dulces');
  if (mine) w.toast(`${a.name} ha vendido todas las rosquillas y las torrijas del puesto: +§${price}. «¡Como las de la abuela!»`, '🍩', a.id);
}

/** Precio con la rebaja de haber regateado (solo en el mercadillo). */
export function marketPrice(a: Agent | undefined, actionId: string, cost: number): number {
  if (a && MARKET_BUYS.has(actionId) && hasEmotion(a, 'regateo')) return Math.round(cost * ECONOMY.haggleDiscount);
  return cost;
}

/** Probabilidad de que el del puesto baje el precio. */
export function haggleChance(w: World, a: Agent): number {
  return Math.min(0.9, 0.3 + 0.08 * skillLevel(w, a, 'carisma') + (hasTrait(a, 'cunado') ? 0.1 : 0) + (hasTrait(a, 'grunon') ? -0.1 : 0));
}

const FINDS: { p: number; text: string; icon: string; effect: (w: World, a: Agent) => void }[] = [
  { p: 0.3, text: 'un libro viejo de ajedrez. Ya sabe dos aperturas más', icon: '📕', effect: (_w, a) => (a.skills = { ...a.skills, ajedrez: Math.min(10, (a.skills?.ajedrez ?? 0) + 0.5) }) },
  { p: 0.25, text: 'un vinilo de Raphael en perfecto estado', icon: '💿', effect: (w, a) => w.feel(a, 'chollo') },
  { p: 0.15, text: 'un jarrón que parecía de la abuela... y lo ha revendido en Wallapop', icon: '🏺', effect: (w, a) => {
    const h = w.householdOf(a);
    if (h) money(w, h, priced(w, ECONOMY.resale), 'ventas');
    w.feel(a, 'chollo');
  } },
  { p: 0.3, text: 'nada: solo cables de un Nokia y un cenicero de Benidorm', icon: '🙃', effect: () => {} },
];

/** Al terminar una acción en uno de los sitios nuevos. */
export function placeTask(w: World, a: Agent, actionId: string, param?: string) {
  const mine = w.isPlayerMember(a);
  const say = (text: string, icon: string) => mine && w.toast(text, icon, a.id);
  switch (actionId) {
    case 'homework_lib':
      // En la biblioteca cunden más que en casa (en casa, +4).
      if (a.job?.career === 'school') a.job.perf = Math.min(100, a.job.perf + 8);
      say(`${a.name} ha hecho los deberes en la biblioteca. Sin la tele, cunde el doble`, '📝');
      break;
    case 'box':
      for (const e of ['enfadado', 'insultado', 'celos']) forget(a, e);
      w.feel(a, 'desfogado');
      say(`${a.name} se ha desfogado con el saco. Ya no se acuerda ni de por qué estaba enfadado/a`, '🥊');
      break;
    case 'market_food': {
      a.carrying = (a.carrying ?? 0) + 8;
      say(`${a.name} vuelve del mercadillo con 8 raciones de fruta y verdura. «¡Que me las quitan de las manos!»`, '🍊');
      const h = w.householdOf(a);
      if (a.errand === 'compra' && h && a.lotId !== h.lotId) {
        a.errand = undefined;
        startTravel(w, a, h.lotId);
      }
      break;
    }
    case 'market_clothes': {
      const options = CLOTHES.filter((c) => c !== a.color);
      a.color = options[Math.floor(Math.random() * options.length)];
      w.feel(a, 'estreno');
      say(`${a.name} estrena ropa de mercadillo. Parece de marca (casi)`, '👕');
      break;
    }
    case 'rummage': {
      let r = Math.random();
      const find = FINDS.find((f) => (r -= f.p) < 0) ?? FINDS[FINDS.length - 1];
      find.effect(w, a);
      say(`${a.name} ha encontrado ${find.text}`, find.icon);
      break;
    }
    case 'haggle':
      if (hasEmotion(a, 'regateo')) {
        say(`${a.name} ya tiene la rebaja: ¡a comprar!`, '🤝');
      } else if (Math.random() < haggleChance(w, a)) {
        w.feel(a, 'regateo');
        say(`«Venga, para ti, a mitad de precio». ¡${a.name} ha regateado como nadie!`, '🤝');
      } else {
        say(`«¡Que me quitas el pan de mis hijos!». A ${a.name} no le bajan ni un euro`, '😤');
      }
      break;
    case 'buy_secondhand':
      buySecondhand(w, a, param);
      break;
    case 'sell_stall':
      sellAtStall(w, a, param);
      break;
    case 'sell_homemade':
      sellHomemade(w, a);
      break;
    case 'play_padel': {
      // El pádel: siempre hay un cuñado que lo comenta toda la semana.
      const rivals = w.agentsIn(a.lotId).filter((x) => x !== a && x.kind === 'person' && !x.travel && x.current?.actionId === 'play_padel');
      const won = Math.random() < 0.5 + 0.05 * skillLevel(w, a, 'forma');
      if (won) w.feel(a, 'fiesta', undefined, 3);
      say(
        won
          ? `${a.name} ha ganado al pádel 6-4${rivals[0] ? ` a ${rivals[0].name}` : ''}. Lo va a contar en todas las comidas familiares`
          : `${a.name} ha perdido al pádel. Dice que la pala era mala y que el sol le daba de cara`,
        '🎾',
      );
      break;
    }
    case 'fart':
    case 'sing':
      if (w.lotById(a.lotId)?.layout === 'library') {
        say(`¡Shhh! La bibliotecaria ha mirado fatal a ${a.name}`, '🤫');
        for (const x of w.agentsIn(a.lotId)) if (x !== a && x.kind === 'person' && !x.travel) x.needs.fun = Math.max(0, x.needs.fun - 5);
      }
      break;
  }
  // Lo comprado con rebaja gasta la rebaja (después de cobrar: los muebles se pagan al terminar).
  if (MARKET_BUYS.has(actionId)) forget(a, 'regateo');
}
