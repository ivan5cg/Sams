// Trabajo y colegio: turnos, sueldos, ascensos, despidos y dilemas.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { coworkerDay } from '../relations';
import { BAR_MENUS, BAR_STAFF, CAREERS, gradeLabel, scheduleText, workDays, type Career } from '../../data/careers';
import { DILEMMAS, DILEMMA_BY_ID, type DilemmaOption } from '../../data/dilemmas';
import { hasTrait } from '../traits';
import { CAREER_SKILL, MAX_SKILL } from '../../data/skills';
import { MINUTES_PER_DAY } from '../constants';
import { degreeReason, schoolDay, startLevel } from './education';
import { isAdult } from '../social';
import type { Agent, BarPlan, Job } from '../types';
import { clamp, moodScore, rand } from '../util';
import type { World } from '../world';
import { money } from './money';
import { incomeTax } from '../../data/economy';
import { skillLevel } from './skills';
import { startTravel } from './travel';
import { priced, taxMult, wage } from './economy';
import { afterShift, assignTasks, companyName, ensureWorkplace, hasWorkplace, leaveDay, promotionVerdict, settleTasks, startVisibleShift, strike } from './work';

/** ¿Se pisan los horarios de dos trabajos? */
function clash(a: Career, b: Career): boolean {
  return a.days.some((d) => b.days.includes(d)) && a.start < b.end && b.start < a.end;
}

export function setJob(w: World, a: Agent, careerId: string) {
  const c = CAREERS[careerId];
  if (!c || c.school) return;
  const teen = w.stageOf(a) === 'teen';
  if (!isAdult(a) && !(teen && c.teens)) {
    if (w.isPlayerMember(a) && teen) w.toast(`${a.name} aún va al instituto: puede buscar algo de medio tiempo`, '🎒');
    return;
  }
  const needs = degreeReason(a, careerId);
  if (needs) {
    if (w.isPlayerMember(a)) w.toast(`${a.name} no puede trabajar de ${c.name.toLowerCase()}: ${needs.toLowerCase()}`, '🎓');
    return;
  }
  const mine = w.isPlayerMember(a);
  if (c.partTime) {
    // Medio tiempo: se compagina con los estudios (si tenía un trabajo de jornada completa que choca, lo deja).
    const full = a.job && !CAREERS[a.job.career]?.school ? CAREERS[a.job.career] : undefined;
    if (full && clash(full, c)) {
      a.job = undefined;
      if (mine) w.toast(`${a.name} deja el trabajo de ${full.name.toLowerCase()}: el horario no cuadra`, '📦');
    }
    a.side = { career: careerId, level: 1, perf: 0, since: w.day };
    if (mine) ensureWorkplace(w, careerId);
    if (mine) w.toast(`¡${a.name} tiene un trabajo de medio tiempo! ${c.levels[0].title}: §${wage(w, c.levels[0].pay)} por jornada (${scheduleText(c)})${a.study || a.job?.career === 'school' ? '. Se compagina con los estudios' : ''}`, c.icon);
    return;
  }
  if (a.study) a.study = undefined;
  if (a.side && clash(CAREERS[a.side.career], c)) {
    if (mine) w.toast(`${a.name} deja el trabajo de ${CAREERS[a.side.career].name.toLowerCase()}: el horario no cuadra`, '📦');
    a.side = undefined;
  }
  const h = w.householdOf(a);
  if (c.startup) {
    if (!h || h.funds < priced(w, c.startup)) {
      w.toast(`Montar el negocio cuesta §${priced(w, c.startup)}: no hay dinero suficiente`, '💸');
      return;
    }
    money(w, h, -priced(w, c.startup), 'negocio');
    a.job = { career: careerId, level: 1, perf: 0, since: w.day };
    w.feel(a, 'jefe_propio');
    w.toast(`¡${a.name} monta su propio negocio: ${c.levels[0].title}! (−§${priced(w, c.startup)}). Ojo: cada lunes, cuota de autónomos`, c.icon);
    w.addNews(`${a.name} ha abierto un bar en el barrio. Dicen que las bravas pican de verdad`, [a.id]);
    return;
  }
  const lvl = startLevel(a, careerId);
  a.job = { career: careerId, level: lvl, perf: 0, since: w.day };
  if (mine) ensureWorkplace(w, careerId);
  w.toast(`¡${a.name} tiene trabajo! ${c.levels[lvl - 1].title} (§${wage(w, c.levels[lvl - 1].pay)} por jornada)${lvl > 1 ? ', gracias a su carrera' : ''}${mine && hasWorkplace(careerId) ? ` en ${companyName(w, careerId)}` : ''}`, c.icon);
}

