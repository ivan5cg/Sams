// Órdenes y tareas: empezar, avanzar, terminar y aplicar sus efectos.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { ACTIONS, type ActionDef } from '../../data/actions';
import { QUALITY } from '../../data/objects';
import { FRIDGE_FOOD, MINUTES_PER_DAY } from '../constants';
import { findPath } from '../pathfinding';
import { NEED_KEYS, type Agent, type Needs, type ScheduledOrder, type SpeciesId, type Task } from '../types';
import { clamp, objectCenter } from '../util';
import type { Target, World } from '../world';
import { costOf } from './calendar';
import { checkObjectAction, checkSocialAction, speciesOk } from './checks';
import { setJob } from './jobs';
import { bestPath, face, interactTiles, moveAlong } from './movement';
import { startParty } from './party';
import { adopt, callForAttention, hideObject, trainPet } from './pets';
import { pantryOwner, shopping } from './shopping';
import { practice, skillLevel, skillPayoff } from './skills';
import { socialOutcome, taskFeelings, walkToAgent } from './social';
import { streetTask } from './street';
import { goHome } from './travel';
import { wishEvent } from './wishes';
import { money } from './money';
import { CLOTHES } from '../neighborhood';
import { CAREER_SKILL, MAX_SKILL, SKILL_BY_ID } from '../../data/skills';
import { SPEND_CATEGORY } from '../../data/economy';
import { bookTrip } from './trips';
import { holidayTask } from './holidays';
import { placeTask } from './places';
import { riskyTask, seeDoctor } from './illness';
import { moveOut } from './breakups';
import { enroll, studyAtHome } from './education';

export function command(w: World, agentId: string, actionId: string, target: Target, param?: string): boolean {
  const a = w.agent(agentId);
  if (!a) return false;
  if (a.travel) {
    w.toast(`${a.name} va de camino`, '🚶');
    return false;
  }
  const def = ACTIONS[actionId];
  const task: Task = { id: w.newId('t'), actionId, byPlayer: true, phase: 'walking', remaining: 0 };
  if (param) task.param = param;
  if (def.target === 'object' && target.kind === 'object') task.targetObjectId = target.id;
  else if (def.target === 'agent' && target.kind === 'agent') task.targetAgentId = target.id;
  else if (target.kind === 'tile') task.dest = { x: target.x, y: target.y };

  if (a.home && def.target === 'tile') {
    w.toast(`${a.name} vive en su jaula`, '🏠');
    return false;
  }

  const cur = a.current;
  const curDef = cur && ACTIONS[cur.actionId];
  const busyWithPlayer = cur && (cur.byPlayer || curDef?.forced || (cur.passiveOf && w.agent(cur.passiveOf)?.current?.byPlayer));
  if (cur && !busyWithPlayer) {
    endTask(w, a);
  }
  if (a.queue.length >= 6) {
    w.toast(`La cola de ${a.name} está llena`, '⚠️');
    return false;
  }
  a.queue.push(task);
  return true;
}

export function cancel(w: World, agentId: string, taskId: string) {
  const a = w.agent(agentId);
  if (!a) return;
  if (a.current?.id === taskId) {
    if (ACTIONS[a.current.actionId].forced) return;
    endTask(w, a);
  } else {
    a.queue = a.queue.filter((t) => t.id !== taskId);
  }
}

export function beginTask(w: World, a: Agent, task: Task): boolean {
  const def = ACTIONS[task.actionId];
  a.current = task;
  a.path = [];
  task.phase = 'walking';
  const grid = w.gridOf(a.lotId);

  const fail = (reason: string) => {
    a.current = null;
    if (task.byPlayer) w.toast(`${a.name}: ${reason}`, '🚫');
    return false;
  };

  if (def.target === 'self') {
    if (!speciesOk(w, a, def)) return fail('no puede hacer eso');
    task.phase = 'acting';
    task.remaining = def.duration;
    w.emit({ type: 'act', agentId: a.id, actionId: task.actionId });
    return true;
  }
  if (def.target === 'tile') {
    if (a.home) return fail('vive en su jaula');
    const path = task.dest && findPath(grid, a.pos, task.dest);
    if (!path) return fail('no puede llegar ahí');
    a.path = path;
    return true;
  }
  if (def.target === 'object') {
    const o = w.object(task.targetObjectId);
    if (!o) return fail('ese objeto ya no está');
    const check = checkObjectAction(w, a, o, task.actionId);
    if (!check.ok) return fail(check.reason ?? 'no es posible');
    if (a.home === o.id) {
      // Ya está dentro.
      task.goal = { ...a.pos };
      return true;
    }
    const best = bestPath(w, a, interactTiles(w, o));
    if (!best) return fail('no puede llegar');
    a.path = best.path;
    task.goal = best.goal;
    return true;
  }
  // Social
  const t = w.agent(task.targetAgentId);
  if (!t) return fail('ya no está');
  const check = checkSocialAction(w, a, t, task.actionId);
  if (!check.ok) return fail(check.reason ?? 'no es posible');
  return true;
}

