// Gente de la calle: vendedor, músico, rapero del metro, cotillas, riders de Glovo y militantes en campaña.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { CAREERS } from '../../data/careers';
import { isOutdoor } from '../../data/lot';
import { SPECIES } from '../../data/species';
import { ACCORDION_LINES, ALCOHOL, CAMPAIGN_LINES, CHISMOSA_LINES, GASSY, GLOVO_LINES, RAP_INTRO, RAP_OUTRO, RAP_VERSES, VENDOR_LINES } from '../../data/street';
import { PANTRY_MAX, TRAVEL_MINUTES } from '../constants';
import { hasEmotion } from '../emotions';
import { bestSecretFor } from '../gossip';
import { METRO_LOT, PARK_LOT } from '../neighborhood';
import { isWalkable } from '../pathfinding';
import { changeRel, isAdult, partnerOf } from '../social';
import { hasTrait, traitsOf } from '../traits';
import { NEED_KEYS, type Agent } from '../types';
import { clamp, rand } from '../util';
import type { World } from '../world';
import { drink, fartReactions } from './body';
import { hasEvent } from './calendar';
import { askChismosa, learnSecret, makePublic } from './gossip';
import { bestPath, neighbours } from './movement';
import { beginTask, runTask } from './tasks';
import { districtOf, freeSpotNear, goHome, startTravel } from './travel';

/** La gente de la calle hace lo suyo: no tiene necesidades ni autonomía normal. */
export function stepRole(w: World, a: Agent, dt: number) {
  for (const k of NEED_KEYS) a.needs[k] = 80;
  if (!a.current) {
    const next = a.queue.shift();
    if (next) beginTask(w, a, next);
    else roleIdle(w, a);
  }
  if (a.current) runTask(w, a, a.current, dt);
}

export function roleIdle(w: World, a: Agent) {
  const audience = w.agentsIn(a.lotId).some((x) => w.isPlayerMember(x) && !x.travel && !x.hidden);
  const say = (lines: string[], p = 0.4) => {
    if (audience && Math.random() < p) w.say(a.id, lines[Math.floor(Math.random() * lines.length)]);
  };
  const wander = (): boolean => {
    const grid = w.gridOf(a.lotId);
    for (let i = 0; i < 10; i++) {
      const lay = w.layoutOf(a.lotId);
      const x = 1 + Math.floor(Math.random() * (lay.w - 2)), y = 1 + Math.floor(Math.random() * (lay.h - 2));
      if (isWalkable(grid, x, y) && isOutdoor(lay.tiles[y][x]) === isOutdoor(lay.tiles[Math.round(a.pos.y)]?.[Math.round(a.pos.x)])) {
        return beginTask(w, a, { id: w.newId('t'), actionId: 'move', byPlayer: false, phase: 'walking', remaining: 0, dest: { x, y } });
      }
    }
    return false;
  };
  const idle = (min: number, max: number) => {
    a.current = { id: w.newId('t'), actionId: 'idle', byPlayer: false, phase: 'acting', remaining: rand(min, max) };
  };
  switch (a.role) {
    case 'vendedor':
      say(VENDOR_LINES, 0.5);
      if (Math.random() < 0.6 && wander()) return;
      return idle(3, 6);
    case 'musico':
      say(ACCORDION_LINES, 0.3);
      a.current = { id: w.newId('t'), actionId: 'play_accordion', byPlayer: false, phase: 'acting', remaining: 30 };
      return;
    case 'rapero':
      if (Math.random() < 0.3 && wander()) return;
      return idle(4, 8);
    case 'chismosa': {
      // A su banco, a ver pasar a la gente.
      const bench = w.objectsIn(a.lotId).find((o) => o.def === 'bench' && w.usersOf(o.id).length < 2);
      say(CHISMOSA_LINES, 0.35);
      if (bench && Math.random() < 0.8) {
        a.current = { id: w.newId('t'), actionId: 'sit_bench', byPlayer: false, phase: 'walking', remaining: 0, targetObjectId: bench.id };
        if (!beginTask(w, a, a.current)) idle(5, 10);
        return;
      }
      return idle(5, 10);
    }
    case 'militante': {
      // Se acerca a quien haya de la familia a pedirle el voto.
      const target = w.agentsIn(a.lotId).find((x) => w.isPlayerMember(x) && x.kind === 'person' && isAdult(x) && !x.travel && !x.hidden);
      say(CAMPAIGN_LINES, 0.5);
      if (target && Math.random() < 0.5) {
        const best = bestPath(w, a, neighbours(w, a.lotId, Math.round(target.pos.x), Math.round(target.pos.y)));
        if (best) {
          a.current = { id: w.newId('t'), actionId: 'move', byPlayer: false, phase: 'walking', remaining: 0, dest: best.goal };
          a.path = best.path;
          return;
        }
      }
      if (Math.random() < 0.4 && wander()) return;
      return idle(4, 8);
    }
    case 'glovo':
      say(GLOVO_LINES, 0.3);
      return idle(3, 5);
  }
  idle(5, 10);
}

