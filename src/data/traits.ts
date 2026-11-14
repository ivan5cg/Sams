// Rasgos de personalidad: cada persona tiene dos. Cambian lo que hacen, cómo hablan y lo que les gusta.

import type { NeedKey } from '../sim/types';
import type { Interest } from './dialogue';

export interface TraitDef {
  id: string;
  label: string;
  icon: string;
  desc: string;
  /** Multiplicador de la bajada de alguna necesidad. */
  decay?: Partial<Record<NeedKey, number>>;
  /** Acciones que le apetecen más (o menos) cuando va a su aire. */
  likesActions?: Record<string, number>;
  /** Temas de conversación que le encantan. */
  interests?: Interest[];
  /** Frases suyas que suelta de vez en cuando. */
  quips: string[];
}

export const TRAITS: TraitDef[] = [
  {
    id: 'cunado',
    label: 'Cuñado/a',
    icon: '🍺',
    desc: 'Lo sabe todo de todo y te lo va a explicar. Le encanta charlar (sobre todo él/ella).',
    decay: { social: 1.3 },
    likesActions: { chat: 1.6, talk: 1.6, joke: 1.4, repair: 1.5 },
    interests: ['deporte', 'cocina'],
    quips: [
      'Esto lo arreglaba yo en dos tardes',
      'Yo es que de esto entiendo mucho',
      'Tú lo que tienes que hacer es...',
      'Eso en mi pueblo se hace de otra manera',
      'Yo a tu edad ya tenía dos pisos',
      '¿Cuánto te ha costado? Te han timado',
      'El aceite de oliva lo cura todo',
      'Eso con WD-40 se arregla',
      'Yo ya lo dije y nadie me hizo caso',
      'Si me hicieran caso a mí, otro gallo cantaría',
      'Esto antes no pasaba',
      'Pues un primo mío lo hace mejor',
      '¿Nueve euros por un yogur morado? En mi época esto era un Cola Cao',
      'Lo del açaí es una moda, te lo digo yo',
      'En el Mercadona lo mejor es ir a primera hora',
    ],
  },
  {
    id: 'bromista',
    label: 'Bromista',
    icon: '🤡',
    desc: 'Siempre tiene un chiste malo preparado. Y lo cuenta.',
    likesActions: { joke: 2.2 },
    quips: ['¿Te sé un chiste?', 'Jajaja, me acabo de acordar de una cosa', 'Ríete, que es gratis'],
  },
  {
    id: 'gloton',
    label: 'Tragón/a',
    icon: '🍽️',
    desc: 'Siempre tiene hambre. Vive con la puerta de la nevera abierta.',
    decay: { hunger: 1.35 },
    likesActions: { eat: 1.5, snack: 1.8, cook: 1.4, buy_hotdog: 1.8, acai_bowl: 1.5, buy_fruit: 1.5, smoothie: 1.4 },
    interests: ['cocina'],
    quips: ['¿Hay algo de picar?', 'Me comería un bocata de calamares', '¿Nos tomamos unas bravas?', 'Esto con un poco de jamón mejora'],
  },
  {
    id: 'perezoso',
    label: 'Perezoso/a',
    icon: '🛋️',
    desc: 'La siesta es sagrada. El sofá, su segundo hogar.',
    decay: { energy: 1.25 },
    likesActions: { nap_sofa: 2, watch_tv: 1.5, sit: 1.5, run: 0.4, pilates: 0.4, reformer: 0.4, clean: 0.5 },
    quips: ['Cinco minutitos más...', 'Mañana lo hago, sin falta', 'La siesta no se negocia', 'Qué pereza, por Dios'],
  },
  {
    id: 'deportista',
    label: 'Deportista',
    icon: '🏃',
    desc: 'Si no se mueve, se aburre. Pilates, correr y lo que le echen.',
    decay: { fun: 1.15 },
    likesActions: { run: 2.2, pilates: 2, reformer: 2, swing: 1.3, walk_dog: 1.5, acai_bowl: 2, smoothie: 1.8, buy_fruit: 1.5 },
    interests: ['deporte'],
    quips: ['Hoy toca piernas', '¿Has visto mis zapatillas de correr?', 'El cuerpo me pide movimiento', 'Mens sana in corpore sano'],
  },
  {
    id: 'romantico',
    label: 'Romántico/a',
    icon: '💘',
    desc: 'Se enamora con facilidad. Las cenas a la luz de las velas le pierden.',
    likesActions: { flirt: 1.8, kiss: 1.8, hug: 1.5, selfie: 1.4 },
    quips: ['Qué bonito es el amor', 'Hoy tengo el día tierno', 'Esta canción me recuerda a alguien...'],
  },
  {
    id: 'grunon',
    label: 'Gruñón/a',
    icon: '😤',
    desc: 'Todo le molesta. Pero en el fondo es buena gente. En el fondo.',
    decay: { social: 0.75 },
    likesActions: { insult: 2.5, chat: 0.7, joke: 0.5 },
    quips: ['Qué ruido, por Dios', 'Esto antes no pasaba', 'Los jóvenes de hoy en día...', 'A ver si se callan los vecinos'],
  },
  {
    id: 'cotilla',
    label: 'Cotilla',
    icon: '👀',
    desc: 'Se entera de todo lo que pasa en el barrio. Y lo cuenta.',
    decay: { social: 1.25 },
    likesActions: { chat: 1.6, talk: 1.6, browse_aisles: 1.5 },
    interests: ['cotilleos'],
    quips: ['¿Te has enterado de lo último?', 'Yo no digo nada, pero...', 'A mí me lo ha contado alguien que lo sabe'],
  },
  {
    id: 'friki',
    label: 'Friki',
    icon: '🤓',
    desc: 'Videojuegos, ajedrez y datos curiosos que nadie ha pedido.',
    likesActions: { play_games: 2, play_chess: 2, browse: 1.5, read: 1.4 },
    interests: ['ciencia'],
    quips: ['¿Sabías que los pulpos tienen tres corazones?', 'Una partidita rápida y me voy', 'Esto en la versión original es mejor'],
  },
  {
    id: 'fiestero',
    label: 'Fiestero/a',
    icon: '🎉',
    desc: 'Si hay música, baila. Si no hay música, la pone.',
    decay: { social: 1.2, fun: 1.2 },
    likesActions: { dance: 2.2, listen_music: 1.6, play_guitar: 1.5, chat: 1.3, selfie: 1.8 },
    interests: ['musica'],
    quips: ['¡Esta noche salimos!', 'Pon algo de música, ¿no?', '¿Y si montamos una barbacoa?'],
  },
  {
    id: 'animalero',
    label: 'Animalero/a',
    icon: '🐾',
    desc: 'Prefiere a los animales que a las personas. Y se nota.',
    likesActions: { pet_animal: 2, play_pet: 2, walk_dog: 1.8, brush_capy: 2, bathe_pet: 1.4, fill_bowl: 1.5 },
    interests: ['mascotas'],
    quips: ['¿Quién es el bonito de la casa?', 'Yo adoptaría otro', 'Los animales no mienten'],
  },
  {
    id: 'tiquismiquis',
    label: 'Tiquismiquis',
    icon: '🧼',
    desc: 'Todo tiene que estar limpio y en su sitio. Todo.',
    decay: { hygiene: 1.4 },
    likesActions: { clean: 2.5, clean_litter: 2, clean_cage: 2, shower: 1.4, bath: 1.4 },
    quips: ['Esto hay que limpiarlo ya', '¿Quién ha dejado esto aquí?', 'Huele raro, ¿no?'],
  },
  {
    id: 'optimista',
    label: 'Optimista',
    icon: '🌞',
    desc: 'Le ve el lado bueno a todo. Hasta a los lunes.',
    decay: { fun: 0.8 },
    quips: ['¡Hoy va a ser un gran día!', 'Todo pasa por algo', 'Al mal tiempo, buena cara'],
  },
];

export const TRAIT_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t]));
