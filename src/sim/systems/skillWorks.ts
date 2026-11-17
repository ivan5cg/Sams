// Lo que se puede hacer con cada nivel de habilidad: acciones que se desbloquean (y que, si dan dinero, se
// hacen una vez al día), libros de habilidad (en casa los que compréis; en la biblioteca, todos), recetas de
// cocina y de repostería, y lo que sale de cada encargo.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import type { ActionDef } from '../../data/actions';
import { CAREERS } from '../../data/careers';
import { OBJECTS } from '../../data/objects';
import { BOOK_RATE, BOOKS, RECIPE_BY_ID, RECIPES, type BookDef, type Recipe } from '../../data/skillTree';
import { SKILL_BY_ID } from '../../data/skills';
import { LIBRARY_LOT } from '../neighborhood';
import { attend } from '../relations';
import { getRel, isAdult, setRel } from '../social';
import { hasTrait } from '../traits';
import type { Agent, PlacedObject, Task } from '../types';
import { clamp } from '../util';
import type { World } from '../world';
import { money } from './money';
import { pantryOwner } from './shopping';
import { practice, skillLevel } from './skills';

/** Días entre una petición de aumento y la siguiente. */
export const RAISE_EVERY = 7;

// --- Desbloqueos y encargos del día ---

/** ¿Aún no tiene el nivel para esto? (entonces ni aparece). */
export function skillLocked(w: World, a: Agent, def: ActionDef): boolean {
  return !!def.requires && skillLevel(w, a, def.requires.skill) < def.requires.level;
}

/** Los encargos que dan dinero, una vez al día. */
export function dailyReason(w: World, a: Agent, def: ActionDef): string | undefined {
  if (def.id === 'ask_raise') return (a.done?.ask_raise ?? -Infinity) > w.day - RAISE_EVERY ? 'Ya lo pidió hace poco: mejor esperar unos días' : undefined;
  return def.daily && a.done?.[def.id] === w.day ? 'Hoy ya lo ha hecho' : undefined;
}

function markDone(w: World, a: Agent, actionId: string) {
  a.done = { ...(a.done ?? {}), [actionId]: w.day };
}

// --- Libros ---

/** Libros de habilidad que hay en esa parcela: todos en la biblioteca; en una casa, los suyos. */
export function booksAt(w: World, lotId: string): BookDef[] {
  if (lotId === LIBRARY_LOT) return Object.values(BOOKS);
  const h = w.state.households.find((x) => x.lotId === lotId);
  return (h?.books ?? []).map((id) => BOOKS[id]).filter(Boolean);
}

/** Por qué no puede estudiar ese libro (o nada si puede). */
export function bookReason(w: World, a: Agent, bookId: string, lotId = a.lotId): string | undefined {
  const b = BOOKS[bookId];
  if (!b || !booksAt(w, lotId).includes(b)) return 'Ese libro no lo tenéis aquí';
  const lvl = skillLevel(w, a, b.skill);
  if (lvl < b.from) return `Aún no lo entiende: hace falta ${SKILL_BY_ID[b.skill].label.toLowerCase()} ${b.from}`;
  if (lvl >= b.upTo) return 'Ya se lo sabe: ahora toca practicar';
  return undefined;
}

/** El libro que coge por su cuenta: de lo que menos sabe, entre lo que entiende. */
export function pickBook(w: World, a: Agent, lotId = a.lotId): BookDef | undefined {
  return booksAt(w, lotId)
    .filter((b) => !bookReason(w, a, b.id, lotId))
    .sort((x, y) => (a.skills?.[x.skill] ?? 0) - (a.skills?.[y.skill] ?? 0) || y.tier - x.tier)[0];
}

export function buyBookReason(w: World, a: Agent, bookId: string): string | undefined {
  const b = BOOKS[bookId];
  const h = w.householdOf(a);
  if (!b || !h) return 'Ese libro no existe';
  if (h.books?.includes(bookId)) return 'Ya lo tenéis en la estantería';
  if (h.funds < b.price) return `Cuesta §${b.price}`;
  return undefined;
}

/** Comprar un libro de habilidad por internet: llega a la estantería de casa. */
export function buyBook(w: World, a: Agent, bookId: string): string | undefined {
  const why = buyBookReason(w, a, bookId);
  if (why) return why;
  const b = BOOKS[bookId];
  const h = w.householdOf(a)!;
  money(w, h, -b.price, 'libros');
  h.books = [...(h.books ?? []), bookId];
  if (w.isPlayerMember(a)) w.toast(`Ha llegado «${b.title}» (${SKILL_BY_ID[b.skill].label.toLowerCase()}, hasta el nivel ${b.upTo}). Ya está en la estantería`, '📚', a.id);
  return undefined;
}

// --- Recetas ---

