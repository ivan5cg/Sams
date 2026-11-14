// Carácter de las mascotas y los trucos que pueden aprender.

import type { NeedKey, SpeciesId } from '../sim/types';

export interface PetTraitDef {
  id: string;
  label: string;
  icon: string;
  desc: string;
  decay?: Partial<Record<NeedKey, number>>;
  likes?: Record<string, number>;
  /** Lo rápido que aprende trucos. */
  learn: number;
}

export const PET_TRAITS: PetTraitDef[] = [
  { id: 'jugueton', label: 'Juguetón/a', icon: '🎾', desc: 'Siempre con ganas de jugar. Siempre.', decay: { fun: 1.3 }, likes: { play_ball: 2, chase: 1.8, play_with_person: 1.8 }, learn: 1.2 },
  { id: 'dormilon', label: 'Dormilón/a', icon: '😴', desc: 'Duerme 20 horas al día. Las otras 4, descansa.', decay: { energy: 1.3 }, likes: { pet_sleep: 1.8, cat_nap: 1.8, capy_sleep: 1.8, ferret_sleep: 1.8, sleep_post: 1.5 }, learn: 0.8 },
  { id: 'tragon', label: 'Tragón/a', icon: '🍖', desc: 'Vive para comer. Por comida aprende lo que sea.', decay: { hunger: 1.3 }, likes: { pet_eat: 1.8, beg_affection: 1.4 }, learn: 1.3 },
  { id: 'trasto', label: 'Trasto', icon: '😈', desc: 'Si hay algo que romper, robar o arañar, lo encontrará.', likes: { steal: 2.2, scratch_sofa: 2, sniff_sofa: 1.6, war_dance: 1.5 }, learn: 0.7 },
  { id: 'mimoso', label: 'Mimoso/a', icon: '🥰', desc: 'Pide caricias a todas horas.', decay: { social: 1.3 }, likes: { beg_affection: 2, cuddle_capy: 2, play_with_person: 1.4 }, learn: 1.1 },
  { id: 'listo', label: 'Listo/a', icon: '🧠', desc: 'Aprende trucos a la primera. A veces da miedo.', learn: 1.9 },
  { id: 'tranquilo', label: 'Tranquilo/a', icon: '🧘', desc: 'Nada le altera. Ni la aspiradora.', decay: { fun: 0.8, social: 0.85 }, learn: 1 },
];

export const PET_TRAIT_BY_ID: Record<string, PetTraitDef> = Object.fromEntries(PET_TRAITS.map((t) => [t.id, t]));

/** Trucos por especie, en orden: se aprende uno cada 20 puntos de adiestramiento. */
export const TRICKS: Partial<Record<SpeciesId, string[]>> = {
  dog: ['Sentarse', 'Dar la pata', 'Hacerse el muerto', 'Rodar por el suelo', 'Traer las zapatillas'],
  cat: ['Venir cuando le llaman', 'Chocar los cinco', 'Sentarse', 'Saltar por el aro', 'Abrir las puertas'],
  ferret: ['Venir cuando le llaman', 'Dar vueltas', 'Hacerse el muerto', 'Saltar', 'La danza de guerra a la orden'],
  capybara: ['Venir cuando le llaman', 'Sentarse', 'Llevar una mandarina en la cabeza', 'Saludar', 'Meditar en el estanque'],
};
