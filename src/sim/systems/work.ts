// La vida en el trabajo: el centro de trabajo de cada profesión (con su jefe y sus compañeros), las tareas
// de cada jornada, acompañar a alguien al trabajo y hacerlas allí, las bajas (maternidad, paternidad,
// enfermedad), las amonestaciones y los despidos, los ascensos (y los enchufes que los roban) y la vida
// corporativa: afterworks, comidas de empresa, la cena de Navidad, drama, líos, fusiones y EREs.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { ACTIONS } from '../../data/actions';
import { CAREERS, type Career } from '../../data/careers';
import {
  BASE_KIT, BIRTH_LEAVE_DAYS, BUYERS, CAREER_TASKS, COMPANIES, CORP_CHANCE, CORP_EVENTS, EVENT_DRUNK, EVENT_GOOD, EVENT_GOSSIP, EVENT_IMPROPER, EVENT_KIT,
  EVENT_LOT_NAME, EVENT_ROMANCE, EVENT_SACKINGS, LEAVE_LABEL, LEAVE_PAY, NEPOTISM, OFFICE_AFFAIRS, OFFICE_DRAMA, STRIKES_TO_FIRE, STRIKE_FORGET_DAYS,
  TASKS_PER_DAY, TASKS_PER_PART_DAY, TASK_PERF, WORK_KITS, WORK_TASKS, type CorpEventKind,
} from '../../data/work';
import { CAREER_SKILL } from '../../data/skills';
import { MINUTES_PER_DAY } from '../constants';
import { addSecret } from '../gossip';
import { makeAgent, placeObjects } from '../neighborhood';
import { changeRel, getRel, partnerOf } from '../social';
import { hasTrait } from '../traits';
import type { Agent, CorpState, Job, PlacedObject, Task } from '../types';
import { moodScore } from '../util';
import type { ActionOption, World } from '../world';
import { drink } from './body';
import { wage } from './economy';
import { money } from './money';
import { skillLevel } from './skills';
import { freeSpotNear, startTravel } from './travel';

/** El restaurante de las comidas y cenas de empresa. */
export const EVENT_LOT = 'RT';
/** Papeles de la gente del trabajo. */
export const WORK_ROLES = new Set(['jefe', 'colega']);

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

export const workLotId = (career: string) => `W_${career}`;

/** ¿Esta profesión tiene un sitio al que ir (y tareas)? (El bar propio y el colegio, no). */
export function hasWorkplace(career: string | undefined): boolean {
  return !!career && !!COMPANIES[career] && !!CAREER_TASKS[career];
}

/** Las empresas donde trabaja la familia. */
export function corp(w: World): CorpState {
  return (w.state.corp = w.state.corp ?? { companies: {} });
}

export function company(w: World, career: string) {
  const c = corp(w);
  return (c.companies[career] = c.companies[career] ?? { name: COMPANIES[career]?.name ?? CAREERS[career]?.name ?? career });
}

export function companyName(w: World, career: string): string {
  return company(w, career).name;
}

/** Crea (si no existe) el centro de trabajo de una profesión, con sus muebles, su jefe y sus compañeros. */
export function ensureWorkplace(w: World, career: string): string | undefined {
  if (!hasWorkplace(career)) return undefined;
  const lotId = workLotId(career);
  if (w.state.lots.some((l) => l.id === lotId)) return lotId;
  const def = COMPANIES[career];
  w.state.lots.push({ id: lotId, name: company(w, career).name, kind: 'work', layout: 'office', work: career, district: 'madrid', style: { wall: 0xe8e4dc, floor: 0x8f8f96 } });
  placeObjects(w.state, lotId, [...BASE_KIT, ...WORK_KITS[def.kit]]);
  hire(w, career, def.boss.name, 'jefe', def.boss.sex);
  for (const m of def.mates) hire(w, career, m.name, 'colega', m.sex);
  w.rebuildGrid();
  return lotId;
}

/** El restaurante de los eventos de empresa (se crea la primera vez). */
export function ensureEventLot(w: World): string {
  if (!w.state.lots.some((l) => l.id === EVENT_LOT)) {
    w.state.lots.push({ id: EVENT_LOT, name: EVENT_LOT_NAME, kind: 'work', layout: 'bar', work: 'evento', district: 'madrid', style: { wall: 0xc9a27a, floor: 0x7a4e2d } });
    placeObjects(w.state, EVENT_LOT, EVENT_KIT);
    w.rebuildGrid();
  }
  return EVENT_LOT;
}

const CLOTHES = [0x2f3e56, 0x5a4a78, 0x7a3b3b, 0x3d6b4f, 0x404040, 0x8a6d3b, 0x1f5f8b];

/** Contrata a alguien (jefe o compañero) en ese centro de trabajo. */
function hire(w: World, career: string, name: string, role: 'jefe' | 'colega', sex?: 'f' | 'm'): Agent {
  const lotId = workLotId(career);
  const lay = w.layoutOf(lotId);
  const a = makeAgent({ id: w.newId('a'), name, species: 'human', ageDays: role === 'jefe' ? 52 : 26 + Math.floor(Math.random() * 18), color: pick(CLOTHES), householdId: 'calle', lotId, x: lay.entrance.x, y: lay.entrance.y - 2 });
  a.role = role;
  a.post = lotId;
  a.abstract = true;
  if (sex) a.sex = sex;
  a.traits = role === 'jefe' ? [pick(['grunon', 'optimista', 'cunado', 'fiestero'])] : [pick(['cotilla', 'bromista', 'perezoso', 'fiestero', 'romantico', 'optimista'])];
  w.state.agents.push(a);
  return a;
}

