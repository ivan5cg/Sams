// Interacción entre personajes: acercarse, aceptar o rechazar, celos y consecuencias.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { ACTIONS } from '../../data/actions';
import { SPECIES } from '../../data/species';
import { MINUTES_PER_DAY } from '../constants';
import { forget, hasEmotion } from '../emotions';
import { addSecret } from '../gossip';
import { REJECT_TEXT, REL_EFFECTS, ROMANTIC, acceptChance, changeRel, getRel, grudgeOf, partnerOf, relKey } from '../social';
import { hasTrait } from '../traits';
import type { Agent, PlacedObject, Task } from '../types';
import { clamp, moodScore } from '../util';
import type { World } from '../world';
import { money } from './money';
import { SPEND_CATEGORY } from '../../data/economy';
import { hasEvent } from './calendar';
import { catchAffair, gossipOutcome } from './gossip';
import { freeBed, moveIn } from './lifecycle';
import { bestPath, face, moveAlong, neighbours } from './movement';
import { skillLevel } from './skills';
import { streetOutcome } from './street';
import { completeTask, endTask } from './tasks';
import { mediate, snitch } from './arcs';
import { PREGNANCY_DAYS, maybeConceive } from './fertility';
import { jokeRisk } from './illness';
import { attend } from '../relations';
import { fight, poison } from './violence';
import { onBreakUp } from './breakups';
import { costOf } from './calendar';

export function canEngage(_w: World, actor: Agent, actorTask: Task, t: Agent): boolean {
  if (t.hidden || t.travel || t.lotId !== actor.lotId) return false;
  const tc = t.current;
  if (!tc) return true;
  if (tc.byPlayer || tc.passiveOf || tc.param === 'leave') return false;
  const d = ACTIONS[tc.actionId];
  if (d.forced) return false;
  if (d.interruptible) return true;
  // Una orden del jugador puede interrumpir cualquier cosa que el otro haga por su cuenta.
  return actorTask.byPlayer;
}

export function walkToAgent(w: World, a: Agent, task: Task, dt: number) {
  const t = w.agent(task.targetAgentId);
  if (!t || t.travel || t.lotId !== a.lotId) return endTask(w, a);
  const def = ACTIONS[task.actionId];
  const dist = Math.hypot(t.pos.x - a.pos.x, t.pos.y - a.pos.y);

  if (dist <= 1.6 && !t.hidden) {
    a.path = [];
    // Para despedir a alguien basta con acercarse: no hace falta que deje lo que hace.
    if (task.actionId === 'say_goodbye') {
      face(w, a, t.pos);
      return completeTask(w, a, task);
    }
    if (canEngage(w, a, task, t)) {
      // Los gatos no siempre están de humor (salvo si los controla el jugador).
      const aloof = SPECIES[t.species].aloof ?? 0;
      if (aloof && a.kind === 'person' && !w.isActive(t) && Math.random() < aloof) {
        if (task.byPlayer) w.toast(`${t.name} no está de humor 😾`, '🐈');
        return endTask(w, a);
      }
      if (!accepts(w, a, t, task.actionId)) return endTask(w, a);
      if (def.cost) {
        const hh = w.householdOf(a);
        money(w, hh, -costOf(w, task.actionId, a), SPEND_CATEGORY[task.actionId] ?? 'calle');
      }
      if (task.actionId === 'flirt' || task.actionId === 'kiss' || task.actionId === 'niqui' || task.actionId === 'ask_affair') jealousy(w, a, t, task.actionId);
      let bedId: string | undefined;
      if (task.actionId === 'niqui') {
        bedId = freeBed(w, a.lotId)?.id;
        if (!bedId) {
          if (task.byPlayer) w.toast('Hace falta una cama libre', '🛏️');
          return endTask(w, a);
        }
        task.targetObjectId = bedId;
      }
      endTask(w, t);
      t.current = { id: w.newId('t'), actionId: task.actionId, byPlayer: false, phase: 'acting', remaining: def.duration + 5, passiveOf: a.id, targetObjectId: bedId };
      t.path = [];
      task.phase = 'acting';
      task.remaining = def.duration;
      w.emit({ type: 'act', agentId: a.id, actionId: task.actionId });
      face(w, a, t.pos);
      if (!t.home) face(w, t, a.pos);
      if (def.offLot) {
        const e = w.layoutOf(a.lotId).entrance;
        a.hidden = t.hidden = true;
        a.pos = { ...e };
        t.pos = { ...e };
      }
      return;
    }
    // Ocupado: esperar un rato.
    if (task.phase !== 'waiting') {
      task.phase = 'waiting';
      task.remaining = 20;
    }
    task.remaining -= dt;
    if (task.remaining <= 0) {
      if (task.byPlayer) w.toast(`${t.name} está ocupado/a`, '⏳');
      endTask(w, a);
    }
    return;
  }

  task.phase = 'walking';
  if (t.hidden) {
    task.remaining -= dt;
    if (task.remaining < -30) endTask(w, a);
    return;
  }
  const tx = Math.round(t.pos.x), ty = Math.round(t.pos.y);
  const needReplan = !task.goal || Math.hypot(task.goal.x - tx, task.goal.y - ty) > 1.5 || a.path.length === 0;
  if (needReplan) {
    const best = bestPath(w, a, neighbours(w, a.lotId, tx, ty));
    if (!best) {
      if (task.byPlayer) w.toast(`${a.name} no puede llegar hasta ${t.name}`, '🚫');
      return endTask(w, a);
    }
    a.path = best.path;
    task.goal = best.goal;
  }
  moveAlong(w, a, dt);
}

