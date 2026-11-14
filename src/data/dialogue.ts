// Frases de los personajes: conversaciones, sonidos de animales y pensamientos.

import type { NeedKey, SpeciesId } from '../sim/types';

/** Pares [lo que dice quien empieza, lo que responde el otro] para cada interacción. */
export const ACTION_LINES: Record<string, [string, string][]> = {
  chat: [
    ['¿Qué tal el día?', '¡Bien! ¿Y el tuyo?'],
    ['¿Has visto lo que hizo el hurón?', '¡Ese bicho es un ladrón!'],
    ['Qué día tan bonito hace', 'Apetece ir al parque'],
    ['¿Qué hay de cenar?', 'Lo que cocines tú'],
    ['He soñado algo rarísimo...', '¿El qué? ¡Cuenta!'],
    ['¿Has visto la última serie?', '¡Sin spoilers, eh!'],
    ['Tengo que ir al gimnasio', 'Llevas un mes diciéndolo'],
    ['Me encanta este barrio', 'Y a mí, la gente es maja'],
  ],
  talk: [
    ['Oye, ¿tienes un momento?', 'Claro, dime'],
  ],
  joke: [
    ['¿Qué le dice un pez a otro? ¡Nada!', '¡Ja, ja, ja!'],
    ['¿Por qué el libro de mates está triste? ¡Tiene muchos problemas!', 'Jajaja, qué malo'],
    ['¿Cómo se despiden los químicos? ¡Ácido un placer!', '¡Jajaja!'],
    ['¿Qué hace una abeja en el gimnasio? ¡Zum-ba!', 'No puedo más, jajaja'],
    ['Van dos y se cae el del medio', '¿Qué? ¡Jajaja!'],
  ],
  hug: [
    ['¡Ven aquí!', '¡Qué gusto!'],
    ['Necesitaba un abrazo', 'Y yo'],
  ],
  insult: [
    ['¡Eres un pesado!', '¡Y tú un borde!'],
    ['¡Vaya pintas llevas!', '¡Mira quién habla!'],
    ['¡Deja de hacer ruido!', '¡Hago lo que quiero!'],
  ],
  flirt: [
    ['Hoy estás radiante', 'Me vas a sonrojar...'],
    ['¿Sabes que tienes una sonrisa preciosa?', 'Tú tampoco estás nada mal'],
    ['¿Te han dicho que tienes unos ojos bonitos?', '¿Ah, sí? Cuéntame más'],
  ],
  kiss: [['Mua', '♥']],
  ask_partner: [['¿Quieres salir conmigo?', '¡Sí, claro que sí!']],
  propose: [['¿Te quieres casar conmigo?', '¡Sí! ¡Mil veces sí!']],
  move_in: [['¿Y si nos vamos a vivir juntos?', '¡Me encantaría!']],
  try_baby: [['¿Y si tenemos un bebé?', 'Vamos a intentarlo']],
  niqui: [['¿Nos vamos un ratito a la habitación?', 'Me parece un plan estupendo']],
  say_goodbye: [['Bueno, que ya es tarde...', '¡Hasta pronto!']],
  feed_baby: [['Aquí viene el avioncito...', '¡Ba-ba!']],
  change_diaper: [['Uf, qué olor...', 'Agú']],
  rock_baby: [['Duérmete, mi niño...', 'Mmm...']],
  play_baby: [['¿Dónde está? ¡Aquí está!', '¡Jijiji!']],
  pet_animal: [['¿Quién es el más bueno? ¡Tú!', '*']],
  play_pet: [['¡A por ella!', '*']],
  walk_dog: [['¿Vamos de paseo?', '*']],
  bathe_pet: [['Quieto, que es un momento', '*']],
  brush_capy: [['Qué pelo más bonito', '*']],
  beg_affection: [['*', 'Ay, ven aquí, bonito']],
  play_with_person: [['*', '¡Vale, vamos a jugar!']],
};

/** Sonidos de cada especie ('*' en las frases de arriba). */
export const PET_SOUNDS: Partial<Record<SpeciesId, string[]>> = {
  dog: ['¡Guau!', '¡Guau, guau!', '¡Auuu!', 'Grrr... ¡guau!'],
  cat: ['Miau', 'Prrrrr', 'Miaaau', '¡Fsss!'],
  guineapig: ['¡Uic, uic!', '¡Ñic!', 'Uiiic'],
  ferret: ['¡Dook, dook!', 'Kek kek kek', '¡Dook!'],
  capybara: ['Mmmm...', '¡Uic!', 'Zzz... mm'],
};