/** El jefe y los compañeros de una profesión. */
export function staffOf(w: World, career: string): Agent[] {
  const lot = workLotId(career);
  return w.state.agents.filter((a) => a.post === lot && WORK_ROLES.has(a.role ?? ''));
}

export function bossOf(w: World, career: string): Agent | undefined {
  return staffOf(w, career).find((a) => a.role === 'jefe');
}

export function matesOf(w: World, career: string): Agent[] {
  return staffOf(w, career).filter((a) => a.role === 'colega');
}

export function isWorkLot(w: World, lotId: string): boolean {
  return w.lotById(lotId)?.kind === 'work';
}

/** La jornada correspondiente a un motivo de viaje ('part' = medio tiempo). */
export function jobFor(a: Agent, reason: 'work' | 'school' | 'part'): Job | undefined {
  return reason === 'part' ? a.side : a.job;
}

/** Los dos trabajos que puede tener (el principal y el de medio tiempo), si los tiene. */
export function jobsOf(a: Agent): { job: Job; which: 'job' | 'side' }[] {
  const out: { job: Job; which: 'job' | 'side' }[] = [];
  if (a.job) out.push({ job: a.job, which: 'job' });
  if (a.side) out.push({ job: a.side, which: 'side' });
  return out;
}

// -----------------------------------------------------------------------------
// Tareas de la jornada
// -----------------------------------------------------------------------------

/** Al empezar la jornada: qué hay que hacer hoy (solo la familia del jugador). */
export function assignTasks(w: World, a: Agent, job: Job) {
  const pool = CAREER_TASKS[job.career];
  if (!pool || !w.isPlayerMember(a)) return;
  const n = Math.min(pool.length, CAREERS[job.career]?.partTime ? TASKS_PER_PART_DAY : TASKS_PER_DAY);
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, n);
  job.tasks = { day: w.day, list: shuffled.map((id) => ({ id, done: false })) };
}

/** Tareas pendientes de hoy. */
export function pendingTasks(w: World, job: Job | undefined): string[] {
  if (!job?.tasks || job.tasks.day !== w.day) return [];
  return job.tasks.list.filter((t) => !t.done).map((t) => t.id);
}

/** El trabajo de quien está ahora en su centro de trabajo (si está en jornada). */
function jobAtWork(_w: World, a: Agent): Job | undefined {
  if (!a.shift || a.lotId !== a.shift.lot) return undefined;
  return a.shift.reason === 'part' ? a.side : a.job;
}

/** Opciones de tarea en un mueble del centro de trabajo. */
export function taskOptions(w: World, a: Agent, o: PlacedObject): ActionOption[] {
  const job = jobAtWork(w, a);
  if (!job || w.lotById(o.lotId)?.work !== job.career) return [];
  return pendingTasks(w, job)
    .filter((id) => WORK_TASKS[id]?.obj === o.def)
    .map((id) => checkWorkTask(w, a, o, `wt_${id}`));
}

/** ¿Puede hacer esa tarea en ese mueble ahora? */
export function checkWorkTask(w: World, a: Agent, o: PlacedObject, actionId: string): ActionOption {
  const def = ACTIONS[actionId];
  const id = actionId.slice(3);
  const job = jobAtWork(w, a);
  if (!job || w.lotById(o.lotId)?.work !== job.career) return { def, ok: false, hidden: true };
  if (!pendingTasks(w, job).includes(id)) return { def, ok: false, hidden: true };
  if (WORK_TASKS[id]?.obj !== o.def) return { def, ok: false, hidden: true };
  if (o.broken) return { def, ok: false, reason: 'Está roto' };
  if (w.usersOf(o.id, a).length >= Math.max(1, w.objDef(o).capacity)) return { def, ok: false, reason: 'Ocupado' };
  return { def, ok: true };
}

/** Tarea hecha (en el centro de trabajo). */
export function workTaskDone(w: World, a: Agent, taskId: string) {
  const job = jobAtWork(w, a);
  const t = job?.tasks?.list.find((x) => x.id === taskId && !x.done);
  if (!job || !t) return;
  t.done = true;
  const left = pendingTasks(w, job).length;
  const sk = CAREER_SKILL[job.career];
  if (sk) {
    a.skills = a.skills ?? {};
    a.skills[sk] = Math.min(10, (a.skills[sk] ?? 0) + 0.15);
  }
  const boss = bossOf(w, job.career);
  if (boss && boss.lotId === a.lotId && Math.random() < 0.4) w.say(boss.id, pick(['¡Así me gusta!', 'Buen trabajo', 'Eso es, sin prisa pero sin pausa', 'Muy bien, sigue así']));
  w.toast(left ? `${a.name}: «${WORK_TASKS[taskId].label}», hecho. Quedan ${left}` : `${a.name} ha terminado todas las tareas de hoy. ¡${pick(['Máquina', 'Crack', 'Así da gusto'])}!`, left ? '✅' : '🏆', a.id);
}

/** Si está en su centro de trabajo sin el jugador encima, se pone con lo que queda. */
export function nextAutoTask(w: World, a: Agent): Omit<Task, 'id' | 'byPlayer' | 'phase' | 'remaining'> | undefined {
  const job = jobAtWork(w, a);
  if (!job) return undefined;
  for (const id of pendingTasks(w, job)) {
    const def = WORK_TASKS[id];
    const o = w.objectsIn(a.lotId).find((x) => x.def === def.obj && checkWorkTask(w, a, x, `wt_${id}`).ok);
    if (o) return { actionId: `wt_${id}`, targetObjectId: o.id };
  }
  return undefined;
}

/**
 * Al acabar la jornada: lo que se ha hecho. Si ha ido solo, las tareas se hacen (o no) según el ánimo y lo que sabe;
 * si se le ha acompañado, cuenta solo lo que se ha hecho de verdad. Devuelve cuánto cambia el rendimiento.
 */