/** Por qué no puede hacer esa receta ahora (nivel o despensa). */
export function recipeReason(w: World, a: Agent, r: Recipe, lotId = a.lotId): string | undefined {
  if (skillLevel(w, a, r.skill) < r.level) return `Hace falta ${SKILL_BY_ID[r.skill].label.toLowerCase()} ${r.level}`;
  const owner = pantryOwner(w, lotId);
  if (owner && (owner.pantry ?? 0) < r.portions) return `Hacen falta ${r.portions} raciones en la nevera`;
  return undefined;
}

/** Lo mejor que sabe hacer con lo que hay en la nevera. */
export function bestRecipe(w: World, a: Agent, skill: Recipe['skill'], lotId = a.lotId): Recipe {
  const ok = RECIPES.filter((r) => r.skill === skill && !recipeReason(w, a, r, lotId));
  return ok[ok.length - 1] ?? RECIPES.find((r) => r.skill === skill && r.level === 0)!;
}

/** Sale el plato: quien cocina y los que están en casa comen, y si se vende, se cobra. */
function serve(w: World, a: Agent, actionId: string, param: string | undefined, lotId: string) {
  const skill = actionId === 'bake' ? 'reposteria' : 'cocina';
  // La receta elegida (con la ración de empezar ya cogida, por eso se comprueba con una más).
  const chosen = param ? RECIPE_BY_ID[param] : undefined;
  const owner = pantryOwner(w, lotId);
  if (owner) owner.pantry = (owner.pantry ?? 0) + 1;
  const r = chosen && chosen.skill === skill && !recipeReason(w, a, chosen, lotId) ? chosen : bestRecipe(w, a, skill, lotId);
  if (owner) owner.pantry = Math.max(0, (owner.pantry ?? 0) - r.portions);
  const lvl = skillLevel(w, a, skill);
  const diners = w.agentsIn(lotId).filter((o) => o !== a && o.kind === 'person' && !o.travel && !o.hidden && w.stageOf(o) !== 'baby' && o.householdId === a.householdId);
  for (const d of diners) {
    d.needs.hunger = clamp(d.needs.hunger + r.family);
    d.needs.fun = clamp(d.needs.fun + r.fun);
    if (r.emotion) w.feel(d, r.emotion === 'orgulloso' ? 'bien_comido' : r.emotion, a.name);
    if (r.family > 0) attend(w, a, d);
  }
  a.needs.fun = clamp(a.needs.fun + r.fun);
  if (r.emotion) w.feel(a, r.emotion, r.label.toLowerCase());
  const mine = w.isPlayerMember(a);
  if (r.sell) {
    const price = r.sell + 15 * lvl;
    money(w, w.householdOf(a), price, 'ventas');
    if (mine) w.toast(`${a.name} ha hecho ${r.label.toLowerCase()}${r.id === 'tarta_boda' ? ' para una boda del barrio' : ' y las ha vendido a los vecinos'}: +§${price}`, r.icon, a.id);
  } else if (mine && r.level > 0) w.toast(`${a.name} ha preparado ${r.label.toLowerCase()}${diners.length && r.family ? '. ¡A la mesa!' : ''}`, r.icon, a.id);
}

// --- Lo que sale de cada cosa ---

const SONGS = ['Lavapiés de mis amores', 'Me dejaste en el metro', 'Rumba del casero', 'Chotis para un ex', 'La del Mercadona'];
const CHAPUZAS = ['le ha arreglado el grifo a la del cuarto', 'ha colgado unas estanterías en el segundo', 'ha cambiado un enchufe en el bajo', 'ha montado un armario de los suecos'];
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Cobrar un encargo (y dejarlo apuntado como hecho hoy). */
function earn(w: World, a: Agent, amount: number, cat: string, text: string, icon: string) {
  money(w, w.householdOf(a), amount, cat);
  if (w.isPlayerMember(a)) w.toast(`${text}: +§${amount}`, icon, a.id);
}