/** Pensamientos cuando una necesidad está muy baja. */
export const NEED_THOUGHTS: Record<NeedKey, string[]> = {
  hunger: ['¡Qué hambre!', 'Me comería un caballo', 'Mi estómago ruge...'],
  energy: ['Me caigo de sueño...', 'Necesito una siesta', 'Zzz... ¿eh?'],
  bladder: ['¡Necesito un baño YA!', '¡Que no llego!'],
  hygiene: ['Huelo un poco...', 'Necesito una ducha'],
  fun: ['Me aburro...', 'Qué día más soso'],
  social: ['Necesito hablar con alguien', 'Me siento solo/a...'],
};

/** Comentarios de vez en cuando mientras se hacen algunas cosas. */
export const ACTION_QUIPS: Record<string, string[]> = {
  watch_tv: ['¡Jajaja!', '¡No me lo puedo creer!', '¡Qué buen capítulo!'],
  cook: ['Una pizca de sal...', '¡Huele de maravilla!'],
  eat: ['¡Qué rico!', 'Ñam, ñam'],
  paint: ['Un poco más de azul...', '¡Mi obra maestra!'],
  read: ['Qué buen libro', 'Un capítulo más...'],
  play_games: ['¡Toma ya!', '¡Nooo, me han matado!'],
  run: ['¡Uf, qué cansancio!', 'Un kilómetro más...'],
  pilates: ['Respira... estira...', 'Siento músculos nuevos'],
  reformer: ['¡Uf, cómo quema!', 'Core, core, core...'],
  repair: ['A ver esto...', '¿Dónde está la llave inglesa?'],
  play_chess: ['Mmm... jaque', '¿Y si muevo el caballo?'],
  dance: ['¡Esta canción me encanta!', '¡Vamos!'],
  play_guitar: ['La, la, laaa', '¡Este acorde mola!'],
  busk: ['¡Gracias, gracias!', 'Una moneda, por favor'],
  homework: ['¿Cuánto es 7 por 8?', 'Qué rollo de deberes'],
  clean: ['Qué asco...', 'Ya casi está'],
  clean_litter: ['Qué asco...', 'Misión cumplida'],
  swing: ['¡Más alto!', '¡Wiii!'],
};

// -----------------------------------------------------------------------------
// Conversaciones interactivas
// -----------------------------------------------------------------------------

export const INTERESTS = ['mascotas', 'deporte', 'musica', 'arte', 'cocina', 'ciencia', 'cotilleos', 'viajes'] as const;
export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABEL: Record<Interest, string> = {
  mascotas: 'las mascotas',
  deporte: 'el deporte',
  musica: 'la música',
  arte: 'el arte',
  cocina: 'la cocina',
  ciencia: 'la ciencia',
  cotilleos: 'los cotilleos',
  viajes: 'los viajes',
};

export interface TopicDef {
  id: string;
  label: string;
  icon: string;
  /** Tema de gustos: sale muy bien si le interesa y mal si lo odia. */
  interest?: Interest;
  say: string[];
  good: string[];
  meh: string[];
  bad: string[];
}