export function settleTasks(w: World, a: Agent, job: Job, visible: boolean, mood: number): { delta: number; done: number; total: number } {
  const list = job.tasks?.day === w.day || (job.tasks && w.day - job.tasks.day <= 1) ? job.tasks?.list ?? [] : [];
  if (!list.length) return { delta: 0, done: 0, total: 0 };
  const sk = CAREER_SKILL[job.career] ? skillLevel(w, a, CAREER_SKILL[job.career]) : 0;
  if (!visible) {
    const p = Math.min(0.95, Math.max(0.2, 0.45 + (mood - 40) / 120 + sk * 0.04 + (a.illness ? -0.2 : 0)));
    for (const t of list) if (!t.done && Math.random() < p) t.done = true;
  }
  const done = list.filter((t) => t.done).length;
  const missed = list.length - done;
  let delta = done * TASK_PERF.done - missed * TASK_PERF.missed;
  if (!missed) delta += TASK_PERF.allDoneBonus * (visible ? 2 : 1);
  job.tasks = undefined;
  if (w.isPlayerMember(a)) {
    if (!missed) w.feel(a, 'tareas_hechas');
    else if (missed >= 2) w.toast(`${a.name} ha dejado ${missed} tareas sin hacer. En la empresa se nota`, '📉', a.id);
  }
  return { delta, done, total: list.length };
}

// -----------------------------------------------------------------------------
// Acompañar al trabajo
// -----------------------------------------------------------------------------

/** Por qué no se le puede acompañar al trabajo (o nada si se puede). */
export function escortReason(w: World, a: Agent, which: 'job' | 'side' = 'job'): string | undefined {
  const job = which === 'side' ? a.side : a.job;
  if (!job || !w.isPlayerMember(a) || a.kind !== 'person') return 'No tiene trabajo';
  if (!hasWorkplace(job.career)) return CAREERS[job.career]?.business ? 'En el bar propio ya mandas tú' : 'Aquí no se puede acompañar';
  if (job.leave) return 'Está de baja';
  if (a.shift) return 'Ya estás con él/ella en el trabajo';
  return undefined;
}

/**
 * Acompañarle al trabajo: si ya está en su jornada, aparece allí; si no, la próxima jornada irá a la vista.
 * Devuelve un aviso con lo que va a pasar.
 */
export function escort(w: World, a: Agent, which: 'job' | 'side' = 'job'): string {
  const why = escortReason(w, a, which);
  if (why) return why;
  const job = (which === 'side' ? a.side : a.job)!;
  const c = CAREERS[job.career];
  const reason = which === 'side' ? 'part' : 'work';
  const lot = ensureWorkplace(w, job.career)!;
  if (a.travel?.reason === reason && a.travel.arrive !== Number.POSITIVE_INFINITY) {
    // Ya está trabajando: le ves allí hasta que acabe.
    const end = a.travel.arrive;
    const mood = a.travel.mood ?? moodScore(a);
    a.travel = { from: a.travel.from, to: lot, arrive: w.state.minutes + 5 };
    a.shift = { lot, end, reason, mood };
    w.setActive(a.id);
    return `Vas con ${a.name} a ${COMPANIES[job.career].place}: haz sus tareas de hoy`;
  }
  job.escort = nextShiftDay(w, job);
  return `${a.name} irá contigo a ${COMPANIES[job.career].place} en su próxima jornada (${c.start}:00)`;
}

/** Número de día de la próxima jornada (hoy si aún no ha empezado). */
function nextShiftDay(w: World, job: Job): number {
  const c = CAREERS[job.career];
  const m = w.state.minutes % MINUTES_PER_DAY;
  for (let i = 0; i < 8; i++) {
    const wd = (w.weekday + i) % 7;
    if (!c.days.includes(wd)) continue;
    if (i === 0 && (job.lastShiftDay === w.day || m >= c.end * 60)) continue;
    return w.day + i;
  }
  return w.day + 1;
}

/** Empieza una jornada a la vista: va a su centro de trabajo y se queda hasta la hora de salida. */
export function startVisibleShift(w: World, a: Agent, job: Job, reason: 'work' | 'part', end: number) {
  const lot = ensureWorkplace(w, job.career);
  if (!lot) return false;
  startTravel(w, a, lot, true);
  a.shift = { lot, end, reason, mood: moodScore(a) };
  a.visitUntil = undefined;
  job.escort = undefined;
  w.setActive(a.id);
  w.toast(`Acompañas a ${a.name} a ${COMPANIES[job.career].place} (${companyName(w, job.career)}). Hoy toca: ${pendingTasks(w, job).map((id) => WORK_TASKS[id].label.toLowerCase()).join(', ')}`, CAREERS[job.career].icon, a.id);
  return true;
}

/** Cada paso: quien trabaja a la vista acaba su jornada a su hora (o se ha ido antes). */
export function shiftTick(w: World, finish: (a: Agent, reason: 'work' | 'part', mood: number, visible: boolean) => void) {
  for (const a of w.state.agents) {
    const s = a.shift;
    if (!s) continue;
    const away = !a.travel && a.lotId !== s.lot;
    const leaving = a.travel && a.travel.to !== s.lot;
    if (w.state.minutes < s.end && !away && !leaving) continue;
    a.shift = undefined;
    const job = jobFor(a, s.reason);
    if (job && w.state.minutes < s.end - 30) {
      job.perf = Math.max(0, job.perf - 10);
      if (w.isPlayerMember(a)) w.toast(`${a.name} se ha ido antes de su hora. A ${bossOf(w, job.career)?.name ?? 'la jefa'} no le ha hecho ninguna gracia`, '😒', a.id);
    }
    finish(a, s.reason, Math.max(s.mood, moodScore(a)), true);
    if (!w.agent(a.id)) continue;
    if (!a.travel && a.lotId === s.lot) {
      const home = w.householdOf(a)?.lotId;
      if (home) startTravel(w, a, home, true);
    }
  }
}