/** ¿Acepta `t` la interacción? Si no, rechazo: baja la relación y avisa. */
export function accepts(w: World, a: Agent, t: Agent, actionId: string): boolean {
  let p = acceptChance(w.state, a, t, actionId);
  const friendly = ['chat', 'joke', 'hug', 'flirt', 'kiss', 'talk', 'niqui', 'ask_partner', 'propose'].includes(actionId);
  if (t.kind === 'person' && friendly) {
    // De buen humor se acepta más; con rencor o enfadado, bastante menos.
    if (p < 1) p *= 0.8 + Math.max(0, Math.min(100, moodScore(t))) / 250;
    if (grudge(w, t, a)) p *= 0.55;
    if (hasEmotion(t, 'enfadado')) p *= 0.7;
  }
  if (Math.random() < p) return true;
  changeRel(w.state, a.id, t.id, -3, ROMANTIC.has(actionId) ? -5 : 0);
  a.needs.social = clamp(a.needs.social - 10);
  a.needs.fun = clamp(a.needs.fun - 5);
  const text = REJECT_TEXT[actionId] ?? 'ha rechazado a';
  if (actionId === 'ask_partner' || actionId === 'propose') w.feel(a, 'calabazas', t.name);
  else if (ROMANTIC.has(actionId)) w.feel(a, 'cobra', t.name);
  remember(w, a, t, actionId === 'kiss' ? 'cobra' : 'rechazo');
  if (w.isPlayerMember(a) || w.isPlayerMember(t)) w.toast(`${t.name} ${text} ${a.name}`, '😳');
  return false;
}

/** Guarda un recuerdo en la relación de los dos: `doer` hizo `k` (a `victim`). */
export function remember(w: World, victim: Agent, doer: Agent, k: string) {
  const key = relKey(victim.id, doer.id);
  const rel = w.state.rels[key] ?? (w.state.rels[key] = { f: 0, r: 0 });
  rel.mem = rel.mem ?? [];
  rel.mem.push({ k, d: w.day, by: doer.id });
  if (rel.mem.length > 5) rel.mem.shift();
}

/** Lo que `t` le hizo a `a` y aún no le ha perdonado. */
export function grudge(w: World, a: Agent, t: Agent): string | undefined {
  return grudgeOf(getRel(w.state, a.id, t.id), a.id, t.id, w.day);
}