export const TOPICS: TopicDef[] = [
  { id: 'dia', label: 'Preguntar qué tal el día', icon: '☀️', say: ['¿Qué tal tu día?', '¿Cómo te va todo?'], good: ['¡Muy bien, gracias por preguntar!', 'Genial, la verdad'], meh: ['Bueno... tirando', 'Normalito'], bad: ['Mejor no preguntes'] },
  { id: 'mascotas', interest: 'mascotas', label: 'Hablar de mascotas', icon: '🐾', say: ['¿Te gustan los animales?', '¿Has visto qué mono es {pet}?'], good: ['¡Me encantan! Son lo mejor', '¡Yo me llevaría a casa a todos!'], meh: ['Están bien, supongo'], bad: ['Puaj, pelos por todas partes'] },
  { id: 'deporte', interest: 'deporte', label: 'Hablar de deporte', icon: '⚽', say: ['¿Viste el partido de ayer?', 'Me he apuntado a pilates'], good: ['¡Qué partidazo! No me lo perdí', '¡Yo también! Es lo mejor'], meh: ['No lo vi, la verdad'], bad: ['El deporte me aburre muchísimo'] },
  { id: 'musica', interest: 'musica', label: 'Hablar de música', icon: '🎵', say: ['¿Qué música te gusta?', '¿Has oído la última canción de moda?'], good: ['¡La música es mi vida!', '¡No paro de escucharla!'], meh: ['Escucho un poco de todo'], bad: ['Esa canción me pone de los nervios'] },
  { id: 'arte', interest: 'arte', label: 'Hablar de arte', icon: '🎨', say: ['¿Te gusta pintar?', 'Fui a una exposición genial'], good: ['¡Me encanta! Tengo el salón lleno de cuadros', '¿Sí? ¡Tienes que llevarme!'], meh: ['No entiendo mucho de arte'], bad: ['Eso de los museos es un rollo'] },
  { id: 'cocina', interest: 'cocina', label: 'Hablar de cocina', icon: '🍳', say: ['¿Sabes hacer tortilla?', 'He probado una receta nueva'], good: ['¡Con cebolla, por supuesto!', '¡Pásamela, por favor!'], meh: ['Yo solo sé hacer huevos fritos'], bad: ['¿Cocinar? Para eso está la pizza'] },
  { id: 'ciencia', interest: 'ciencia', label: 'Hablar de ciencia', icon: '🔬', say: ['¿Sabías que los pulpos tienen tres corazones?', 'He leído algo sobre agujeros negros'], good: ['¡Qué fascinante! Cuéntame más', '¡Me encanta ese tema!'], meh: ['Ah... qué curioso'], bad: ['Uf, me estás dando dolor de cabeza'] },
  { id: 'cotilleos', interest: 'cotilleos', label: 'Cotillear', icon: '🤫', say: ['¿Te has enterado de lo de {gossip}?', 'No se lo digas a nadie, pero {gossip}...'], good: ['¡No me digas! ¡Cuéntamelo todo!', '¡Lo sabía!'], meh: ['Ah, vale...'], bad: ['No me gusta hablar de los demás'] },
  { id: 'viajes', interest: 'viajes', label: 'Hablar de viajes', icon: '✈️', say: ['¿Dónde te irías de vacaciones?', 'Quiero ir a Japón'], good: ['¡A la playa, sin dudarlo!', '¡Qué envidia! Llévame'], meh: ['Yo soy más de quedarme en casa'], bad: ['Odio hacer maletas'] },
  { id: 'cumplido', label: 'Hacer un cumplido', icon: '🌟', say: ['Me caes genial, ¿sabes?', 'Siempre me alegras el día'], good: ['¡Oh, qué bonito! Tú también a mí', 'Gracias, de verdad'], meh: ['Eh... gracias'], bad: ['¿Y eso a qué viene?'] },
  { id: 'chiste', label: 'Contar un chiste', icon: '😂', say: ['¿Qué le dice un pez a otro? ¡Nada!', '¿Cómo se despiden los químicos? ¡Ácido un placer!'], good: ['¡Jajaja! ¡Qué bueno!', 'No puedo con la risa'], meh: ['Je... je', 'Ese ya me lo sabía'], bad: ['Qué malo, por favor'] },
  { id: 'quejarse', label: 'Quejarse de la vida', icon: '😮‍💨', say: ['Estoy un poco agobiado/a...', 'Hoy todo me sale mal'], good: ['Ánimo, aquí me tienes para lo que necesites', 'Ven, cuéntamelo todo'], meh: ['Ya pasará'], bad: ['Todos tenemos problemas, eh'] },
  { id: 'coquetear', label: 'Coquetear', icon: '😏', say: ['¿Sabes que tienes una sonrisa preciosa?', 'Contigo el tiempo vuela'], good: ['Me estás sonrojando...', 'Tú tampoco estás nada mal'], meh: ['Eh... gracias, supongo'], bad: ['Mejor nos quedamos como amigos'] },
  { id: 'parque', label: 'Proponer ir juntos al parque', icon: '🌳', say: ['¿Te vienes al parque conmigo?'], good: ['¡Venga, vamos!'], meh: ['Hoy no puedo, otro día'], bad: ['No me apetece'] },
];

export const TOPIC_BY_ID: Record<string, TopicDef> = Object.fromEntries(TOPICS.map((t) => [t.id, t]));
