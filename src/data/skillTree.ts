// Lo que da cada nivel de habilidad: libros para aprender (básico y avanzado; lo de maestro, solo
// practicando), recetas de cocina y de repostería, y cosas nuevas que se pueden hacer (las acciones con
// `requires` en `data/actions.ts`). El perfil y los avisos al subir de nivel salen de aquí.

import { ACTIONS } from './actions';
import { SKILLS } from './skills';

// --- Libros de habilidad ---

/** Dos tomos por habilidad: hasta qué nivel enseña cada uno, desde qué nivel se entiende y lo que cuesta. */
export const BOOK_TIERS: Record<1 | 2, { label: string; price: number; from: number; upTo: number }> = {
  1: { label: 'Para principiantes', price: 25, from: 0, upTo: 4 },
  2: { label: 'Avanzado', price: 70, from: 3, upTo: 7 },
};
/** Puntos por minuto leyendo (a nivel 0; como practicar, cuesta más cuanto más nivel). */
export const BOOK_RATE = 0.022;

const TITLES: Record<string, [string, string]> = {
  cocina: ['Cocinar sin quemar la casa', 'El recetario de la abuela Paca'],
  reposteria: ['Magdalenas para torpes', 'Hojaldres, merengues y otras brujerías'],
  manitas: ['El bricolaje explicado a tu cuñado', 'Fontanería y electricidad sin calambrazos'],
  musica: ['Tus primeros acordes', 'Rumba, flamenco y punteo'],
  piano: ['El piano en 30 días (o 300)', 'Chopin para valientes'],
  canto: ['Cantar en la ducha... y fuera', 'Técnica vocal de coplera'],
  ajedrez: ['Las aperturas de toda la vida', 'Finales de torre del abuelo Ramón'],
  programacion: ['Programar desde cero', 'Patrones, bugs y café'],
  inversion: ['Tus ahorros sin miedo', 'Gestión de carteras para valientes'],
  arte: ['Dibujar es fácil', 'Del boceto al óleo'],
  forma: ['Calistenia en el salón', 'Entrena como un maratoniano'],
  logica: ['Sudokus y acertijos', 'Lógica para mentes inquietas'],
  carisma: ['Cómo caer bien en el ascensor', 'Hablar en público sin morir'],
};

export interface BookDef {
  id: string;
  skill: string;
  tier: 1 | 2;
  title: string;
  price: number;
  from: number;
  upTo: number;
}

/** Todos los libros (`cocina:1`, `cocina:2`...). */
export const BOOKS: Record<string, BookDef> = Object.fromEntries(
  SKILLS.filter((s) => TITLES[s.id]).flatMap((s) =>
    ([1, 2] as const).map((tier) => {
      const t = BOOK_TIERS[tier];
      const b: BookDef = { id: `${s.id}:${tier}`, skill: s.id, tier, title: TITLES[s.id][tier - 1], price: t.price, from: t.from, upTo: t.upTo };
      return [b.id, b];
    }),
  ),
);

// --- Recetas ---

export interface Recipe {
  id: string;
  label: string;
  icon: string;
  skill: 'cocina' | 'reposteria';
  level: number;
  /** Raciones de la despensa que gasta (contando la que se coge al empezar). */
  portions: number;
  /** Hambre que les quita a los de casa que estén (quien cocina come aparte). */
  family: number;
  /** Diversión para todos los que estén en casa (y quien cocina). */
  fun: number;
  /** Emoción para quien lo prueba. */
  emotion?: string;
  /** Se vende (a los vecinos o por encargo): base + 15 por nivel. */
  sell?: number;
  desc: string;
}

