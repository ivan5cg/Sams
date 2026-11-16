// La familia con la que se empieza: la García de siempre o la que diseñe el jugador.

import { CLOTHES, HAIR, HAIR_STYLES, SKIN } from '../data/looks';
import { SPECIES } from '../data/species';
import { TRAITS } from '../data/traits';
import type { SpeciesId } from './types';

export type StartStage = 'child' | 'teen' | 'young' | 'adult' | 'elder';

export interface PersonSpec {
  name: string;
  stage: StartStage;
  traits: [string, string];
  /** Color de la ropa. */
  color: number;
  look?: { skin?: number; hair?: number; hairStyle?: string };
  /** Edad exacta (si no, la de la mitad de su etapa). */
  ageDays?: number;
}

export interface PetSpec {
  species: SpeciesId;
  name: string;
  ageDays?: number;
  color?: number;
}

export interface FamilySpec {
  surname: string;
  people: PersonSpec[];
  /** Los dos primeros adultos son pareja. */
  couple: boolean;
  pets: PetSpec[];
}

export const MAX_START_PEOPLE = 4;

/** Edad (días) para empezar en cada etapa: más o menos la mitad de la etapa. */
export const STAGE_AGE: Record<StartStage, number> = { child: 7, teen: 16, young: 26, adult: 50, elder: 80 };
export const STAGE_LABEL: Record<StartStage, string> = { child: 'Niño/a', teen: 'Adolescente', young: 'Joven', adult: 'Adulto/a', elder: 'Anciano/a' };

/** La familia García de siempre (Lucía, Mateo, Toby y Misi). */
export const GARCIA: FamilySpec = {
  surname: 'García',
  people: [
    { name: 'Lucía', stage: 'young', ageDays: 24, traits: ['deportista', 'romantico'], color: 0xe0607e },
    { name: 'Mateo', stage: 'young', ageDays: 27, traits: ['cunado', 'gloton'], color: 0x4f8fd9 },
  ],
  couple: true,
  pets: [
    { species: 'dog', name: 'Toby', ageDays: 9, color: 0xc68642 },
    { species: 'cat', name: 'Misi', ageDays: 12, color: 0x9a9a9a },
  ],
};

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const NAMES = ['Carmen', 'Javier', 'Lola', 'Andrés', 'Marta', 'Raúl', 'Elena', 'Pablo', 'Rocío', 'Nacho', 'Julia', 'Sergio', 'Alba', 'Hugo', 'Irene', 'Manolo', 'Pilar', 'Dani'];
const SURNAMES = ['Fernández', 'López', 'Martín', 'Sánchez', 'Gómez', 'Ruiz', 'Moreno', 'Jiménez', 'Navarro', 'Romero', 'Torres', 'Castillo'];

/** Dos rasgos distintos que no se peleen entre sí (nada de gruñón y optimista a la vez). */
export function traitsOk(t: [string, string]): boolean {
  return t[0] !== t[1] && !(t.includes('grunon') && t.includes('optimista')) && t.every((x) => TRAITS.some((d) => d.id === x));
}

function randomTraits(): [string, string] {
  for (;;) {
    const t: [string, string] = [pick(TRAITS).id, pick(TRAITS).id];
    if (traitsOk(t)) return t;
  }
}

export function randomPerson(stage: StartStage, used: string[] = []): PersonSpec {
  const free = NAMES.filter((n) => !used.includes(n));
  return {
    name: pick(free.length ? free : NAMES),
    stage,
    traits: randomTraits(),
    color: pick(CLOTHES),
    look: { skin: pick(SKIN), hair: pick(HAIR), hairStyle: pick(HAIR_STYLES) },
  };
}

/** Una familia al azar: una pareja, quizá con hijos, y quizá una mascota. */
export function randomFamily(): FamilySpec {
  const people: PersonSpec[] = [];
  const adultStage: StartStage = Math.random() < 0.6 ? 'young' : 'adult';
  people.push(randomPerson(adultStage));
  if (Math.random() < 0.85) people.push(randomPerson(adultStage, people.map((p) => p.name)));
  const kids = Math.floor(Math.random() * 3);
  for (let i = 0; i < kids && people.length < MAX_START_PEOPLE; i++) people.push(randomPerson(Math.random() < 0.5 ? 'child' : 'teen', people.map((p) => p.name)));
  const species = pick<SpeciesId | null>(['dog', 'cat', 'guineapig', 'ferret', 'capybara', null]);
  const pets: PetSpec[] = species ? [{ species, name: pick(SPECIES[species].names) }] : [];
  return { surname: pick(SURNAMES), people, couple: people.length >= 2, pets };
}

/** Lo que falla en una familia (para el creador); vacío si está bien. */
export function familyProblems(f: FamilySpec): string[] {
  const out: string[] = [];
  if (!f.surname.trim()) out.push('Falta el apellido');
  if (f.surname.length > 20) out.push('El apellido es demasiado largo');
  if (!f.people.length) out.push('Hace falta al menos una persona');
  if (f.people.length > MAX_START_PEOPLE) out.push(`Como mucho, ${MAX_START_PEOPLE} personas`);
  if (!f.people.some((p) => ['young', 'adult', 'elder'].includes(p.stage))) out.push('Hace falta al menos un adulto (alguien tiene que hacer la compra)');
  for (const p of f.people) {
    if (!p.name.trim()) out.push('Hay alguien sin nombre');
    else if (p.name.length > 20) out.push(`El nombre de ${p.name.slice(0, 20)}... es demasiado largo`);
    if (!traitsOk(p.traits)) out.push(`${p.name || 'Alguien'}: elige dos rasgos distintos (y no gruñón y optimista a la vez)`);
  }
  const names = f.people.map((p) => p.name.trim().toLowerCase()).filter(Boolean);
  if (new Set(names).size !== names.length) out.push('Hay dos personas con el mismo nombre');
  for (const pet of f.pets) {
    if (SPECIES[pet.species]?.kind !== 'pet') out.push('Esa mascota no existe');
    if (!pet.name.trim()) out.push('La mascota necesita un nombre');
  }
  return out;
}
