// Emociones: cómo se siente cada uno por algo que le ha pasado. Duran unas horas (o días),
// suben o bajan el ánimo y cambian lo que le apetece hacer.

export interface EmotionDef {
  id: string;
  label: string;
  icon: string;
  /** Cuánto suma (o resta) al ánimo. */
  value: number;
  /** Cuánto dura, en horas de juego. */
  hours: number;
  /** Acciones que le apetecen más (o menos) mientras dura. */
  likes?: Record<string, number>;
  /** Lo que piensa al sentirlo (bocadillo). */
  thoughts?: string[];
}

const E: EmotionDef[] = [
  // --- Buenas ---
  { id: 'acai', label: 'Açaí riquísimo', icon: '😋', value: 8, hours: 4, thoughts: ['Qué rico estaba eso', 'Me siento sanísimo/a'] },
  { id: 'casero', label: 'Comida casera', icon: '🍲', value: 6, hours: 4, thoughts: ['Como en casa, en ningún sitio'] },
  { id: 'descansado', label: 'Ha dormido como un bebé', icon: '🛌', value: 10, hours: 8, likes: { run: 1.3, pilates: 1.3 }, thoughts: ['¡Qué bien he dormido!', 'Esta cama es una nube'] },
  { id: 'ducha_spa', label: 'Ducha de hotel', icon: '🧖', value: 6, hours: 4, thoughts: ['Esto es un spa'] },
  { id: 'regalo', label: 'Le han hecho un regalo', icon: '🎁', value: 10, hours: 8, likes: { hug: 1.5, chat: 1.3 }, thoughts: ['¡Qué detalle!', 'No hacía falta... pero me encanta'] },
  { id: 'estreno', label: 'Estrena ropa', icon: '👕', value: 7, hours: 12, likes: { selfie: 1.8 }, thoughts: ['Voy hecho un pincel', 'Qué bien me queda esto'] },
  { id: 'vacaciones', label: 'Vuelve de vacaciones', icon: '🏖️', value: 14, hours: 48, thoughts: ['Qué bien nos lo hemos pasado', 'Ya estoy pensando en las próximas'] },
  { id: 'deseo', label: 'Deseo cumplido', icon: '⭐', value: 10, hours: 6, thoughts: ['¡Lo he conseguido!'] },
  { id: 'orgulloso', label: 'Orgulloso/a de sí', icon: '🏅', value: 15, hours: 24, thoughts: ['Esto hay que celebrarlo', 'Soy un crack'] },
  { id: 'nivel', label: 'Ha mejorado en algo', icon: '📈', value: 6, hours: 6 },
  { id: 'ascenso', label: '¡Le han ascendido!', icon: '🎉', value: 20, hours: 24, thoughts: ['¡Por fin se me reconoce!'] },
  { id: 'enamorado', label: 'Enamorado/a', icon: '😍', value: 12, hours: 12, likes: { flirt: 1.8, kiss: 1.8, hug: 1.5 }, thoughts: ['Qué bonito es el amor', 'No me lo quito de la cabeza'] },
  { id: 'boda', label: 'Recién casados', icon: '💍', value: 25, hours: 48, likes: { kiss: 1.8, hug: 1.6 }, thoughts: ['¡Nos hemos casado!'] },
  { id: 'bebe', label: '¡Bebé en la familia!', icon: '👶', value: 20, hours: 48, likes: { rock_baby: 1.8, play_baby: 1.8 }, thoughts: ['Es lo más bonito del mundo'] },
  { id: 'fiesta', label: 'Fiestón', icon: '🥳', value: 15, hours: 12, likes: { dance: 1.6, chat: 1.3 }, thoughts: ['¡Qué fiesta más buena!'] },
  { id: 'risas', label: 'Se ha reído un montón', icon: '😂', value: 6, hours: 3, likes: { joke: 1.5 } },
  { id: 'abrazo', label: 'Un buen abrazo', icon: '🤗', value: 5, hours: 3 },
  { id: 'inspirado', label: 'Inspirado/a', icon: '💡', value: 6, hours: 4, likes: { paint: 2.2, play_guitar: 2, read: 1.5 }, thoughts: ['Se me ha ocurrido una idea genial'] },
  { id: 'endorfinas', label: 'Subidón de endorfinas', icon: '💪', value: 8, hours: 4, likes: { dance: 1.5, run: 1.3 }, thoughts: ['Me siento invencible'] },
  { id: 'reconciliados', label: 'Han hecho las paces', icon: '🕊️', value: 8, hours: 8 },
  { id: 'selfie', label: 'Selfie con muchos likes', icon: '📸', value: 5, hours: 3 },
  { id: 'mimos', label: 'Mimos de su mascota', icon: '🐾', value: 6, hours: 4, thoughts: ['Es el animal más bueno del mundo'] },
  { id: 'loteria', label: '¡Le ha tocado la lotería!', icon: '🤑', value: 25, hours: 48, thoughts: ['¡Que me ha tocado!', 'Esto no lo dejo, eh. Bueno, igual sí'] },
  { id: 'navidad', label: 'Espíritu navideño', icon: '🎄', value: 10, hours: 24, likes: { hug: 1.5, chat: 1.3 }, thoughts: ['Ya huele a turrón'] },
  { id: 'verbena', label: 'Noche de verbena', icon: '🎆', value: 12, hours: 12, likes: { dance: 2 }, thoughts: ['¡Que suene Paquito el Chocolatero!'] },
  { id: 'jefe_propio', label: 'Jefe/a de sí mismo/a', icon: '🏪', value: 8, hours: 24 },
  { id: 'buen_dia_curro', label: 'Buen día en el trabajo', icon: '😎', value: 8, hours: 6 },
  { id: 'cumple', label: '¡Es su cumpleaños!', icon: '🎂', value: 12, hours: 24, likes: { chat: 1.4, dance: 1.4 }, thoughts: ['¡Un añito más!'] },
  { id: 'casa_nueva', label: 'Casa más grande', icon: '🏡', value: 12, hours: 48, thoughts: ['¡Cuánto sitio!'] },
  { id: 'truco', label: 'Ha aprendido un truco', icon: '🦴', value: 8, hours: 6 },
  { id: 'achispado', label: 'Achispado/a', icon: '🍻', value: 10, hours: 3, likes: { dance: 2, chat: 1.5, joke: 1.6, sing: 2, cana: 1.4, chotis: 1.8 }, thoughts: ['¡Qué bien se está aquí!', 'Una más y me voy. De verdad'] },
  { id: 'borracho', label: 'Borracho/a', icon: '🥴', value: 4, hours: 3, likes: { dance: 2.2, sing: 2.5, flirt: 2, insult: 1.6, argue: 1.5, fart: 2, joke: 1.4 }, thoughts: ['El suelo se mueve...', '¿Dónde he dejado las llaves?'] },
  { id: 'rapeado', label: '¡Le han dedicado un rap!', icon: '🎤', value: 10, hours: 6, thoughts: ['¡Soy famoso/a en el metro!'] },
  { id: 'salseo', label: 'Se ha enterado de un salseo', icon: '🌶️', value: 5, hours: 4, likes: { gossip_with: 2, chat: 1.4 }, thoughts: ['Esto lo tengo que contar', '¡Qué fuerte!'] },
  { id: 'traicionado', label: 'Le han puesto los cuernos', icon: '🦌', value: -25, hours: 72, likes: { argue: 2.5, insult: 1.6, eat: 1.5, listen_music: 1.5, flirt: 0.3 }, thoughts: ['¿Cómo ha podido?', 'Con lo que yo le quería...'] },
  { id: 'remordimientos', label: 'Remordimientos', icon: '😬', value: -6, hours: 24, thoughts: ['Esto no está bien...'] },
  { id: 'reyes', label: '¡Han venido los Reyes!', icon: '🎁', value: 14, hours: 24, likes: { play_games: 1.6, hug: 1.4 }, thoughts: ['¡Me han traído justo lo que pedí!'] },
  { id: 'roscon', label: 'Se ha comido su trozo de roscón', icon: '🥯', value: 4, hours: 12 },
  { id: 'rey_roscon', label: 'Rey/reina del roscón', icon: '👑', value: 8, hours: 14, thoughts: ['Aquí mando yo, que llevo corona'] },
  { id: 'caramelos', label: 'Con la bolsa llena de caramelos', icon: '🍬', value: 8, hours: 8, likes: { dance: 1.3, joke: 1.3 }, thoughts: ['¡He cogido un montón!'] },
  { id: 'disfrazado', label: 'Disfrazado/a', icon: '🎭', value: 8, hours: 14, likes: { dance: 1.8, joke: 1.6, chat: 1.3 }, thoughts: ['Nadie me reconoce', '¿A que voy guapísimo/a?'] },
  { id: 'premio_disfraz', label: '¡Ha ganado el concurso de disfraces!', icon: '🏆', value: 18, hours: 24, thoughts: ['El mejor disfraz del barrio'] },
  { id: 'gamberrada', label: 'Le han hecho un truco', icon: '🧻', value: -5, hours: 6, thoughts: ['El año que viene compro caramelos'] },
  { id: 'regateo', label: 'Ha conseguido rebaja', icon: '🤝', value: 4, hours: 2, thoughts: ['¡A mitad de precio! Soy un/a crack'] },
  { id: 'chollo', label: 'Ha encontrado un chollo', icon: '🏺', value: 7, hours: 8, thoughts: ['Esto en una tienda vale el triple'] },
  { id: 'desfogado', label: 'Se ha desfogado', icon: '🥊', value: 6, hours: 4, thoughts: ['Como nuevo/a'] },
  { id: 'castizo', label: 'Castizo/a', icon: '🎩', value: 10, hours: 12, likes: { chotis: 2.5, dance: 1.5 }, thoughts: ['¡Viva San Isidro!'] },
  { id: 'glovo', label: 'Comida a domicilio', icon: '🛵', value: 5, hours: 3 },
  { id: 'premio', label: '¡Premio en la tragaperras!', icon: '🎰', value: 12, hours: 6, likes: { tragaperras: 2 }, thoughts: ['¡Lo sabía! ¡Esta máquina me debía una!'] },
  { id: 'gol', label: '¡Ha ganado su equipo!', icon: '⚽', value: 10, hours: 12, thoughts: ['¡Campeones, campeones!'] },
  { id: 'derrota', label: 'Ha perdido su equipo', icon: '😤', value: -6, hours: 12, thoughts: ['El árbitro, que estaba comprado'] },
  { id: 'mojado', label: 'Calado/a hasta los huesos', icon: '☔', value: -4, hours: 3, likes: { shower: 1.4, bath: 1.5, watch_tv: 1.3 }, thoughts: ['¿Quién se ha dejado el paraguas?'] },
  { id: 'deseo_fuente', label: 'Ha pedido un deseo', icon: '⛲', value: 4, hours: 6 },
  // --- Malas ---
  { id: 'cobra', label: 'Le han hecho la cobra', icon: '😳', value: -10, hours: 6, likes: { flirt: 0.3, kiss: 0.3 }, thoughts: ['Tierra, trágame', 'Qué vergüenza...'] },
  { id: 'calabazas', label: 'Le han dado calabazas', icon: '🎃', value: -18, hours: 24, likes: { flirt: 0.2, eat: 1.4, watch_tv: 1.4 }, thoughts: ['Con lo bien que íbamos...'] },
  { id: 'insultado', label: 'Le han insultado', icon: '😠', value: -8, hours: 6, likes: { insult: 2, argue: 2, joke: 0.5 }, thoughts: ['Esto no se va a quedar así'] },
  { id: 'enfadado', label: 'Enfadado/a', icon: '😡', value: -10, hours: 8, likes: { argue: 2.5, insult: 1.6, chat: 0.5, joke: 0.4, run: 1.4 }, thoughts: ['¡Qué rabia me da!', 'No me hables ahora'] },
  { id: 'luto', label: 'De luto', icon: '🖤', value: -20, hours: 72, likes: { watch_tv: 1.5, hug: 1.6, remember: 2.5, joke: 0.3, dance: 0.2 }, thoughts: ['Le echo tanto de menos...'] },
  { id: 'corazon_roto', label: 'Corazón roto', icon: '💔', value: -18, hours: 48, likes: { eat: 1.5, watch_tv: 1.5, flirt: 0.3, listen_music: 1.5 }, thoughts: ['¿Por qué a mí?', 'Pon una de Alejandro Sanz'] },
  { id: 'celos', label: 'Celoso/a', icon: '😤', value: -12, hours: 12, likes: { argue: 2 }, thoughts: ['¿Y ese/a quién es?'] },
  { id: 'despedido', label: 'Le han despedido', icon: '📦', value: -18, hours: 48, thoughts: ['¿Y ahora qué hago?'] },
  { id: 'estresado', label: 'Estresado/a', icon: '😩', value: -8, hours: 8, likes: { nap_sofa: 1.5, watch_tv: 1.4, bath: 1.6, pilates: 1.5 }, thoughts: ['No llego a todo'] },
  { id: 'espalda', label: 'Dolor de espalda', icon: '🦴', value: -6, hours: 6, likes: { run: 0.5, pilates: 1.6, bath: 1.4 }, thoughts: ['Ay, mi espalda...', 'Esta cama es una tabla'] },
  { id: 'verguenza', label: 'Qué vergüenza', icon: '🙈', value: -6, hours: 4 },
  { id: 'calor', label: 'Qué calor...', icon: '🥵', value: -5, hours: 6, likes: { shower: 1.5, swim: 1.6, smoothie: 1.6, run: 0.5 }, thoughts: ['Me derrito', 'Esto es el infierno'] },
  { id: 'apagon', label: 'Sin luz', icon: '🕯️', value: -6, hours: 4, thoughts: ['¿Alguien sabe dónde están las velas?'] },
  { id: 'cuota', label: 'Ha pagado la cuota de autónomos', icon: '🧾', value: -6, hours: 12, thoughts: ['Trabajo para pagar la cuota'] },
  { id: 'mal_dia_curro', label: 'Mal día en el trabajo', icon: '😒', value: -8, hours: 6, likes: { watch_tv: 1.4, nap_sofa: 1.3 } },
  { id: 'resaca', label: 'Resaca', icon: '🤕', value: -6, hours: 8, likes: { nap_sofa: 1.8, sleep: 1.3, dance: 0.3 }, thoughts: ['No vuelvo a beber', 'Que no me hablen alto'] },
];

export const EMOTIONS: Record<string, EmotionDef> = Object.fromEntries(E.map((e) => [e.id, e]));