// -----------------------------------------------------------------------------
// Bajas
// -----------------------------------------------------------------------------

/** Día de la baja (maternidad, paternidad, enfermedad): no va, cobra la prestación. Devuelve true si está de baja. */
export function leaveDay(w: World, a: Agent, job: Job, c: Career): boolean {
  // Enfermo con parte del médico: baja hasta que se cure.
  if (!job.leave && a.illness?.treated && !c.school) startSickLeave(w, a, job);
  const lv = job.leave;
  if (!lv) {
    // Malo en el colegio con médico: falta justificada.
    if (c.school && a.illness?.treated) {
      job.lastShiftDay = w.day;
      return true;
    }
    return false;
  }
  if ((lv.kind === 'enfermedad' && !a.illness) || w.day > lv.until) {
    job.leave = undefined;
    if (w.isPlayerMember(a)) w.toast(`${a.name} se reincorpora ${c.school ? 'a clase' : 'al trabajo'} después de la ${LEAVE_LABEL[lv.kind]}`, '💼', a.id);
    return false;
  }
  job.lastShiftDay = w.day;
  if (!c.school && !c.business) {
    const pay = Math.round(wage(w, c.levels[job.level - 1].pay) * LEAVE_PAY[lv.kind]);
    money(w, w.householdOf(a), pay, 'prestacion');
    if (w.isPlayerMember(a)) w.toastOnce(`${a.id}:leave:${w.day}`, `${a.name} está de ${LEAVE_LABEL[lv.kind]}: la Seguridad Social paga §${pay} hoy`, lv.kind === 'enfermedad' ? '🩹' : '👶', 600, a.id);
  }
  return true;
}

/** Baja por enfermedad (con el parte del médico). */
export function startSickLeave(w: World, a: Agent, job?: Job) {
  for (const { job: j } of job ? [{ job }] : jobsOf(a)) {
    const c = CAREERS[j.career];
    if (!c || c.school || c.business || !a.illness || j.leave) continue;
    j.leave = { kind: 'enfermedad', until: Math.floor(a.illness.until / MINUTES_PER_DAY) + 1 };
    w.feel(a, 'de_baja');
    if (w.isPlayerMember(a)) w.toast(`La médica le da la baja a ${a.name}: hasta que se cure no va ${c.partTime ? 'a su trabajo de tarde' : 'a trabajar'} (y cobra el 75 %)`, '🩹', a.id);
  }
}

/** Ha nacido un bebé: baja por maternidad para la madre y por paternidad para el otro progenitor. */
export function birthLeave(w: World, parents: Agent[], mother?: Agent) {
  for (const p of parents) {
    for (const { job } of jobsOf(p)) {
      const c = CAREERS[job.career];
      if (!c || c.school || c.business) continue;
      const kind = p === mother || (!mother && p.sex === 'f') ? 'maternidad' : 'paternidad';
      job.leave = { kind, until: w.day + BIRTH_LEAVE_DAYS };
      if (w.isPlayerMember(p)) w.toast(`${p.name} coge la ${LEAVE_LABEL[kind]} (${BIRTH_LEAVE_DAYS} días, cobrando el sueldo entero)`, '🍼', p.id);
    }
  }
}

// -----------------------------------------------------------------------------
// Amonestaciones, despidos y ascensos
// -----------------------------------------------------------------------------

/** Una amonestación. Con tres, despido. Devuelve true si le han echado. */
export function strike(w: World, a: Agent, job: Job, why: string, fire: (why: string) => void): boolean {
  job.strikes = (job.strikes ?? 0) + 1;
  job.strikeDay = w.day;
  w.feel(a, 'amonestado');
  if (job.strikes >= STRIKES_TO_FIRE) {
    fire(why);
    return true;
  }
  if (w.isPlayerMember(a)) w.toast(`Amonestación para ${a.name} (${job.strikes}/${STRIKES_TO_FIRE}): ${why}. A la tercera, a la calle`, '📝', a.id);
  return false;
}

/** ¿Le dan el ascenso? A veces se lo lleva el enchufado, y con un jefe que no le traga, no hay manera. */
export function promotionVerdict(w: World, a: Agent, job: Job): 'ok' | 'stolen' | 'blocked' {
  if (!w.isPlayerMember(a) || !hasWorkplace(job.career) || !w.state.corp?.companies[job.career]) return 'ok';
  const co = company(w, job.career);
  const boss = bossOf(w, job.career);
  const nephew = w.agent(co.nephew);
  if (nephew && Math.random() < CORP_CHANCE.stolenPromotion * w.corpChance) {
    job.perf = 70;
    w.feel(a, 'enchufado');
    w.toast(`El ascenso de ${a.name} se lo ha llevado ${nephew.name}, que casualmente es familia de ${boss?.name ?? 'quien manda'}. Enchufes`, '🔌', a.id);
    w.addNews(`en ${co.name} han ascendido al enchufado, ${nephew.name}, en vez de a ${a.name}`, [a.id]);
    return 'stolen';
  }
  if (boss && getRel(w.state, a.id, boss.id).f <= -30 && Math.random() < 0.5 * w.corpChance) {
    job.perf = 80;
    w.toast(`${boss.name} no quiere ni oír hablar de ascender a ${a.name}. Habrá que llevarse mejor con el jefe`, '😤', a.id);
    return 'blocked';
  }
  return 'ok';
}

