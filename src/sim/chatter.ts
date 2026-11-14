// Charlas que dependen de lo que pasa: el día de la semana, la hora, el trabajo, las mascotas,
// el dinero, las noticias del barrio... y la forma de ser de cada uno.

import { CAREERS, gradeLabel } from '../data/careers';
import { ACTION_LINES, CUNADO_LINES, CUNADO_NEWS_REPLIES, NEWS_REPLIES } from '../data/dialogue';
import { SKILL_BY_ID } from '../data/skills';
import { getRel } from './social';
import { hasTrait, traitsOf } from './traits';
import type { Agent } from './types';
import type { World } from './world';

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Frases que tienen sentido ahora mismo entre `a` y `t`. */
export function contextPairs(world: World, a: Agent, t: Agent): [string, string][] {
  const pairs: [string, string][] = [];
  const wd = world.weekday;
  const h = world.hour;
  const rel = getRel(world.state, a.id, t.id);

  if (wd === 0) pairs.push(['Odio los lunes...', 'Y yo. Deberían prohibirlos por ley']);
  if (wd === 4) pairs.push(['¡Por fin es viernes!', '¡Esta noche, cañas y bravas!']);
  if (wd >= 5) pairs.push(['¿Qué tal el finde?', 'Pues de vermut y siesta, como Dios manda']);
  if (h < 11) pairs.push(['Buenos días. ¿Has desayunado?', 'Un café y una tostada con tomate, lo de siempre']);
  if (h >= 14 && h < 16) pairs.push(['¿Qué hay de comer?', 'Lentejas. Si quieres las comes y si no, las dejas']);
  if (h >= 22 || h < 5) pairs.push(['¿Qué haces despierto/a a estas horas?', 'No puedo dormir. ¿Y tú?']);

  if (t.job) {
    const c = CAREERS[t.job.career];
    if (c?.school) pairs.push(['¿Qué tal en el cole?', t.job.perf >= 60 ? `Muy bien, voy de ${gradeLabel(t.job.perf).toLowerCase()}` : 'Fatal, me han puesto un examen sorpresa']);
    else if (c) pairs.push([`¿Qué tal de ${c.levels[t.job.level - 1].title.toLowerCase()}?`, t.job.perf >= 60 ? 'Genial, creo que me ascienden pronto' : 'Uf, mi jefe me tiene frito']);
  } else if (t.kind === 'person' && world.stageOf(t) !== 'elder' && world.stageOf(t) !== 'child' && world.stageOf(t) !== 'baby') {
    pairs.push(['¿Sigues buscando curro?', 'Sí, a ver si sale algo, que la cosa está muy mala']);
  }
  if (world.stageOf(t) === 'elder') pairs.push(['¿Qué tal la jubilación?', 'De maravilla: obras, petanca y siesta']);

  const pet = world.state.agents.find((x) => x.kind === 'pet' && x.householdId === a.householdId);
  if (pet) pairs.push([`¿Sabes lo que ha hecho ${pet.name} hoy?`, '¡Cuenta, cuenta!']);

  const hh = world.householdOf(a);
  if (hh && hh.funds < 300) pairs.push(['Estamos a final de mes, ¿eh?', 'Ni me lo recuerdes, que estoy tieso/a']);
  if (hh && hh.funds > 6000) pairs.push(['¿Y si nos vamos de crucero?', '¿Tú has visto lo que cuesta el aceite?']);
  if (a.needs.hunger < 40) pairs.push(['¿Picamos algo?', '¡Unas bravas no se le niegan a nadie!']);
  if (a.needs.energy < 35) pairs.push(['Estoy muerto/a de sueño', 'Pues échate una siesta, hombre']);

  const best = Object.entries(a.skills ?? {}).sort((x, y) => y[1] - x[1])[0];
  if (best && best[1] >= 3) pairs.push([`Me estoy volviendo un crack en ${SKILL_BY_ID[best[0]]?.label.toLowerCase() ?? best[0]}`, 'Ya será menos...']);

  if (rel.status) pairs.push(['Te quiero, ¿lo sabías?', 'Y yo a ti, tontorrón/a']);
  if (rel.f <= -20) pairs.push(['¿Qué miras?', 'Nada, nada...']);

  // Según dónde estén
  const layout = world.lotById(a.lotId)?.layout;
  if (layout === 'super') {
    pairs.push(['¡Hombre, vecino! ¿Tú también por aquí?', 'Aquí, a por cuatro cosas... y salgo con cuarenta']);
    pairs.push(['¿Has visto cómo ha subido el aceite?', 'Ni lo mires, que duele']);
    pairs.push(['¿Sabes dónde está el tomate frito?', 'Lo han cambiado de sitio otra vez']);
  }
  if (layout === 'acai') {
    pairs.push(['¿Has probado el bowl con mantequilla de cacahuete?', '¡Está buenísimo!']);
    pairs.push(['Esto es lo más sano que he comido en mi vida', 'Y lo más caro, también']);
    if (hasTrait(a, 'cunado')) pairs.push(['Esto del açaí es una moda, te lo digo yo', 'Pero bien que te lo estás comiendo']);
  }
  const hh2 = world.householdOf(a);
  if (hh2 && (hh2.pantry ?? 0) <= 2 && hh2.id === t.householdId) pairs.push(['La nevera está vacía', 'Pues habrá que ir al Mercadona']);

  const news = world.gossipFor(a, t);
  if (news) pairs.push([`¿Te has enterado de que ${news}?`, pick(hasTrait(t, 'cunado') ? CUNADO_NEWS_REPLIES : NEWS_REPLIES)]);

  return pairs;
}

/** Elige qué se dicen en una charla: según el contexto, su forma de ser o los clásicos. */
export function chatPair(world: World, a: Agent, t: Agent): [string, string] {
  const r = Math.random();
  if (hasTrait(a, 'cunado') && r < 0.35) return pick(CUNADO_LINES);
  const ctx = contextPairs(world, a, t);
  if (ctx.length && r < 0.7) return pick(ctx);
  return pick(ACTION_LINES.chat);
}

/** Algo que suelta por su forma de ser (o nada). */
export function traitQuip(a: Agent): string | undefined {
  const ts = traitsOf(a);
  if (!ts.length) return undefined;
  return pick(pick(ts).quips);
}
