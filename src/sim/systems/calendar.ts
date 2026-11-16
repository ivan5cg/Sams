// El calendario: días, estaciones, eventos (calor, verbena, Navidad, elecciones...), facturas y lotería.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { ACTIONS } from '../../data/actions';
import { CAREERS } from '../../data/careers';
import { QUALITY } from '../../data/objects';
import { ELECTRIC, EVENTS, POWERED_ACTIONS } from '../../data/seasons';
import { lifeStage } from '../../data/species';
import { MINUTES_PER_DAY } from '../constants';
import { BAR_LOT, PARK_LOT, PLAZA_LOT, SUPER_LOT } from '../neighborhood';
import { getRel, isAdult, partnerOf } from '../social';
import { hasTrait } from '../traits';
import type { Agent, SpeciesId } from '../types';
import { rand } from '../util';
import { newWish } from '../wishes';
import type { World } from '../world';
import { dailyGossip } from './gossip';
import { deathChance, die, evolveTraits, freeCrib, onStageChange } from './lifecycle';
import { neighbourAdopts } from './pets';
import { endTask } from './tasks';
import { availableVisitors, districtOf, sendVisit, startTravel } from './travel';

/** ¿Está en marcha este evento (en esa parcela, si se dice)? */
export function hasEvent(w: World, id: string, lotId?: string): boolean {
  return !!w.state.events?.some((e) => e.id === id && e.until > w.state.minutes && (!lotId || !e.lotId || e.lotId === lotId));
}

export function activeEvents(w: World) {
  return (w.state.events ?? []).filter((e) => e.until > w.state.minutes && EVENTS[e.id]);
}

export function startEvent(w: World, id: string, minutes: number, lotId?: string) {
  w.state.events = [...activeEvents(w).filter((e) => e.id !== id), { id, until: w.state.minutes + minutes, ...(lotId ? { lotId } : {}) }];
}

/** Lo que cuesta una acción ahora (con ofertas, más barato). */
export function costOf(w: World, actionId: string): number {
  const c = ACTIONS[actionId]?.cost ?? 0;
  if (hasEvent(w, 'ofertas') && (actionId === 'shop_small' || actionId === 'shop_big')) return Math.round(c * 0.7);
  return c;
}

/** Por qué no se puede comprar lotería ahora (o nada si se puede). */
export function lotteryReason(w: World, a: Agent): string | undefined {
  if (w.season !== 3) return 'Solo se vende en invierno, antes de Navidad';
  if (w.weekday === 6) return 'El sorteo es hoy: ya no se venden';
  if (w.state.lottery?.includes(a.id)) return 'Ya tiene su décimo';
  return undefined;
}

/** Lo que pasa cada día según la estación: olas de calor, ofertas, Navidad... */
export function seasonalDay(w: World) {
  const wd = w.weekday;
  const se = w.season;
  if (wd === 0) w.toast(w.seasonDef.intro, w.seasonDef.icon);
  if (wd === 0 && se === 0) {
    for (const m of w.members) if (m.kind === 'person' && partnerOf(w.state, m.id)) w.feel(m, 'enamorado', undefined, 8);
  }
  if (se === 1 && wd >= 1 && wd <= 4 && !hasEvent(w, 'calor') && Math.random() < 0.35) {
    startEvent(w, 'calor', 2 * MINUTES_PER_DAY);
    w.toast('¡Ola de calor! 40 grados a la sombra. Duchas, piscina y batidos', '🥵');
    w.addNews('hace un calor que no se puede ni respirar', []);
  }
  if (se === 2 && wd === 1) {
    startEvent(w, 'ofertas', 2 * MINUTES_PER_DAY);
    w.toast('Días de la huerta en el Mercadona: la compra, un 30% más barata', '🥬');
  }
  if (se === 1 && wd === 5) w.toast('Esta noche hay verbena en el parque. ¡Que no falte nadie!', '🎆');
  // Primavera: campaña electoral (martes a viernes), San Isidro (sábado) y elecciones (domingo).
  if (se === 0 && wd === 1) {
    startEvent(w, 'campana', 4 * MINUTES_PER_DAY);
    w.toast('Empieza la campaña electoral: carteles, mítines y militantes llamando a las puertas', '🗳️');
  }
  if (se === 0 && wd === 5) {
    startEvent(w, 'sanisidro', MINUTES_PER_DAY);
    w.toast('¡San Isidro! Chulapos y chulapas, chotis en la pradera y rosquillas tontas y listas', '🎩');
    w.addNews('todo el barrio se ha vestido de chulapo por San Isidro', []);
  }
  if (se === 0 && wd === 6) {
    const cunado = w.members.find((m) => hasTrait(m, 'cunado'));
    w.toast(cunado ? `Hoy hay elecciones. ${cunado.name} dice que él ya sabía el resultado desde hace un mes` : 'Hoy hay elecciones: colas en el colegio electoral y tertulias en el bar', '🗳️');
  }
  if (se === 3 && wd === 6) {
    startEvent(w, 'navidad', MINUTES_PER_DAY);
    for (const m of w.members) if (m.kind === 'person') w.feel(m, 'navidad');
    const cunado = w.members.find((m) => hasTrait(m, 'cunado'));
    w.toast(
      cunado ? `¡Feliz Navidad! En la cena, ${cunado.name} ha explicado cómo arreglar el país. Dos veces` : '¡Feliz Navidad! Turrón, polvorones y villancicos a todo volumen',
      '🎄',
    );
  }
  w.blackoutTonight = w.wishesEnabled && Math.random() < w.blackoutChance;
  // El tiempo: lluvia en primavera y otoño, nieve en invierno.
  if ((se === 0 || se === 2) && Math.random() < 0.25) startEvent(w, 'lluvia', Math.round(rand(10, 20)) * 60);
  if (se === 3 && wd !== 6 && Math.random() < 0.4) startEvent(w, 'nevada', Math.round(rand(8, 16)) * 60);
}