/** Despido (por faltas, por no hacer su trabajo, por un ERE, por portarse mal...). `pay`: la indemnización. */
export function fire(w: World, a: Agent, why = '', which: 'job' | 'side' = 'job', pay = 0) {
  const job = which === 'side' ? a.side : a.job;
  const c = job && CAREERS[job.career];
  if (which === 'side') a.side = undefined;
  else a.job = undefined;
  if (a.shift && (a.shift.reason === 'part') === (which === 'side')) a.shift = undefined;
  w.feel(a, 'despedido');
  if (pay > 0) money(w, w.householdOf(a), pay, 'indemnizacion');
  if (w.isPlayerMember(a)) {
    w.toast(c?.business ? `El negocio de ${a.name} ha tenido que cerrar` : `¡Han despedido a ${a.name}${why ? ` por ${why}` : ''}!${pay > 0 ? ` Indemnización: §${pay}.` : ''} Toca buscar otro trabajo`, '📦', a.id);
  }
  w.addNews(c?.business ? `ha cerrado el bar de ${a.name}` : `han despedido a ${a.name}${why ? ` por ${why}` : ''}`, [a.id]);
}

/** A veces, al empezar la jornada, surge algo que hay que decidir. */
export function maybeDilemma(w: World, a: Agent) {
  if (!w.wishesEnabled || !w.isPlayerMember(a) || w.state.dilemma || !a.job || CAREERS[a.job.career]?.school) return;
  if (Math.random() > w.dilemmaChance) return;
  const pool = DILEMMAS.filter((d) => !d.careers || d.careers.includes(a.job!.career));
  const d = pool[Math.floor(Math.random() * pool.length)];
  w.state.dilemma = { id: d.id, agentId: a.id, until: a.travel?.arrive ?? w.state.minutes + 240 };
}

/** El jugador elige una opción del dilema (o se elige la última si no contesta a tiempo). */
/** ¿Puede elegir esa opción? (las que piden habilidad o rasgo, solo quien lo tiene). */
export function canChoose(w: World, a: Agent, opt: DilemmaOption): boolean {
  const n = opt.needs;
  if (!n) return true;
  if (n.skill && skillLevel(w, a, n.skill[0]) < n.skill[1]) return false;
  if (n.trait && !hasTrait(a, n.trait)) return false;
  return true;
}

export function resolveDilemma(w: World, index: number) {
  const dl = w.state.dilemma;
  if (!dl) return;
  w.state.dilemma = undefined;
  const d = DILEMMA_BY_ID[dl.id];
  const a = w.agent(dl.agentId);
  let opt = d?.options[Math.max(0, Math.min(index, d.options.length - 1))];
  // Una opción que no le toca no se puede elegir: se queda con la última.
  if (d && a && opt && !canChoose(w, a, opt)) opt = d.options[d.options.length - 1];
  if (!d || !a || !opt) return;
  const res = opt.chance === undefined || Math.random() < opt.chance || !opt.fail ? opt.ok : opt.fail;
  const h = w.householdOf(a);
  if (a.job && res.perf) a.job.perf = Math.max(0, Math.min(100, a.job.perf + res.perf));
  if (h && res.money) money(w, h, res.money, 'trabajo');
  if (res.energy) a.needs.energy = clamp(a.needs.energy + res.energy);
  if (res.emotion) w.feel(a, res.emotion);
  if (res.skill && a.job) {
    const sk = CAREER_SKILL[a.job.career];
    if (sk) {
      a.skills = a.skills ?? {};
      a.skills[sk] = Math.min(MAX_SKILL, (a.skills[sk] ?? 0) + res.skill);
    }
  }
  if (res.extraHours && a.travel?.reason === 'work') a.travel.arrive += res.extraHours * 60;
  w.toast(res.text.replace('{name}', a.name), opt.icon);
}