/** Emociones al terminar algo: lo rico que estaba, lo bien que se ha dormido... */
export function taskFeelings(w: World, a: Agent, task: Task, o?: PlacedObject) {
  if (a.kind !== 'person') return;
  const id = task.actionId;
  if (id === 'acai_bowl' || id === 'smoothie') w.feel(a, 'acai');
  else if (id === 'cook' && skillLevel(w, a, 'cocina') >= 2) w.feel(a, 'casero');
  else if (id === 'selfie') w.feel(a, 'selfie');
  else if (id === 'run' || id === 'pilates' || id === 'reformer') w.feel(a, 'endorfinas');
  else if (['listen_music', 'read', 'swing', 'sit_bench'].includes(id) && Math.random() < 0.35) w.feel(a, 'inspirado');
  if (!o) return;
  const q = o.q ?? 2;
  if (id === 'sleep' || id === 'nap_bed') {
    if (q === 3) w.feel(a, 'descansado');
    else if (q === 1 && Math.random() < 0.6) w.feel(a, 'espalda');
  }
  if ((id === 'shower' || id === 'bath') && q === 3) w.feel(a, 'ducha_spa');
  if (id === 'nap_sofa' && q === 1 && Math.random() < 0.4) w.feel(a, 'espalda');
}

/** Emociones y recuerdos de las interacciones que salen bien. */
export function socialFeelings(w: World, a: Agent, t: Agent, id: string) {
  const rel = getRel(w.state, a.id, t.id);
  if (id === 'hug') {
    w.feel(a, 'abrazo');
    w.feel(t, 'abrazo');
  }
  if (id === 'joke') {
    w.feel(t, 'risas');
    jokeRisk(w, a, t);
  }
  if (id === 'give_gift') w.feel(t, 'regalo', a.name);
  if (id === 'kiss' || id === 'ask_partner') {
    w.feel(a, 'enamorado', t.name);
    w.feel(t, 'enamorado', a.name);
    if (id === 'kiss' && !(rel.mem ?? []).some((m) => m.k === 'primer_beso')) remember(w, t, a, 'primer_beso');
  }
  if (id === 'propose') {
    w.feel(a, 'boda', t.name);
    w.feel(t, 'boda', a.name);
    remember(w, t, a, 'boda');
    if (w.isPlayerMember(a) || w.isPlayerMember(t)) w.emit({ type: 'moment', text: `${a.name} y ${t.name}: ¡vivan los novios!`, lotId: a.lotId });
  }
  if (id === 'insult') {
    w.feel(t, 'insultado', a.name);
    remember(w, t, a, 'insulto');
  }
  if (['pet_animal', 'play_pet', 'cuddle_capy', 'beg_affection', 'play_with_person'].includes(id)) {
    const person = a.kind === 'person' ? a : t;
    const pet = a.kind === 'pet' ? a : t;
    if (person.kind === 'person' && pet.kind === 'pet' && Math.random() < 0.5) w.feel(person, 'mimos', pet.name);
  }
}

