// Gente de la calle (metro, plaza, bar...) y lo que dicen. Humor de barrio, sin meterse con nadie por su origen.

export type Role = 'vendedor' | 'rapero' | 'musico' | 'chismosa' | 'militante' | 'glovo' | 'jefe' | 'colega';

export interface RoleNpc {
  role: Role;
  name: string;
  /** Dónde está (id de parcela). */
  post: string;
  /** Mujer mayor, joven... para el dibujo y la edad. */
  ageDays: number;
  color: number;
}

export const STREET_NPCS: RoleNpc[] = [
  { role: 'vendedor', name: 'El de los chicles', post: 'MT', ageDays: 38, color: 0x6a8caf },
  { role: 'rapero', name: 'MC Kalimotxo', post: 'MT', ageDays: 23, color: 0x222222 },
  { role: 'musico', name: 'El del acordeón', post: 'MT', ageDays: 64, color: 0x7b4f2c },
  { role: 'chismosa', name: 'Doña Puri', post: 'P', ageDays: 78, color: 0x7b4fa0 },
  { role: 'chismosa', name: 'Doña Remedios', post: 'P', ageDays: 81, color: 0x2e5e4e },
  { role: 'chismosa', name: 'Doña Encarna', post: 'PL', ageDays: 79, color: 0x8b2e3c },
  { role: 'chismosa', name: 'Doña Maruja', post: 'PL', ageDays: 83, color: 0x3a4a7a },
  { role: 'militante', name: 'Mari Carmen', post: 'P', ageDays: 52, color: 0xd62828 },
  { role: 'militante', name: 'Pilar', post: 'PL', ageDays: 47, color: 0xe63946 },
  { role: 'glovo', name: 'Jonathan (rider)', post: 'MT', ageDays: 25, color: 0x3a3f4a },
  { role: 'glovo', name: 'Sergio (rider)', post: 'MT', ageDays: 29, color: 0x2d6a4f },
];

export const ROLE_LABEL: Record<Role, string> = {
  vendedor: 'Vendedor de chuches',
  rapero: 'Rapero del metro',
  musico: 'Músico del metro',
  chismosa: 'Vecina cotilla',
  militante: 'Militante del POC',
  glovo: 'Repartidor de Glovo',
  jefe: 'Jefe/a',
  colega: 'Compañero/a de trabajo',
};

/** Lo que se oye en la oficina. */
export const BOSS_LINES = [
  '¿Cómo vamos con lo mío?',
  'Esto lo quiero para ayer',
  'Somos una gran familia',
  'A ver, una cosita rápida...',
  'Hay que darlo todo, chicos',
  'Mi puerta siempre está abierta',
  'Reunión en cinco minutos',
];
export const MATE_LINES = [
  '¿Un cafelito?',
  'Qué ganas de que sea viernes',
  '¿Te has enterado de lo de contabilidad?',
  'El jefe hoy viene de malas',
  'Otra reunión que podía haber sido un correo',
  '¿Quién se ha comido mi yogur?',
  'Esto no me lo pagan',
  '¿Hacemos un afterwork el jueves?',
];

export const VENDOR_LINES = [
  '¡Chupachups, chicles, kleenex, a un euro!',
  '¡Agua fresquita, agua!',
  'Señores pasajeros, perdonen las molestias...',
  '¡Pilas, pañuelos, chuches para los niños!',
  '¡Tres por dos euros, aprovecha!',
];

export const ACCORDION_LINES = ['♪ Bésame, bésame mucho... ♪', '♪ Paquito el Chocolatero... ♪', '♪ Libertango ♪', '♪ El chotis de siempre ♪'];

export const CHISMOSA_LINES = [
  '¿Te has enterado de lo de la del cuarto?',
  'Yo no digo nada, pero...',
  'Esa niña va a acabar mal, te lo digo yo',
  'A mí me lo ha contado alguien que lo sabe',
  'En mis tiempos esto no pasaba',
  'Calla, calla, que viene',
  'Lo que yo te diga: ahí hay tomate',
  'Hija, es que la gente no tiene vergüenza',
];

