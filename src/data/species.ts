import type { AgentKind, NeedKey, SpeciesId } from '../sim/types';

export interface LifeStage {
  id: string;
  label: string;
  /** Edad (días de juego) a la que termina esta etapa. */
  until: number;
}

export interface SpeciesDef {
  id: SpeciesId;
  kind: AgentKind;
  label: string;
  icon: string;
  /** Casillas por minuto de juego. */
  speed: number;
  /** Bajada de cada necesidad por minuto de juego. */
  decay: Record<NeedKey, number>;
  /** Cómo se llama cada necesidad para esta especie. */
  needLabels?: Partial<Record<NeedKey, string>>;
  stages: LifeStage[];
  /** Precio de adopción en la protectora. */
  price: number;
  /** Nombres para los animales adoptados. */
  names: string[];
  /** Vive dentro de este objeto y no sale (la cobaya en su jaula). */
  habitat?: string;
  /** Probabilidad de rechazar mimos de alguien a quien no le apetece (gatos). */
  aloof?: number;
  /** Radio de calma: quien esté cerca se relaja (capibaras). */
  calmAura?: number;
  /** Prefiere quedarse en el jardín. */
  outdoor?: boolean;
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  human: {
    id: 'human',
    price: 0,
    names: [],
    kind: 'person',
    label: 'Persona',
    icon: '🧑',
    speed: 1.6,
    decay: { hunger: 0.09, energy: 0.075, bladder: 0.17, hygiene: 0.06, fun: 0.1, social: 0.07 },
    stages: [
      { id: 'baby', label: 'Bebé', until: 3 },
      { id: 'child', label: 'Niño/a', until: 12 },
      { id: 'teen', label: 'Adolescente', until: 20 },
      { id: 'young', label: 'Joven adulto', until: 45 },
      { id: 'adult', label: 'Adulto', until: 75 },
      { id: 'elder', label: 'Anciano/a', until: 100 },
    ],
  },
  dog: {
    id: 'dog',
    price: 150,
    names: ['Toby', 'Luna', 'Rocky', 'Kira', 'Bruno', 'Nala', 'Thor', 'Lola', 'Max', 'Bimba', 'Rufo', 'Pancho', 'Golfo', 'Lúa'],
    kind: 'pet',
    label: 'Perro',
    icon: '🐕',
    speed: 2.0,
    decay: { hunger: 0.1, energy: 0.07, bladder: 0.14, hygiene: 0.03, fun: 0.12, social: 0.09 },
    needLabels: { social: 'Cariño' },
    stages: [
      { id: 'young', label: 'Cachorro', until: 7 },
      { id: 'adult', label: 'Adulto', until: 35 },
      { id: 'elder', label: 'Mayor', until: 50 },
    ],
  },
  cat: {
    id: 'cat',
    price: 120,
    names: ['Misi', 'Garfield', 'Nube', 'Simba', 'Pelusa', 'Salem', 'Mimi', 'Tigre', 'Michi', 'Kiwi', 'Bigotes', 'Cleo', 'Félix'],
    aloof: 0.3,
    kind: 'pet',
    label: 'Gato',
    icon: '🐈',
    speed: 1.8,
    decay: { hunger: 0.09, energy: 0.08, bladder: 0.12, hygiene: 0.02, fun: 0.09, social: 0.05 },
    needLabels: { social: 'Cariño' },
    stages: [
      { id: 'young', label: 'Gatito', until: 7 },
      { id: 'adult', label: 'Adulto', until: 40 },
      { id: 'elder', label: 'Mayor', until: 55 },
    ],
  },
  guineapig: {
    id: 'guineapig',
    price: 40,
    names: ['Coco', 'Galleta', 'Canela', 'Pipa', 'Bolita', 'Churro', 'Fresa', 'Peluche', 'Bizcocho', 'Rulo', 'Pompón'],
    habitat: 'cage',
    kind: 'pet',
    label: 'Cobaya',
    icon: '🐹', // no hay emoji de cobaya
    speed: 1.0,
    decay: { hunger: 0.12, energy: 0.07, bladder: 0.1, hygiene: 0.05, fun: 0.08, social: 0.08 },
    needLabels: { social: 'Cariño', hygiene: 'Jaula' },
    stages: [
      { id: 'young', label: 'Cría', until: 3 },
      { id: 'adult', label: 'Adulta', until: 18 },
      { id: 'elder', label: 'Mayor', until: 25 },
    ],
  },
  ferret: {
    id: 'ferret',
    price: 90,
    names: ['Pipo', 'Flash', 'Ninja', 'Chispa', 'Bandido', 'Fideo', 'Rayo', 'Zorro', 'Tofu', 'Gizmo'],
    kind: 'pet',
    label: 'Hurón',
    icon: '🦦', // no hay emoji de hurón
    speed: 2.2,
    decay: { hunger: 0.11, energy: 0.11, bladder: 0.12, hygiene: 0.04, fun: 0.15, social: 0.07 },
    needLabels: { social: 'Cariño' },
    stages: [
      { id: 'young', label: 'Cría', until: 4 },
      { id: 'adult', label: 'Adulto', until: 22 },
      { id: 'elder', label: 'Mayor', until: 30 },
    ],
  },
  capybara: {
    id: 'capybara',
    price: 300,
    names: ['Capi', 'Zen', 'Paco', 'Tranqui', 'Bombón', 'Moka', 'Dalai', 'Lenteja', 'Siesta', 'Buda'],
    calmAura: 3,
    outdoor: true,
    kind: 'pet',
    label: 'Capibara',
    icon: '🦫', // no hay emoji de capibara
    speed: 1.2,
    decay: { hunger: 0.1, energy: 0.06, bladder: 0.1, hygiene: 0.06, fun: 0.05, social: 0.06 },
    needLabels: { social: 'Cariño', hygiene: 'Agua' },
    stages: [
      { id: 'young', label: 'Cría', until: 6 },
      { id: 'adult', label: 'Adulta', until: 32 },
      { id: 'elder', label: 'Mayor', until: 45 },
    ],
  },
};

export const NEED_INFO: Record<NeedKey, { label: string; icon: string }> = {
  hunger: { label: 'Hambre', icon: '🍽️' },
  energy: { label: 'Energía', icon: '⚡' },
  bladder: { label: 'Vejiga', icon: '🚽' },
  hygiene: { label: 'Higiene', icon: '🛁' },
  fun: { label: 'Diversión', icon: '🎮' },
  social: { label: 'Social', icon: '💬' },
};

export function needLabel(species: SpeciesId, need: NeedKey): string {
  return SPECIES[species].needLabels?.[need] ?? NEED_INFO[need].label;
}

export function lifeStage(species: SpeciesId, ageDays: number): LifeStage {
  const stages = SPECIES[species].stages;
  return stages.find((s) => ageDays < s.until) ?? stages[stages.length - 1];
}
