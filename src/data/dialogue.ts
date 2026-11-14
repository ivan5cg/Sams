// Frases de los personajes: conversaciones, sonidos de animales y pensamientos.
// Muy de aquí: cañas, tortilla, el pueblo, los lunes... y algún que otro cuñado.

import type { NeedKey, SpeciesId } from '../sim/types';

/** Chistes malos (de los de toda la vida). */
export const CHISTES: [string, string][] = [
  ['¿Qué le dice un techo a otro? Techo de menos', '¡Jajaja! Qué malo, por favor'],
  ['¿Cómo se llama el campeón japonés de buceo? Tokofondo', 'Jajaja, ¿y el subcampeón? Kasitoko'],
  ['¿Qué le dice una iguana a su hermana gemela? Iguanita', 'No puedo con la risa'],
  ['¿Por qué las focas miran al cielo? ¡Porque ahí están los focos!', 'Jajaja, ese me lo apunto'],
  ['¿Cómo se dice pañuelo en japonés? Saka-moko', '¡Jajajaja!'],
  ['¿Qué le dice un jardinero a otro? Disfrutemos mientras podamos', 'Jajaja, qué bueno'],
  ['¿Cómo se llama el primo vegetariano de Bruce Lee? Broco-Lee', '¡Jajaja! Esto es de cuñado total'],
  ['Van dos y se cae el del medio', '...¿qué? ¡Jajaja!'],
  ['¿Qué hace una abeja en el gimnasio? ¡Zum-ba!', 'Jajaja, me meo'],
  ['¿Cuál es el colmo de un electricista? Que su mujer se llame Luz y sus hijos le sigan la corriente', '¡Jajaja, muy bueno!'],
  ['Mamá, mamá, en el colegio me llaman despistado. —Niño, tú no vives aquí', 'Jajaja, pobre crío'],
  ['¿Sabes por qué el mar es azul? Porque los peces hacen blu, blu, blu', 'Jajaja, qué chorrada'],
  ['¿Qué le dice el uno al diez? Para ser como yo, tienes que ser sincero', '¡Jajaja!'],
];