/** Termina la tarea actual sin aplicar efectos de finalización. */
export function endTask(w: World, a: Agent) {
  a.current = null;
  a.path = [];
  if (a.hidden) {
    a.hidden = false;
    const e = w.layoutOf(a.lotId).entrance;
    a.pos = { x: e.x + (a.kind === 'pet' ? 1 : 0), y: e.y };
  }
}

export function completeTask(w: World, a: Agent, task: Task) {
  const def = ACTIONS[task.actionId];
  const o = w.object(task.targetObjectId);
  if (o) {
    const od = w.objDef(o);
    if (def.refill) o.stock = od.maxStock;
    if (def.dirties) o.dirt = (o.dirt ?? 0) + 1;
    if (def.cleans) {
      o.dirt = 0;
      const resident = w.residentOf(o.id);
      if (resident) resident.needs.hygiene = Math.max(resident.needs.hygiene, 90);
    }
    if (def.removes) w.state.objects = w.state.objects.filter((x) => x.id !== o.id);
    riskyTask(w, a, task.actionId, o.def);
    if (task.actionId === 'repair') {
      o.broken = false;
      if (w.isPlayerMember(a)) w.toast(`${a.name} ha arreglado: ${od.name.toLowerCase()}`, '🔧');
    }
    if (task.actionId === 'steal') hideObject(w, a, o);
    if (def.doneToast) w.toastOnce(`${a.id}:${def.id}`, def.doneToast.replace('{name}', a.name).replace('{obj}', od.name.toLowerCase()), def.icon);
  }
  if (task.actionId === 'adopt' && task.param) adopt(w, task.param as SpeciesId);
  if (task.actionId === 'throw_party') startParty(w, a);
  streetTask(w, a, task.actionId);
  if (task.actionId === 'train_pet') {
    const pet = w.agent(task.targetAgentId);
    if (pet) trainPet(w, a, pet);
  }
  if (task.actionId === 'show_trick') {
    const pet = w.agent(task.targetAgentId);
    const tr = pet?.tricks?.[Math.floor(Math.random() * (pet.tricks?.length ?? 1))];
    if (pet && tr) {
      w.say(a.id, `¡${pet.name}, ${tr.toLowerCase()}!`);
      for (const x of w.agentsIn(a.lotId)) if (x.kind === 'person' && x !== a && !x.hidden && Math.hypot(x.pos.x - pet.pos.x, x.pos.y - pet.pos.y) < 5) x.needs.fun = clamp(x.needs.fun + 10);
    }
  }
  if (task.actionId === 'day_off' && a.job) {
    a.job.dayOff = w.day + 1;
    w.toast(`${a.name} tiene libre mañana. ¡A disfrutar!`, '🏖️');
  }
  if (task.actionId === 'book_trip') bookTrip(w, a);
  holidayTask(w, a, task.actionId);
  placeTask(w, a, task.actionId);
  if (task.actionId === 'work_home' && a.job) {
    // Informes desde casa: suben el rendimiento (más con la habilidad de su carrera).
    const sk = CAREER_SKILL[a.job.career];
    a.job.perf = Math.min(100, a.job.perf + 8 + (sk ? skillLevel(w, a, sk) : 0));
    a.job.homeDay = w.day;
    if (w.isPlayerMember(a)) w.toast(`${a.name} ha mandado los informes. El jefe responde con un 👍`, '🧑‍💻');
  }
  if (task.actionId === 'buy_clothes') {
    // Ropa nueva: cambia el color de lo que lleva.
    const options = CLOTHES.filter((c) => c !== a.color);
    a.color = options[Math.floor(Math.random() * options.length)];
    w.feel(a, 'estreno');
    if (w.isPlayerMember(a)) w.toast(`${a.name} estrena ropa. ¡Va hecho un pincel!`, '👕');
  }
  // Medicinas y médico.
  if (task.actionId === 'take_medicine' && a.illness && a.illness.medicated !== w.day) {
    a.illness.medicated = w.day;
    money(w, w.householdOf(a), -(ACTIONS.take_medicine.cost ?? 0), 'compra');
    a.illness.until = Math.max(w.state.minutes + 60, a.illness.until - MINUTES_PER_DAY / 2);
    a.emotions = (a.emotions ?? []).filter((e) => e.id !== 'enfermo');
    if (w.isPlayerMember(a)) w.toast(`${a.name} se ha tomado algo: se encuentra un poco mejor`, '💊', a.id);
  }
  if (task.actionId === 'call_doctor') seeDoctor(w, a);
  if (task.actionId === 'move_out') moveOut(w, a);
  if (task.actionId === 'change_clothes') {
    // Del armario: otra ropa de las de siempre (sin pasar por caja).
    const options = CLOTHES.filter((c) => c !== a.color);
    a.color = options[Math.floor(Math.random() * options.length)];
    if (w.isPlayerMember(a)) w.toast(`${a.name} se ha cambiado de ropa`, '👚');
  }
  if (task.actionId === 'take_course' && task.param && SKILL_BY_ID[task.param]) {
    // Un curso sube un nivel de golpe (sin pasar del máximo).
    const s = SKILL_BY_ID[task.param];
    a.skills = a.skills ?? {};
    const before = Math.floor(a.skills[s.id] ?? 0);
    a.skills[s.id] = Math.min(MAX_SKILL, before + 1);
    w.feel(a, 'nivel', s.label.toLowerCase());
    if (w.isPlayerMember(a)) w.toast(`${a.name} ha terminado el curso: ${s.label.toLowerCase()} nivel ${Math.floor(a.skills[s.id])}`, '🎓');
    if (Math.floor(a.skills[s.id]) > before) wishEvent(w, a, { skill: s.id, level: Math.floor(a.skills[s.id]) });
  }
  if (task.actionId === 'buy_lottery') {
    w.state.lottery = [...(w.state.lottery ?? []), a.id];
    w.toast(`${a.name} ha comprado un décimo. ¡Que toque!`, '🎫');
  }
  w.bump(a, task.actionId);
  taskFeelings(w, a, task, o);
  skillPayoff(w, a, task.actionId);
  shopping(w, a, task.actionId);
  if (task.actionId === 'find_job' && task.param) setJob(w, a, task.param);
  if (task.actionId === 'enroll' && task.param) {
    const why = enroll(w, a, task.param);
    if (why && w.isPlayerMember(a)) w.toast(`${a.name}: ${why}`, '🎓');
  }
  if (task.actionId === 'study_exams') studyAtHome(w, a);
  if (ACTIONS[task.actionId].target === 'agent' && task.actionId !== 'say_goodbye') {
    const t = w.agent(task.targetAgentId);
    if (t) socialOutcome(w, a, t, task.actionId);
  }
  if (task.actionId !== 'talk') {
    const t = w.agent(task.targetAgentId);
    wishEvent(w, a, { action: task.actionId, target: task.targetAgentId, targetHousehold: t?.householdId });
  }
  if (task.actionId === 'squeak' || task.actionId === 'cry') callForAttention(w, a);
  if (task.actionId === 'say_goodbye') {
    const t = w.agent(task.targetAgentId);
    if (t?.visitUntil) {
      // Despide a toda su familia que esté de visita.
      for (const g of w.agentsIn(a.lotId)) if (g.householdId === t.householdId) g.visitUntil = w.state.minutes;
      w.noVisitsUntil = w.state.minutes + 240;
    }
  }
  endTask(w, a);
  if (task.param === 'leave') goHome(w, a);
}