/** Cada hora: quién está en la calle (las cotillas comen en casa; el metro cierra de madrugada). */
export function streetHours(w: World) {
  const h = w.hour;
  for (const a of w.state.agents) {
    if (!a.role || a.travel) continue;
    let on = true;
    if (a.role === 'chismosa') on = (h >= 9 && h < 14) || (h >= 17 && h < 21);
    else if (a.role === 'vendedor' || a.role === 'rapero' || a.role === 'musico') on = h >= 7 && h < 24;
    else continue; // riders y militantes van por su cuenta
    if (on === a.hidden) {
      a.hidden = !on;
      a.current = null;
      a.path = [];
      if (on) a.pos = freeSpotNear(w, a.lotId, w.layoutOf(a.lotId).entrance);
    }
  }
}

/** Raps del metro: dedica un tema a alguien de la familia (línea a línea, en bocadillos). */
export function rapTick(w: World) {
  const rapper = w.state.agents.find((x) => x.role === 'rapero' && !x.hidden && x.lotId === METRO_LOT);
  if (!rapper) return;
  if (!w.rap && w.rapQueue.length) {
    const target = w.agent(w.rapQueue.shift());
    const last = target ? w.lastRap.get(target.id) ?? -1e9 : 0;
    if (target && target.lotId === METRO_LOT && !target.travel && w.state.minutes - last > 120) startRap(w, rapper, target);
  }
  const r = w.rap;
  if (!r || w.state.minutes < r.next) return;
  const line = r.lines.shift();
  if (line) {
    w.say(r.by, line);
    r.next = w.state.minutes + 1.6;
    if (!rapper.current || rapper.current.actionId !== 'rap') rapper.current = { id: w.newId('t'), actionId: 'rap', byPlayer: false, phase: 'acting', remaining: 30 };
  } else {
    w.rap = null;
    if (rapper.current?.actionId === 'rap') rapper.current = null;
  }
}

/** Un rap con lo que se sabe de `t`: trabajo, mascota, pareja, rasgos... */
export function startRap(w: World, rapper: Agent, t: Agent) {
  const fill = (pair: [string, string], x = '', y = '') => pair.map((l) => l.replace('{name}', t.name).replace('{x}', x).replace('{y}', y));
  const pickPair = (list: [string, string][]) => list[Math.floor(Math.random() * list.length)];
  const lines: string[] = [...fill(pickPair(RAP_INTRO))];
  const verses: string[][] = [];
  if (t.job && !CAREERS[t.job.career]?.school) verses.push(fill(RAP_VERSES.job[0], CAREERS[t.job.career].levels[t.job.level - 1].title.toLowerCase()));
  else if (isAdult(t)) verses.push(fill(RAP_VERSES.paro[0]));
  const pet = w.state.agents.find((x) => x.kind === 'pet' && x.householdId === t.householdId);
  if (pet) verses.push(fill(RAP_VERSES.pet[0], SPECIES[pet.species].label.toLowerCase(), pet.name));
  const pid = partnerOf(w.state, t.id);
  if (pid) verses.push(fill(RAP_VERSES.partner[0], w.agent(pid)?.name ?? ''));
  for (const tr of traitsOf(t)) if (RAP_VERSES[tr.id]) verses.push(fill(RAP_VERSES[tr.id][0]));
  if (hasEmotion(t, 'enamorado')) verses.push(fill(RAP_VERSES.enamorado[0]));
  verses.sort(() => Math.random() - 0.5);
  for (const v of verses.slice(0, 2)) lines.push(...v);
  lines.push(...fill(pickPair(RAP_OUTRO)));
  w.rap = { by: rapper.id, lines, next: w.state.minutes, about: t.id };
  w.lastRap.set(t.id, w.state.minutes);
  w.feel(t, 'rapeado');
  if (w.isPlayerMember(t)) w.toast(`🎤 ${rapper.name} le está dedicando un rap a ${t.name}: «${lines[0]}»`, '🎤');
}