// -----------------------------------------------------------------------------
// Vida corporativa
// -----------------------------------------------------------------------------

/** Rellena {a}, {b}, {boss}, {company}, {name}, {event}. */
function fill(text: string, w: World, career: string, extra: Record<string, string> = {}): string {
  const mates = matesOf(w, career);
  const a = mates[Math.floor(Math.random() * mates.length)];
  const b = mates.filter((x) => x !== a)[0] ?? a;
  const vars: Record<string, string> = { a: a?.name ?? 'Paco', b: b?.name ?? 'Mari', boss: bossOf(w, career)?.name ?? 'el jefe', company: companyName(w, career), ...extra };
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? k);
}

/** Cada mañana: amonestaciones que se olvidan, drama, líos, enchufes, fusiones y la cena de Navidad. */
export function corpDaily(w: World, fireFor: (a: Agent, which: 'job' | 'side', why: string, pay?: number) => void) {
  const careers = new Map<string, { a: Agent; job: Job; which: 'job' | 'side' }[]>();
  for (const a of w.members) {
    if (a.kind !== 'person') continue;
    for (const { job, which } of jobsOf(a)) {
      if (job.strikes && w.day - (job.strikeDay ?? 0) >= STRIKE_FORGET_DAYS) {
        job.strikes--;
        job.strikeDay = w.day;
      }
      if (!hasWorkplace(job.career)) continue;
      ensureWorkplace(w, job.career);
      if (!careers.has(job.career)) careers.set(job.career, []);
      careers.get(job.career)!.push({ a, job, which });
    }
  }
  const k = w.corpChance;
  for (const [career, people] of careers) {
    const co = company(w, career);
    const boss = bossOf(w, career);
    const names = people.map((p) => p.a.name).join(' y ');
    // El ERE de una fusión anunciada.
    if (co.merger && w.day >= co.merger.day) {
      const buyer = co.merger.buyer;
      co.merger = undefined;
      co.name = `${buyer} (antes ${co.name.replace(/ \(antes .*\)$/, '')})`;
      const lot = w.state.lots.find((l) => l.id === workLotId(career));
      if (lot) lot.name = co.name;
      w.addNews(`${buyer} ha comprado la empresa donde trabaja ${names}. Hay ERE`, people.map((p) => p.a.id));
      for (const p of people) {
        const risk = CORP_CHANCE.ereBase + (p.job.perf < 40 ? CORP_CHANCE.ereLowPerf : 0) - (p.job.level >= 4 ? 0.08 : 0);
        if (Math.random() < risk) {
          const c = CAREERS[career];
          const pay = Math.round(wage(w, c.levels[p.job.level - 1].pay) * (8 + 2 * p.job.level));
          fireFor(p.a, p.which, `el ERE tras la compra por ${buyer}`, pay);
        } else {
          w.toast(`${p.a.name} se salva del ERE de ${buyer}. Por los pelos`, '😮‍💨', p.a.id);
        }
      }
      // Algún compañero también cae (y entra alguien nuevo, de la empresa compradora).
      const mate = pick(matesOf(w, career));
      if (mate && Math.random() < 0.6) {
        replaceMate(w, career, mate, `${mate.name} ha caído en el ERE`);
      }
      continue;
    }
    // Rumores de fusión.
    if (!co.merger && Math.random() < CORP_CHANCE.merger * k && people.every((p) => w.day - (p.job.since ?? 0) >= 3)) {
      const buyer = pick(BUYERS.filter((b) => !co.name.includes(b)));
      co.merger = { buyer, day: w.day + 2 };
      for (const p of people) {
        w.feel(p.a, 'rumor_ere');
        w.toast(`Bombazo en ${co.name}: ${buyer} la quiere comprar. Dicen que habrá ERE en dos días. ¡${p.a.name}, a rendir!`, '🏢', p.a.id);
      }
      continue;
    }
    if (!boss) continue;
    // El enchufado.
    if (!co.nephew && Math.random() < CORP_CHANCE.nepotism * k) {
      const n = pick(NEPOTISM);
      const who = n.who.replace('{boss}', boss.name);
      const used = new Set(w.state.agents.map((x) => x.name));
      const nephew = hire(w, career, used.has(n.name) ? `${n.name} ${w.state.nextId}` : n.name, 'colega');
      co.nephew = nephew.id;
      w.toast(`En ${co.name} ha entrado a trabajar ${nephew.name}, ${who}. Sin entrevista, claro. Cuidado con los ascensos`, '🔌', people[0].a.id);
      w.addNews(`${nephew.name} ha entrado a trabajar en ${co.name} por ser ${who}`, people.map((p) => p.a.id));
      continue;
    }
    // Drama y líos de la oficina (salseo para comentar).
    if (Math.random() < CORP_CHANCE.drama * k) {
      const text = fill(pick(OFFICE_DRAMA), w, career);
      w.toast(`Drama en ${co.name}: ${text}`, '🍿', people[0].a.id);
      for (const p of people) w.feel(p.a, 'salseo');
    } else if (Math.random() < CORP_CHANCE.affair * k) {
      const text = fill(pick(OFFICE_AFFAIRS), w, career);
      addSecret(w.state, { kind: 'trabajo', text: `en ${co.name}: ${text.charAt(0).toLowerCase()}${text.slice(1)}`, about: staffOf(w, career).map((s) => s.id).slice(0, 2), known: people.map((p) => p.a.id), juicy: 3, day: w.day });
      w.toast(`Salseo en ${co.name}: ${text} 🌶️`, '🤫', people[0].a.id);
      for (const p of people) w.feel(p.a, 'salseo');
    }
  }
}

