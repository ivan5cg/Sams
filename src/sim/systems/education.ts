// Estudios: lo que se aprende en clase (colegio, instituto, universidad), matricularse en una carrera (con
// beca si hubo buenas notas), aprobar, graduarse y lo que da el título (profesiones que lo piden, o empezar
// más arriba en otras).
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { CAREERS } from '../../data/careers';
import { DEGREES, LEARNING, SCHOLARSHIP_GRADE } from '../../data/education';
import { MAX_SKILL } from '../../data/skills';
import { isAdult } from '../social';
import type { Agent } from '../types';
import type { World } from '../world';
import { money } from './money';

function learn(a: Agent, skill: string, amount: number) {
  a.skills = a.skills ?? {};
  a.skills[skill] = Math.min(MAX_SKILL, (a.skills[skill] ?? 0) + amount);
}

/** ¿Tiene beca? (buenas notas al acabar el instituto). */
export function hasScholarship(a: Agent): boolean {
  return (a.lastGrade ?? 0) >= SCHOLARSHIP_GRADE;
}

/** Por qué no puede matricularse en esa carrera (o nada si puede). */
export function enrollReason(w: World, a: Agent, degreeId: string): string | undefined {
  const d = DEGREES[degreeId];
  if (!d) return 'Esa carrera no existe';
  if (a.kind !== 'person' || !isAdult(a) || w.stageOf(a) === 'elder') return 'La universidad, de joven o de adulto';
  if (a.study) return `Ya estudia ${DEGREES[a.study.degree]?.label ?? 'una carrera'}`;
  if (a.degrees?.includes(degreeId)) return 'Ya tiene ese título';
  if (!hasScholarship(a) && (w.householdOf(a)?.funds ?? 0) < d.cost) return `La matrícula cuesta §${d.cost}`;
  return undefined;
}

/** Matricularse: deja el trabajo (si tenía) y empieza a ir a clase. */
export function enroll(w: World, a: Agent, degreeId: string): string | undefined {
  const why = enrollReason(w, a, degreeId);
  if (why) return why;
  const d = DEGREES[degreeId];
  const beca = hasScholarship(a);
  if (!beca) money(w, w.householdOf(a), -d.cost, 'cursos');
  const quit = a.job && !CAREERS[a.job.career]?.school ? CAREERS[a.job.career].name : '';
  a.job = { career: 'uni', level: 1, perf: 50 };
  a.study = { degree: degreeId, progress: 0 };
  if (w.isPlayerMember(a)) w.toast(`¡${a.name} empieza ${d.label} en la universidad!${beca ? ' Con beca: la matrícula, gratis' : ` (matrícula: −§${d.cost})`}${quit ? `. Deja el trabajo de ${quit.toLowerCase()}` : ''}`, d.icon, a.id);
  return undefined;
}

/** Al volver de clase: lo aprendido, y en la universidad, el avance (y la graduación). */
export function schoolDay(w: World, a: Agent) {
  const job = a.job;
  if (!job) return;
  if (job.career === 'school') {
    const st = w.stageOf(a) as 'child' | 'teen';
    learn(a, 'idiomas', LEARNING.school[st] ?? 0.15);
    return;
  }
  if (job.career !== 'uni' || !a.study) return;
  const d = DEGREES[a.study.degree];
  if (!d) return;
  learn(a, d.skill, LEARNING.uniSkill * (0.5 + job.perf / 100));
  learn(a, 'idiomas', LEARNING.uniLanguages);
  // Con buenas notas se avanza más deprisa; con malas, se repiten asignaturas.
  a.study.progress += 0.4 + job.perf / 80;
  if (a.study.progress >= d.days) graduate(w, a);
}

/** ¡Título! Ya puede trabajar de lo suyo. */
export function graduate(w: World, a: Agent) {
  const d = a.study && DEGREES[a.study.degree];
  if (!d) return;
  a.degrees = [...(a.degrees ?? []), d.id];
  a.study = undefined;
  a.job = undefined;
  w.feel(a, 'graduado', d.label);
  if (w.isPlayerMember(a)) w.toast(`¡${a.name} se ha graduado en ${d.label}! Ya puede trabajar de ${CAREERS[d.career].name.toLowerCase()} (ordenador → Buscar trabajo)`, '🎓', a.id);
  w.addNews(`${a.name} ha terminado la carrera de ${d.label}`, [a.id]);
}

/** ¿Le falta la carrera para ese trabajo? */
export function degreeReason(a: Agent, careerId: string): string | undefined {
  const c = CAREERS[careerId];
  if (!c?.degree || a.degrees?.includes(c.degree)) return undefined;
  return `Hace falta la carrera de ${DEGREES[c.degree].label}`;
}

/** Nivel con el que empieza en una profesión (más arriba con la carrera que toca). */
export function startLevel(a: Agent, careerId: string): number {
  const d = Object.values(DEGREES).find((x) => x.career === careerId && x.startLevel && a.degrees?.includes(x.id));
  return d?.startLevel ?? 1;
}

/** Estudiar en casa o en la biblioteca: sube las notas (y lo de la carrera). */
export function studyAtHome(w: World, a: Agent) {
  const job = a.job;
  if (!job || !CAREERS[job.career]?.school) return;
  job.perf = Math.min(100, job.perf + 6);
  const d = a.study && DEGREES[a.study.degree];
  if (d) learn(a, d.skill, 0.2);
  else learn(a, 'idiomas', 0.05);
  if (w.isPlayerMember(a)) w.toast(`${a.name} ha estudiado para los exámenes: las notas suben`, '📖', a.id);
}