/** Pedir comida: un rider sale hacia casa. */
export function orderGlovo(w: World, a: Agent) {
  const rider = w.state.agents.find((x) => x.role === 'glovo' && x.hidden && !x.travel);
  const home = w.householdOf(a)?.lotId;
  if (!rider || !home) {
    w.toast('No hay riders libres ahora mismo. Inténtalo en un rato', '🛵');
    return;
  }
  rider.deliverTo = a.id;
  rider.hidden = false;
  rider.lotId = METRO_LOT;
  rider.travel = { from: METRO_LOT, to: home, arrive: w.state.minutes + 25 };
  w.toast(`${a.name} ha pedido comida por Glovo. Llega en unos 25 minutos`, '🛵');
}

export function deliverFood(w: World, rider: Agent) {
  const who = w.agent(rider.deliverTo);
  rider.deliverTo = undefined;
  rider.visitUntil = w.state.minutes + 10;
  w.say(rider.id, GLOVO_LINES[Math.floor(Math.random() * GLOVO_LINES.length)]);
  if (who && who.lotId === rider.lotId && !who.travel) {
    who.needs.hunger = clamp(who.needs.hunger + 65);
    w.feel(who, 'glovo');
    w.bump(who, 'eat');
    w.toast(`¡Ding, dong! ${rider.name} trae la comida de ${who.name}`, '🛵');
  } else {
    const h = who && w.householdOf(who);
    if (h) h.pantry = Math.min(PANTRY_MAX, (h.pantry ?? 0) + 2);
    w.toast('El rider de Glovo ha dejado la comida en la nevera', '🛵');
  }
}

/** Campaña electoral: las militantes salen a la calle y llaman a las puertas. */
export function campaignHour(w: World) {
  const on = hasEvent(w, 'campana');
  const h = w.hour;
  for (const m of w.state.agents.filter((x) => x.role === 'militante')) {
    if (m.travel) continue;
    const out = on && ((h >= 11 && h < 14) || (h >= 17 && h < 20));
    if (!out) {
      if (!m.hidden) goHome(w, m);
      continue;
    }
    if (m.hidden) {
      m.hidden = false;
      m.lotId = m.post ?? PARK_LOT;
      m.pos = freeSpotNear(w, m.lotId, w.layoutOf(m.lotId).entrance);
    }
    // Una vez al día, llaman a la puerta de la familia.
    const someoneHome = w.members.some((x) => x.kind === 'person' && x.lotId === w.household.lotId && !x.travel);
    if (someoneHome && w.campaignKnockDay !== w.day && Math.random() < 0.35 && districtOf(w, m.post ?? '') === districtOf(w, w.household.lotId)) {
      w.campaignKnockDay = w.day;
      startTravel(w, m, w.household.lotId);
      m.visitUntil = w.state.minutes + TRAVEL_MINUTES + 45;
    }
  }
}