/** Lo que pasa cada hora con los eventos. */
export function eventsHour(w: World) {
  const h = w.hour;
  const se = w.season;
  const now = w.state.minutes;
  w.heatNow = hasEvent(w, 'calor') && h >= 11 && h < 20;
  if (w.heatNow) for (const m of w.members) if (m.kind === 'person' && !m.travel && m.lotId !== SUPER_LOT) w.feel(m, 'calor', undefined, 2);
  // Lluvia: quien esté en la calle (parque, plaza) acaba calado.
  if (hasEvent(w, 'lluvia')) {
    for (const a of w.state.agents) {
      const lot = w.lotById(a.lotId);
      if (a.kind === 'person' && !a.travel && !a.role && (lot?.kind === 'park')) w.feel(a, 'mojado');
    }
  }
  // Verbena: sábado de verano por la noche, en el parque.
  if (se === 1 && w.weekday === 5 && h === 19 && !hasEvent(w, 'verbena')) {
    const until = now + 6 * 60;
    startEvent(w, 'verbena', 6 * 60, PARK_LOT);
    for (const hh of w.state.households) {
      if (hh.id === w.household.id || Math.random() < 0.25) continue;
      for (const p of availableVisitors(w, hh)) {
        if (p.kind !== 'person') continue;
        startTravel(w, p, PARK_LOT);
        p.visitUntil = until;
      }
    }
    w.toast('¡Empieza la verbena en el parque! Música, churros y Paquito el Chocolatero', '🎆');
  }
  if (hasEvent(w, 'verbena')) for (const a of w.agentsIn(PARK_LOT)) if (a.kind === 'person' && !a.travel) w.feel(a, 'verbena');
  // Apagón: un par de horas sin luz por la noche.
  if (w.blackoutTonight && h === 21) {
    w.blackoutTonight = false;
    const home = w.household.lotId;
    startEvent(w, 'apagon', 120, home);
    for (const a of w.agentsIn(home)) {
      if (a.kind === 'person' && !a.travel) w.feel(a, 'apagon');
      const cur = a.current && w.object(a.current.targetObjectId);
      if (cur && (ELECTRIC.has(cur.def) || POWERED_ACTIONS.has(a.current!.actionId))) endTask(w, a);
    }
    w.toast('¡Apagón! Se ha ido la luz en toda la calle. ¿Dónde están las velas?', '🕯️');
  }
  // San Isidro: en el parque y la plaza, todo el mundo castizo.
  if (hasEvent(w, 'sanisidro')) {
    for (const lotId of [PARK_LOT, PLAZA_LOT]) for (const a of w.agentsIn(lotId)) if (a.kind === 'person' && !a.travel && !a.role) w.feel(a, 'castizo');
    if (h === 11) for (const hh of w.state.households) if (hh.id !== w.household.id && Math.random() < 0.5) sendVisit(w, hh, districtOf(w, hh.lotId) === 'alcorcon' ? PLAZA_LOT : PARK_LOT, false);
  }
  // Domingo por la tarde: derbi en la tele del bar.
  if (w.weekday === 6 && h === 19) {
    for (const hh of w.state.households) if (hh.id !== w.household.id && Math.random() < 0.35) sendVisit(w, hh, BAR_LOT, false);
    if (w.members.some((m) => m.kind === 'person' && isAdult(m))) w.toastOnce('derbi', 'Esta tarde hay derbi Madrid–Atleti. En el Bar Casa Paco lo ponen en la tele', '⚽', 600);
  }
  // Nochevieja (último día del invierno): las uvas.
  if (se === 3 && w.weekday === 6 && h === 23) {
    const cunado = w.members.find((m) => hasTrait(m, 'cunado'));
    w.toast(cunado ? `¡Las doce campanadas! ${cunado.name} se ha atragantado con la quinta uva. Feliz año` : '¡Las doce campanadas! Doce uvas, cava y ¡feliz año nuevo!', '🍇');
    for (const m of w.members) if (m.kind === 'person') w.feel(m, 'fiesta', undefined, 6);
  }
  // Lotería de Navidad: el sorteo, el último día del invierno a mediodía.
  if (se === 3 && w.weekday === 6 && h === 12 && w.state.lottery?.length) lotteryDraw(w);
}

