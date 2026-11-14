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
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  human: {
    id: 'human',
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
  // Especies preparadas para la fase 2 (comportamientos y objetos propios).
  cat: {
    id: 'cat',
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
    kind: 'pet',
    label: 'Cobaya',
    icon: '🐹',
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
    kind: 'pet',
    label: 'Hurón',
    icon: '🦦',
    speed: 2.2,
    decay: { hunger: 0.11, energy: 0.06, bladder: 0.12, hygiene: 0.04, fun: 0.15, social: 0.07 },
    needLabels: { social: 'Cariño' },
    stages: [
      { id: 'young', label: 'Cría', until: 4 },
      { id: 'adult', label: 'Adulto', until: 22 },
      { id: 'elder', label: 'Mayor', until: 30 },
    ],
  },
  capybara: {
    id: 'capybara',
    kind: 'pet',
    label: 'Capibara',
    icon: '🦫',
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
