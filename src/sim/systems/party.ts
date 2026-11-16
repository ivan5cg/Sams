// Fiestas en casa.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { hasEmotion } from '../emotions';
import { changeRel, getRel, isAdult } from '../social';
import { hasTrait } from '../traits';
import type { Agent } from '../types';
import type { World } from '../world';
import { remember } from './social';
import { availableVisitors, endOfVisits, startTravel } from './travel';

/** La familia monta una fiesta en casa: vienen vecinos de varias familias. */
export function startParty(w: World, host: Agent) {
  const lotId = w.household.lotId;
  const until = Math.min(w.state.minutes + 240, endOfVisits(w) + 60);
  const birthday = w.members.find((m) => hasEmotion(m, 'cumple'))?.name;
  w.state.party = { lotId, host: host.id, until, ...(birthday ? { birthday } : {}) };
  // Se invita a gente de varias familias (primero a los amigos).
  const guests: Agent[] = [];
  const others = w.state.households.filter((h) => h.id !== w.household.id).sort(() => Math.random() - 0.5);
  for (const h of others) {
    const ppl = availableVisitors(w, h).filter((x) => x.kind === 'person' && w.stageOf(x) !== 'child');
    ppl.sort((x, y) => getRel(w.state, host.id, y.id).f - getRel(w.state, host.id, x.id).f);
    for (const p of ppl.slice(0, 2)) guests.push(p);
    if (guests.length >= 6) break;
  }
  for (const g of guests) {
    startTravel(w, g, lotId);
    g.visitUntil = until;
  }
  for (const m of w.members) if (m.kind === 'person' && m.lotId === lotId) w.feel(m, 'fiesta', undefined, 4);
  w.noVisitsUntil = until;
  w.toast(birthday ? `¡Fiesta de cumpleaños de ${birthday}! Vienen ${guests.length} invitados` : `¡Fiesta en casa! Vienen ${guests.length} invitados`, '🥳');
}

export function partyHour(w: World) {
  const p = w.state.party;
  if (!p) return;
  const here = w.agentsIn(p.lotId).filter((x) => x.kind === 'person' && !x.travel);
  for (const x of here) w.feel(x, 'fiesta', undefined, 4);
  if (w.state.minutes < p.until) return;
  // Fin de fiesta: buen recuerdo, nuevos amigos y alguna resaca.
  const host = w.agent(p.host);
  for (const x of here) {
    w.feel(x, 'fiesta');
    if (host && x !== host) {
      changeRel(w.state, host.id, x.id, 8);
      remember(w, x, host, 'fiesta');
    }
    if (isAdult(x) && !hasTrait(x, 'fiestero') && Math.random() < 0.3) w.feel(x, 'resaca', undefined, 10);
  }
  for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) changeRel(w.state, here[i].id, here[j].id, 3);
  if (host) w.bump(host, 'parties');
  const guests = here.filter((x) => x.householdId !== w.household.id).length;
  const good = guests >= 3;
  w.toast(good ? '¡La fiesta ha sido todo un éxito!' : 'La fiesta ha estado... tranquila', good ? '🎉' : '😅');
  w.addNews(p.birthday ? `la fiesta de cumpleaños de ${p.birthday} fue la comidilla del barrio` : `la fiesta de la ${w.household.name} ${good ? 'fue un fiestón' : 'fue un poco sosa'}`, host ? [host.id] : []);
  w.state.party = undefined;
}
