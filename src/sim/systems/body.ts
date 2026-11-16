// El cuerpo: pedos, alcohol, borracheras y resacas.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { ACTIONS } from '../../data/actions';
import { DRUNK_LINES, FART_LAUGHS, FART_LINES, FART_REACTIONS } from '../../data/street';
import { forget, hasEmotion } from '../emotions';
import { addSecret } from '../gossip';
import { changeRel } from '../social';
import { hasTrait } from '../traits';
import type { Agent } from '../types';
import { clamp } from '../util';
import type { World } from '../world';
import { checkSelfAction } from './checks';
import { endTask } from './tasks';

/** Reacciones de quien está cerca cuando alguien se tira un pedo. */
export function fartReactions(w: World, a: Agent) {
  const near = w.agentsIn(a.lotId).filter((x) => x !== a && x.kind === 'person' && !x.hidden && !x.travel && Math.hypot(x.pos.x - a.pos.x, x.pos.y - a.pos.y) <= 4);
  if (a.kind === 'person') w.say(a.id, FART_LINES[Math.floor(Math.random() * FART_LINES.length)]);
  for (const x of near) {
    if (hasTrait(x, 'bromista') || w.stageOf(x) === 'child' || hasEmotion(x, 'borracho')) {
      x.needs.fun = clamp(x.needs.fun + 6);
      w.feel(x, 'risas');
      if (Math.random() < 0.6) w.say(x.id, FART_LAUGHS[Math.floor(Math.random() * FART_LAUGHS.length)]);
    } else {
      x.needs.fun = clamp(x.needs.fun - (hasTrait(x, 'tiquismiquis') ? 10 : 4));
      if (Math.random() < 0.6) w.say(x.id, a.kind === 'pet' ? `¡${a.name}! ¡Qué peste!` : FART_REACTIONS[Math.floor(Math.random() * FART_REACTIONS.length)]);
      if (a.kind === 'person') changeRel(w.state, a.id, x.id, -1);
    }
  }
  if (a.kind !== 'person') return;
  const strangers = near.filter((x) => x.householdId !== a.householdId);
  if (strangers.length && !hasTrait(a, 'bromista') && !hasTrait(a, 'cunado')) w.feel(a, 'verguenza');
  if (strangers.length && w.lotById(a.lotId).kind !== 'home') {
    addSecret(w.state, { kind: 'pedo', text: `a ${a.name} se le escapó un pedo en ${w.lotById(a.lotId).name}`, about: [a.id], known: strangers.map((x) => x.id), juicy: 1, day: w.day });
  }
}

/** Beber: achispado, borracho... y, si se pasa, al suelo. */
export function drink(w: World, a: Agent, n: number) {
  a.alcohol = Math.min(100, (a.alcohol ?? 0) + n);
  a.alcoholMax = Math.max(a.alcoholMax ?? 0, a.alcohol);
  updateDrunk(w, a);
  if (a.alcohol >= 60 && Math.random() < 0.5) w.say(a.id, DRUNK_LINES[Math.floor(Math.random() * DRUNK_LINES.length)]);
  if (a.alcohol >= 90) {
    endTask(w, a);
    a.queue = [];
    a.current = { id: w.newId('t'), actionId: 'pass_out', byPlayer: false, phase: 'acting', remaining: ACTIONS.pass_out.duration };
    w.toastFor(a, `${a.name} ha bebido demasiado y se ha quedado frito/a`, '🥴');
  }
  // Borracho delante de los vecinos: salseo asegurado.
  const strangers = w.agentsIn(a.lotId).filter((x) => x.kind === 'person' && x.householdId !== a.householdId && !x.hidden);
  if (a.alcohol >= 60 && strangers.length && w.lotById(a.lotId).kind !== 'home') {
    addSecret(w.state, { kind: 'borrachera', text: `${a.name} se cogió un pedo en ${w.lotById(a.lotId).name} y acabó cantando «Mi gran noche» encima de una silla`, about: [a.id], known: strangers.map((x) => x.id), juicy: 2, day: w.day });
  }
}

export function updateDrunk(w: World, a: Agent) {
  const v = a.alcohol ?? 0;
  if (v >= 60) {
    forget(a, 'achispado');
    w.feel(a, 'borracho');
  } else if (v >= 30) {
    forget(a, 'borracho');
    w.feel(a, 'achispado');
  } else {
    forget(a, 'borracho');
    forget(a, 'achispado');
  }
}

/** Cada hora: se pasa la borrachera (o se vomita), y los gases buscan salida. */
export function bodyHour(w: World) {
  const h = w.hour;
  const detailed = w.detailedLots();
  for (const a of w.state.agents) {
    if (a.alcohol) {
      a.alcohol = Math.max(0, a.alcohol - 12);
      updateDrunk(w, a);
      if (a.alcohol >= 70 && !a.travel && detailed.has(a.lotId) && Math.random() < 0.2 && a.current?.actionId !== 'pass_out') {
        endTask(w, a);
        a.current = { id: w.newId('t'), actionId: 'vomit', byPlayer: false, phase: 'acting', remaining: 3 };
        w.spawnPuddle(a.lotId, Math.round(a.pos.x), Math.round(a.pos.y));
        w.toastFor(a, `${a.name} ha vomitado. Qué espectáculo`, '🤮');
      }
    }
    if (h === 9 && (a.alcoholMax ?? 0) >= 50) {
      w.feel(a, 'resaca');
      a.alcoholMax = 0;
    } else if (h === 9) a.alcoholMax = 0;
    // Gases: tarde o temprano, salen.
    if ((a.gas ?? 0) > 0 && !a.travel && !a.hidden && detailed.has(a.lotId) && Math.random() < 0.18 * (a.gas ?? 0) * (hasTrait(a, 'gloton') ? 1.5 : 1)) {
      a.gas = Math.max(0, (a.gas ?? 0) - 1);
      const busy = a.current && ACTIONS[a.current.actionId].forced;
      if (!busy && checkSelfAction(w, a, 'fart').ok && w.stageOf(a) !== 'baby') {
        a.queue.unshift({ id: w.newId('t'), actionId: 'fart', byPlayer: false, phase: 'walking', remaining: 0 });
        if (a.current && !a.current.byPlayer && ACTIONS[a.current.actionId].interruptible) endTask(w, a);
      }
    }
  }
}
