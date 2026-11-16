// Trabajo y colegio: turnos, sueldos, ascensos, despidos y dilemas.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { CAREERS, gradeLabel } from '../../data/careers';
import { DILEMMAS, DILEMMA_BY_ID } from '../../data/dilemmas';
import { CAREER_SKILL, MAX_SKILL } from '../../data/skills';
import { MINUTES_PER_DAY } from '../constants';
import { isAdult } from '../social';
import type { Agent } from '../types';
import { clamp, moodScore, rand } from '../util';
import type { World } from '../world';
import { skillLevel } from './skills';
import { startTravel } from './travel';

export function setJob(w: World, a: Agent, careerId: string) {
  const c = CAREERS[careerId];
  if (!c || c.school || !isAdult(a)) return;
  const h = w.householdOf(a);
  if (c.startup) {
    if (!h || h.funds < c.startup) {
      w.toast(`Montar el negocio cuesta §${c.startup}: no hay dinero suficiente`, '💸');
      return;
    }
    h.funds -= c.startup;
    a.job = { career: careerId, level: 1, perf: 0 };
    w.feel(a, 'jefe_propio');
    w.toast(`¡${a.name} monta su propio negocio: ${c.levels[0].title}! (−§${c.startup}). Ojo: cada lunes, cuota de autónomos`, c.icon);
    w.addNews(`${a.name} ha abierto un bar en el barrio. Dicen que las bravas pican de verdad`, [a.id]);
    return;
  }
  a.job = { career: careerId, level: 1, perf: 0 };
  w.toast(`¡${a.name} tiene trabajo! ${c.levels[0].title} (§${c.levels[0].pay} por jornada)`, c.icon);
}

