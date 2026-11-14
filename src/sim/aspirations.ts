// Metas de vida: lo que cada persona quiere conseguir a largo plazo, por etapas.
// Cumplir cada etapa da dinero y orgullo; cumplirla entera, una buena recompensa.

import { SPECIES } from '../data/species';
import { getRel, isAdult } from './social';
import type { Agent } from './types';
import type { World } from './world';

export interface AspirationStage {
  label: string;
  done: (w: World, a: Agent) => boolean;
}

export interface AspirationDef {
  id: string;
  label: string;
  icon: string;
  desc: string;
  stages: AspirationStage[];
}

const stat = (a: Agent, ...keys: string[]) => keys.reduce((s, k) => s + (a.stats?.[k] ?? 0), 0);
const skill = (a: Agent, id: string) => Math.floor(a.skills?.[id] ?? 0);
const job = (a: Agent, career: string, level: number) => a.job?.career === career && a.job.level >= level;
const funds = (w: World, a: Agent) => w.householdOf(a)?.funds ?? 0;
const children = (w: World, a: Agent) => w.state.agents.filter((x) => x.parents?.includes(a.id));
const grandchildren = (w: World, a: Agent) => {
  const kids = new Set(children(w, a).map((k) => k.id));
  return w.state.agents.filter((x) => x.parents?.some((p) => kids.has(p)));
};
const friends = (w: World, a: Agent, min: number) =>
  w.state.agents.filter((x) => x !== a && x.kind === 'person' && !getRel(w.state, a.id, x.id).kin && getRel(w.state, a.id, x.id).f >= min);
const pets = (w: World, a: Agent) => w.state.agents.filter((x) => x.kind === 'pet' && x.householdId === a.householdId);