/** Efectos de las interacciones sociales en la relación (y parejas, bodas, mudanzas). */
export function socialOutcome(w: World, a: Agent, t: Agent, actionId: string) {
  const eff = REL_EFFECTS[actionId];
  if (eff) changeRel(w.state, a.id, t.id, eff[0], eff[1]);
  const key = relKey(a.id, t.id);
  const rel = w.state.rels[key];
  const loud = w.isPlayerMember(a) || w.isPlayerMember(t);
  // Un detalle (charlar, un abrazo, un regalo, un beso...) cuenta como atención: la relación no se desgasta.
  if (eff && (eff[0] > 0 || eff[1] > 0)) attend(w, a, t);
  if (actionId === 'best_friends' && rel) {
    rel.best = true;
    remember(w, t, a, 'mejores');
    if (loud) w.toast(`¡${a.name} y ${t.name} ahora son mejores amigos! Uña y carne`, '🫶');
  }
  if (actionId === 'ban' && rel) {
    rel.banned = a.id;
    rel.best = false;
    w.feel(t, 'insultado', a.name);
    // Si estaba en su casa, a la calle.
    if (t.lotId === w.householdOf(a)?.lotId) t.visitUntil = w.state.minutes;
    if (loud) w.toast(`${a.name} ha declarado a ${t.name} persona non grata: no vuelve a pisar su casa`, '🚫');
  }
  if (actionId === 'fight') fight(w, a, t);
  if (actionId === 'poison') poison(w, a, t);
  if (actionId === 'unban' && rel) {
    rel.banned = undefined;
    if (loud) w.toast(`${a.name} le levanta el veto a ${t.name}. Ya puede volver a casa`, '🕊️');
  }
  if (actionId === 'ask_partner' && rel) {
    // Si `t` tenía pareja, la deja.
    const ex = partnerOf(w.state, t.id);
    if (ex && ex !== a.id) {
      const exRel = w.state.rels[relKey(t.id, ex)];
      if (exRel) exRel.status = undefined;
      changeRel(w.state, t.id, ex, -30, -40);
      if (loud) w.toast(`${t.name} ha roto con ${w.agent(ex)?.name ?? 'su pareja'}`, '💔');
    }
    rel.status = 'partner';
    if (loud) w.toast(`¡${a.name} y ${t.name} ahora son pareja!`, '💘');
    w.addNews(`${a.name} y ${t.name} están saliendo`, [a.id, t.id]);
  }
  if (actionId === 'propose' && rel) {
    rel.status = 'married';
    if (loud) w.toast(`¡${a.name} y ${t.name} se casan!`, '💍');
    w.addNews(`${a.name} y ${t.name} se casan`, [a.id, t.id]);
  }
  if (actionId === 'move_in') moveIn(w, t);
  socialFeelings(w, a, t, actionId);
  if (ACTIONS[actionId].targetRoles) streetOutcome(w, a, t, actionId);
  if (actionId === 'gossip_with') gossipOutcome(w, a, t);
  if (actionId === 'mediate') mediate(w, a, t);
  if (actionId === 'snitch') snitch(w, a, t);
  if (actionId === 'chotis' && (hasEvent(w, 'sanisidro') || Math.random() < 0.3)) {
    w.feel(a, 'castizo');
    w.feel(t, 'castizo');
  }
  if (actionId === 'ask_affair' && rel) {
    rel.affair = true;
    w.feel(a, 'enamorado', t.name);
    w.feel(t, 'enamorado', a.name);
    if (!hasTrait(a, 'grunon') && Math.random() < 0.6) w.feel(a, 'remordimientos');
    const cheater = partnerOf(w.state, a.id) ? a : t;
    const lover = cheater === a ? t : a;
    const p = w.agent(partnerOf(w.state, cheater.id));
    if (p) addSecret(w.state, { kind: 'lio', text: `${cheater.name} tiene un lío con ${lover.name}, y ${p.name} no sabe nada`, about: [cheater.id, lover.id, p.id], known: [a.id, t.id], juicy: 3, day: w.day });
    if (loud) w.toast(`${a.name} y ${t.name} tienen un lío a escondidas. Que no se entere nadie...`, '🤫');
  }
  if (actionId === 'end_affair' && rel) {
    rel.affair = false;
    w.feel(t, 'calabazas', a.name);
    if (loud) w.toast(`${a.name} deja el lío con ${t.name}`, '🚪');
  }
  // Ñiqui ñiqui: puede haber embarazo (se sabe al día siguiente).
  if (actionId === 'niqui') maybeConceive(w, a, t);
  if (actionId === 'try_baby') {
    const h = w.householdOf(a);
    if (h && !h.expecting && Math.random() < 0.7) {
      const mother = [a, t].find((x) => x.sex === 'f');
      h.expecting = { parents: [a.id, t.id], due: w.state.minutes + PREGNANCY_DAYS * MINUTES_PER_DAY, ...(mother && [a, t].some((x) => x.sex === 'm') ? { mother: mother.id, known: true } : {}) };
      if (mother && h.expecting.mother) w.feel(mother, 'embarazada');
      if (loud) w.toast(`¡${a.name} y ${t.name} van a tener un bebé! Llegará en 3 días`, '🍼');
    } else if (loud) w.toast('Esta vez no ha habido suerte. ¡Otra vez será!', '🍀');
  }
  if (actionId === 'change_diaper') {
    const crib = w.object(t.home);
    if (crib) crib.dirt = 0;
  }
  if (actionId === 'insult' && loud) w.toastOnce(`${key}:insult`, `${a.name} y ${t.name} han discutido`, '🤬', 120);
  if (actionId === 'argue') {
    w.feel(a, 'enfadado', t.name);
    w.feel(t, 'enfadado', a.name);
    remember(w, t, a, 'pelea');
    if (loud) w.toastOnce(`${key}:argue`, `¡Bronca entre ${a.name} y ${t.name}!`, '💢', 120);
  }
  if (actionId === 'apologize') {
    forget(t, 'enfadado');
    forget(t, 'insultado');
    forget(a, 'enfadado');
    remember(w, t, a, 'perdon');
    w.feel(a, 'reconciliados', t.name);
    w.feel(t, 'reconciliados', a.name);
    if (loud) w.toast(`${t.name} acepta las disculpas de ${a.name}. ¡Hacen las paces!`, '🕊️');
  }
  if ((actionId === 'break_up' || actionId === 'divorce') && rel) {
    const divorce = actionId === 'divorce';
    rel.status = undefined;
    if (a.householdId === t.householdId) rel.ex = true;
    remember(w, t, a, divorce ? 'divorcio' : 'ruptura');
    onBreakUp(w, a, t, rel);
    w.feel(t, 'corazon_roto', a.name);
    w.feel(a, 'corazon_roto', t.name, 24);
    if (loud) {
      w.toast(divorce ? `${a.name} y ${t.name} se divorcian` : `${a.name} ha cortado con ${t.name}`, '💔');
      if (rel.ex) w.toast('...pero siguen viviendo juntos. Uno de los dos tendrá que buscarse un piso (ordenador → Irse de casa), o se irá solo en unos días', '🏠');
    }
    w.addNews(divorce ? `${a.name} y ${t.name} se han divorciado` : `${a.name} y ${t.name} lo han dejado`, [a.id, t.id]);
  }
  if (actionId === 'insult' && (rel?.f ?? 0) <= -50) w.addNews(`${a.name} y ${t.name} no se pueden ni ver`, [a.id, t.id]);
}

/** Coquetear delante de la pareja tiene consecuencias. */
export function jealousy(w: World, a: Agent, t: Agent, actionId = 'flirt') {
  for (const [who, other] of [[a, t], [t, a]] as const) {
    const pid = partnerOf(w.state, who.id);
    if (!pid || pid === other.id) continue;
    const p = w.agent(pid);
    if (!p || p.lotId !== who.lotId || p.travel || p.hidden) continue;
    // Un beso (o algo más) delante de tu pareja: pillado/a.
    if (actionId !== 'flirt' || getRel(w.state, who.id, other.id).affair) {
      catchAffair(w, who, other, p, 'pillado');
      continue;
    }
    changeRel(w.state, who.id, p.id, -12, -15);
    w.feel(p, 'celos', who.name);
    remember(w, p, who, 'celos');
    changeRel(w.state, other.id, p.id, -10, 0);
    if (w.isPlayerMember(who) || w.isPlayerMember(p)) w.toast(`¡${p.name} ha pillado a ${who.name} coqueteando con ${other.name}!`, '😠');
  }
}