/** Al terminar una acción de habilidad. */
export function skillTask(w: World, a: Agent, task: Task, o: PlacedObject | undefined) {
  const id = task.actionId;
  const lvl = (s: string) => skillLevel(w, a, s);
  const mine = w.isPlayerMember(a);
  if (id === 'cook' || id === 'bake') serve(w, a, id, task.param, o?.lotId ?? a.lotId);
  if (id === 'buy_book' && task.param) {
    const why = buyBook(w, a, task.param);
    if (why && mine) w.toast(`${a.name}: ${why}`, '📚');
  }
  switch (id) {
    case 'catering':
      earn(w, a, 120 + 20 * lvl('cocina'), 'encargos', `${a.name} ha cocinado para la comunión del nieto de la del quinto`, '🍱');
      break;
    case 'odd_jobs':
      earn(w, a, 25 + 10 * lvl('manitas'), 'encargos', `${a.name} ${pick(CHAPUZAS)}`, '🔨');
      break;
    case 'make_furniture':
      earn(w, a, 120 + 25 * lvl('manitas'), 'ventas', `${a.name} ha fabricado una mesita y la ha vendido por Wallapop`, '🪑');
      break;
    case 'upgrade':
      if (o) {
        o.q = Math.min(3, (o.q ?? 2) + 1) as 1 | 2 | 3;
        if (mine) w.toast(`${a.name} ha mejorado ${OBJECTS[o.def].name.toLowerCase()}: ahora es ${o.q === 3 ? 'de lujo' : 'normal'}`, '🛠️', a.id);
      }
      break;
    case 'compose': {
      const song = pick(SONGS);
      w.feel(a, 'inspirado');
      earn(w, a, 40 + 20 * lvl('musica'), 'ventas', `${a.name} ha compuesto «${song}» y ya suena en las plataformas`, '🎼');
      if (lvl('musica') >= 8) w.addNews(`la canción «${song}», de ${a.name}, suena en todos los bares`, [a.id]);
      break;
    }
    case 'piano_family':
    case 'concert': {
      const skill = id === 'concert' ? 'musica' : 'piano';
      const boost = 6 + 2 * lvl(skill);
      for (const x of w.agentsIn(a.lotId)) {
        if (x === a || x.kind !== 'person' || x.travel || x.hidden) continue;
        x.needs.fun = clamp(x.needs.fun + boost);
        w.feel(x, 'recital', a.name);
        const r = getRel(w.state, a.id, x.id);
        setRel(w.state, a.id, x.id, { ...r, f: Math.min(100, r.f + 2) });
      }
      if (id === 'concert') {
        earn(w, a, 100 + 25 * lvl('musica'), 'propinas', `${a.name} ha llenado el bar: concierto con bises`, '🎸');
        w.addNews(`${a.name} dio anoche un concierto en el bar. Hubo que poner sillas`, [a.id]);
      } else if (mine) w.toast(`${a.name} ha tocado el piano para todos. Aplausos`, '🎶', a.id);
      break;
    }
    case 'piano_lessons':
      earn(w, a, 40 + 10 * lvl('piano'), 'encargos', `${a.name} ha dado clase de piano a un niño del barrio`, '🎹');
      break;
    case 'chess_tournament': {
      const win = Math.random() < Math.min(0.85, 0.1 + 0.07 * lvl('ajedrez'));
      if (win) {
        w.feel(a, 'orgulloso');
        earn(w, a, 60 + 25 * lvl('ajedrez'), 'premios', `¡${a.name} ha ganado el torneo de ajedrez!`, '🏆');
        w.addNews(`${a.name} ha ganado el torneo de ajedrez del barrio`, [a.id]);
      } else if (mine) w.toast(`${a.name} ha quedado a mitad de tabla en el torneo. El año que viene`, '♟️', a.id);
      break;
    }
    case 'chess_lessons':
      earn(w, a, 30 + 8 * lvl('ajedrez'), 'encargos', `${a.name} ha dado clase de ajedrez en el centro cultural`, '♟️');
      break;
    case 'freelance_web':
      earn(w, a, 60 + 15 * lvl('programacion'), 'encargos', `${a.name} ha hecho la web de la peluquería de la esquina`, '🌐');
      break;
    case 'make_game': {
      const hit = Math.random() < Math.min(0.8, 0.12 + 0.07 * lvl('programacion'));
      if (hit) {
        w.feel(a, 'orgulloso');
        earn(w, a, 400 + 120 * lvl('programacion'), 'ventas', `¡El videojuego de ${a.name} es un éxito: miles de descargas!`, '🕹️');
        w.addNews(`el videojuego de ${a.name} lo está petando`, [a.id]);
      } else earn(w, a, 30, 'ventas', `${a.name} ha publicado su videojuego... y lo han descargado su madre y tres amigos`, '🕹️');
      break;
    }
    case 'stocks': {
      const back = Math.round(100 * (0.55 + Math.random() * 0.7 + 0.05 * lvl('logica')));
      money(w, w.householdOf(a), back, 'bolsa');
      if (mine) w.toast(back >= 100 ? `${a.name} ha acertado en bolsa: los §100 son ahora §${back}` : `${a.name} ha perdido en bolsa: de los §100 quedan §${back}`, back >= 100 ? '📈' : '📉', a.id);
      break;
    }
    case 'ask_raise':
      if (a.job && !CAREERS[a.job.career]?.school) {
        const c = CAREERS[a.job.career];
        const yes = Math.random() < Math.min(0.85, 0.15 + 0.07 * lvl('carisma') + a.job.perf / 400);
        if (yes && a.job.level < c.levels.length) {
          a.job.level++;
          a.job.perf = 10;
          w.feel(a, 'ascenso');
          if (mine) w.toast(`¡Con mucha labia, ${a.name} ha conseguido que le suban a ${c.levels[a.job.level - 1].title.toLowerCase()}!`, '💶', a.id);
        } else if (yes) {
          a.job.perf = Math.min(100, a.job.perf + 20);
          if (mine) w.toast(`El jefe le da la razón a ${a.name}: más arriba no hay, pero le valora más`, '💶', a.id);
        } else {
          a.job.perf = Math.max(0, a.job.perf - 5);
          w.feel(a, 'estresado');
          if (mine) w.toast(`El jefe le ha dicho a ${a.name} que «ahora no es buen momento»`, '😬', a.id);
        }
      }
      break;
    case 'exhibit':
      w.feel(a, 'orgulloso');
      earn(w, a, 150 + 30 * lvl('arte'), 'ventas', `${a.name} ha expuesto en una galería de Malasaña y ha vendido varios cuadros`, '🖼️');
      w.addNews(`${a.name} expone sus cuadros en Malasaña`, [a.id]);
      break;
    case 'personal_trainer':
      earn(w, a, 40 + 10 * lvl('forma'), 'encargos', `${a.name} ha machacado a un cliente en el gimnasio`, '🏋️');
      break;
    case 'sing_wedding':
      earn(w, a, 80 + 15 * lvl('canto'), 'encargos', `${a.name} ha cantado en una boda: no quedó un ojo seco`, '💒');
      break;
    case 'half_marathon':
      w.feel(a, 'orgulloso');
      if (Math.random() < 0.05 * lvl('forma')) earn(w, a, 50 + 20 * lvl('forma'), 'premios', `¡${a.name} ha quedado en el podio de la media maratón!`, '🏅');
      else if (mine) w.toast(`${a.name} ha terminado la media maratón. Le tiemblan las piernas, pero qué orgullo`, '🏅', a.id);
      break;
    case 'serenade': {
      const t = w.agent(task.targetAgentId);
      if (t) {
        w.feel(t, hasTrait(t, 'grunon') && Math.random() < 0.4 ? 'verguenza' : 'serenata', a.name);
        if (mine) w.toast(`${a.name} le ha cantado una serenata a ${t.name}. Los vecinos, asomados al balcón`, '🌹', a.id);
      }
      break;
    }
    case 'portrait': {
      const t = w.agent(task.targetAgentId);
      if (t) {
        w.feel(t, 'retratado', a.name);
        if (mine) w.toast(`${a.name} le ha pintado un retrato a ${t.name}. Se lo cuelga en el salón`, '🖌️', a.id);
      }
      break;
    }
  }
}

