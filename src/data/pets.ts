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

// -----------------------------------------------------------------------------
// Salud de las mascotas (versión 28): enfermedades, el veterinario y lo que cuesta.
// -----------------------------------------------------------------------------

export interface PetIllnessDef {
  id: string;
  label: string;
  icon: string;
  /** Solo la cogen estas especies (si no, todas). */
  species?: SpeciesId[];
  /** Lo que cobra el veterinario por el tratamiento (antes de la inflación). */
  cost: number;
  /** Días que dura (tratada, la mitad). Las graves no se curan solas. */
  days: number;
  /** Se cura sola sin tratar (las leves). */
  mild?: boolean;
  /** Probabilidad diaria de morir sin tratar (con tratamiento, mucho menos). */
  deadly: number;
  /** Cómo se nota: necesidades que bajan más rápido. */
  decay: Partial<Record<NeedKey, number>>;
  /** Lo que dice el veterinario. */
  vet: string;
}

export const PET_ILLNESSES: Record<string, PetIllnessDef> = {
  otitis: { id: 'otitis', label: 'Otitis', icon: '👂', species: ['dog', 'cat'], cost: 90, days: 4, mild: true, deadly: 0, decay: { fun: 1.3 }, vet: 'Unas gotitas dos veces al día y listo' },
  pulgas: { id: 'pulgas', label: 'Pulgas y parásitos', icon: '🐜', cost: 60, days: 5, mild: true, deadly: 0, decay: { hygiene: 1.8, fun: 1.2 }, vet: 'Pipeta, collar antiparasitario y a lavar toda la casa' },
  gastro_pet: { id: 'gastro_pet', label: 'Gastroenteritis', icon: '🤢', cost: 180, days: 3, deadly: 0.04, decay: { hunger: 1.6, bladder: 2, energy: 1.3 }, vet: 'Dieta blanda, suero y nada de sobras de la mesa' },
  calcetin: { id: 'calcetin', label: 'Se ha tragado un calcetín', icon: '🧦', species: ['dog', 'ferret'], cost: 1400, days: 3, deadly: 0.25, decay: { hunger: 1.4, energy: 1.6, fun: 1.5 }, vet: 'Hay que operar ya. Cirugía de urgencia, con anestesia y todo' },
  moquillo: { id: 'moquillo', label: 'Moquillo', icon: '🤧', species: ['dog', 'ferret'], cost: 650, days: 6, deadly: 0.12, decay: { energy: 1.8, hunger: 1.2 }, vet: 'Es grave. Antibióticos, suero y muchos mimos' },
  rinones: { id: 'rinones', label: 'Insuficiencia renal', icon: '🫘', species: ['cat'], cost: 900, days: 7, deadly: 0.08, decay: { bladder: 1.8, energy: 1.4, hunger: 1.3 }, vet: 'Pienso renal de por vida, análisis y una medicación carísima' },
  dientes: { id: 'dientes', label: 'Dientes demasiado largos', icon: '🦷', species: ['guineapig', 'capybara'], cost: 160, days: 4, deadly: 0.05, decay: { hunger: 1.8 }, vet: 'Hay que limarle los dientes con sedación' },
  golpe_calor: { id: 'golpe_calor', label: 'Golpe de calor', icon: '🥵', cost: 250, days: 2, deadly: 0.1, decay: { energy: 2, hunger: 1.2 }, vet: 'Suero, sombra y agua fresquita. Ha ido por poco' },
  desnutricion: { id: 'desnutricion', label: 'Desnutrición por descuido', icon: '🦴', cost: 320, days: 5, deadly: 0.15, decay: { hunger: 1.8, energy: 1.5, social: 1.3 }, vet: 'Este animal está muy mal cuidado. Vitaminas, dieta y vigilancia. Si vuelve a pasar, aviso a la protectora' },
};

/** Probabilidad diaria de ponerse mala (con descuidos y de mayor, más; con la revisión del veterinario, menos). */
export const PET_SICK_CHANCE = 0.012;
/** Horas mal cuidada a partir de las que cae la desnutrición. */
export const NEGLECT_HOURS = 18;
