import type { AgentKind, Needs, SpeciesId } from '../sim/types';

export type ActionTarget = 'object' | 'agent' | 'self' | 'tile';

export interface ActionDef {
  id: string;
  label: string;
  /** Gerundio que se muestra mientras se hace ("Durmiendo"). */
  verb: string;
  icon: string;
  target: ActionTarget;
  /** Quién puede hacerla. */
  actors: AgentKind[];
  /** Limita la acción a ciertas especies (arenero → gatos y hurones). */
  species?: SpeciesId[];
  /** Para acciones sociales: a quién se puede dirigir. */
  targetKinds?: AgentKind[];
  /** Limita la acción a ciertas especies de destino (pasear → solo perros). */
  targetSpecies?: SpeciesId[];
  /** Duración máxima en minutos de juego. */
  duration: number;
  /** Cambio de necesidades por minuto de juego para quien la hace. */
  effects: Partial<Needs>;
  /** Cambio para el compañero en acciones sociales. */
  partnerEffects?: Partial<Needs>;
  /** Termina cuando las necesidades que sube están llenas, o al alcanzar estos valores. */
  until?: 'full' | Partial<Needs>;
  /** Multiplica la bajada de necesidades mientras se hace (dormir = más lento). */
  decayMult?: number;
  /** Otro agente puede interrumpirla para interactuar. */
  interruptible?: boolean;
  /** La hacen fuera de la parcela (pasear). */
  offLot?: boolean;
  /** El jugador no puede cancelarla. */
  forced?: boolean;
  /** Coste en simoleones. */
  cost?: number;
  /** Puntuación fija para la autonomía (tareas sin necesidad asociada). */
  baseScore?: number;
  /** La IA no la elige nunca por sí sola. */
  playerOnly?: boolean;
  // --- Efectos sobre el objeto ---
  /** Gasta una ración del objeto al empezar (comedero, heno). */
  consumes?: boolean;
  /** Rellena el objeto al terminar. */
  refill?: boolean;
  /** Ensucia el objeto al terminar (arenero, jaula). */
  dirties?: boolean;
  /** Deja el objeto limpio al terminar. */
  cleans?: boolean;
  /** Quita el objeto al terminar (charcos). */
  removes?: boolean;
  /** Aviso al terminar; {name} = quien la hace, {obj} = el objeto. */
  doneToast?: string;
  /** Se puede hacer estando de visita en casa ajena. */
  guestOk?: boolean;
  /** Solo para estas etapas de la vida de quien la hace (bebés). */
  actorStages?: string[];
  /** Solo hacia estas etapas de la vida (cuidar bebés). */
  targetStages?: string[];
  /** Practicar una habilidad: puntos por minuto (a nivel 0; cuesta más cuanto más nivel). */
  skill?: { id: string; rate: number };
  /** Solo la pueden hacer personajes con este papel (el rapero, el del acordeón...). */
  roles?: string[];
  /** Solo hacia personajes con este papel (comprar chuches al vendedor...). */
  targetRoles?: string[];
}

const PETS_FREE: SpeciesId[] = ['dog', 'cat', 'ferret', 'capybara'];
const PETS_INDOOR: SpeciesId[] = ['dog', 'cat', 'ferret'];