/** Al terminar cualquier acción con `daily`: se apunta. */
export function noteDaily(w: World, a: Agent, def: ActionDef) {
  if (def.daily || def.id === 'ask_raise') markDone(w, a, def.id);
}

/** Comprobaciones propias de cada acción de habilidad (además del nivel y del «una vez al día»). */
export function skillCheck(w: World, a: Agent, def: ActionDef, o?: PlacedObject): { hidden?: boolean; reason?: string } | undefined {
  const id = def.id;
  if (id === 'upgrade' && o) {
    if (w.lotById(o.lotId)?.householdId !== a.householdId || w.isGuest(a)) return { hidden: true };
    if ((o.q ?? 2) >= 3) return { reason: 'Ya es de lujo' };
  }
  if (id === 'ask_raise' && (!a.job || CAREERS[a.job.career]?.school || !isAdult(a))) return { hidden: true };
  if (id === 'read_skill_book' && o) {
    if (!booksAt(w, o.lotId).length) return { reason: 'No hay libros de habilidad: se compran en el ordenador' };
    if (!pickBook(w, a, o.lotId)) return { reason: 'Ya se sabe todo lo que enseñan estos libros' };
  }
  if (id === 'concert' && w.lotById(a.lotId)?.layout !== 'bar') return { hidden: true };
  if (id === 'half_marathon' && w.lotById(a.lotId)?.kind !== 'park') return { hidden: true };
  return undefined;
}

/** Leyendo un libro de habilidad: aprende hasta donde enseña el libro. Devuelve false si ya no hay nada que leer. */
export function readBook(w: World, a: Agent, task: Task, dt: number): boolean {
  if (!task.param) task.param = pickBook(w, a)?.id;
  const b = task.param ? BOOKS[task.param] : undefined;
  if (!b || bookReason(w, a, b.id)) return false;
  practice(w, a, { id: b.skill, rate: BOOK_RATE }, dt, b.upTo);
  if (skillLevel(w, a, b.skill) >= b.upTo) {
    if (w.isPlayerMember(a)) w.toast(`${a.name} se ha aprendido «${b.title}» de pe a pa. Lo que queda, practicando`, '📘', a.id);
    return false;
  }
  return true;
}