/** Un compañero se va (despedido, ERE...) y entra otro. */
function replaceMate(w: World, career: string, mate: Agent, text: string) {
  w.toast(`${text}. Entra alguien nuevo en ${companyName(w, career)}`, '📦');
  w.state.agents = w.state.agents.filter((x) => x !== mate);
  for (const key of Object.keys(w.state.rels)) if (key.split('|').includes(mate.id)) delete w.state.rels[key];
  if (company(w, career).nephew === mate.id) company(w, career).nephew = undefined;
  const used = new Set(w.state.agents.map((x) => x.name));
  const pool = ['Sonia', 'Rober', 'Marisa', 'Quique', 'Lourdes', 'Asier', 'Noa', 'Fran', 'Inés', 'Gorka'].filter((n) => !used.has(n));
  hire(w, career, pool[0] ?? `Nuevo/a ${w.state.nextId}`, 'colega');
}

/** Al salir del trabajo: a veces hay afterwork, comida de empresa o la cena de Navidad. */
export function afterShift(w: World, a: Agent, job: Job) {
  if (!w.isPlayerMember(a) || w.state.prompt || w.state.corp?.event || !hasWorkplace(job.career) || job.leave) return;
  const co = company(w, job.career);
  const d = w.date;
  let kind: CorpEventKind | undefined;
  if (d.m === 12 && d.d >= 12 && d.d <= 23 && co.xmas !== d.y && (d.wd === 4 || d.d >= 20)) kind = 'navidad';
  else if ((w.weekday === 3 || w.weekday === 4) && Math.random() < CORP_CHANCE.afterwork * w.corpChance && w.day - (co.last?.afterwork ?? -9) >= 5) kind = 'afterwork';
  else if (Math.random() < CORP_CHANCE.comida * w.corpChance && w.day - (co.last?.comida ?? -30) >= 20) kind = 'comida';
  if (!kind) return;
  if (kind === 'navidad') co.xmas = d.y;
  co.last = { ...(co.last ?? {}), [kind]: w.day };
  w.state.prompt = { kind: 'event', event: kind, agentId: a.id, career: job.career, until: w.state.minutes + 60 };
}

/** El texto de la invitación. */
export function inviteText(w: World, p: { event: CorpEventKind; agentId: string; career: string }): string {
  const a = w.agent(p.agentId);
  return CORP_EVENTS[p.event].invite.replace('{company}', companyName(w, p.career)).replace('{name}', a?.name ?? '');
}

/** Respuesta a una invitación: 'solo' (va por su cuenta), 'contigo' (le acompañas: se juega) o 'no'. */
export function answerInvite(w: World, choice: 'solo' | 'contigo' | 'no', fireFor: (a: Agent, which: 'job' | 'side', why: string) => void) {
  const p = w.state.prompt;
  if (!p || p.kind !== 'event') return;
  w.state.prompt = undefined;
  const a = w.agent(p.agentId);
  if (!a) return;
  const ev = CORP_EVENTS[p.event];
  const boss = bossOf(w, p.career);
  const mates = matesOf(w, p.career);
  if (choice === 'no' || a.travel || a.kind !== 'person') {
    for (const m of mates) changeRel(w.state, a.id, m.id, -2, 0);
    if (boss && p.event === 'navidad') changeRel(w.state, a.id, boss.id, -6, 0);
    w.toast(`${a.name} no va ${p.event === 'navidad' ? 'a la cena de Navidad' : `al ${ev.label.toLowerCase()}`}. ${p.event === 'navidad' ? 'Se ha notado su ausencia' : 'Otra vez será'}`, '🏠', a.id);
    return;
  }
  if (choice === 'contigo') {
    startEvent(w, a, p.event, p.career);
    return;
  }
  // Va por su cuenta: se cuenta lo que ha pasado al volver.
  const home = w.householdOf(a)?.lotId ?? a.lotId;
  a.travel = { from: a.lotId, to: home, arrive: w.state.minutes + ev.hours * 60, reason: 'event', mood: moodScore(a) };
  a.current = null;
  a.queue = [];
  resolveAbstractEvent(w, a, p.event, p.career, fireFor);
}

/** Lo que pasa en un evento al que ha ido solo. */
function resolveAbstractEvent(w: World, a: Agent, kind: CorpEventKind, career: string, fireFor: (a: Agent, which: 'job' | 'side', why: string) => void) {
  const event = CORP_EVENTS[kind].label.toLowerCase();
  const boss = bossOf(w, career);
  const mates = matesOf(w, career);
  const mate = pick(mates);
  const vars = { name: a.name, event };
  const party = hasTrait(a, 'fiestero') ? 0.15 : 0;
  const r = Math.random();
  for (const m of mates) changeRel(w.state, a.id, m.id, 4, 0);
  // Siempre hay algo que contar.
  const gossip = fill(pick(EVENT_GOSSIP), w, career, vars);
  w.toast(`En el ${event} de ${companyName(w, career)}: ${gossip}`, '🍿', a.id);
  if (Math.random() < 0.5) addSecret(w.state, { kind: 'trabajo', text: `en el ${event} de ${companyName(w, career)}, ${gossip.charAt(0).toLowerCase()}${gossip.slice(1)}`, about: [mate?.id ?? a.id], known: [a.id], juicy: 2, day: w.day });
  if (Math.random() < 0.12 * w.corpChance && mate) {
    replaceMate(w, career, mate, fill(pick(EVENT_SACKINGS), w, career).replace(/^Han despedido a [^ ]+( \([^)]*\))?/, `Han despedido a ${mate.name}`));
  }
  if (r < 0.4 - party) {
    w.feel(a, 'evento_empresa');
    if (boss) changeRel(w.state, a.id, boss.id, 6, 0);
    const job = jobsOf(a).find((j) => j.job.career === career)?.job;
    if (job) job.perf = Math.min(100, job.perf + 5);
    w.toast(fill(pick(EVENT_GOOD), w, career, vars), '🥂', a.id);
  } else if (r < 0.72) {
    w.feel(a, 'evento_empresa');
    drink(w, a, 45);
    w.toast(fill(pick(EVENT_DRUNK), w, career, vars), '🍷', a.id);
    if (Math.random() < 0.25 + party) improper(w, a, career, fill(pick(EVENT_IMPROPER), w, career, vars), fireFor);
  } else if (r < 0.87 && mate) {
    w.feel(a, 'evento_empresa');
    changeRel(w.state, a.id, mate.id, 8, 18);
    w.toast(fill(pick(EVENT_ROMANCE), w, career, { ...vars, a: mate.name }), '💘', a.id);
    if (partnerOf(w.state, a.id)) addSecret(w.state, { kind: 'lio', text: `${a.name} y ${mate.name} estuvieron muy acaramelados en el ${event} de la empresa`, about: [a.id, mate.id], known: [mate.id], juicy: 3, day: w.day });
  } else {
    w.feel(a, 'evento_empresa');
    w.toast(`${a.name} se lo ha pasado bien en el ${event}, sin más. Ha cenado, ha brindado y a casa`, '🙂', a.id);
  }
}