/** Lo que pasa al interactuar con la gente de la calle. */
export function streetOutcome(w: World, a: Agent, t: Agent, id: string) {
  const loud = w.isPlayerMember(a);
  switch (id) {
    case 'buy_candy':
      w.say(t.id, '¡Gracias, guapo/a! ¡Que aproveche!');
      break;
    case 'tip_artist':
    case 'ask_rap':
      if (t.role === 'rapero') startRap(w, t, a);
      else w.say(t.id, '♪ ¡Gracias! Esta va por ti ♪');
      break;
    case 'ask_gossip':
      if (loud) askChismosa(w, a, t);
      else {
        const sec = bestSecretFor(w.state, [t.id], [a.id]);
        if (sec) sec.known.push(a.id);
      }
      break;
    case 'tell_chismosa': {
      const fam = w.members.map((m) => m.id);
      const sec = bestSecretFor(w.state, fam, [t.id]);
      if (!sec) {
        if (loud) w.toast(`${a.name} no sabe nada que ${t.name} no sepa ya`, '🤷');
        break;
      }
      sec.known.push(t.id);
      w.say(t.id, '¡No me digas! ¡Esto lo sabe mañana todo el barrio!');
      if (loud) w.toast(`${t.name} ya lo sabe. Mañana lo sabrá todo el barrio...`, '🤫');
      if (Math.random() < 0.6) makePublic(w, sec);
      break;
    }
    case 'listen_campaign':
      w.say(t.id, CAMPAIGN_LINES[Math.floor(Math.random() * CAMPAIGN_LINES.length)]);
      if (hasTrait(a, 'cunado')) w.say(a.id, 'Mira, yo es que de política entiendo mucho...');
      break;
    case 'promise_vote':
      w.say(t.id, '¡Gracias! ¡Este domingo, a votar! Le dejo una rosa');
      changeRel(w.state, a.id, t.id, 8);
      break;
    case 'decline_vote':
      w.say(t.id, 'Nada, nada. ¡Que tenga un buen día!');
      t.visitUntil = w.state.minutes;
      break;
  }
}

/** Lo que pasa al terminar acciones de bar, metro, plaza, pedos... */
export function streetTask(w: World, a: Agent, id: string) {
  if (ALCOHOL[id]) drink(w, a, ALCOHOL[id]);
  if (GASSY.has(id)) a.gas = Math.min(3, (a.gas ?? 0) + (Math.random() < 0.5 ? 1 : 0));
  const mine = w.isPlayerMember(a);
  switch (id) {
    case 'fart':
      fartReactions(w, a);
      break;
    case 'tragaperras': {
      const h = w.householdOf(a);
      const r = Math.random();
      if (h && r < 0.01) {
        h.funds += 100;
        w.feel(a, 'premio');
        if (mine) w.toast(`¡Premio gordo en la tragaperras! ${a.name} se lleva §100`, '🎰');
      } else if (h && r < 0.07) {
        h.funds += 15;
        w.feel(a, 'premio');
        if (mine) w.toast(`¡Ding, ding, ding! ${a.name} saca §15 de la tragaperras`, '🎰');
      }
      break;
    }
    case 'watch_football':
      w.feel(a, Math.random() < 0.55 ? 'gol' : 'derrota');
      break;
    case 'throw_coin':
      w.feel(a, 'deseo_fuente');
      break;
    case 'read_map':
      if (mine) w.toast('Línea 10 hasta Puerta del Sur, transbordo y MetroSur hasta Alcorcón Central. Fácil, ¿no?', '🗺️');
      break;
    case 'whatsapp': {
      if (!mine) break;
      const fam = w.members.map((m) => m.id);
      const cand = (w.state.secrets ?? []).filter((sx) => !sx.known.some((x) => fam.includes(x)) && sx.known.length >= 2);
      const sec = Math.random() < 0.45 + (hasTrait(a, 'cotilla') ? 0.25 : 0) ? cand[Math.floor(Math.random() * cand.length)] : undefined;
      if (sec) learnSecret(w, a, sec, 'En el grupo de WhatsApp del barrio alguien ha soltado');
      else w.toast('En el grupo del barrio solo hay audios de 5 minutos y cadenas de «buenos días»', '📱');
      break;
    }
    case 'order_glovo':
      orderGlovo(w, a);
      break;
    case 'sing':
      if (hasEmotion(a, 'borracho') || hasEmotion(a, 'achispado')) w.say(a.id, '♪ ¡Mi gran noche! ♪');
      break;
  }
}