export function runTask(w: World, a: Agent, task: Task, dt: number) {
  const def = ACTIONS[task.actionId];

  if (task.passiveOf) {
    const initiator = w.agent(task.passiveOf);
    const ok = initiator?.current?.targetAgentId === a.id && initiator.current.phase === 'acting';
    task.remaining -= dt;
    if (!ok || task.remaining <= 0) endTask(w, a);
    return;
  }

  if (task.phase === 'walking') {
    if (def.target === 'agent') return walkToAgent(w, a, task, dt);
    if (def.target === 'object' && !w.object(task.targetObjectId)) return endTask(w, a);
    if (!moveAlong(w, a, dt)) return;
    if (def.target === 'tile') return completeTask(w, a, task);
    // Ha llegado al objeto
    const o = w.object(task.targetObjectId)!;
    const check = checkObjectAction(w, a, o, task.actionId);
    if (!check.ok) {
      if (task.byPlayer) w.toast(`${a.name}: ${check.reason}`, '🚫');
      return endTask(w, a);
    }
    const hh = w.householdOf(a);
    if (def.cost && hh) money(w, hh, -costOf(w, task.actionId, a), SPEND_CATEGORY[task.actionId] ?? 'ocio');
    if (def.consumes) o.stock = Math.max(0, (o.stock ?? 0) - 1);
    if (FRIDGE_FOOD.has(task.actionId)) {
      const owner = pantryOwner(w, o.lotId);
      if (owner) owner.pantry = Math.max(0, (owner.pantry ?? 0) - 1);
    }
    task.phase = 'acting';
    task.remaining = def.duration;
    w.emit({ type: 'act', agentId: a.id, actionId: task.actionId });
    face(w, a, objectCenter(o));
    return;
  }

  if (task.phase === 'waiting') {
    return walkToAgent(w, a, task, dt);
  }

  // Actuando
  let partner: Agent | undefined;
  if (def.target === 'agent') {
    partner = w.agent(task.targetAgentId);
    if (!partner || partner.current?.passiveOf !== a.id) return endTask(w, a);
  }
  const tq = def.target === 'object' ? w.object(task.targetObjectId)?.q : undefined;
  applyEffects(w, a, def.effects, dt, tq ? QUALITY[tq].mult : 1);
  if (def.skill) practice(w, a, def.skill, dt);
  if (partner && def.partnerEffects) applyEffects(w, partner, def.partnerEffects, dt);
  task.remaining -= dt;
  if (task.remaining <= 0 || isSatisfied(w, a, def)) {
    if (def.offLot && partner) {
      endTask(w, partner);
    }
    completeTask(w, a, task);
  }
}