export function lotteryDraw(w: World) {
  const tickets = w.state.lottery ?? [];
  w.state.lottery = [];
  w.toast('Los niños de San Ildefonso cantan el sorteo de la Lotería de Navidad...', '🎶');
  for (const id of tickets) {
    const a = w.agent(id);
    const h = a && w.householdOf(a);
    if (!a || !h) continue;
    const r = Math.random();
    if (r < 0.03) {
      h.funds += 4000;
      w.feel(a, 'loteria');
      w.toast(`¡¡EL GORDO!! ¡A ${a.name} le han tocado §4.000!`, '🤑');
      w.addNews(`a ${a.name} le ha tocado el Gordo de Navidad`, [a.id]);
    } else if (r < 0.2) {
      h.funds += 100;
      w.toast(`Pedrea para ${a.name}: +§100. Algo es algo`, '🎫');
    } else if (r < 0.32) {
      h.funds += 20;
      w.toast(`Reintegro para ${a.name}: recupera los §20`, '🎫');
    } else {
      w.toast(`A ${a.name} no le ha tocado nada. Lo importante es la salud`, '🙃');
    }
  }
}

/** Cosas que pasan: averías, dinero encontrado, la lotería... */
export function dailyEvents(w: World) {
  const h = w.household;
  if (w.state.familyGone) return;
  for (const o of w.objectsIn(h.lotId)) {
    if (w.objDef(o).breakable && !o.broken && Math.random() < 0.03 * QUALITY[o.q ?? 2].breaks) {
      o.broken = true;
      w.toast(`Se ha estropeado: ${w.objDef(o).name.toLowerCase()}. Toca para repararlo`, '🔧');
    }
  }
  const r = Math.random();
  if (r < 0.01) {
    h.funds += 500;
    w.toast('¡Os ha tocado la lotería! +§500', '🎟️');
    w.addNews(`a la ${h.name} le ha tocado la lotería`, []);
  } else if (r < 0.08) {
    h.funds += 50;
    w.toast('Habéis encontrado §50 en el bolsillo de un abrigo viejo', '🧥');
  }
}