/** Pares [lo que dice quien empieza, lo que responde el otro] para cada interacción. */
export const ACTION_LINES: Record<string, [string, string][]> = {
  chat: [
    ['¿Qué pasa, máquina? ¿Cómo va eso?', 'Aquí andamos, tirando'],
    ['¿Nos tomamos unas cañas luego?', '¡Y unas bravas, que no falten!'],
    ['¿Tortilla con cebolla o sin cebolla?', 'Con cebolla. Lo otro es un crimen'],
    ['Vaya calor que hace, ¿eh?', 'Y lo que queda, hijo, y lo que queda'],
    ['¿Has visto cómo está el aceite?', 'Por las nubes. Ya es oro líquido'],
    ['Este verano me voy al pueblo', 'Allí sí que se está bien, con la fresca'],
    ['¿Viste el partido de anoche?', '¡Penalti clarísimo y no lo pitó!'],
    ['He estado en el Mercadona y me he dejado un dineral', 'Si es que vas a por pan y sales con cien euros'],
    ['¿Tú duermes siesta?', 'Todos los días. Es Patrimonio de la Humanidad'],
    ['¿A qué hora cenáis vosotros?', 'Pronto, a las diez'],
    ['¿Me has visto el móvil?', 'Lo tienes en la mano'],
    ['¿Has visto lo que hizo el hurón?', 'Ese bicho tiene más vicios que un cuñado'],
  ],
  talk: [['Oye, ¿tienes un momento?', 'Claro, dime']],
  joke: CHISTES,
  hug: [
    ['¡Ven aquí, que te doy un achuchón!', '¡Ay, qué gusto!'],
    ['Necesitaba un abrazo', 'Y yo, hombre, y yo'],
  ],
  insult: [
    ['¡Eres más pesado que una vaca en brazos!', '¡Y tú más borde que un bordillo!'],
    ['¡Vaya pintas llevas, hijo!', '¡Mira quién fue a hablar!'],
    ['¡Baja la música, que son las tantas!', '¡Pues cómprate unos tapones!'],
    ['¡Tienes menos gracia que un pez espada!', '¡Y tú menos luces que un barco pirata!'],
  ],
  flirt: [
    ['¿Estudias o trabajas?', 'Jajaja, ¿en serio? ¿Esa frase todavía funciona?'],
    ['Si la belleza fuera delito, te caía cadena perpetua', 'Ay, calla, calla... sigue'],
    ['Hoy estás que lo tiras', 'Me vas a sacar los colores...'],
    ['¿Te han dicho alguna vez que tienes unos ojos preciosos?', '¿Ah, sí? Cuéntame más'],
  ],
  kiss: [['Mua', '♥']],
  ask_partner: [['¿Quieres salir conmigo?', '¡Sí, claro que sí!']],
  propose: [['¿Te quieres casar conmigo? Con banquete y todo', '¡Sí! ¡Y que haya barra libre!']],
  move_in: [['¿Y si nos vamos a vivir juntos?', '¡Me encantaría! Pero el mando de la tele es mío']],
  try_baby: [['¿Y si tenemos un bebé?', 'Vamos a intentarlo']],
  niqui: [['¿Nos vamos un ratito a la habitación?', 'Me parece un plan estupendo']],
  say_goodbye: [
    ['Venga, que me voy, que mañana madrugo', '¡Hala, hasta luego!'],
    ['Bueno, ya si eso nos vemos', 'Venga, dale recuerdos a tu madre'],
  ],
  feed_baby: [['Aquí viene el avioncito... ¡brrrum!', '¡Ba-ba!']],
  change_diaper: [['Madre mía, qué olor... ¿qué has comido?', 'Agú']],
  rock_baby: [['Duérmete niño, duérmete ya...', 'Mmm...']],
  play_baby: [['¿Dónde está el bebé? ¡Aquí está!', '¡Jijiji!']],
  pet_animal: [['¿Quién es el más bonito de la casa? ¡Tú!', '*']],
  play_pet: [['¡A por ella, campeón!', '*']],
  walk_dog: [['¿Vamos a dar un paseíto?', '*']],
  bathe_pet: [['Quieto, que es un momentito', '*']],
  brush_capy: [['Qué pelito más bonito tienes', '*']],
  beg_affection: [['*', 'Ay, ven aquí, bonito']],
  play_with_person: [['*', '¡Vale, venga, vamos a jugar!']],
};

/** Respuestas cuando un cuñado empieza la conversación (y su réplica de sabelotodo). */
export const CUNADO_LINES: [string, string][] = [
  ['Esto lo arreglaba yo en dos tardes', 'Ya, como la estantería, ¿no?'],
  ['Tú lo que tienes que hacer es comprarte un piso', 'Claro, con qué dinero'],
  ['El aceite de oliva lo cura todo, te lo digo yo', 'Eso dice mi abuela también'],
  ['Yo a tu edad ya tenía dos pisos y un apartamento en la playa', 'Y yo me lo creo'],
  ['¿Cuánto te ha costado el coche? Te han timado', 'Pero si aún no te lo he dicho'],
  ['Si me hicieran caso a mí, otro gallo cantaría', 'Ya empezamos...'],
  ['Eso con WD-40 se arregla', '¿El qué? Si no te he contado nada'],
  ['Un primo mío trabaja en eso y dice que...', 'Tu primo trabaja en todo, ¿eh?'],
  ['La paella con chorizo es la buena', '¡Eso es un delito en Valencia!'],
  ['Yo de fútbol sé más que el entrenador', 'Pues que te fiche, hombre'],
];

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
  hunger: ['Me comería un bocata de calamares', 'Tengo más hambre que el perro de un ciego', 'Unas bravas me salvarían la vida'],
  energy: ['Necesito una siesta como el comer', 'Me caigo de sueño...', 'Estoy más cansado/a que un perro de dos amos'],
  bladder: ['¡Que no llego!', 'Necesito un baño YA', '¡Ay, ay, ay!'],
  hygiene: ['Huelo a tigre...', 'Necesito una ducha urgente', 'Hoy no me arrimo a nadie'],
  fun: ['Me aburro como una ostra', 'Qué día más soso', 'Esto es más aburrido que un domingo por la tarde'],
  social: ['Necesito hablar con alguien', 'Qué sola/o me siento...', '¿Nadie quiere un café?'],
};