export const RECIPES: Recipe[] = [
  { id: 'huevos', label: 'Huevos fritos con patatas', icon: '🍳', skill: 'cocina', level: 0, portions: 1, family: 0, fun: 0, desc: 'Lo de siempre: llena y no falla' },
  { id: 'tortilla', label: 'Tortilla de patatas (con cebolla)', icon: '🥔', skill: 'cocina', level: 2, portions: 1, family: 20, fun: 5, emotion: 'casero', desc: 'Da para que pique toda la familia' },
  { id: 'lentejas', label: 'Lentejas de la abuela', icon: '🍲', skill: 'cocina', level: 4, portions: 2, family: 35, fun: 4, emotion: 'casero', desc: 'Si quieres las comes, y si no, las dejas' },
  { id: 'croquetas', label: 'Croquetas caseras', icon: '🧆', skill: 'cocina', level: 5, portions: 2, family: 25, fun: 15, emotion: 'bien_comido', desc: 'Se acaban antes de llegar a la mesa' },
  { id: 'cocido', label: 'Cocido madrileño de tres vuelcos', icon: '🥘', skill: 'cocina', level: 6, portions: 3, family: 55, fun: 12, emotion: 'bien_comido', desc: 'Sopa, garbanzos y carne: la familia, llena para todo el día' },
  { id: 'paella', label: 'Paella de domingo', icon: '🥘', skill: 'cocina', level: 8, portions: 3, family: 55, fun: 20, emotion: 'bien_comido', desc: 'Con socarrat. Nada de chorizo' },
  { id: 'callos', label: 'Callos a la madrileña de concurso', icon: '🏆', skill: 'cocina', level: 10, portions: 3, family: 60, fun: 25, emotion: 'orgulloso', desc: 'El plato estrella: a todo el que lo prueba se le saltan las lágrimas' },
  { id: 'magdalenas', label: 'Magdalenas', icon: '🧁', skill: 'reposteria', level: 0, portions: 1, family: 10, fun: 6, desc: 'Para mojar en el café con leche' },
  { id: 'torrijas', label: 'Torrijas', icon: '🍞', skill: 'reposteria', level: 2, portions: 1, family: 15, fun: 10, emotion: 'casero', desc: 'Como las de Semana Santa, pero cualquier día' },
  { id: 'rosquillas', label: 'Rosquillas listas y tontas', icon: '🍩', skill: 'reposteria', level: 3, portions: 1, family: 10, fun: 10, sell: 25, desc: 'Se venden solas a los vecinos' },
  { id: 'tarta_queso', label: 'Tarta de queso cremosa', icon: '🍰', skill: 'reposteria', level: 5, portions: 2, family: 15, fun: 18, emotion: 'bien_comido', desc: 'Que tiemble al cortarla' },
  { id: 'roscon', label: 'Roscón casero (con nata)', icon: '🥯', skill: 'reposteria', level: 7, portions: 2, family: 20, fun: 20, sell: 50, desc: 'Con haba y con sorpresa, y se venden los que sobran' },
  { id: 'tarta_boda', label: 'Tarta nupcial de tres pisos', icon: '🎂', skill: 'reposteria', level: 9, portions: 3, family: 10, fun: 15, emotion: 'orgulloso', sell: 220, desc: 'Un encargo para una boda del barrio' },
];

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** La acción con la que se hace cada tipo de receta. */
export const RECIPE_ACTION: Record<Recipe['skill'], string> = { cocina: 'cook', reposteria: 'bake' };

// --- Lo que se desbloquea ---

/** Ventajas que no son una acción ni una receta. */
const PERKS: { skill: string; level: number; icon: string; label: string }[] = [
  { skill: 'cocina', level: 2, icon: '🤢', label: 'Ya no intoxica a nadie' },
  { skill: 'manitas', level: 3, icon: '⚡', label: 'Arregla aparatos sin calambrazos' },
  { skill: 'manitas', level: 6, icon: '⏱️', label: 'Arregla las cosas en la mitad de tiempo' },
  { skill: 'musica', level: 3, icon: '🪕', label: 'Tocar por propinas en el parque' },
  { skill: 'inversion', level: 2, icon: '🔎', label: 'Ver el análisis de cada valor (tendencia)' },
  { skill: 'inversion', level: 4, icon: '💠', label: 'Comisión del 0,5 % y productos complejos (cripto)' },
];

export interface Unlock {
  skill: string;
  level: number;
  icon: string;
  label: string;
  kind: 'action' | 'recipe' | 'perk';
}

/** Todo lo que se desbloquea, por habilidad y nivel (de menos a más). */
export const UNLOCKS: Unlock[] = [
  ...Object.values(ACTIONS)
    .filter((a) => a.requires && a.requires.level > 0)
    .map((a): Unlock => ({ skill: a.requires!.skill, level: a.requires!.level, icon: a.icon, label: a.label.replace(/\s*\(.*\)$/, ''), kind: 'action' })),
  ...RECIPES.filter((r) => r.level > 0).map((r): Unlock => ({ skill: r.skill, level: r.level, icon: r.icon, label: r.label, kind: 'recipe' })),
  ...PERKS.map((p): Unlock => ({ ...p, kind: 'perk' })),
].sort((x, y) => x.level - y.level);

export function unlocksOf(skill: string): Unlock[] {
  return UNLOCKS.filter((u) => u.skill === skill);
}