export function newDay(w: World) {
  w.toast(`Empieza el día ${w.day}`, '🌅');
  // Las relaciones se enfrían un poco si no se cuidan.
  for (const rel of Object.values(w.state.rels)) {
    if (!rel.kin && Math.abs(rel.f) > 5) rel.f -= Math.sign(rel.f) * 0.5;
    rel.r = Math.max(0, rel.r - (rel.status ? 0.5 : 1));
  }
  // Facturas, cada lunes.
  if (w.weekday === 0 && w.day > 1) {
    for (const h of w.state.households) {
      const ms = h.memberIds.map((id) => w.agent(id)!).filter(Boolean);
      const bill = h.okupa ? 0 : 60 + 20 * ms.filter((m) => m.kind === 'person').length + 10 * ms.filter((m) => m.kind === 'pet').length;
      h.funds -= bill;
      for (const m of ms) {
        if (m.job && CAREERS[m.job.career]?.business) {
          h.funds -= 90;
          w.feel(m, 'cuota');
          if (h.id === w.household.id) w.toast(`Cuota de autónomos de ${m.name}: −§90`, '🧾');
        }
      }
      if (h.id === w.household.id) {
        w.toast(`Han llegado las facturas de la semana: §${bill}`, '🧾');
        if (h.funds < 0) w.toast('¡Estáis en números rojos!', '⚠️');
      }
    }
  }
  dailyEvents(w);
  seasonalDay(w);
  dailyGossip(w);
  evolveTraits(w);
  // Cada día, el deseo más antiguo de cada uno cambia por otro.
  for (const m of w.members) {
    if (m.wishes && m.wishes.length >= 3) {
      m.wishes.shift();
      const wish = newWish(w, m);
      if (wish) m.wishes.push(wish);
    }
  }
  // Los vecinos hacen su compra sin que lo veamos.
  for (const h of w.state.households) if (h.id !== w.household.id) h.pantry = Math.max(h.pantry ?? 0, 12);
  // Pensiones
  for (const h of w.state.households) {
    for (const id of h.memberIds) {
      const m = w.agent(id);
      if (m?.kind === 'person' && w.stageOf(m) === 'elder' && !m.job) h.funds += 30;
    }
  }
  // Envejecer
  const step = w.state.aging === 'off' ? 0 : w.state.aging === 'fast' ? 2 : 1;
  if (step) {
    for (const a of [...w.state.agents]) {
      if (a.role) continue;
      const before = lifeStage(a.species, a.ageDays);
      a.ageDays += step;
      const after = lifeStage(a.species, a.ageDays);
      if (before.id !== after.id) {
        if (w.isPlayerMember(a)) w.toast(`¡${a.name} ha crecido! Ahora es ${after.label.toLowerCase()}. ¡Feliz cumpleaños!`, '🎂');
        if (a.kind === 'person' && after.id !== 'baby') w.feel(a, 'cumple');
        onStageChange(w, a, after.id);
      }
    }
    for (const a of [...w.state.agents]) {
      if (!a.role && Math.random() < deathChance(w, a)) die(w, a, 'old');
    }
  }
  // Dramas del barrio: alguna pareja de vecinos se separa (y hay que contarlo).
  for (const [k, rel] of Object.entries(w.state.rels)) {
    if (!rel.status) continue;
    const [x, y] = k.split('|').map((id) => w.agent(id));
    if (!x || !y || w.isPlayerMember(x) || w.isPlayerMember(y)) continue;
    if (x.householdId === y.householdId) rel.r = Math.min(100, rel.r + 0.5);
    if (Math.random() < 0.004) {
      const married = rel.status === 'married';
      rel.status = undefined;
      rel.r = Math.min(rel.r, 15);
      if (x.householdId === y.householdId) rel.ex = true;
      w.addNews(married ? `${x.name} y ${y.name} se han divorciado. Dicen que por una herencia` : `${x.name} y ${y.name} lo han dejado`, [x.id, y.id]);
    }
  }
  // Los vecinos también tienen hijos.
  for (const h of w.state.households) {
    if (h.id === w.household.id || h.expecting || h.memberIds.length >= 6) continue;
    const people = h.memberIds.map((id) => w.agent(id)!).filter((m) => m && m.kind === 'person' && ['young', 'adult'].includes(w.stageOf(m)));
    const couple = people.flatMap((p, i) => people.slice(i + 1).map((q) => [p, q] as const)).find(([p, q]) => getRel(w.state, p.id, q.id).status);
    if (couple && freeCrib(w, h.lotId) && Math.random() < 0.12) h.expecting = { parents: [couple[0].id, couple[1].id], due: w.state.minutes + 3 * MINUTES_PER_DAY };
  }
  // Mascotas en el barrio: si falta alguna especie, una familia la adopta; y de vez en cuando, por gusto.
  const ALL: SpeciesId[] = ['dog', 'cat', 'guineapig', 'ferret', 'capybara'];
  const present = new Set(w.state.agents.map((a) => a.species));
  const wanted: SpeciesId[] = ALL.filter((sp) => !present.has(sp));
  if (Math.random() < 0.3) wanted.push(ALL[Math.floor(Math.random() * ALL.length)]);
  for (const species of wanted) {
    const candidates = w.state.households.filter((h) => {
      if (h.id === w.household.id || h.memberIds.length >= 6) return false;
      const ms = h.memberIds.map((id) => w.agent(id)!).filter(Boolean);
      if (ms.filter((m) => m.kind === 'pet').length >= 2 || !ms.some((m) => m.kind === 'person' && isAdult(m))) return false;
      return species !== 'guineapig' || w.objectsIn(h.lotId).some((o) => o.def === 'cage' && !w.residentOf(o.id));
    });
    const h = candidates[Math.floor(Math.random() * candidates.length)];
    if (h) neighbourAdopts(w, h, species);
  }
}