/** Despido: tres jornadas seguidas rindiendo fatal. */
export function fire(w: World, a: Agent) {
  const c = a.job && CAREERS[a.job.career];
  a.job = undefined;
  w.feel(a, 'despedido');
  if (w.isPlayerMember(a)) w.toast(c?.business ? `El negocio de ${a.name} ha tenido que cerrar` : `¡Han despedido a ${a.name}! Toca buscar otro trabajo`, '📦');
  w.addNews(c?.business ? `ha cerrado el bar de ${a.name}` : `han despedido a ${a.name}`, [a.id]);
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
export function resolveDilemma(w: World, index: number) {
  const dl = w.state.dilemma;
  if (!dl) return;
  w.state.dilemma = undefined;
  const d = DILEMMA_BY_ID[dl.id];
  const a = w.agent(dl.agentId);
  const opt = d?.options[Math.max(0, Math.min(index, d.options.length - 1))];
  if (!d || !a || !opt) return;
  const res = opt.chance === undefined || Math.random() < opt.chance || !opt.fail ? opt.ok : opt.fail;
  const h = w.householdOf(a);
  if (a.job && res.perf) a.job.perf = Math.max(0, Math.min(100, a.job.perf + res.perf));
  if (h && res.money) h.funds += res.money;
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

export function quitJob(w: World, a: Agent) {
  if (!a.job || CAREERS[a.job.career].school) return;
  a.job = undefined;
  w.toast(`${a.name} ha dejado el trabajo`, '📦');
}

/** A su hora, cada uno se va al trabajo o al colegio (y vuelve a casa al salir). */
export function checkShift(w: World, a: Agent) {
  const job = a.job;
  if (!job || job.lastShiftDay === w.day) return;
  const c = CAREERS[job.career];
  if (!c || !c.days.includes(w.weekday)) return;
  const m = w.state.minutes % MINUTES_PER_DAY;
  const start = c.start * 60, end = c.end * 60;
  const mine = w.isPlayerMember(a);
  if (mine && m >= start - 60 && m < start) {
    w.toastOnce(`${a.id}:shift`, `${a.name} entra ${c.school ? 'a clase' : 'a trabajar'} a las ${c.start}:00`, c.icon, 600);
  }
  if (m < start || m >= end) return;
  if (job.dayOff === w.day) {
    job.lastShiftDay = w.day;
    job.perf = Math.max(0, job.perf - 2);
    if (mine) w.toast(`${a.name} tiene hoy el día libre`, '🏖️');
    return;
  }
  const busy = a.travel || a.hidden || a.current?.actionId === 'pass_out';
  if (busy) {
    if (m >= start + 60) {
      // Una hora tarde: ya no va.
      job.lastShiftDay = w.day;
      job.perf = Math.max(0, job.perf - 15);
      if (mine) w.toast(`${a.name} ha faltado ${c.school ? 'a clase' : 'al trabajo'}`, '😬');
      if (!c.school) {
        job.badDays = (job.badDays ?? 0) + 1;
        if (job.badDays >= 3 && job.perf <= 10) fire(w, a);
      }
    }
    return;
  }
  job.lastShiftDay = w.day;
  const home = w.householdOf(a)?.lotId ?? a.lotId;
  const dayStart = Math.floor(w.state.minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  startTravel(w, a, home, true);
  a.travel = { ...a.travel!, to: home, arrive: dayStart + end, reason: c.school ? 'school' : 'work', mood: moodScore(a) };
  a.visitUntil = undefined;
  if (mine) w.toast(`${a.name} se va ${c.school ? 'al colegio' : 'a trabajar'}`, c.icon);
  maybeDilemma(w, a);
}

/** Al volver: cansancio, sueldo y rendimiento (ascensos o notas). */
export function finishShift(w: World, a: Agent, reason: 'work' | 'school', mood: number) {
  const job = a.job;
  if (!job) return;
  const c = CAREERS[job.career];
  a.needs.hunger = clamp(a.needs.hunger - 30);
  a.needs.energy = clamp(a.needs.energy - (reason === 'school' ? 20 : 30));
  a.needs.fun = clamp(a.needs.fun - 20);
  a.needs.hygiene = clamp(a.needs.hygiene - 15);
  a.needs.social = clamp(a.needs.social + 15);
  a.needs.bladder = 80;
  const mine = w.isPlayerMember(a);
  const before = job.perf;
  const skillBonus = CAREER_SKILL[job.career] ? skillLevel(w, a, CAREER_SKILL[job.career]) * 0.6 : 0;
  job.perf = Math.max(0, Math.min(100, job.perf + (mood - 45) / 4 + rand(-3, 5) + skillBonus));
  if (reason === 'school') {
    if (mine && gradeLabel(before) !== gradeLabel(job.perf)) w.toast(`Notas de ${a.name}: ${gradeLabel(job.perf)}`, '📚');
    return;
  }
  if (w.state.dilemma?.agentId === a.id) resolveDilemma(w, 99);
  let pay = c.levels[job.level - 1].pay;
  if (c.business) {
    // En el negocio propio unos días se gana mucho y otros, nada (o se pierde).
    pay = Math.random() < 0.12 ? -Math.round(rand(20, 60)) : Math.round(pay * rand(0.3, 1.7) * (0.6 + Math.max(0, mood) / 125));
  }
  const h = w.householdOf(a);
  if (h) h.funds += pay;
  const delta = job.perf - before;
  if (delta >= 12) w.feel(a, 'buen_dia_curro');
  else if (delta <= -3) w.feel(a, 'mal_dia_curro');
  job.badDays = job.perf <= 8 ? (job.badDays ?? 0) + 1 : 0;
  if (job.badDays >= 3) {
    fire(w, a);
    return;
  }
  if (job.perf >= 100 && job.level < c.levels.length) {
    job.level++;
    job.perf = 10;
    const lvl = c.levels[job.level - 1];
    w.addNews(`han ascendido a ${a.name} a ${lvl.title.toLowerCase()}`, [a.id]);
    w.feel(a, 'ascenso');
    if (mine) w.toast(`¡Ascenso! ${a.name} ahora es ${lvl.title} (§${lvl.pay} por jornada)`, '🎉');
  } else if (mine) {
    if (c.business && pay < 0) w.toast(`Hoy en el bar de ${a.name} no ha entrado ni el tato: −§${-pay} de gastos`, '🦗');
    else w.toast(`${a.name} vuelve del ${c.business ? 'bar' : 'trabajo'}: +§${pay}`, '💰');
  }
}
