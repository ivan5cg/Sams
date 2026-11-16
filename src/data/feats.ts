// Logros (se consiguen jugando) y retos (opcionales: se activan desde ☰ → 🏆).

import type { World } from '../sim/world';

export interface FeatCtx {
  w: World;
  /** Contadores de la familia (bebés, raps, premios...). En un reto, desde que se activó. */
  counts: Record<string, number>;
  /** Minuto en que se activó el reto (0 en los logros). */
  since: number;
}

export interface FeatDef {
  id: string;
  icon: string;
  label: string;
  desc: string;
  done: (c: FeatCtx) => boolean;
  /** Progreso para enseñar (actual, objetivo). */
  progress?: (c: FeatCtx) => [number, number];
}

const PET_SPECIES = ['dog', 'cat', 'guineapig', 'ferret', 'capybara'];
const people = (w: World) => w.members.filter((m) => m.kind === 'person');

export const ACHIEVEMENTS: FeatDef[] = [
  { id: 'ascenso', icon: '📈', label: 'Primer ascenso', desc: 'Que asciendan a alguien de la familia.', done: ({ w }) => w.members.some((m) => (m.job?.level ?? 1) >= 2 && m.job?.career !== 'school') },
  {
    id: 'boda',
    icon: '💍',
    label: '¡Vivan los novios!',
    desc: 'Que alguien de la familia se case.',
    done: ({ w }) => Object.entries(w.state.rels).some(([k, r]) => r.status === 'married' && k.split('|').some((id) => w.household.memberIds.includes(id))),
  },
  { id: 'bebe', icon: '👶', label: 'La familia crece', desc: 'Tener un bebé.', done: ({ counts }) => (counts.babies ?? 0) >= 1 },
  { id: 'tres_generaciones', icon: '👵', label: 'Tres generaciones', desc: 'Que viva en casa un nieto de la familia fundadora.', done: ({ w }) => w.members.some((m) => (m.gen ?? 1) >= 3), progress: ({ w }) => [Math.max(1, ...w.members.map((m) => m.gen ?? 1)), 3] },
  { id: 'cinco_generaciones', icon: '🌳', label: 'Cinco generaciones', desc: 'Llegar a la quinta generación.', done: ({ w }) => w.members.some((m) => (m.gen ?? 1) >= 5), progress: ({ w }) => [Math.max(1, ...w.members.map((m) => m.gen ?? 1)), 5] },
  { id: 'meta', icon: '🏆', label: 'Sueño cumplido', desc: 'Completar una meta de vida.', done: ({ w }) => w.members.some((m) => (m.aspirationsDone?.length ?? 0) > 0) },
  { id: 'navidad', icon: '🎄', label: 'Navidad sin deudas', desc: 'Llegar a la noche de Navidad sin números rojos.', done: ({ counts }) => (counts.navidad_ok ?? 0) >= 1 },
  {
    id: 'zoo',
    icon: '🐾',
    label: 'Arca de Noé',
    desc: 'Adoptar las cinco especies (perro, gato, cobaya, hurón y capibara).',
    done: ({ counts }) => PET_SPECIES.every((s) => (counts[`adopt_${s}`] ?? 0) > 0),
    progress: ({ counts }) => [PET_SPECIES.filter((s) => (counts[`adopt_${s}`] ?? 0) > 0).length, 5],
  },
  { id: 'tragaperras', icon: '🎰', label: 'La máquina paga', desc: 'Sacar premio en la tragaperras del bar.', done: ({ counts }) => (counts.slot_wins ?? 0) >= 1 },
  { id: 'kalimotxo', icon: '🎤', label: 'Musa de MC Kalimotxo', desc: 'Que el rapero del metro os dedique 3 temas.', done: ({ counts }) => (counts.raps ?? 0) >= 3, progress: ({ counts }) => [Math.min(3, counts.raps ?? 0), 3] },
  { id: 'fiestas', icon: '🥳', label: 'La casa de las fiestas', desc: 'Montar 3 fiestas en casa.', done: ({ w }) => people(w).reduce((s, m) => s + (m.stats?.parties ?? 0), 0) >= 3, progress: ({ w }) => [Math.min(3, people(w).reduce((s, m) => s + (m.stats?.parties ?? 0), 0)), 3] },
  { id: 'reformas', icon: '🏗️', label: 'Casoplón', desc: 'Ampliar la casa al máximo.', done: ({ w }) => (w.lotById(w.household.lotId)?.size ?? 1) >= 3 },
  { id: 'rico', icon: '🤑', label: 'Forrados', desc: 'Tener §20.000 en el banco.', done: ({ w }) => w.household.funds >= 20_000, progress: ({ w }) => [Math.max(0, Math.min(20_000, Math.round(w.household.funds))), 20_000] },
  { id: 'trucos', icon: '🎪', label: 'Mascota de circo', desc: 'Que una mascota aprenda todos sus trucos.', done: ({ w }) => w.members.some((m) => m.kind === 'pet' && (m.training ?? 0) >= 100) },
  {
    id: 'salseo',
    icon: '🌶️',
    label: 'Radio Patio',
    desc: 'Enterarse de 10 salseos del barrio.',
    done: ({ w }) => (w.state.secrets ?? []).filter((s) => s.known.some((id) => w.household.memberIds.includes(id))).length >= 10,
    progress: ({ w }) => [Math.min(10, (w.state.secrets ?? []).filter((s) => s.known.some((id) => w.household.memberIds.includes(id))).length), 10],
  },
];

export interface ChallengeDef extends FeatDef {
  /** Si devuelve un motivo, el reto se ha perdido. */
  failed?: (c: FeatCtx) => string | undefined;
  /** Contador que empieza en cero al activar el reto. */
  counter?: string;
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'cien_bebes',
    icon: '🍼',
    label: '100 bebés',
    desc: 'Que nazcan 100 bebés en la familia (de las generaciones que hagan falta).',
    counter: 'babies',
    done: ({ counts }) => (counts.babies ?? 0) >= 100,
    progress: ({ counts }) => [Math.min(100, counts.babies ?? 0), 100],
  },
  {
    id: 'sin_nevera',
    icon: '🚫',
    label: 'Vivir sin nevera',
    desc: 'Vende la nevera y aguanta 7 días sin ella (a base de Glovo, açaí y bar).',
    done: ({ w, since }) => !w.objectsIn(w.household.lotId).some((o) => o.def === 'fridge') && w.state.minutes - since >= 7 * 1440,
    failed: ({ w, since }) => (w.state.minutes - since > 60 && w.objectsIn(w.household.lotId).some((o) => o.def === 'fridge') ? 'Hay una nevera en casa' : undefined),
    progress: ({ w, since }) => [Math.min(7, Math.floor((w.state.minutes - since) / 1440)), 7],
  },
  {
    id: 'del_arte',
    icon: '🎨',
    label: 'Vivir del arte',
    desc: 'Dos semanas sin que nadie de la familia trabaje y sin números rojos (pintad y tocad en el parque).',
    done: ({ w, since }) => w.state.minutes - since >= 14 * 1440,
    failed: ({ w }) => (w.members.some((m) => m.job && m.job.career !== 'school') ? 'Alguien ha cogido un trabajo' : w.household.funds < 0 ? 'Números rojos' : undefined),
    progress: ({ w, since }) => [Math.min(14, Math.floor((w.state.minutes - since) / 1440)), 14],
  },
];