export const ASPIRATIONS: AspirationDef[] = [
  {
    id: 'chef',
    label: 'Chef con estrella',
    icon: '👩‍🍳',
    desc: 'Que en el barrio hablen de sus croquetas.',
    stages: [
      { label: 'Cocinar 8 veces', done: (_w, a) => stat(a, 'cook') >= 8 },
      { label: 'Cocina nivel 4', done: (_w, a) => skill(a, 'cocina') >= 4 },
      { label: 'Llegar a nivel 3 en Cocina (trabajo)', done: (_w, a) => job(a, 'cocina', 3) },
      { label: 'Cocina nivel 8', done: (_w, a) => skill(a, 'cocina') >= 8 },
    ],
  },
  {
    id: 'familia',
    label: 'Gran familia',
    icon: '👨‍👩‍👧',
    desc: 'Una casa llena de gente, de ruido y de táperes.',
    stages: [
      { label: 'Tener pareja', done: (w, a) => w.state.agents.some((x) => x !== a && !!getRel(w.state, a.id, x.id).status) },
      { label: 'Casarse', done: (w, a) => w.state.agents.some((x) => x !== a && getRel(w.state, a.id, x.id).status === 'married') },
      { label: 'Tener 2 hijos/as', done: (w, a) => children(w, a).length >= 2 },
      { label: 'Tener un nieto/a', done: (w, a) => grandchildren(w, a).length >= 1 },
    ],
  },
  {
    id: 'rico',
    label: 'Forrado/a',
    icon: '💰',
    desc: 'Vivir de las rentas. O, por lo menos, no mirar el precio del aceite.',
    stages: [
      { label: 'Tener §4.000', done: (w, a) => funds(w, a) >= 4000 },
      { label: 'Tener 3 muebles de lujo en casa', done: (w, a) => w.objectsIn(w.householdOf(a)?.lotId ?? '').filter((o) => o.q === 3).length >= 3 },
      { label: 'Tener §10.000', done: (w, a) => funds(w, a) >= 10000 },
      { label: 'Ampliar la casa', done: (w, a) => (w.lotById(w.householdOf(a)?.lotId ?? '')?.size ?? 1) >= 2 },
    ],
  },
  {
    id: 'social',
    label: 'El alma del barrio',
    icon: '🥳',
    desc: 'Conocer a todo el mundo y que todo el mundo le conozca.',
    stages: [
      { label: 'Tener 3 amigos/as', done: (w, a) => friends(w, a, 30).length >= 3 },
      { label: 'Montar una fiesta', done: (_w, a) => stat(a, 'parties') >= 1 },
      { label: 'Tener 6 amigos/as', done: (w, a) => friends(w, a, 30).length >= 6 },
      { label: 'Tener 2 mejores amigos/as', done: (w, a) => friends(w, a, 75).length >= 2 },
    ],
  },
  {
    id: 'artista',
    label: 'Artista bohemio/a',
    icon: '🎨',
    desc: 'Vivir del arte (y si no da, de la guitarra en el parque).',
    stages: [
      { label: 'Arte nivel 3', done: (_w, a) => skill(a, 'arte') >= 3 },
      { label: 'Vender 5 cuadros', done: (_w, a) => stat(a, 'paint') >= 5 },
      { label: 'Música nivel 4', done: (_w, a) => skill(a, 'musica') >= 4 },
      { label: 'Arte nivel 8', done: (_w, a) => skill(a, 'arte') >= 8 },
    ],
  },
  {
    id: 'fitness',
    label: 'Cuerpo de anuncio',
    icon: '🏋️',
    desc: 'Que en la playa se giren al verle pasar.',
    stages: [
      { label: 'Hacer deporte 10 veces', done: (_w, a) => stat(a, 'run', 'pilates', 'reformer') >= 10 },
      { label: 'Forma física nivel 5', done: (_w, a) => skill(a, 'forma') >= 5 },
      { label: 'Tomarse 5 açaí bowls', done: (_w, a) => stat(a, 'acai_bowl', 'smoothie') >= 5 },
      { label: 'Forma física nivel 9', done: (_w, a) => skill(a, 'forma') >= 9 },
    ],
  },
  {
    id: 'animales',
    label: 'Amigo/a de los animales',
    icon: '🐾',
    desc: 'Una casa con más patas que personas.',
    stages: [
      { label: 'Tener 2 mascotas', done: (w, a) => pets(w, a).length >= 2 },
      { label: 'Que una mascota aprenda un truco', done: (w, a) => pets(w, a).some((p) => (p.tricks?.length ?? 0) >= 1) },
      { label: 'Una mascota inseparable', done: (w, a) => pets(w, a).some((p) => getRel(w.state, a.id, p.id).f >= 60) },
      { label: 'Mascotas de 3 especies distintas', done: (w, a) => new Set(pets(w, a).map((p) => p.species)).size >= 3 },
    ],
  },
  {
    id: 'empresa',
    label: 'Emprendedor/a',
    icon: '🏪',
    desc: 'Ser su propio jefe. Y pagar su propia cuota de autónomos.',
    stages: [
      { label: 'Montar un negocio propio', done: (_w, a) => a.job?.career === 'negocio' },
      { label: 'Negocio nivel 2', done: (_w, a) => job(a, 'negocio', 2) },
      { label: 'Carisma nivel 6', done: (_w, a) => skill(a, 'carisma') >= 6 },
      { label: 'Negocio nivel 4', done: (_w, a) => job(a, 'negocio', 4) },
    ],
  },
  {
    id: 'sabio',
    label: 'Sabelotodo',
    icon: '🧠',
    desc: 'Tener razón en las sobremesas. Siempre.',
    stages: [
      { label: 'Leer 8 veces', done: (_w, a) => stat(a, 'read') >= 8 },
      { label: 'Lógica nivel 4', done: (_w, a) => skill(a, 'logica') >= 4 },
      { label: 'Tres habilidades a nivel 4', done: (_w, a) => Object.values(a.skills ?? {}).filter((v) => v >= 4).length >= 3 },
      { label: 'Lógica nivel 8', done: (_w, a) => skill(a, 'logica') >= 8 },
    ],
  },
];

export const ASPIRATION_BY_ID: Record<string, AspirationDef> = Object.fromEntries(ASPIRATIONS.map((x) => [x.id, x]));

/** Una meta que le pegue (según sus rasgos), para empezar. */
export function suggestAspiration(a: Agent): string {
  const t = a.traits ?? [];
  const pref: Record<string, string> = { gloton: 'chef', deportista: 'fitness', romantico: 'familia', fiestero: 'social', cotilla: 'social', animalero: 'animales', friki: 'sabio', cunado: 'sabio' };
  for (const id of t) if (pref[id] && Math.random() < 0.7) return pref[id];
  const done = new Set(a.aspirationsDone ?? []);
  const free = ASPIRATIONS.filter((x) => !done.has(x.id));
  return (free.length ? free : ASPIRATIONS)[Math.floor(Math.random() * (free.length || ASPIRATIONS.length))].id;
}

/** Quién puede tener meta de vida: personas de la familia del jugador desde adolescentes. */
export function canAspire(w: World, a: Agent): boolean {
  return a.kind === 'person' && w.isPlayerMember(a) && (isAdult(a) || w.stageOf(a) === 'teen') && !!SPECIES[a.species];
}