/** Ha hecho algo impropio en un evento de la empresa: amonestación o despido fulminante. */
function improper(w: World, a: Agent, career: string, text: string, fireFor: (a: Agent, which: 'job' | 'side', why: string) => void) {
  const which = jobsOf(a).find((j) => j.job.career === career);
  w.feel(a, 'verguenza');
  w.toast(text, '😱', a.id);
  addSecret(w.state, { kind: 'trabajo', text: `${text.charAt(0).toLowerCase()}${text.slice(1)} (${companyName(w, career)})`, about: [a.id], known: matesOf(w, career).map((m) => m.id), juicy: 3, day: w.day });
  if (!which) return;
  if (Math.random() < CORP_CHANCE.improperFire) fireFor(a, which.which, 'comportamiento impropio en un evento de la empresa');
  else strike(w, a, which.job, 'por su comportamiento en el evento de la empresa', (why) => fireFor(a, which.which, why));
}

/** Empieza un evento al que le acompañas: van al restaurante el jefe y los compañeros. */
export function startEvent(w: World, a: Agent, kind: CorpEventKind, career: string) {
  const lot = ensureEventLot(w);
  const ev = CORP_EVENTS[kind];
  corp(w).event = { kind, career, lot, until: w.state.minutes + ev.hours * 60, guest: a.id };
  for (const s of staffOf(w, career)) {
    s.lotId = lot;
    s.abstract = true;
    s.current = null;
    s.path = [];
    s.pos = freeSpotNear(w, lot, w.layoutOf(lot).entrance);
  }
  startTravel(w, a, lot, true);
  w.setActive(a.id);
  w.toast(`${ev.icon} ¡${ev.label} de ${companyName(w, career)} en ${EVENT_LOT_NAME}! Cuidado con lo que haces delante de ${bossOf(w, career)?.name ?? 'la jefa'}...`, ev.icon, a.id);
}

/** Cada hora del evento: salseo (y al final, todos a casa). */
export function eventHour(w: World) {
  const ev = w.state.corp?.event;
  if (!ev) return;
  const guest = w.agent(ev.guest);
  if (w.state.minutes >= ev.until || !guest || (guest.lotId !== ev.lot && guest.travel?.to !== ev.lot)) return endEvent(w);
  if (guest.lotId !== ev.lot) return;
  const text = fill(pick(EVENT_GOSSIP), w, ev.career);
  w.toast(text, '🍿', guest.id);
  const mates = matesOf(w, ev.career);
  const speaker = pick(mates);
  if (speaker) w.say(speaker.id, pick(['¡Otra ronda!', '¡Que hable el jefe!', '¿Has visto a esos dos?', 'Yo mañana no voy ni a rastras', '¡Por la empresa!']));
  // Cuánto ha bebido el invitado de la familia.
  if ((guest.alcohol ?? 0) >= 70 && !ev.improper && Math.random() < 0.35) {
    ev.improper = true;
    improper(w, guest, ev.career, `${guest.name} va como una cuba y se ha puesto a contar intimidades de ${bossOf(w, ev.career)?.name ?? 'la jefa'} en voz alta`, w.fireFor);
  }
}

/** Fin del evento: cada uno a su sitio. */
export function endEvent(w: World) {
  const ev = w.state.corp?.event;
  if (!ev) return;
  corp(w).event = undefined;
  for (const s of staffOf(w, ev.career)) {
    s.lotId = s.post ?? s.lotId;
    s.current = null;
    s.path = [];
    s.abstract = true;
    s.pos = freeSpotNear(w, s.lotId, w.layoutOf(s.lotId).entrance);
  }
  const guest = w.agent(ev.guest);
  if (guest && guest.lotId === ev.lot && !guest.travel) {
    w.feel(guest, 'evento_empresa');
    w.toast(`Se acaba el ${CORP_EVENTS[ev.kind].label.toLowerCase()}. ${guest.name} vuelve a casa${(guest.alcohol ?? 0) >= 50 ? ' haciendo eses' : ''}`, '🚕', guest.id);
    const home = w.householdOf(guest)?.lotId;
    if (home) startTravel(w, guest, home);
  }
}