export function applyEffects(_w: World, a: Agent, effects: Partial<Needs>, dt: number, mult = 1) {
  for (const k of NEED_KEYS) {
    const e = effects[k];
    if (e) a.needs[k] = clamp(a.needs[k] + e * dt * (e > 0 ? mult : 1));
  }
}

export function isSatisfied(_w: World, a: Agent, def: ActionDef): boolean {
  const until = def.until;
  if (!until) return false;
  if (until === 'full') {
    const ups = NEED_KEYS.filter((k) => (def.effects[k] ?? 0) > 0);
    return ups.length > 0 && ups.every((k) => a.needs[k] >= 99.5);
  }
  return NEED_KEYS.every((k) => until[k] === undefined || a.needs[k] >= until[k]);
}

/** Programa una orden para la próxima vez que el reloj marque `minuteOfDay` (hoy o mañana). */
export function scheduleOrder(w: World, agentId: string, actionId: string, target: Target, minuteOfDay: number, param?: string): ScheduledOrder | null {
  const a = w.agent(agentId);
  const def = ACTIONS[actionId];
  if (!a || !def || !w.isPlayerMember(a)) return null;
  const dayStart = Math.floor(w.state.minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  let at = dayStart + Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(minuteOfDay)));
  if (at <= w.state.minutes) at += MINUTES_PER_DAY;
  const order: ScheduledOrder = { id: w.newId('p'), agentId, at, actionId, target: { ...target }, ...(param ? { param } : {}) };
  w.state.schedule = [...(w.state.schedule ?? []), order].sort((x, y) => x.at - y.at);
  const hh = `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(Math.round(minuteOfDay) % 60).padStart(2, '0')}`;
  w.toast(`Programado: a las ${hh}, ${a.name} → ${def.label.toLowerCase()}`, '⏰');
  return order;
}

export function cancelOrder(w: World, orderId: string) {
  w.state.schedule = (w.state.schedule ?? []).filter((o) => o.id !== orderId);
}

/** Da las órdenes programadas que ya toca dar. */
export function runSchedule(w: World) {
  const list = w.state.schedule;
  if (!list?.length || list[0].at > w.state.minutes) return;
  const due = list.filter((o) => o.at <= w.state.minutes);
  w.state.schedule = list.filter((o) => o.at > w.state.minutes);
  for (const o of due) {
    const a = w.agent(o.agentId);
    const def = ACTIONS[o.actionId];
    if (!a || !def) continue;
    const ok = command(w, o.agentId, o.actionId, o.target as Target, o.param);
    if (ok) w.toast(`⏰ Es la hora: ${a.name} → ${def.label.toLowerCase()}`, '⏰', a.id);
    else w.toast(`⏰ ${a.name} no ha podido ${def.label.toLowerCase()} a su hora`, '⏰', a.id);
  }
}