/** Comentarios de vez en cuando mientras se hacen algunas cosas. */
export const ACTION_QUIPS: Record<string, string[]> = {
  watch_tv: ['¡Jajaja!', 'Otra vez anuncios...', 'Este concurso está amañado', '¡Pero qué tonto el del programa!'],
  cook: ['Un chorrito de aceite...', '¡Huele a gloria!', 'Como la de mi madre, ninguna', 'Le falta una pizca de sal'],
  eat: ['¡Qué rico!', 'Ñam, ñam', 'Esto está de rechupete', 'Como en casa, en ningún sitio'],
  snack: ['Solo un poquito...', 'Una más y lo dejo'],
  paint: ['Un poco más de azul...', '¡Mi obra maestra!', 'Esto en el Prado no lo tienen'],
  read: ['Qué buen libro', 'Un capítulo más y apago'],
  play_games: ['¡Toma ya!', '¡Nooo, que me han matado!', 'Una partida más y lo dejo'],
  run: ['¡Uf, qué fatiga!', 'Un kilómetro más...', 'Esto lo hago por las torrijas de Semana Santa'],
  pilates: ['Respira... estira...', 'Siento músculos que no sabía que tenía'],
  reformer: ['¡Ay, cómo quema!', 'Core, core, core...', 'Mañana no me levanto'],
  repair: ['A ver esto...', '¿Quién ha tocado esto?', 'Esto con un poco de cinta americana...'],
  play_chess: ['Mmm... jaque', '¿Y si muevo el caballo?'],
  dance: ['¡Esta canción me encanta!', '¡Que no pare la fiesta!', '¡Vamos!'],
  play_guitar: ['La, la, laaa', '¡Este acorde mola!', 'Ahora, una de Sabina'],
  busk: ['¡Gracias, gracias!', 'Una monedita, por favor', 'Ahora, una rumbita'],
  homework: ['¿Cuánto es 7 por 8?', 'Qué rollo de deberes', 'Esto no lo vamos a usar nunca'],
  clean: ['Qué asco, por favor', 'Ya casi está'],
  clean_litter: ['Qué asco...', 'Misión cumplida'],
  swing: ['¡Más alto!', '¡Wiii!'],
  sit_bench: ['Aquí se está de lujo', 'Qué bien se está a la fresca'],
  shop_small: ['¿Quiere bolsa? —No, traigo la mía', 'Vengo a por pan y me llevo media tienda', 'Esto la semana pasada estaba más barato'],
  shop_big: ['¡Ciento veinte euros! ¿Pero qué he comprado?', 'Necesito otro carro', 'Que no se me olvide el papel higiénico'],
  browse_aisles: ['¿Dónde estará el tomate frito?', '¡Han cambiado todo de sitio otra vez!', 'Uy, esto es nuevo... al carro', 'La pizza de jamón y queso, la mejor', '¿Y la leche? ¿Dónde han puesto la leche?'],
  buy_fruit: ['Qué buena pinta tienen estas fresas', 'Una manzana al día...'],
  acai_bowl: ['Esto es superfood, ¿eh?', 'Lleva granola, plátano, fresas... y lo morado', 'Qué rico y qué sano', 'Esto me da energía para todo el día'],
  smoothie: ['Mmm, de mango', 'Esto es puro antioxidante'],
  selfie: ['#açaí #healthy #barrio', 'Esta para Instagram', 'Que se vea el bowl, que se vea', 'Una más, que he salido con los ojos cerrados'],
  buy_hotdog: ['¡Con mostaza, por favor!', 'Esto es alta cocina'],
};

