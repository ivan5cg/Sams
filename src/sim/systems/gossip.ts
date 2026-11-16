// Salseo del barrio e infidelidades.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { bestSecretFor, inventGossip, spreadGossip } from '../gossip';
import { changeRel, getRel, relKey } from '../social';
import type { Agent } from '../types';
import type { World } from '../world';
import { remember } from './social';

/** La familia del jugador se entera de un secreto. */
export function learnSecret(w: World, a: Agent, sec: { id: string; text: string; known: string[]; kind: string; about: string[] }, how: string) {
  if (!sec.known.includes(a.id)) sec.known.push(a.id);
  w.feel(a, 'salseo');
  w.toast(`🌶️ ${how}: ${sec.text}`, '🌶️');
  // Si el salseo es que te ponen los cuernos...
  if (sec.kind === 'lio' && sec.about[2] === a.id) {
    const [x, y] = sec.about.map((id) => w.agent(id));
    if (x && y) catchAffair(w, x, y, a, 'cotilleo');
  }
}

export function askChismosa(w: World, a: Agent, c: Agent) {
  const fam = w.members.map((m) => m.id);
  // Primero, lo que va de ti (si te ponen los cuernos, ellas lo saben).
  const aboutYou = (w.state.secrets ?? []).find((sx) => sx.kind === 'lio' && sx.about[2] === a.id && sx.known.includes(c.id) && !sx.known.includes(a.id));
  const sec = aboutYou ?? bestSecretFor(w.state, [c.id], fam);
  if (!sec) {
    w.say(c.id, 'Pues hija, hoy no hay nada. ¡Qué barrio más aburrido!');
    if (w.isPlayerMember(a)) w.toast(`${c.name} no sabe nada nuevo. Vuelve otro día`, '🗣️');
    return;
  }
  w.say(c.id, aboutYou ? 'Ay, hijo/a... ¿tú no sabes lo de tu pareja?' : 'Acércate, que te cuento...');
  learnSecret(w, a, sec, `${c.name} te cuenta`);
}

/** Cotillear con alguien: si sabe algo que tú no, te lo cuenta; si no, se lo cuentas tú. */
export function gossipOutcome(w: World, a: Agent, t: Agent) {
  const fam = w.isPlayerMember(a) ? w.members.map((m) => m.id) : [a.id];
  // Si sabes que a `t` le ponen los cuernos... se lo cuentas.
  const cuernos = (w.state.secrets ?? []).find((sx) => sx.kind === 'lio' && sx.about[2] === t.id && sx.known.some((id) => fam.includes(id)) && !sx.known.includes(t.id));
  if (cuernos) {
    cuernos.known.push(t.id);
    const [x, y] = cuernos.about.map((id) => w.agent(id));
    if (x && y) catchAffair(w, x, y, t, 'chivatazo', a);
    changeRel(w.state, a.id, t.id, 5);
    return;
  }
  const theirs = getRel(w.state, a.id, t.id).f >= 10 ? bestSecretFor(w.state, [t.id], fam) : undefined;
  if (theirs && w.isPlayerMember(a)) {
    learnSecret(w, a, theirs, `${t.name} te cuenta`);
    changeRel(w.state, a.id, t.id, 3);
    return;
  }
  const mine = bestSecretFor(w.state, fam, [t.id]);
  if (mine) {
    mine.known.push(t.id);
    w.say(a.id, '¿Te has enterado...?');
    w.say(t.id, '¡No me digas! ¡Qué fuerte!');
    changeRel(w.state, a.id, t.id, 3);
    if (w.isPlayerMember(a)) w.toast(`${a.name} le cuenta el salseo a ${t.name}`, '🌶️');
  } else if (w.isPlayerMember(a)) {
    w.toast(`${t.name} no sabe nada jugoso. Prueba con las vecinas del banco`, '🌶️');
  }
}

/** Un secreto se sabe en todo el barrio: noticia y consecuencias. */
export function makePublic(w: World, sec: { text: string; public?: boolean; kind: string; about: string[]; known: string[] }) {
  if (sec.public) return;
  sec.public = true;
  w.addNews(`dicen que ${sec.text}`, sec.about);
  if (w.members.some((m) => sec.about.includes(m.id))) w.toast(`Todo el barrio lo sabe ya: ${sec.text}`, '📢');
  if (sec.kind === 'lio') {
    const [x, y, p] = sec.about.map((id) => w.agent(id));
    if (x && y && p && !sec.known.includes(p.id)) {
      sec.known.push(p.id);
      catchAffair(w, x, y, p, 'cotilleo');
    }
  }
}

/** Cada día: salseo nuevo entre vecinos y lo que corre de boca en boca. */
export function dailyGossip(w: World) {
  for (let i = 0; i < (Math.random() < 0.5 ? 2 : 1); i++) inventGossip(w.state, w.household.id, w.day);
  for (const sec of spreadGossip(w.state, w.household.id, w.day)) {
    sec.public = false;
    makePublic(w, sec);
  }
}

/** `betrayed` descubre que `cheater` tiene un lío con `lover`. */
export function catchAffair(w: World, cheater: Agent, lover: Agent, betrayed: Agent, how: 'pillado' | 'cotilleo' | 'chivatazo', teller?: Agent) {
  const rel = getRel(w.state, cheater.id, betrayed.id);
  if (!rel.status && !rel.ex) return;
  changeRel(w.state, cheater.id, betrayed.id, -40, -50);
  changeRel(w.state, lover.id, betrayed.id, -40, 0);
  remember(w, betrayed, cheater, 'infidelidad');
  w.feel(betrayed, 'traicionado', cheater.name);
  w.feel(cheater, 'verguenza');
  const text =
    how === 'pillado'
      ? `¡${betrayed.name} ha pillado a ${cheater.name} con ${lover.name}!`
      : how === 'chivatazo'
        ? `${teller?.name ?? 'Alguien'} le ha contado a ${betrayed.name} que ${cheater.name} tiene un lío con ${lover.name}`
        : `${betrayed.name} se ha enterado por las vecinas de que ${cheater.name} tiene un lío con ${lover.name}`;
  const loud = [cheater, lover, betrayed, teller].some((x) => x && w.isPlayerMember(x));
  if (loud) w.toast(text, '🦌');
  w.addNews(how === 'pillado' ? `${betrayed.name} pilló a ${cheater.name} con ${lover.name}. Hubo gritos` : `a ${betrayed.name} le ponen los cuernos con ${lover.name}`, [cheater.id, lover.id, betrayed.id]);
  for (const sx of w.state.secrets ?? []) if (sx.kind === 'lio' && sx.about[0] === cheater.id && sx.about[1] === lover.id) sx.public = true;
  // Si quien lo descubre no es de la familia del jugador, decide por su cuenta: muchas veces, se acabó.
  if (!w.isPlayerMember(betrayed) && Math.random() < 0.7) {
    const key = relKey(cheater.id, betrayed.id);
    const r = w.state.rels[key];
    if (r?.status) {
      const married = r.status === 'married';
      r.status = undefined;
      if (cheater.householdId === betrayed.householdId) r.ex = true;
      remember(w, cheater, betrayed, married ? 'divorcio' : 'ruptura');
      w.feel(cheater, 'corazon_roto', betrayed.name);
      if (loud) w.toast(`${betrayed.name} ${married ? 'pide el divorcio a' : 'deja a'} ${cheater.name}`, '💔');
    }
  }
}