export const CAMPAIGN_LINES = [
  '¿Ha pensado ya a quién va a votar el domingo?',
  'Le dejo un folleto y una rosa, guapo/a',
  '¡Por una sanidad pública de calidad!',
  '¿Le puedo dejar un bolígrafo? Son gratis',
  'Este domingo, todos a votar, ¿eh?',
];

export const GLOVO_LINES = ['¡Glovo! ¿Es aquí?', 'Ponme cinco estrellas, porfa', 'Que llego tarde al siguiente pedido', 'La bici sin batería y cuesta arriba, qué ilusión'];

export const OKUPA_LINES: [string, string][] = [
  ['La vivienda es un derecho, no un negocio', 'Ya, ya... ¿y la luz quién la paga?'],
  ['¿Tienes un mechero?', 'No fumo, hijo'],
  ['Esta casa estaba vacía cinco años', 'Pues ahora tiene más vida que nunca'],
];

export const DRUNK_LINES = [
  '¡Te quiero mucho, tío! ¡Mucho!',
  '¡Camarero, otra ronda!',
  'Que no estoy borracho, que estoy contento',
  '¡Esta noche no vuelvo a casa!',
  '¿Tú sabes lo que te aprecio yo a ti?',
  '¡Que suene Raphael!',
  'Yo antes era muy bueno al fútbol, ¿eh?',
];

export const FART_LINES = ['Ups...', '¡Ha sido el perro!', 'Esto es salud', 'Perdón, perdón...', '¡Uy! ¿Habéis oído eso?'];
export const FART_REACTIONS = ['¡Qué peste!', '¿Quién ha sido?', '¡Abre la ventana!', '¡Cerdo/a!', 'Madre mía, qué atufo'];
export const FART_LAUGHS = ['¡JAJAJA! ¡Qué artista!', '¡Ese ha sonado a trompeta!', '¡Un aplauso!'];

/** Expresiones castizas para las charlas. */
export const MADRID_PAIRS: [string, string][] = [
  ['¡Esto mola mazo!', '¡Qué chachi!'],
  ['¿Nos vamos de cañas?', 'Venga, pero solo una. (Nunca es solo una)'],
  ['¿Un bocata de calamares en la Plaza Mayor?', 'Eso y un vermut, y me muero feliz'],
  ['De Madrid al cielo', 'Y un agujerito para verlo'],
  ['¿Tú eres más del Madrid o del Atleti?', 'Eso no se pregunta, que acabamos mal'],
  ['¡Al loro con lo que te voy a contar!', 'Suelta, suelta'],
  ['Me piro, vampiro', 'Hasta luego, Lucas'],
  ['¿Has ido al Rastro este domingo?', 'Me compré una lámpara que no funciona. Pero qué bonita'],
  ['El metro va a reventar', 'Como todos los días a las ocho'],
];

export const ALCORCON_PAIRS: [string, string][] = [
  ['Alcorcón es Madrid, digan lo que digan', 'Bueno... más o menos'],
  ['¿Has visto el Alcorcón contra el Madrid de aquella vez?', '¡El Alcorconazo! Eso no se olvida'],
  ['Desde aquí, con el MetroSur, estás en Madrid en nada', 'En nada... y tres transbordos'],
];