const A: ActionDef[] = [
  // --- Personas: objetos ---
  { id: 'sleep', label: 'Dormir', verb: 'Durmiendo', icon: '💤', target: 'object', actors: ['person'], duration: 540, effects: { energy: 0.22 }, until: 'full', decayMult: 0.4 },
  { id: 'eat', label: 'Comer', verb: 'Comiendo', icon: '🍝', target: 'object', actors: ['person'], duration: 25, effects: { hunger: 3, fun: 0.05 }, until: 'full' },
  { id: 'snack', guestOk: true, label: 'Picar algo', verb: 'Picando algo', icon: '🍪', target: 'object', actors: ['person'], duration: 8, effects: { hunger: 2 } },
  { id: 'toilet', guestOk: true, label: 'Usar el váter', verb: 'En el baño', icon: '🚽', target: 'object', actors: ['person'], duration: 8, effects: { bladder: 14 }, until: 'full' },
  { id: 'shower', label: 'Ducharse', verb: 'Duchándose', icon: '🚿', target: 'object', actors: ['person'], duration: 15, effects: { hygiene: 7, fun: 0.05 }, until: 'full' },
  { id: 'watch_tv', guestOk: true, label: 'Ver la tele', verb: 'Viendo la tele', icon: '📺', target: 'object', actors: ['person'], duration: 120, effects: { fun: 0.35 }, until: 'full', interruptible: true },
  { id: 'nap_sofa', label: 'Echar una siesta', verb: 'Echando la siesta', icon: '😴', target: 'object', actors: ['person'], duration: 60, effects: { energy: 0.15 }, decayMult: 0.6, until: 'full' },
  { id: 'read', guestOk: true, label: 'Leer un libro', verb: 'Leyendo', icon: '📖', target: 'object', actors: ['person'], duration: 60, effects: { fun: 0.25 }, until: 'full', interruptible: true },
  { id: 'browse', label: 'Navegar por internet', verb: 'En el ordenador', icon: '💻', target: 'object', actors: ['person'], duration: 60, effects: { fun: 0.3, social: 0.1 }, until: 'full', interruptible: true },
  { id: 'whatsapp', label: 'Mirar el grupo de WhatsApp del barrio', verb: 'Mirando el WhatsApp', icon: '📱', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], duration: 15, effects: { fun: 0.3, social: 0.3 }, interruptible: true },
  { id: 'order_glovo', label: 'Pedir comida por Glovo (§15)', verb: 'Pidiendo comida', icon: '🛵', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], cost: 15, duration: 5, effects: {}, playerOnly: true },
  { id: 'drink_beer', label: 'Tomarse una cerveza', verb: 'Tomándose una cerveza', icon: '🍺', target: 'object', actors: ['person'], actorStages: ['young', 'adult', 'elder'], duration: 12, effects: { fun: 0.5, social: 0.1, bladder: -0.4 } },
  { id: 'throw_party', label: 'Montar una fiesta (§120)', verb: 'Organizando una fiesta', icon: '🥳', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], duration: 15, effects: { fun: 0.2 }, cost: 120, playerOnly: true },
  { id: 'day_off', label: 'Pedir el día libre mañana', verb: 'Pidiendo el día libre', icon: '🏖️', target: 'object', actors: ['person'], duration: 5, effects: {}, playerOnly: true },
  { id: 'buy_clothes', label: 'Comprar ropa por internet (§60)', verb: 'Mirando ropa', icon: '👕', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], cost: 60, duration: 15, effects: { fun: 0.4 }, playerOnly: true },
  { id: 'take_course', label: 'Hacer un curso online (§150)', verb: 'Haciendo un curso', icon: '🎓', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], cost: 150, duration: 120, effects: { fun: -0.05, energy: -0.05 }, playerOnly: true },
  { id: 'work_home', label: 'Teletrabajar (informes)', verb: 'Teletrabajando', icon: '🧑‍💻', target: 'object', actors: ['person'], actorStages: ['young', 'adult'], duration: 120, effects: { fun: -0.12, energy: -0.08 }, playerOnly: true },
  { id: 'book_trip', label: 'Reservar un fin de semana fuera (§600)', verb: 'Mirando ofertas de viajes', icon: '🧳', target: 'object', actors: ['person'], actorStages: ['young', 'adult', 'elder'], duration: 20, effects: { fun: 0.3 }, playerOnly: true },
  { id: 'find_job', label: 'Buscar trabajo', verb: 'Buscando trabajo', icon: '📰', target: 'object', actors: ['person'], duration: 20, effects: { fun: -0.05 }, playerOnly: true },
  { id: 'adopt', label: 'Adoptar una mascota', verb: 'Mirando la protectora', icon: '🏠', target: 'object', actors: ['person'], duration: 15, effects: { fun: 0.1 }, playerOnly: true },
  { id: 'fill_bowl', label: 'Llenar el comedero (§10)', verb: 'Llenando el comedero', icon: '🥣', target: 'object', actors: ['person'], duration: 2, effects: {}, cost: 10, refill: true },
  { id: 'refill_hay', label: 'Poner heno (§5)', verb: 'Poniendo heno', icon: '🌾', target: 'object', actors: ['person'], duration: 3, effects: {}, cost: 5, refill: true },
  { id: 'clean_cage', label: 'Limpiar la jaula', verb: 'Limpiando la jaula', icon: '🧹', target: 'object', actors: ['person'], duration: 10, effects: { fun: -0.15, hygiene: -0.2 }, cleans: true },
  { id: 'clean_litter', label: 'Limpiar el arenero', verb: 'Limpiando el arenero', icon: '🧹', target: 'object', actors: ['person'], duration: 5, effects: { fun: -0.2, hygiene: -0.3 }, cleans: true },
  { id: 'clean', guestOk: true, label: 'Limpiar', verb: 'Limpiando', icon: '🧽', target: 'object', actors: ['person'], duration: 4, effects: { fun: -0.2 }, baseScore: 6, removes: true },

  // --- Mascotas: objetos ---
  { id: 'pet_eat', label: 'Comer del comedero', verb: 'Comiendo', icon: '🦴', target: 'object', actors: ['pet'], species: PETS_FREE, duration: 15, effects: { hunger: 5 }, until: 'full', consumes: true },
  { id: 'pet_sleep', label: 'Dormir en su cama', verb: 'Durmiendo', icon: '💤', target: 'object', actors: ['pet'], species: ['dog'], duration: 480, effects: { energy: 0.3 }, until: 'full', decayMult: 0.4 },
  { id: 'nap_bed', label: 'Subirse a la cama', verb: 'Dormitando en la cama', icon: '😴', target: 'object', actors: ['pet'], species: PETS_INDOOR, duration: 120, effects: { energy: 0.25, social: 0.05 }, until: 'full', decayMult: 0.5 },
  { id: 'play_ball', guestOk: true, label: 'Jugar con la pelota', verb: 'Jugando con la pelota', icon: '🎾', target: 'object', actors: ['pet'], species: PETS_INDOOR, duration: 30, effects: { fun: 0.7, energy: -0.05 }, until: 'full', interruptible: true },
  { id: 'pee_outside', guestOk: true, label: 'Hacer pis', verb: 'Haciendo pis', icon: '🌳', target: 'object', actors: ['pet'], species: ['dog', 'capybara'], duration: 4, effects: { bladder: 25 }, until: 'full' },
  { id: 'sniff_sofa', guestOk: true, label: 'Tumbarse en el sofá', verb: 'Tumbado en el sofá', icon: '🛋️', target: 'object', actors: ['pet'], species: PETS_INDOOR, duration: 60, effects: { energy: 0.12, fun: 0.05 }, until: 'full', interruptible: true },

  // Gato
  { id: 'use_litter', label: 'Usar el arenero', verb: 'En el arenero', icon: '🐾', target: 'object', actors: ['pet'], species: ['cat', 'ferret'], duration: 4, effects: { bladder: 25 }, until: 'full', dirties: true },
  { id: 'scratch_post', label: 'Afilarse las uñas', verb: 'Arañando el rascador', icon: '🐾', target: 'object', actors: ['pet'], species: ['cat'], duration: 15, effects: { fun: 0.8 }, until: 'full', interruptible: true },
  { id: 'sleep_post', label: 'Dormir en lo alto', verb: 'Durmiendo en el rascador', icon: '💤', target: 'object', actors: ['pet'], species: ['cat'], duration: 300, effects: { energy: 0.3 }, until: 'full', decayMult: 0.4 },
  { id: 'scratch_sofa', label: 'Arañar el sofá', verb: 'Arañando el sofá', icon: '😼', target: 'object', actors: ['pet'], species: ['cat'], duration: 10, effects: { fun: 0.5 }, doneToast: '{name} ha arañado el sofá 😼' },
  { id: 'cat_nap', label: 'Siesta donde sea', verb: 'Echando una siesta', icon: '😴', target: 'self', actors: ['pet'], species: ['cat'], duration: 90, effects: { energy: 0.22 }, until: 'full', decayMult: 0.5, interruptible: true },

  // Cobaya (vive en su jaula)
  { id: 'cage_eat', label: 'Comer heno', verb: 'Comiendo heno', icon: '🌾', target: 'object', actors: ['pet'], species: ['guineapig'], duration: 15, effects: { hunger: 5 }, until: 'full', consumes: true },
  { id: 'cage_sleep', label: 'Dormir en la casita', verb: 'Durmiendo', icon: '💤', target: 'object', actors: ['pet'], species: ['guineapig'], duration: 300, effects: { energy: 0.3 }, until: 'full', decayMult: 0.4 },
  { id: 'cage_run', label: 'Corretear', verb: 'Correteando', icon: '💨', target: 'object', actors: ['pet'], species: ['guineapig'], duration: 20, effects: { fun: 0.6, energy: -0.05 }, until: 'full', interruptible: true },
  { id: 'cage_pee', label: 'Hacer pis en el serrín', verb: 'Haciendo pis', icon: '💧', target: 'object', actors: ['pet'], species: ['guineapig'], duration: 3, effects: { bladder: 35 }, until: 'full', dirties: true },
  { id: 'squeak', label: 'Chillar pidiendo atención', verb: 'Chillando', icon: '📣', target: 'self', actors: ['pet'], species: ['guineapig'], duration: 5, effects: { social: 0.4, fun: 0.2 } },

  // Hurón
  { id: 'ferret_sleep', label: 'Dormir en la hamaca', verb: 'Durmiendo en la hamaca', icon: '💤', target: 'object', actors: ['pet'], species: ['ferret'], duration: 360, effects: { energy: 0.35 }, until: 'full', decayMult: 0.4 },
  { id: 'steal', label: 'Robar y esconder', verb: 'Robando', icon: '🫣', target: 'object', actors: ['pet'], species: ['ferret'], duration: 2, effects: { fun: 4 }, baseScore: 3 },
  { id: 'war_dance', label: 'Danza de guerra', verb: '¡Danza de guerra!', icon: '🌀', target: 'self', actors: ['pet'], species: ['ferret'], duration: 8, effects: { fun: 1.4, energy: -0.3 }, until: 'full' },

  // Capibara
  { id: 'swim', guestOk: true, label: 'Bañarse en el estanque', verb: 'En remojo', icon: '💦', target: 'object', actors: ['pet'], species: ['capybara', 'dog'], duration: 60, effects: { hygiene: 2, fun: 0.3 }, until: 'full', interruptible: true },
  { id: 'capy_sleep', label: 'Dormir en la paja', verb: 'Durmiendo', icon: '💤', target: 'object', actors: ['pet'], species: ['capybara'], duration: 420, effects: { energy: 0.3 }, until: 'full', decayMult: 0.4 },

  // Muebles de la tienda
  { id: 'sit', label: 'Sentarse', verb: 'Sentado', icon: '💺', target: 'object', actors: ['person'], guestOk: true, duration: 60, effects: { energy: 0.08, fun: 0.12 }, until: 'full', interruptible: true },
  { id: 'bath', label: 'Darse un baño', verb: 'En la bañera', icon: '🛁', target: 'object', actors: ['person'], duration: 40, effects: { hygiene: 4, fun: 0.3, energy: 0.05 }, until: 'full' },
  { id: 'dance', label: 'Bailar', verb: 'Bailando', icon: '💃', target: 'object', actors: ['person'], guestOk: true, duration: 30, effects: { fun: 0.9, energy: -0.15, social: 0.05 }, until: 'full', interruptible: true },
  { id: 'listen_music', label: 'Escuchar música', verb: 'Escuchando música', icon: '🎶', target: 'object', actors: ['person'], guestOk: true, duration: 60, effects: { fun: 0.35 }, until: 'full', interruptible: true },
  { id: 'play_games', label: 'Jugar a la consola', verb: 'Jugando a la consola', icon: '🎮', target: 'object', actors: ['person'], guestOk: true, duration: 60, effects: { fun: 0.65, social: 0.05 }, until: 'full', interruptible: true },
  { id: 'repair', label: 'Reparar', verb: 'Reparando', icon: '🔧', target: 'object', actors: ['person'], duration: 40, effects: { fun: -0.15, hygiene: -0.1 }, baseScore: 12 },

  // Habilidades
  { id: 'cook', label: 'Cocinar', verb: 'Cocinando', icon: '🍳', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], duration: 45, effects: { hunger: 2.2, fun: 0.15 }, until: 'full', skill: { id: 'cocina', rate: 0.02 } },
  { id: 'play_guitar', label: 'Tocar la guitarra', verb: 'Tocando la guitarra', icon: '🎸', target: 'object', actors: ['person'], guestOk: true, duration: 60, effects: { fun: 0.4 }, until: 'full', interruptible: true, skill: { id: 'musica', rate: 0.02 }, baseScore: 2 },
  { id: 'paint', label: 'Pintar un cuadro', verb: 'Pintando', icon: '🎨', target: 'object', actors: ['person'], duration: 60, effects: { fun: 0.35 }, interruptible: true, skill: { id: 'arte', rate: 0.02 }, baseScore: 2 },
  { id: 'run', label: 'Correr', verb: 'Corriendo', icon: '🏃', target: 'object', actors: ['person'], duration: 40, effects: { fun: 0.2, energy: -0.3, hygiene: -0.3 }, skill: { id: 'forma', rate: 0.025 }, baseScore: 2 },
  { id: 'play_chess', label: 'Jugar al ajedrez', verb: 'Jugando al ajedrez', icon: '♟️', target: 'object', actors: ['person'], guestOk: true, duration: 45, effects: { fun: 0.35, social: 0.1 }, until: 'full', interruptible: true, skill: { id: 'logica', rate: 0.02 }, baseScore: 2 },
  { id: 'practice_speech', label: 'Ensayar ante el espejo', verb: 'Ensayando discursos', icon: '🗣️', target: 'object', actors: ['person'], duration: 30, effects: { fun: 0.1, social: 0.15 }, skill: { id: 'carisma', rate: 0.025 }, baseScore: 2 },
  { id: 'play_toys', label: 'Jugar con juguetes', verb: 'Jugando', icon: '🧸', target: 'object', actors: ['person'], actorStages: ['child'], guestOk: true, duration: 45, effects: { fun: 0.9, social: 0.1 }, until: 'full', interruptible: true },
  { id: 'homework', label: 'Hacer los deberes', verb: 'Haciendo los deberes', icon: '📝', target: 'self', actors: ['person'], actorStages: ['child', 'teen'], duration: 30, effects: { fun: -0.1 }, skill: { id: 'logica', rate: 0.01 }, baseScore: 5 },
  { id: 'busk', label: 'Tocar a cambio de propinas', verb: 'Tocando en la calle', icon: '🪕', target: 'self', actors: ['person'], duration: 45, effects: { fun: 0.3, social: 0.2 }, skill: { id: 'musica', rate: 0.01 }, playerOnly: true },
  { id: 'pilates', label: 'Hacer pilates', verb: 'Haciendo pilates', icon: '🧘', target: 'object', actors: ['person'], guestOk: true, duration: 45, effects: { fun: 0.3, energy: -0.12, hygiene: -0.15 }, skill: { id: 'forma', rate: 0.025 }, interruptible: true, baseScore: 3 },
  { id: 'reformer', label: 'Clase de reformer (§12)', verb: 'En clase de reformer', icon: '🧘', target: 'object', actors: ['person'], guestOk: true, cost: 12, duration: 50, effects: { fun: 0.45, energy: -0.15, hygiene: -0.2, social: 0.1 }, skill: { id: 'forma', rate: 0.045 }, baseScore: 3 },

  // Mercadona
  { id: 'shop_small', label: 'Compra pequeña (§45 · 8 raciones)', verb: 'Haciendo la compra', icon: '🛒', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], guestOk: true, cost: 45, duration: 20, effects: { social: 0.1 }, playerOnly: true },
  // --- Enfermedades (ver systems/illness.ts) ---
  { id: 'call_doctor', label: 'Llamar al centro de salud', verb: 'Al teléfono con la médica', icon: '🩺', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], duration: 15, effects: {}, playerOnly: true },
  { id: 'take_medicine', label: 'Tomarse algo (§5)', verb: 'Tomándose la medicina', icon: '💊', target: 'self', actors: ['person'], actorStages: ['child', 'teen', 'young', 'adult', 'elder'], cost: 5, duration: 5, effects: { energy: 0.5 }, baseScore: 20 },
  // --- La calle (sin casa, tras un desahucio; ver systems/bills.ts) ---
  { id: 'sleep_bench', guestOk: true, label: 'Dormir en el banco', verb: 'Durmiendo en el banco', icon: '🪑', target: 'object', actors: ['person'], duration: 480, effects: { energy: 0.14, hygiene: -0.03 }, until: 'full', decayMult: 0.6 },
  { id: 'free_meal', guestOk: true, label: 'Bocadillo del comedor social (gratis)', verb: 'Comiendo un bocadillo', icon: '🥪', target: 'object', actors: ['person'], duration: 15, effects: { hunger: 2.4, social: 0.1 }, until: 'full' },
  { id: 'wash_up', guestOk: true, label: 'Lavarse en el lavabo', verb: 'Lavándose', icon: '🧼', target: 'object', actors: ['person'], duration: 10, effects: { hygiene: 3 }, until: { hygiene: 75 } },
  // --- Muebles del catálogo grande ---
  { id: 'change_clothes', label: 'Cambiarse de ropa', verb: 'Cambiándose', icon: '👚', target: 'object', actors: ['person'], actorStages: ['child', 'teen', 'young', 'adult', 'elder'], duration: 6, effects: { fun: 0.5 }, playerOnly: true },
  { id: 'play_cards', guestOk: true, label: 'Echar unas cartas', verb: 'Jugando a las cartas', icon: '🃏', target: 'object', actors: ['person'], actorStages: ['child', 'teen', 'young', 'adult', 'elder'], duration: 40, effects: { fun: 0.5, social: 0.4 }, interruptible: true, baseScore: 2 },
  { id: 'bbq', guestOk: true, label: 'Hacer una barbacoa (§12)', verb: 'Haciendo barbacoa', icon: '🍖', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], cost: 12, duration: 45, effects: { hunger: 2.2, fun: 0.3, social: 0.2 }, until: 'full', skill: { id: 'cocina', rate: 0.015 } },
  { id: 'watch_fish', guestOk: true, label: 'Mirar los peces', verb: 'Mirando los peces', icon: '🐠', target: 'object', actors: ['person'], duration: 30, effects: { fun: 0.3, energy: 0.03 }, until: 'full', interruptible: true },
  { id: 'warm_up', guestOk: true, label: 'Calentarse junto al fuego', verb: 'Junto a la chimenea', icon: '🔥', target: 'object', actors: ['person'], duration: 45, effects: { fun: 0.25, energy: 0.08, social: 0.05 }, until: 'full', interruptible: true, baseScore: 1 },
  { id: 'karaoke', guestOk: true, label: 'Cantar en el karaoke', verb: 'Cantando', icon: '🎤', target: 'object', actors: ['person'], actorStages: ['child', 'teen', 'young', 'adult', 'elder'], duration: 30, effects: { fun: 0.8, social: 0.15, energy: -0.05 }, interruptible: true, skill: { id: 'musica', rate: 0.015 } },
  { id: 'soak', guestOk: true, label: 'Meterse en el jacuzzi', verb: 'En el jacuzzi', icon: '♨️', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], duration: 40, effects: { hygiene: 1.5, fun: 0.6, energy: 0.06, social: 0.1 }, until: 'full' },
  { id: 'sunbathe', label: 'Tomar el sol', verb: 'Tomando el sol', icon: '😎', target: 'object', actors: ['person'], duration: 60, effects: { fun: 0.3, energy: 0.1 }, until: 'full', interruptible: true },
  // --- Biblioteca, gimnasio y mercadillo (ver systems/places.ts) ---
  { id: 'study', guestOk: true, label: 'Estudiar', verb: 'Estudiando', icon: '📚', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], duration: 60, effects: { fun: -0.02 }, skill: { id: 'logica', rate: 0.035 }, interruptible: true, baseScore: 2 },
  { id: 'homework_lib', guestOk: true, label: 'Hacer los deberes (en silencio)', verb: 'Haciendo los deberes', icon: '📝', target: 'object', actors: ['person'], actorStages: ['child', 'teen'], duration: 40, effects: { fun: -0.05 }, skill: { id: 'logica', rate: 0.02 }, baseScore: 6 },
  { id: 'lift_weights', guestOk: true, label: 'Levantar pesas (§5)', verb: 'Levantando pesas', icon: '🏋️', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], cost: 5, duration: 40, effects: { fun: 0.15, energy: -0.35, hygiene: -0.35 }, skill: { id: 'forma', rate: 0.04 }, baseScore: 2 },
  { id: 'box', guestOk: true, label: 'Darle al saco (§5)', verb: 'Dándole al saco', icon: '🥊', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], cost: 5, duration: 20, effects: { fun: 0.6, energy: -0.3, hygiene: -0.2 }, skill: { id: 'forma', rate: 0.02 }, baseScore: 1 },
  { id: 'market_food', guestOk: true, label: 'Fruta y verdura (§30 · 8 raciones)', verb: 'Comprando en el mercadillo', icon: '🍊', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], cost: 30, duration: 15, effects: { social: 0.2 }, playerOnly: true },
  { id: 'market_clothes', guestOk: true, label: 'Ropa de mercadillo (§25)', verb: 'Probándose ropa', icon: '👕', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], cost: 25, duration: 15, effects: { fun: 0.4 }, playerOnly: true },
  { id: 'rummage', guestOk: true, label: 'Rebuscar entre los trastos (§5)', verb: 'Rebuscando', icon: '🏺', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], cost: 5, duration: 20, effects: { fun: 0.5 }, baseScore: 3 },
  { id: 'haggle', guestOk: true, label: 'Regatear', verb: 'Regateando', icon: '🤝', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], duration: 6, effects: { social: 0.4 }, skill: { id: 'carisma', rate: 0.03 }, playerOnly: true },
  { id: 'play_padel', guestOk: true, label: 'Echar un pádel (§8)', verb: 'Jugando al pádel', icon: '🎾', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], cost: 8, duration: 60, effects: { fun: 0.6, social: 0.35, energy: -0.3, hygiene: -0.3 }, skill: { id: 'forma', rate: 0.03 }, interruptible: true, baseScore: 4 },
  // --- Fiestas (solo existen en su día: ver systems/holidays.ts) ---
  { id: 'eat_roscon', guestOk: true, label: 'Comer roscón de Reyes', verb: 'Comiendo roscón', icon: '🥯', target: 'object', actors: ['person'], duration: 15, effects: { hunger: 2.5, fun: 0.4 }, baseScore: 12 },
  { id: 'buy_lottery', label: 'Lotería de Navidad (§20)', verb: 'Comprando lotería', icon: '🎫', target: 'object', actors: ['person'], actorStages: ['young', 'adult', 'elder'], guestOk: true, cost: 20, duration: 5, effects: { fun: 0.5 }, playerOnly: true },
  { id: 'cana', label: 'Una caña (§2)', verb: 'Tomándose una caña', icon: '🍺', target: 'object', actors: ['person'], actorStages: ['young', 'adult', 'elder'], guestOk: true, cost: 2, duration: 15, effects: { fun: 0.5, social: 0.3, bladder: -0.4 } },
  { id: 'vermut', label: 'Un vermut (§3)', verb: 'Tomándose un vermut', icon: '🍷', target: 'object', actors: ['person'], actorStages: ['young', 'adult', 'elder'], guestOk: true, cost: 3, duration: 15, effects: { fun: 0.5, social: 0.3 } },
  { id: 'chupito', label: 'Un chupito (§3)', verb: 'Chupito va', icon: '🥃', target: 'object', actors: ['person'], actorStages: ['young', 'adult', 'elder'], guestOk: true, cost: 3, duration: 3, effects: { fun: 2.5 }, playerOnly: true },
  { id: 'calamares', label: 'Bocadillo de calamares (§5)', verb: 'Comiéndose un bocata', icon: '🥖', target: 'object', actors: ['person'], guestOk: true, cost: 5, duration: 20, effects: { hunger: 3.2, fun: 0.2 }, until: 'full' },
  { id: 'bravas', label: 'Unas bravas (§4)', verb: 'Comiendo bravas', icon: '🍟', target: 'object', actors: ['person'], guestOk: true, cost: 4, duration: 15, effects: { hunger: 2.6, fun: 0.3, social: 0.2 } },
  { id: 'tortilla', label: 'Pincho de tortilla (§3)', verb: 'Comiendo tortilla', icon: '🍳', target: 'object', actors: ['person'], guestOk: true, cost: 3, duration: 10, effects: { hunger: 3 } },
  { id: 'tragaperras', label: 'Echar a la tragaperras (§1)', verb: 'Jugando a la tragaperras', icon: '🎰', target: 'object', actors: ['person'], actorStages: ['young', 'adult', 'elder'], guestOk: true, cost: 1, duration: 10, effects: { fun: 0.7 } },
  { id: 'watch_football', label: 'Ver el fútbol', verb: 'Viendo el fútbol', icon: '⚽', target: 'object', actors: ['person'], guestOk: true, duration: 90, effects: { fun: 0.35, social: 0.2 }, until: 'full', interruptible: true },
  { id: 'play_mus', label: 'Echar un mus', verb: 'Jugando al mus', icon: '🃏', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], guestOk: true, duration: 45, effects: { fun: 0.5, social: 0.4 }, until: 'full', interruptible: true, skill: { id: 'logica', rate: 0.01 } },
  { id: 'churros', label: 'Churros con chocolate (§3)', verb: 'Mojando churros', icon: '🥨', target: 'object', actors: ['person'], guestOk: true, cost: 3, duration: 15, effects: { hunger: 2.4, fun: 0.4 } },
  { id: 'rosquillas', label: 'Rosquillas tontas y listas (§2)', verb: 'Comiendo rosquillas', icon: '🍩', target: 'object', actors: ['person'], guestOk: true, cost: 2, duration: 8, effects: { hunger: 1.8, fun: 0.4 } },
  { id: 'throw_coin', label: 'Echar una moneda a la fuente (§1)', verb: 'Pidiendo un deseo', icon: '🪙', target: 'object', actors: ['person'], guestOk: true, cost: 1, duration: 3, effects: { fun: 1.5 }, playerOnly: true },
  { id: 'read_map', label: 'Mirar el plano del metro', verb: 'Mirando el plano', icon: '🗺️', target: 'object', actors: ['person'], guestOk: true, duration: 5, effects: { fun: 0.1 }, playerOnly: true },
  { id: 'shop_big', label: 'Compra grande (§95 · 20 raciones)', verb: 'Haciendo la compra grande', icon: '🛒', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], guestOk: true, cost: 95, duration: 35, effects: { social: 0.1, energy: -0.05 }, playerOnly: true },
  { id: 'browse_aisles', label: 'Pasear por los pasillos', verb: 'Mirando ofertas', icon: '🧐', target: 'object', actors: ['person'], guestOk: true, duration: 25, effects: { fun: 0.15, social: 0.05 }, until: 'full', interruptible: true, baseScore: 1 },
  { id: 'buy_fruit', label: 'Comprar fruta (§3)', verb: 'Comiendo fruta', icon: '🍎', target: 'object', actors: ['person'], guestOk: true, cost: 3, duration: 8, effects: { hunger: 2.5 }, until: 'full' },
  { id: 'order_groceries', label: 'Pedir la compra a domicilio (§70 · 8 raciones)', verb: 'Haciendo el pedido', icon: '📦', target: 'object', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], cost: 70, duration: 10, effects: {}, playerOnly: true },
  // Açaí
  { id: 'acai_bowl', label: 'Pedir un açaí bowl (§9)', verb: 'Comiendo un açaí bowl', icon: '🫐', target: 'object', actors: ['person'], guestOk: true, cost: 9, duration: 20, effects: { hunger: 3.5, fun: 0.35, energy: 0.1 }, until: 'full', baseScore: 2 },
  { id: 'smoothie', label: 'Pedir un smoothie (§6)', verb: 'Tomando un smoothie', icon: '🥤', target: 'object', actors: ['person'], guestOk: true, cost: 6, duration: 10, effects: { hunger: 1.5, fun: 0.3 }, baseScore: 1 },
  { id: 'selfie', label: 'Hacerse una selfie para Instagram', verb: 'Haciéndose una selfie', icon: '🤳', target: 'object', actors: ['person'], guestOk: true, duration: 6, effects: { fun: 0.6, social: 0.3 }, baseScore: 2 },

  // Parque
  { id: 'sit_bench', label: 'Sentarse en el banco', verb: 'Sentado en el banco', icon: '🪑', target: 'object', actors: ['person'], guestOk: true, duration: 60, effects: { energy: 0.08, fun: 0.15, social: 0.05 }, until: 'full', interruptible: true },
  { id: 'swing', label: 'Columpiarse', verb: 'Columpiándose', icon: '🎠', target: 'object', actors: ['person'], guestOk: true, duration: 30, effects: { fun: 0.7, energy: -0.05 }, until: 'full', interruptible: true },
  { id: 'buy_hotdog', label: 'Comprar un perrito (§5)', verb: 'Comiendo un perrito', icon: '🌭', target: 'object', actors: ['person'], guestOk: true, duration: 12, effects: { hunger: 4.5, fun: 0.1 }, until: 'full', cost: 5 },

  // Ciclo de vida
  { id: 'baby_sleep', label: 'Dormir en la cuna', verb: 'Durmiendo', icon: '💤', target: 'object', actors: ['person'], actorStages: ['baby'], duration: 240, effects: { energy: 0.4 }, until: 'full', decayMult: 0.5, interruptible: true },
  { id: 'cry', label: 'Llorar', verb: 'Llorando', icon: '😭', target: 'self', actors: ['person'], actorStages: ['baby'], duration: 5, effects: { social: 0.3 }, interruptible: true },
  { id: 'remember', label: 'Recordar', verb: 'Recordando', icon: '🕯️', target: 'object', actors: ['person'], guestOk: true, duration: 20, effects: { social: 0.2, fun: -0.1 } },

  // --- Social: persona → persona ---
  { id: 'talk', label: 'Conversar…', verb: 'Conversando', icon: '🗨️', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 90, effects: { social: 0.15 }, partnerEffects: { social: 0.15 }, playerOnly: true, interruptible: true },
  { id: 'chat', label: 'Charlar', verb: 'Charlando', icon: '💬', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 30, effects: { social: 0.7, fun: 0.1 }, partnerEffects: { social: 0.7, fun: 0.1 }, until: 'full', interruptible: true, skill: { id: 'carisma', rate: 0.005 } },
  { id: 'joke', label: 'Contar un chiste', verb: 'Contando un chiste', icon: '😂', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 10, effects: { fun: 0.6, social: 0.3 }, partnerEffects: { fun: 0.6, social: 0.3 } },
  { id: 'gossip_with', label: 'Cotillear', verb: 'Cotilleando', icon: '🌶️', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 15, effects: { social: 0.6, fun: 0.3 }, partnerEffects: { social: 0.6, fun: 0.3 }, interruptible: true },
  { id: 'chotis', label: 'Bailar un chotis', verb: 'Bailando un chotis', icon: '🎩', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 15, effects: { fun: 0.8, social: 0.5 }, partnerEffects: { fun: 0.8, social: 0.5 } },
  { id: 'ask_affair', label: 'Proponer un lío', verb: 'Tirando los tejos', icon: '🤫', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 6, effects: { social: 1, fun: 0.5 }, partnerEffects: { social: 1 }, playerOnly: true },
  { id: 'end_affair', label: 'Dejar el lío', verb: 'Dejando el lío', icon: '🚪', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 6, effects: { social: -0.3 }, partnerEffects: { social: -1 }, playerOnly: true },
  // Gente de la calle
  { id: 'buy_candy', label: 'Comprar un chupachups (§1)', verb: 'Comprando chuches', icon: '🍭', target: 'agent', actors: ['person'], targetKinds: ['person'], targetRoles: ['vendedor'], cost: 1, duration: 3, effects: { hunger: 1, fun: 1.5 }, guestOk: true, playerOnly: true },
  { id: 'tip_artist', label: 'Darle una moneda (§1)', verb: 'Dando una moneda', icon: '🪙', target: 'agent', actors: ['person'], targetKinds: ['person'], targetRoles: ['rapero', 'musico'], cost: 1, duration: 3, effects: { fun: 1 }, guestOk: true, playerOnly: true },
  { id: 'ask_rap', label: 'Pedirle un rap', verb: 'Escuchando un rap', icon: '🎤', target: 'agent', actors: ['person'], targetKinds: ['person'], targetRoles: ['rapero'], duration: 10, effects: { fun: 1.2 }, guestOk: true, playerOnly: true },
  { id: 'ask_gossip', label: 'Preguntar por los cotilleos', verb: 'Escuchando cotilleos', icon: '🗣️', target: 'agent', actors: ['person'], targetKinds: ['person'], targetRoles: ['chismosa'], duration: 15, effects: { social: 0.7, fun: 0.4 }, guestOk: true },
  { id: 'tell_chismosa', label: 'Contarles un secreto', verb: 'Contando un secreto', icon: '🤫', target: 'agent', actors: ['person'], targetKinds: ['person'], targetRoles: ['chismosa'], duration: 8, effects: { social: 0.6, fun: 0.4 }, guestOk: true, playerOnly: true },
  { id: 'listen_campaign', label: 'Escuchar su programa', verb: 'Escuchando el programa', icon: '📋', target: 'agent', actors: ['person'], targetKinds: ['person'], targetRoles: ['militante'], duration: 10, effects: { social: 0.4, fun: -0.2 }, guestOk: true, playerOnly: true },
  { id: 'promise_vote', label: 'Prometerle el voto', verb: 'Prometiendo el voto', icon: '🌹', target: 'agent', actors: ['person'], targetKinds: ['person'], targetRoles: ['militante'], actorStages: ['young', 'adult', 'elder'], duration: 4, effects: { social: 0.5 }, guestOk: true, playerOnly: true },
  { id: 'decline_vote', label: 'Ya tengo el voto decidido', verb: 'Despachando a la militante', icon: '✋', target: 'agent', actors: ['person'], targetKinds: ['person'], targetRoles: ['militante'], duration: 3, effects: {}, guestOk: true, playerOnly: true },
  { id: 'argue', label: 'Discutir', verb: 'Discutiendo', icon: '💢', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 10, effects: { fun: -0.3, social: 0.3 }, partnerEffects: { fun: -0.6, social: -0.3 } },
  { id: 'mediate', label: 'Mediar en el culebrón', verb: 'Mediando', icon: '🕊️', target: 'agent', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], targetKinds: ['person'], duration: 15, effects: { social: 0.5, fun: -0.1 }, partnerEffects: { social: 0.5 }, playerOnly: true },
  { id: 'snitch', label: 'Contarle lo que se dice', verb: 'Contándole lo que se dice', icon: '🤫', target: 'agent', actors: ['person'], actorStages: ['teen', 'young', 'adult', 'elder'], targetKinds: ['person'], duration: 6, effects: { social: 0.3 }, partnerEffects: { social: -0.3, fun: -0.5 }, playerOnly: true },
  { id: 'best_friends', label: 'Proponer ser mejores amigos', verb: 'Haciendo un pacto', icon: '🫶', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 8, effects: { social: 1, fun: 0.5 }, partnerEffects: { social: 1, fun: 0.5 }, playerOnly: true },
  { id: 'ban', label: 'Declarar persona non grata', verb: 'Echándole la bronca', icon: '🚫', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 4, effects: { fun: 0.2 }, partnerEffects: { social: -0.5 }, playerOnly: true },
  { id: 'unban', label: 'Levantarle el veto', verb: 'Haciendo las paces', icon: '🕊️', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 4, effects: { social: 0.3 }, partnerEffects: { social: 0.5 }, playerOnly: true },
  { id: 'fight', label: 'Liarse a mamporros', verb: 'Peleándose', icon: '🥊', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 6, effects: { energy: -2 }, partnerEffects: { energy: -2 }, playerOnly: true },
  { id: 'poison', label: 'Echarle algo en la comida', verb: 'Sirviendo un plato «especial»', icon: '🍲', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 10, effects: {}, partnerEffects: { hunger: 2 }, playerOnly: true },
  { id: 'apologize', label: 'Pedir perdón', verb: 'Pidiendo perdón', icon: '🙏', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 6, effects: { social: 0.8 }, partnerEffects: { social: 0.8 } },
  { id: 'break_up', label: 'Cortar', verb: 'Cortando', icon: '💔', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 6, effects: { social: -0.5 }, partnerEffects: { social: -1.5, fun: -1 }, playerOnly: true },
  { id: 'divorce', label: 'Pedir el divorcio', verb: 'Pidiendo el divorcio', icon: '📄', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 8, effects: { social: -0.5 }, partnerEffects: { social: -1.5, fun: -1 }, playerOnly: true },
  { id: 'insult', label: 'Insultar', verb: 'Discutiendo', icon: '🤬', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 6, effects: { fun: 0.3 }, partnerEffects: { social: -2, fun: -1 } },
  { id: 'flirt', label: 'Coquetear', verb: 'Coqueteando', icon: '😏', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 10, effects: { social: 0.8, fun: 0.4 }, partnerEffects: { social: 0.8, fun: 0.3 } },
  { id: 'kiss', label: 'Besar', verb: 'Besando', icon: '💋', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 4, effects: { social: 2, fun: 0.5 }, partnerEffects: { social: 2, fun: 0.5 } },
  { id: 'ask_partner', label: 'Pedir salir', verb: 'Declarándose', icon: '💘', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 5, effects: { social: 1 }, partnerEffects: { social: 1 }, playerOnly: true },
  { id: 'propose', label: 'Pedir matrimonio', verb: 'Pidiendo matrimonio', icon: '💍', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 6, effects: { social: 2, fun: 1 }, partnerEffects: { social: 2, fun: 1 }, playerOnly: true },
  { id: 'move_in', label: 'Proponer vivir juntos', verb: 'Hablando de mudarse', icon: '🏡', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 6, effects: { social: 1 }, partnerEffects: { social: 1 }, playerOnly: true },
  { id: 'niqui', label: 'Ñiqui ñiqui', verb: 'Ñiqui ñiqui', icon: '💞', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 20, effects: { fun: 1.5, social: 1.2, energy: -0.2, hygiene: -0.3 }, partnerEffects: { fun: 1.5, social: 1.2, energy: -0.2, hygiene: -0.3 }, playerOnly: true },
  { id: 'try_baby', label: 'Intentar tener un bebé', verb: 'Buscando un bebé', icon: '🍼', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 20, effects: { social: 1, fun: 1, energy: -0.2 }, partnerEffects: { social: 1, fun: 1, energy: -0.2 }, playerOnly: true },
  { id: 'feed_baby', label: 'Dar el biberón (§3)', verb: 'Dando el biberón', icon: '🍼', target: 'agent', actors: ['person'], targetKinds: ['person'], targetStages: ['baby'], cost: 3, duration: 10, effects: { social: 0.3 }, partnerEffects: { hunger: 6 } },
  { id: 'change_diaper', label: 'Cambiar el pañal', verb: 'Cambiando el pañal', icon: '🧷', target: 'agent', actors: ['person'], targetKinds: ['person'], targetStages: ['baby'], duration: 5, effects: { fun: -0.3, hygiene: -0.3 }, partnerEffects: { hygiene: 12, bladder: 12 } },
  { id: 'rock_baby', label: 'Mecer', verb: 'Meciendo', icon: '🤱', target: 'agent', actors: ['person'], targetKinds: ['person'], targetStages: ['baby'], duration: 15, effects: { social: 0.4 }, partnerEffects: { social: 2.5, energy: 0.6, fun: 0.4 } },
  { id: 'play_baby', label: 'Hacer cucamonas', verb: 'Haciendo cucamonas', icon: '🤪', target: 'agent', actors: ['person'], targetKinds: ['person'], targetStages: ['baby'], duration: 10, effects: { fun: 0.4 }, partnerEffects: { fun: 2, social: 0.8 } },
  { id: 'say_goodbye', label: 'Despedirse', verb: 'Despidiéndose', icon: '👋', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 3, effects: { social: 0.5 }, partnerEffects: { social: 0.5 }, playerOnly: true },
  { id: 'give_gift', label: 'Hacer un regalo (§40)', verb: 'Dando un regalo', icon: '🎁', target: 'agent', actors: ['person'], actorStages: ['child', 'teen', 'young', 'adult', 'elder'], targetKinds: ['person'], cost: 40, duration: 5, effects: { social: 1, fun: 0.5 }, partnerEffects: { social: 1.5, fun: 2 }, playerOnly: true },
  { id: 'hug', label: 'Abrazar', verb: 'Abrazando', icon: '🤗', target: 'agent', actors: ['person'], targetKinds: ['person'], duration: 4, effects: { social: 2 }, partnerEffects: { social: 2 } },

  // --- Social: persona → mascota ---
  { id: 'pet_animal', label: 'Acariciar', verb: 'Acariciando', icon: '🤚', target: 'agent', actors: ['person'], targetKinds: ['pet'], duration: 8, effects: { social: 0.4, fun: 0.1 }, partnerEffects: { social: 1.6 } },
  { id: 'train_pet', label: 'Adiestrar', verb: 'Adiestrando', icon: '🦴', target: 'agent', actors: ['person'], targetKinds: ['pet'], targetSpecies: ['dog', 'cat', 'ferret', 'capybara'], duration: 30, effects: { fun: 0.15, energy: -0.05 }, partnerEffects: { fun: 0.25, energy: -0.15 }, playerOnly: true, guestOk: false },
  { id: 'show_trick', label: 'Pedirle un truco', verb: 'Haciendo un truco', icon: '🎪', target: 'agent', actors: ['person'], targetKinds: ['pet'], duration: 6, effects: { fun: 1.6 }, partnerEffects: { fun: 0.8, social: 0.6 } },
  { id: 'play_pet', label: 'Jugar', verb: 'Jugando', icon: '🎾', target: 'agent', actors: ['person'], targetKinds: ['pet'], duration: 20, effects: { fun: 0.6, energy: -0.1 }, partnerEffects: { fun: 1, energy: -0.1 } },
  { id: 'walk_dog', label: 'Sacar a pasear', verb: 'De paseo', icon: '🦮', target: 'agent', actors: ['person'], targetKinds: ['pet'], targetSpecies: ['dog'], duration: 45, effects: { fun: 0.3, social: 0.2, energy: -0.1 }, partnerEffects: { fun: 0.8, bladder: 4, social: 0.5, energy: -0.15 }, offLot: true },
  { id: 'bathe_pet', label: 'Bañar', verb: 'Bañando', icon: '🫧', target: 'agent', actors: ['person'], targetKinds: ['pet'], targetSpecies: ['dog', 'cat', 'ferret'], duration: 15, effects: { hygiene: -0.3 }, partnerEffects: { hygiene: 6, fun: -0.2 } },
  { id: 'brush_capy', label: 'Cepillar', verb: 'Cepillando', icon: '🪮', target: 'agent', actors: ['person'], targetKinds: ['pet'], targetSpecies: ['capybara'], duration: 15, effects: { fun: 0.3, social: 0.3 }, partnerEffects: { hygiene: 3, social: 1 } },

  // --- Social: mascota → persona ---
  { id: 'beg_affection', label: 'Pedir mimos', verb: 'Pidiendo mimos', icon: '🥺', target: 'agent', actors: ['pet'], species: PETS_FREE, targetKinds: ['person'], duration: 8, effects: { social: 1.6 }, partnerEffects: { social: 0.3, fun: 0.2 } },
  { id: 'play_with_person', label: 'Invitar a jugar', verb: 'Jugando', icon: '🐾', target: 'agent', actors: ['pet'], species: PETS_INDOOR, targetKinds: ['person'], duration: 15, effects: { fun: 1 }, partnerEffects: { fun: 0.6, energy: -0.1 } },

  // --- Social: mascota → mascota ---
  { id: 'sniff', label: 'Olfatear', verb: 'Olfateando', icon: '👃', target: 'agent', actors: ['pet'], species: PETS_FREE, targetKinds: ['pet'], duration: 5, effects: { social: 1, fun: 0.3 }, partnerEffects: { social: 1, fun: 0.3 } },
  { id: 'cuddle_capy', label: 'Acurrucarse con la capibara', verb: 'Acurrucados', icon: '🥰', target: 'agent', actors: ['pet'], species: PETS_INDOOR, targetKinds: ['pet'], targetSpecies: ['capybara'], duration: 30, effects: { social: 1, fun: 0.3, energy: 0.1 }, partnerEffects: { social: 0.6 }, until: 'full' },
  { id: 'chase', label: 'Perseguir', verb: 'Persiguiendo', icon: '💨', target: 'agent', actors: ['pet'], species: ['dog', 'ferret'], targetKinds: ['pet'], targetSpecies: ['cat', 'dog', 'ferret'], duration: 6, effects: { fun: 1.5, energy: -0.3 }, partnerEffects: { fun: 0.5, energy: -0.3 } },

  // --- Propias ---
  { id: 'fart', label: 'Tirarse un pedo', verb: 'Tirándose un pedo', icon: '💨', target: 'self', actors: ['person', 'pet'], species: ['human', 'dog', 'capybara'], duration: 2, effects: { fun: 2 } },
  { id: 'sing', label: 'Cantar a pleno pulmón', verb: 'Cantando', icon: '🎤', target: 'self', actors: ['person'], actorStages: ['child', 'teen', 'young', 'adult', 'elder'], duration: 8, effects: { fun: 1, social: 0.1 }, playerOnly: true },
  { id: 'vomit', label: 'Vomitar', verb: 'Vomitando', icon: '🤮', target: 'self', actors: ['person'], duration: 3, effects: { hunger: -5 }, forced: true, playerOnly: true },
  { id: 'rap', label: 'Rapear', verb: 'Rapeando', icon: '🎤', target: 'self', actors: ['person'], roles: ['rapero'], duration: 6, effects: {}, playerOnly: true, interruptible: true },
  { id: 'play_accordion', label: 'Tocar el acordeón', verb: 'Tocando el acordeón', icon: '🪗', target: 'self', actors: ['person'], roles: ['musico'], duration: 30, effects: {}, playerOnly: true, interruptible: true },
  { id: 'move', label: 'Ir aquí', verb: 'Caminando', icon: '👣', target: 'tile', actors: ['person', 'pet'], duration: 0, effects: {}, playerOnly: true },
  { id: 'costume', label: 'Disfrazarse (§15)', verb: 'Disfrazándose', icon: '🎭', target: 'self', actors: ['person'], actorStages: ['child', 'teen', 'young', 'adult', 'elder'], duration: 20, effects: { fun: 0.6 }, baseScore: 8 },
  { id: 'trick_or_treat', label: 'Truco o trato por las casas', verb: 'Pidiendo caramelos', icon: '🎃', target: 'self', actors: ['person'], actorStages: ['child', 'teen'], duration: 60, effects: { fun: 0.7, social: 0.4, hunger: 0.1, energy: -0.05 }, baseScore: 25 },
  { id: 'idle', label: 'Esperar', verb: 'Pensando', icon: '💭', target: 'self', actors: ['person', 'pet'], duration: 15, effects: {}, interruptible: true, playerOnly: true },
  { id: 'pass_out', label: 'Desmayarse', verb: 'Agotado en el suelo', icon: '😵', target: 'self', actors: ['person', 'pet'], duration: 300, effects: { energy: 0.5 }, until: { energy: 40 }, forced: true, playerOnly: true },
];

export const ACTIONS: Record<string, ActionDef> = Object.fromEntries(A.map((a) => [a.id, a]));

export const SOCIAL_ACTIONS = A.filter((a) => a.target === 'agent');
export const SELF_ACTIONS = A.filter((a) => a.target === 'self' && !a.playerOnly);
