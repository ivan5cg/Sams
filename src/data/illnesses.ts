// Enfermedades: lo que duran, cómo se notan (necesidades que bajan más rápido), lo que se contagian y lo
// peligrosas que son. Las cifras, aquí para poder ajustarlas sin tocar la lógica (systems/illness.ts).

import type { NeedKey } from '../sim/types';

export interface IllnessDef {
  id: string;
  label: string;
  icon: string;
  /** Días que dura sin tratar (tratada, la mitad). */
  days: number;
  /** Multiplicador de la bajada de necesidades mientras dura. */
  decay: Partial<Record<NeedKey, number>>;
  /** Probabilidad por hora de pegársela a alguien que esté en la misma parcela. */
  contagion: number;
  /** Probabilidad diaria de morir sin tratar (con tratamiento, la cuarta parte). Por etapa de la vida. */
  deadly?: Partial<Record<'baby' | 'child' | 'teen' | 'young' | 'adult' | 'elder', number>>;
  /** Solo la cogen estas etapas. */
  stages?: string[];
  /** Al curarse sin tratar, puede complicarse en esta otra (probabilidad, y la de los mayores). */
  worsens?: { into: string; chance: number; elder: number };
  /** Lo que se le ocurre al que la tiene. */
  thought: string;
}

export const ILLNESSES: Record<string, IllnessDef> = {
  resfriado: { id: 'resfriado', label: 'Resfriado', icon: '🤧', days: 3, decay: { energy: 1.2, fun: 1.1 }, contagion: 0.03, thought: 'Achís... ¿Alguien tiene un kleenex?' },
  gripe: {
    id: 'gripe', label: 'Gripe', icon: '🤒', days: 4, decay: { energy: 1.7, hunger: 0.8, fun: 1.3 }, contagion: 0.05,
    deadly: { baby: 0.02, elder: 0.02 }, worsens: { into: 'neumonia', chance: 0.08, elder: 0.3 }, thought: 'Me duele hasta el pelo',
  },
  gastro: { id: 'gastro', label: 'Gastroenteritis', icon: '🤢', days: 2, decay: { bladder: 2.2, hunger: 1.3, energy: 1.3 }, contagion: 0.02, thought: 'No me separo del váter' },
  varicela: { id: 'varicela', label: 'Varicela', icon: '🔴', days: 5, decay: { fun: 1.4, energy: 1.2 }, contagion: 0.08, stages: ['baby', 'child', 'teen'], thought: '¡Qué picores! Y no me puedo rascar' },
  neumonia: {
    id: 'neumonia', label: 'Neumonía', icon: '🫁', days: 6, decay: { energy: 2.2, hunger: 0.8, fun: 1.5 }, contagion: 0,
    deadly: { baby: 0.08, child: 0.02, teen: 0.02, young: 0.02, adult: 0.04, elder: 0.1 }, thought: 'Me cuesta hasta respirar',
  },
  envenenamiento: {
    id: 'envenenamiento', label: 'Envenenamiento', icon: '☠️', days: 2, decay: { energy: 2, hunger: 1.5, bladder: 1.8 }, contagion: 0,
    deadly: { baby: 0.6, child: 0.6, teen: 0.6, young: 0.6, adult: 0.6, elder: 0.6 }, thought: 'Algo de lo que he comido no me ha sentado nada bien...',
  },
  intoxicacion: { id: 'intoxicacion', label: 'Intoxicación alimentaria', icon: '🦠', days: 1, decay: { bladder: 2.5, hunger: 1.5, energy: 1.2 }, contagion: 0, thought: 'Esa paella no estaba bien...' },
};

/** Probabilidad diaria de pillar cada cosa (sin que te la peguen), según la estación (0 primavera ... 3 invierno). */
export const CATCH_CHANCE: Record<string, [number, number, number, number]> = {
  resfriado: [0.01, 0.004, 0.02, 0.03],
  gripe: [0.003, 0.001, 0.006, 0.02],
  gastro: [0.004, 0.006, 0.004, 0.004],
  varicela: [0.004, 0.002, 0.003, 0.004],
};

/** Infarto: probabilidad diaria de partida en adultos y mayores (sube con los años, la vida sedentaria y la glotonería). */
export const HEART_ATTACK = { adult: 0.0004, elder: 0.0015 };