/** Mal comportamiento delante del jefe (en el trabajo o en un evento de la empresa). */
export function conduct(w: World, a: Agent, t: Agent, actionId: string) {
  if (!w.isPlayerMember(a) || a.kind !== 'person') return;
  const lot = w.lotById(a.lotId);
  if (lot?.kind !== 'work') return;
  const ev = w.state.corp?.event;
  const career = lot.work === 'evento' ? ev?.career : lot.work;
  if (!career) return;
  const boss = bossOf(w, career);
  const bossHere = !!boss && boss.lotId === a.lotId;
  const drunk = (a.alcohol ?? 0) >= 50;
  const which = jobsOf(a).find((j) => j.job.career === career);
  if (!which) return;
  let bad = '';
  if ((actionId === 'insult' || actionId === 'argue') && t === boss) bad = `${a.name} le ha faltado al respeto a ${boss.name} delante de todos`;
  else if (actionId === 'insult' && bossHere) bad = `${a.name} ha insultado a ${t.name} delante de ${boss!.name}`;
  else if ((actionId === 'kiss' || actionId === 'flirt') && t === boss && drunk) bad = `${a.name}, con unas copas de más, ha intentado ligar con ${boss.name}`;
  else if (actionId === 'kiss' && bossHere && partnerOf(w.state, a.id) && partnerOf(w.state, a.id) !== t.id) bad = `${a.name} se ha besado con ${t.name} delante de toda la empresa (y tiene pareja)`;
  else if (actionId === 'fart' && t === boss) bad = `${a.name} se ha tirado un pedo en la cara de ${boss.name}`;
  if (!bad) return;
  if (ev && lot.work === 'evento') ev.improper = true;
  improper(w, a, career, bad, w.fireFor);
}

/** El nombre que se le pone al bebé (desde el aviso). */
export function nameBaby(w: World, name: string): string | undefined {
  const p = w.state.prompt;
  if (!p || p.kind !== 'naming') return 'No hay ningún bebé esperando nombre';
  const baby = w.agent(p.agentId);
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!baby) {
    w.state.prompt = undefined;
    return 'El bebé ya no está';
  }
  if (clean && w.state.agents.some((x) => x !== baby && x.name === clean)) return `Ya hay alguien que se llama ${clean} en el barrio: elige otro`;
  w.state.prompt = undefined;
  if (!clean || clean === baby.name) {
    w.toast(`¡Bienvenido/a al mundo, ${baby.name}!`, '👶', baby.id);
    return undefined;
  }
  const old = baby.name;
  baby.name = clean;
  for (const n of w.state.news ?? []) if (n.about.includes(baby.id)) n.text = n.text.replace(old, clean);
  for (const o of w.state.objects) if (o.label === old) o.label = clean;
  w.toast(`¡Bienvenido/a al mundo, ${clean}!`, '👶', baby.id);
  return undefined;
}


/** Con el jefe y los compañeros: hacer la pelota, pedir un ascenso, ponerle verde al jefe. */
export function workOutcome(w: World, a: Agent, t: Agent, actionId: string) {
  const entry = jobsOf(a).find((j) => t.post === workLotId(j.job.career));
  if (!entry) return;
  const { job } = entry;
  const c = CAREERS[job.career];
  const loud = w.isPlayerMember(a);
  if (actionId === 'suck_up') {
    job.perf = Math.min(100, job.perf + 3);
    w.say(t.id, pick(['Hombre, gracias. Se agradece', 'Tú sí que sabes', '¿Qué quieres, un aumento?']));
    // Si le ven los compañeros, queda de pelota.
    const seen = matesOf(w, job.career).filter((m) => m.lotId === a.lotId);
    if (seen.length && Math.random() < 0.4) {
      for (const m of seen) changeRel(w.state, a.id, m.id, -4, 0);
      if (loud) w.toast(`Los compañeros han visto a ${a.name} haciéndole la pelota a ${t.name}. Ya le llaman «el/la pelota»`, '🫡', a.id);
    }
  } else if (actionId === 'ask_promotion') {
    const rel = getRel(w.state, a.id, t.id).f;
    if (job.level >= c.levels.length) {
      w.say(t.id, '¿Más arriba? Más arriba ya solo estoy yo');
    } else if (job.perf >= 75 && rel >= 15) {
      job.level++;
      job.perf = 10;
      w.feel(a, 'ascenso');
      if (loud) w.toast(`¡${t.name} le da el ascenso a ${a.name}! Ahora es ${c.levels[job.level - 1].title} (§${wage(w, c.levels[job.level - 1].pay)} por jornada)`, '🎉', a.id);
      w.addNews(`han ascendido a ${a.name} a ${c.levels[job.level - 1].title.toLowerCase()}`, [a.id]);
    } else if (job.perf < 40) {
      job.perf = Math.max(0, job.perf - 3);
      changeRel(w.state, a.id, t.id, -4, 0);
      if (loud) w.toast(`${t.name}: «¿Un ascenso? ¿Con lo que rindes? Anda, vuelve a tu mesa». Mal momento`, '😬', a.id);
    } else {
      changeRel(w.state, a.id, t.id, -1, 0);
      if (loud) w.toast(`${t.name}: «Ya lo hablaremos en la evaluación». ${rel < 15 ? 'Le falta caerle mejor' : 'Le falta rendir un poco más'} (rendimiento ${Math.round(job.perf)} %)`, '🤔', a.id);
    }
  } else if (actionId === 'complain_boss') {
    const boss = bossOf(w, job.career);
    w.say(t.id, pick(['¡Total! No hay quien le aguante', 'Calla, calla, que me lo vas a contar a mí', 'Shhh, que te oye']));
    if (boss && Math.random() < (boss.lotId === a.lotId ? 0.3 : 0.1)) {
      changeRel(w.state, a.id, boss.id, -15, 0);
      if (loud) w.toast(`A ${boss.name} le han ido con el cuento de lo que ${a.name} dice de él/ella. Ambiente tenso`, '👂', a.id);
    }
  }
}