// -----------------------------------------------------------------------------
// Conversaciones interactivas
// -----------------------------------------------------------------------------

export const INTERESTS = ['mascotas', 'deporte', 'musica', 'arte', 'cocina', 'ciencia', 'cotilleos', 'viajes'] as const;
export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABEL: Record<Interest, string> = {
  mascotas: 'las mascotas',
  deporte: 'el fútbol',
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
  { id: 'dia', label: 'Preguntar qué tal le va', icon: '☀️', say: ['¿Qué tal todo? ¿Cómo va la vida?', '¿Qué pasa, cómo estás?'], good: ['¡Muy bien! Aquí, disfrutando', 'Pues mira, no me puedo quejar'], meh: ['Tirando, que no es poco', 'Ahí vamos, como siempre'], bad: ['Mejor no preguntes, que me enciendo'] },
  { id: 'mascotas', interest: 'mascotas', label: 'Hablar de las mascotas', icon: '🐾', say: ['¿Has visto qué mono es {pet}?', '¿Tú eres más de perros o de gatos?'], good: ['¡Me encantan! Son lo mejor del mundo', '¡Yo me los llevaría a todos a casa!'], meh: ['Están bien, pero sueltan mucho pelo'], bad: ['Puaj, pelos por todas partes. Ni hablar'] },
  { id: 'deporte', interest: 'deporte', label: 'Hablar de fútbol', icon: '⚽', say: ['¿Viste el partido de anoche? ¡Vaya penalti!', 'Este año ganamos la liga, te lo digo yo'], good: ['¡Clarísimo! El árbitro estaba ciego', '¡Ojalá! Este año sí que sí'], meh: ['No lo vi, estaba en el pueblo'], bad: ['Once tíos detrás de un balón. Qué aburrimiento'] },
  { id: 'musica', interest: 'musica', label: 'Hablar de música', icon: '🎵', say: ['¿Te vienes a un concierto en las fiestas del pueblo?', '¿Has oído la canción del verano?'], good: ['¡Ahí estaré, en primera fila!', '¡No me la quito de la cabeza!'], meh: ['Yo escucho un poco de todo'], bad: ['Esa canción me pone de los nervios'] },
  { id: 'arte', interest: 'arte', label: 'Hablar de arte', icon: '🎨', say: ['¿Has ido al Prado?', 'He pintado un cuadro, ¿quieres verlo?'], good: ['¡Me encanta! Las Meninas me dejaron sin palabras', '¡Claro! A ver ese Picasso'], meh: ['Yo de arte entiendo poco'], bad: ['Eso de los museos es un tostón'] },
  { id: 'cocina', interest: 'cocina', label: 'Debate: tortilla con o sin cebolla', icon: '🍳', say: ['Vamos a zanjar esto: ¿tortilla con cebolla o sin cebolla?', '¿Cuál es tu receta estrella?'], good: ['¡Con cebolla, por supuesto! Lo demás es un crimen', 'Mis croquetas. Las de mi abuela, vamos'], meh: ['A mí mientras tenga patata...'], bad: ['Sin cebolla. Y no hay más que hablar. Fin'] },
  { id: 'ciencia', interest: 'ciencia', label: 'Contar un dato curioso', icon: '🔬', say: ['¿Sabías que los pulpos tienen tres corazones?', '¿Sabías que un día en Venus dura más que un año?'], good: ['¡Qué fuerte! Cuéntame más', '¡Me encantan estas cosas!'], meh: ['Ah... qué curioso'], bad: ['Uf, me estás dando dolor de cabeza'] },
  { id: 'cotilleos', interest: 'cotilleos', label: 'Cotillear', icon: '🤫', say: ['¿Te has enterado de que {news}?', 'Yo no digo nada, pero... {news}'], good: ['¡No me digas! ¡Cuéntamelo todo!', '¡Lo sabía! Si es que se veía venir'], meh: ['Ah, vale... no lo sabía'], bad: ['No me gusta hablar de la gente a sus espaldas'] },
  { id: 'viajes', interest: 'viajes', label: 'Hablar de las vacaciones', icon: '🏖️', say: ['¿Dónde os vais este verano? ¿A Benidorm?', 'Estoy pensando en ir al pueblo en agosto'], good: ['¡A la playa, con la sombrilla y la tortilla!', '¡Al pueblo, a la fresca y a las fiestas!'], meh: ['Yo este año me quedo en casa'], bad: ['Odio hacer maletas. Y los atascos'] },
  { id: 'precios', label: 'Quejarse de lo caro que está todo', icon: '💸', say: ['¿Has visto cómo está todo de caro?', 'El aceite ya está a precio de oro'], good: ['¡Ni me hables! Vas a por pan y te dejas cincuenta euros', 'Si es que no se puede vivir'], meh: ['Ya, ya... es lo que hay'], bad: ['Bueno, tampoco es para tanto, ¿no?'] },
  { id: 'cumplido', label: 'Hacer un cumplido', icon: '🌟', say: ['Me caes genial, ¿sabes?', 'Siempre me alegras el día'], good: ['¡Oh, qué bonito! Tú a mí también', 'Gracias, de verdad, eres un sol'], meh: ['Eh... gracias'], bad: ['¿Y eso a qué viene ahora?'] },
  { id: 'chiste', label: 'Contar un chiste', icon: '😂', say: ['¿Qué le dice un techo a otro? Techo de menos', '¿Cómo se llama el campeón japonés de buceo? Tokofondo'], good: ['¡Jajaja! ¡Qué bueno!', 'No puedo con la risa, ¡para!'], meh: ['Je... je. Ese ya me lo sabía', 'Ese es más viejo que la tos'], bad: ['Qué malo, por favor. Eres un cuñado'] },
  { id: 'quejarse', label: 'Desahogarse', icon: '😮‍💨', say: ['Estoy un poco agobiado/a con todo...', 'Hoy todo me sale mal'], good: ['Ánimo, aquí me tienes para lo que necesites', 'Ven, que te invito a un café y me lo cuentas'], meh: ['Ya pasará, hombre'], bad: ['Pues anda que yo... déjame que te cuente lo mío'] },
  { id: 'coquetear', label: 'Coquetear', icon: '😏', say: ['¿Estudias o trabajas?', 'Si la belleza fuera delito, te caía cadena perpetua'], good: ['Ay, calla, calla... sigue', 'Me estás sacando los colores'], meh: ['Jajaja, ¿esa frase todavía funciona?'], bad: ['Mejor nos quedamos como amigos, ¿vale?'] },
  { id: 'parque', label: 'Proponer ir juntos al parque', icon: '🌳', say: ['¿Te vienes a dar una vuelta por el parque?'], good: ['¡Venga, vamos, que hace un día estupendo!'], meh: ['Hoy no puedo, otro día'], bad: ['No me apetece nada'] },
];

export const TOPIC_BY_ID: Record<string, TopicDef> = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

/** Reacciones a las noticias del barrio. */
export const NEWS_REPLIES = ['¡No me digas!', '¡Qué fuerte!', 'Eso ya lo sabe todo el barrio', 'Lo sabía, se veía venir', 'Calla, calla, que me da algo'];
export const CUNADO_NEWS_REPLIES = ['Eso ya lo sabía yo hace un mes', 'Normal, si es que yo ya lo dije', 'Pues un primo mío dice que no es así'];
