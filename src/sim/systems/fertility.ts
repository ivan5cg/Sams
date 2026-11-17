// El ciclo menstrual y los embarazos. Las mujeres de adolescentes a adultas (las mayores, ya no) tienen un
// ciclo de 28 días: regla (con su dolor y su mantita), días tranquilos, ovulación (radiantes, y más
// fértiles) y los días de antes de la regla (más sensibles). El ñiqui ñiqui entre una mujer y un hombre
// puede acabar en embarazo, más o menos probable según el día del ciclo; se sabe al día siguiente.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { MINUTES_PER_DAY } from '../constants';
import { addSecret } from '../gossip';
import { getRel } from '../social';
import type { Agent, Household } from '../types';
import type { World } from '../world';

export const CYCLE_DAYS = 28;
/** Lo que dura un embarazo (en este juego todo va rápido: lo mismo que «buscar un bebé»). */
export const PREGNANCY_DAYS = 3;

export type CyclePhase = 'regla' | 'folicular' | 'ovulacion' | 'lutea' | 'premenstrual';

export const PHASE_INFO: Record<CyclePhase, { icon: string; label: string }> = {
  regla: { icon: '🩸', label: 'Con la regla' },
  folicular: { icon: '🌱', label: 'Días tranquilos' },
  ovulacion: { icon: '🌸', label: 'Ovulando' },
  lutea: { icon: '🌙', label: 'Segunda mitad del ciclo' },
  premenstrual: { icon: '🌧️', label: 'Antes de la regla' },
};

/** Probabilidad de quedarse embarazada en un ñiqui ñiqui, según el día del ciclo. */
export const FERTILITY: Record<CyclePhase, number> = { regla: 0.01, folicular: 0.06, ovulacion: 0.35, lutea: 0.03, premenstrual: 0.02 };

/** ¿Está embarazada? */
export function isPregnant(w: World, a: Agent): boolean {
  return w.householdOf(a)?.expecting?.mother === a.id;
}

/** ¿Tiene ciclo ahora? (mujer, de adolescente a adulta, y sin estar embarazada). */
export function hasCycle(w: World, a: Agent): boolean {
  if (a.kind !== 'person' || a.sex !== 'f') return false;
  const st = w.stageOf(a);
  return (st === 'teen' || st === 'young' || st === 'adult') && !isPregnant(w, a);
}

/** Día del ciclo (0 = primer día de regla). Si aún no tenía ciclo apuntado, empieza en un día al azar. */
export function cycleDay(w: World, a: Agent): number {
  if (a.cycle === undefined) a.cycle = w.day - Math.floor(Math.random() * CYCLE_DAYS);
  return (((w.day - a.cycle) % CYCLE_DAYS) + CYCLE_DAYS) % CYCLE_DAYS;
}

export function phaseOf(day: number): CyclePhase {
  if (day < 5) return 'regla';
  if (day < 12) return 'folicular';
  if (day < 15) return 'ovulacion';
  if (day < 23) return 'lutea';
  return 'premenstrual';
}

/** Fase del ciclo de alguien (o nada si no tiene ciclo). */
export function phase(w: World, a: Agent): CyclePhase | null {
  return hasCycle(w, a) ? phaseOf(cycleDay(w, a)) : null;
}

/** Cada mañana: cómo se encuentra cada una según el ciclo, y cómo va cada embarazo. */
export function dailyCycle(w: World) {
  for (const a of w.state.agents) {
    if (!hasCycle(w, a)) continue;
    const day = cycleDay(w, a);
    const p = phaseOf(day);
    const mine = w.isPlayerMember(a);
    if (p === 'regla') {
      // Los dos primeros días, los peores.
      w.feel(a, day < 2 ? 'dolor_regla' : 'regla', undefined, 24);
      if (day < 2) a.needs.energy = Math.max(0, a.needs.energy - 8);
      if (day === 0 && mine) w.toast(`A ${a.name} le ha bajado la regla: mantita, ibuprofeno y chocolate`, '🩸', a.id);
    } else if (p === 'ovulacion') {
      w.feel(a, 'radiante', undefined, 24);
    } else if (p === 'premenstrual') {
      w.feel(a, 'sensible', undefined, 24);
    }
  }
  for (const h of w.state.households) pregnancyDay(w, h);
}

/** Síntomas del embarazo y la noticia (al día siguiente de quedarse). */
function pregnancyDay(w: World, h: Household) {
  const e = h.expecting;
  const mother = e?.mother ? w.agent(e.mother) : undefined;
  if (!e || !mother) return;
  const mine = h.id === w.household.id;
  if (!e.known) {
    e.known = true;
    const father = e.parents.map((id) => w.agent(id)).find((x) => x && x !== mother);
    w.feel(mother, 'embarazada');
    if (mine) w.toast(`¡${mother.name} está embarazada${father ? ` de ${father.name}` : ''}! El bebé llegará en unos ${PREGNANCY_DAYS - 1} días`, '🤰', mother.id);
    if (father && getRel(w.state, mother.id, father.id).affair) {
      addSecret(w.state, { kind: 'lio', text: `${mother.name} está embarazada... y el padre es ${father.name}, su amante`, about: [mother.id, father.id], known: [mother.id, father.id], juicy: 3, day: w.day });
    }
    w.addNews(`${mother.name} está embarazada`, [mother.id]);
    return;
  }
  // Náuseas por la mañana y antojos.
  w.feel(mother, 'antojos', undefined, 24);
  if (Math.random() < 0.4 && !mother.travel) {
    mother.needs.hunger = Math.max(0, mother.needs.hunger - 10);
    if (mine) w.toast(`Náuseas matutinas: ${mother.name} se ha levantado con el estómago revuelto`, '🤢', mother.id);
  }
}

/** Tras un ñiqui ñiqui: ¿embarazo? Solo entre una mujer (joven o adulta) y un hombre, y sin otro bebé en camino. */
export function maybeConceive(w: World, a: Agent, b: Agent): boolean {
  const pair = [a, b];
  const mother = pair.find((x) => x.sex === 'f');
  const father = pair.find((x) => x.sex === 'm');
  if (!mother || !father) return false;
  if (!['young', 'adult'].includes(w.stageOf(mother)) || ['baby', 'child'].includes(w.stageOf(father))) return false;
  const h = w.householdOf(mother);
  if (!h || h.expecting || h.okupa) return false;
  const p = phase(w, mother);
  if (!p || Math.random() >= FERTILITY[p]) return false;
  h.expecting = { parents: [mother.id, father.id], due: w.state.minutes + PREGNANCY_DAYS * MINUTES_PER_DAY, mother: mother.id, known: false };
  return true;
}

/** Tras dar a luz, el ciclo vuelve un tiempo después. */
export function afterBirth(w: World, mother: Agent | undefined) {
  if (mother) mother.cycle = w.day + 10;
}