/** Plantillas del rap: cada una son dos versos que riman. {name}, {x}... se rellenan. */
export const RAP_INTRO: [string, string][] = [
  ['¡Yo, yo! Esto va pa {name}, que acaba de subir', 'en este vagón se ha venido a lucir'],
  ['Atención al vagón, que viene {name}', 'con más flow que el metro a las seis de la tarde, ¡bam!'],
];
export const RAP_VERSES: Record<string, [string, string][]> = {
  job: [['Curra de {x}, se lo curra de verdad', 'y luego en el metro, ¡qué felicidad!']],
  paro: [['Está en el paro pero tiene mucho flow', 'si buscas curro, ¡el Glovo ya llegó!']],
  pet: [['Tiene un {x} en casa que se llama {y}', 'lo quiere más que a la tortilla, ¡no te miento, bro!']],
  partner: [['Va con {x}, el amor de su vida', 'más dulce que una rosquilla, ¡qué movida!']],
  cunado: [['Dice que lo sabe todo, un cuñao de manual', 'te arregla el país antes de Alcorcón Central']],
  deportista: [['Corre en la cinta, hace pilates, no para', 'tiene unas piernas que ni la Cibeles se compara']],
  gloton: [['Se come las bravas, los churros y el bocata', 'y luego en el metro va pidiendo la lata']],
  enamorado: [['Viene enamorao, se le nota en la mirada', 'pa mí que en Alcorcón tiene a alguien esperando en la parada']],
};
export const RAP_OUTRO: [string, string][] = [
  ['¡Una monedita pa el artista, que esto es arte de verdad!', '¡Y viva Alcorcón, Madrid y toda la Comunidad!'],
  ['Esto ha sido MC Kalimotxo, rimando sin parar', 'si te ha gustao, ya sabes: ¡un eurito y a votar!'],
];

/** Plantillas de salseo entre vecinos: {x}, {y} = personas, {p} = pareja de {x}. */
export const GOSSIP_TEMPLATES: { text: string; juicy: number; needs?: 'partner' | 'two' | 'single' | 'jobless' | 'job' }[] = [
  { text: '{x} debe dinero a medio barrio', juicy: 2 },
  { text: '{x} y {y} se han peleado por una plaza de aparcamiento', juicy: 1, needs: 'two' },
  { text: 'a {x} le vieron salir del bar a las cuatro de la mañana cantando «Paquito el Chocolatero»', juicy: 2 },
  { text: '{x} dice que trabaja en un banco, pero está en el paro', juicy: 2, needs: 'jobless' },
  { text: '{x} dice que es jefe/a, pero es el/la becario/a', juicy: 1, needs: 'job' },
  { text: '{x} se ha operado la nariz y dice que es de nacimiento', juicy: 2 },
  { text: '{x} tiene 3.000 puntos en la tarjeta del súper y no los gasta nunca', juicy: 1 },
  { text: '{x} ha suspendido el carné de conducir por quinta vez', juicy: 1 },
  { text: '{x} le lee los WhatsApp a {p} cuando duerme', juicy: 2, needs: 'partner' },
  { text: '{x} ha ido a una vidente para saber si {p} le quiere', juicy: 2, needs: 'partner' },
  { text: 'a {x} le pillaron llevándose los sobres de azúcar del bar', juicy: 1 },
  { text: '{x} está buscando pareja por internet. Y se ha puesto diez años menos', juicy: 2, needs: 'single' },
  { text: '{x} y {y} se tiraron los tejos en la verbena', juicy: 2, needs: 'two' },
  { text: '{x} se ha comprado un coche que no puede pagar', juicy: 2 },
  { text: '{x} dice que es de Madrid de toda la vida, pero es de Alcorcón', juicy: 1 },
  { text: '{x} no saluda a {y} desde lo de la comunidad de vecinos', juicy: 1, needs: 'two' },
];

/** Bebidas y lo que suben el alcohol. */
export const ALCOHOL: Record<string, number> = { cana: 20, vermut: 20, drink_beer: 20, chupito: 35 };

/** Comidas que dan gases (luego, pedos). */
export const GASSY = new Set(['eat', 'cook', 'calamares', 'bravas', 'tortilla', 'churros', 'buy_hotdog', 'acai_bowl', 'cana', 'drink_beer']);

/** Conversaciones de Getafe (el Cerro, el pádel, el Geta). */
export const GETAFE_PAIRS: [string, string][] = [
  ['Desde el Cerro se ve todo Madrid', 'Y el Bernabéu, si guiñas un ojo'],
  ['¿Vienes el domingo al Coliseum?', '¡Aúpa Geta! Aunque pierda'],
  ['¿Echamos un pádel?', 'Vale, pero el que pierda paga las cañas'],
  ['Aquí en Getafe se vive de lujo', 'Y con el MetroSur, a Madrid en nada'],
  ['¿Tú has subido al Cerro de los Ángeles en bici?', 'Una vez. Y bajé andando'],
];