export function quitJob(w: World, a: Agent, which: 'job' | 'side' = 'job') {
  if (which === 'side') {
    if (!a.side) return;
    a.side = undefined;
    if (a.shift?.reason === 'part') a.shift = undefined;
    w.toast(`${a.name} ha dejado el trabajo de medio tiempo`, '📦');
    return;
  }
  if (!a.job || CAREERS[a.job.career].school) return;
  a.job = undefined;
  if (a.shift?.reason === 'work') a.shift = undefined;
  w.toast(`${a.name} ha dejado el trabajo`, '📦');
}

/** A su hora, cada uno se va al trabajo o al colegio (y vuelve a casa al salir). También el de medio tiempo. */
export function checkShift(w: World, a: Agent) {
  if (a.role) return;
  if (a.job) checkOne(w, a, a.job, 'job');
  if (a.side && !a.travel && !a.shift) checkOne(w, a, a.side, 'side');
}

function checkOne(w: World, a: Agent, job: Job, which: 'job' | 'side') {
  if (job.lastShiftDay === w.day) return;
  const c = CAREERS[job.career];
  if (!c || !workDays(job).includes(w.weekday)) return;
  const m = w.state.minutes % MINUTES_PER_DAY;
  const start = c.start * 60, end = c.end * 60;
  const mine = w.isPlayerMember(a);
  const what = c.school ? 'a clase' : which === 'side' ? 'a su trabajo de medio tiempo' : 'a trabajar';
  if (mine && m >= start - 60 && m < start) {
    w.toastOnce(`${a.id}:shift:${which}`, `${a.name} entra ${what} a las ${c.start}:00${job.escort === w.day ? ' (vas con él/ella)' : ''}`, c.icon, 600);
  }
  if (m < start || m >= end) return;
  if (leaveDay(w, a, job, c)) return;
  if (job.dayOff === w.day) {
    job.lastShiftDay = w.day;
    job.perf = Math.max(0, job.perf - 2);
    if (mine) w.toast(`${a.name} tiene hoy el día libre`, '🏖️');
    return;
  }
  if (a.travel?.reason === 'trip') {
    // De vacaciones: cuenta como día libre.
    job.lastShiftDay = w.day;
    return;
  }
  const busy = a.travel || a.hidden || a.shift || a.current?.actionId === 'pass_out';
  if (busy) {
    if (m >= start + 60) {
      // Una hora tarde: ya no va.
      job.lastShiftDay = w.day;
      job.perf = Math.max(0, job.perf - 15);
      if (c.school) {
        if (mine) w.toast(`${a.name} ha faltado a clase`, '😬');
        return;
      }
      if (mine) w.toast(`${a.name} ha faltado ${what} sin avisar`, '😬', a.id);
      job.badDays = (job.badDays ?? 0) + 1;
      if (mine) strike(w, a, job, 'faltar sin avisar', (why) => fire(w, a, why, which));
      else if (job.badDays >= 3 && job.perf <= 10) fire(w, a, 'faltar', which);
    }
    return;
  }
  job.lastShiftDay = w.day;
  if (!c.school) assignTasks(w, a, job);
  const reason = c.school ? 'school' : which === 'side' ? 'part' : 'work';
  const home = w.householdOf(a)?.lotId ?? a.lotId;
  const dayStart = Math.floor(w.state.minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  if (mine && a.illness && !a.illness.treated && !c.school) w.toast(`${a.name} va ${what} con ${a.illness.id === 'resfriado' ? 'un resfriado' : 'fiebre'}. Con el parte del médico podría coger la baja`, '🤧', a.id);
  if (mine && reason !== 'school' && job.escort === w.day && startVisibleShift(w, a, job, reason, dayStart + end)) {
    maybeDilemma(w, a);
    return;
  }
  startTravel(w, a, home, true);
  a.travel = { ...a.travel!, to: home, arrive: dayStart + end, reason, mood: moodScore(a) };
  a.visitUntil = undefined;
  if (mine) w.toast(`${a.name} se va ${c.school ? 'al colegio' : which === 'side' ? `a su trabajo de tarde (${c.name.toLowerCase()})` : 'a trabajar'}`, c.icon);
  if (which === 'job') maybeDilemma(w, a);
}

/** Al volver: cansancio, sueldo, tareas y rendimiento (ascensos o notas). `visible`: ha trabajado a la vista. */
export function finishShift(w: World, a: Agent, reason: 'work' | 'school' | 'part', mood: number, visible = false) {
  const job = reason === 'part' ? a.side : a.job;
  if (!job) return;
  const c = CAREERS[job.career];
  if (!visible) {
    // Si se le ha acompañado, ya ha comido, ha ido al baño... a la vista. Si no, se resume.
    a.needs.hunger = clamp(a.needs.hunger - (reason === 'part' ? 15 : 30));
    a.needs.energy = clamp(a.needs.energy - (reason === 'school' ? 20 : reason === 'part' ? 15 : 30));
    a.needs.fun = clamp(a.needs.fun - (reason === 'part' ? 10 : 20));
    a.needs.hygiene = clamp(a.needs.hygiene - 15);
    a.needs.social = clamp(a.needs.social + 15);
    a.needs.bladder = 80;
  }
  const mine = w.isPlayerMember(a);
  const before = job.perf;
  const skillBonus = CAREER_SKILL[job.career] ? skillLevel(w, a, CAREER_SKILL[job.career]) * 0.6 : 0;
  // Ir malo a trabajar se nota.
  const sick = a.illness && !c.school ? -4 : 0;
  job.perf = Math.max(0, Math.min(100, job.perf + (mood - 45) / 4 + rand(-3, 5) + skillBonus + sick));
  if (reason === 'school') {
    if (mine && gradeLabel(before) !== gradeLabel(job.perf)) w.toast(`Notas de ${a.name}: ${gradeLabel(job.perf)}`, '📚');
    schoolDay(w, a);
    return;
  }
  // Las tareas del día (solo la familia del jugador las tiene).
  const tasks = settleTasks(w, a, job, visible, mood);
  job.perf = Math.max(0, Math.min(100, job.perf + tasks.delta));
  if (reason === 'work' && w.state.dilemma?.agentId === a.id) resolveDilemma(w, 99);
  coworkerDay(w, a);
  let pay = wage(w, c.levels[job.level - 1].pay);
  if (c.business) {
    // En el negocio propio unos días se gana mucho y otros, nada (o se pierde). Depende de la carta.
    const plan = job.bar;
    const m = BAR_MENUS[plan?.menu ?? 'normal'] ?? BAR_MENUS.normal;
    pay = Math.random() < m.bad ? -Math.round(rand(20, 60)) : Math.round(pay * m.mult * rand(1 - m.spread, 1 + m.spread) * (0.6 + Math.max(0, mood) / 125));
    if (plan?.staff) {
      // Con camarero se sirve más y se acaba menos reventado, pero hay que pagarle.
      if (pay > 0) pay = Math.round(pay * BAR_STAFF.boost);
      pay -= BAR_STAFF.wage;
      a.needs.energy = clamp(a.needs.energy + 12);
    }
  }
  const h = w.householdOf(a);
  money(w, h, pay, c.business ? 'negocio' : 'sueldo');
  // Hacienda se lleva su parte del sueldo (en el negocio propio ya está la cuota de autónomos).
  const tax = c.business ? 0 : Math.round(incomeTax(pay) * taxMult(w));
  money(w, h, -tax, 'hacienda');
  const delta = job.perf - before;
  if (delta >= 12) w.feel(a, 'buen_dia_curro');
  else if (delta <= -3) w.feel(a, 'mal_dia_curro');
  const which = reason === 'part' ? 'side' : 'job';
  job.badDays = job.perf <= 8 ? (job.badDays ?? 0) + 1 : 0;
  if (job.badDays >= 3) {
    fire(w, a, 'su bajo rendimiento', which);
    return;
  }
  // No hacer casi nada de lo que toca, con el rendimiento por los suelos: amonestación.
  if (mine && tasks.total && tasks.done / tasks.total < 0.34 && job.perf < 30) {
    if (strike(w, a, job, 'no hacer su trabajo', (why) => fire(w, a, why, which))) return;
  }
  if (job.perf >= 100 && job.level < c.levels.length && promotionVerdict(w, a, job) === 'ok') {
    job.level++;
    job.perf = 10;
    const lvl = c.levels[job.level - 1];
    w.addNews(`han ascendido a ${a.name} a ${lvl.title.toLowerCase()}`, [a.id]);
    w.feel(a, 'ascenso');
    if (mine) w.toast(`¡Ascenso! ${a.name} ahora es ${lvl.title} (§${wage(w, lvl.pay)} por jornada)`, '🎉');
  } else if (mine) {
    if (c.business && pay < 0) w.toast(`Hoy en el bar de ${a.name} no ha entrado ni el tato: −§${-pay} de gastos`, '🦗');
    else w.toast(`${a.name} vuelve del ${c.business ? 'bar' : 'trabajo'}: +§${pay - tax}${tax ? ` (Hacienda se queda §${tax})` : ''}${tasks.total ? ` · tareas: ${tasks.done}/${tasks.total}` : ''}`, '💰');
  }
  afterShift(w, a, job);
}

/** Cambiar cómo se lleva el bar (una vez por semana). Devuelve el motivo si no se puede. */
export function setBarPlan(w: World, a: Agent, patch: { menu?: BarPlan['menu']; staff?: boolean; sunday?: boolean }): string | undefined {
  const job = a.job;
  if (!job || !CAREERS[job.career]?.business) return 'No tiene bar';
  const week = w.weekIndex;
  const plan: BarPlan = job.bar ?? { menu: 'normal' };
  if (plan.week === week) return 'Esta semana ya se ha cambiado: hasta el lunes, nada';
  const next: BarPlan = { ...plan, week };
  if (patch.menu) next.menu = patch.menu;
  if (patch.sunday !== undefined) next.sunday = patch.sunday;
  if (patch.staff === true && !plan.staff) {
    const candidates = w.state.agents.filter((x) => x.kind === 'person' && !x.role && isAdult(x) && !x.job && !w.isPlayerMember(x));
    const hired = candidates[Math.floor(Math.random() * candidates.length)];
    if (!hired) return 'No hay nadie en el barrio buscando trabajo';
    next.staff = hired.name;
    w.addNews(`${hired.name} trabaja ahora de camarero/a en el bar de ${a.name}`, [hired.id, a.id]);
  } else if (patch.staff === false && plan.staff) {
    w.toast(`${plan.staff} ya no trabaja en el bar. Se ha llevado una botella de anís de recuerdo`, '🍺', a.id);
    delete next.staff;
  }
  job.bar = next;
  return undefined;
}
