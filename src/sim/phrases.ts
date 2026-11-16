// Diálogos generados por piezas: muletillas + tema con contexto real (estación, trabajo, mascota,
// pareja, recuerdos, vecinos, comida, dinero...) + coletilla, y respuestas según cómo es y cómo está
// quien contesta. Además, una memoria de lo ya dicho para que casi nunca se repita una frase.

import { CAREERS } from '../data/careers';
import { EMOTIONS } from '../data/emotions';
import { SKILL_BY_ID } from '../data/skills';
import { SPECIES } from '../data/species';
import { TRAIT_BY_ID } from '../data/traits';
import { ASPIRATION_BY_ID } from './aspirations';
import { getRel, isAdult, partnerOf } from './social';
import { hasTrait, traitsOf } from './traits';
import type { Agent } from './types';
import { moodScore, type World } from './world';

const rnd = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

// ---------------------------------------------------------------------------
// Memoria anti-repetición
// ---------------------------------------------------------------------------

const used = new Map<string, number>();
let tick = 0;

/** Elige de la lista algo que no se haya dicho hace poco (si todo está gastado, lo más antiguo). */
export function fresh<T>(xs: readonly T[], key: (x: T) => string = (x) => String(x)): T {
  if (!xs.length) return undefined as T;
  const window = Math.max(3, Math.floor(xs.length * 0.75));
  const ok = xs.filter((x) => tick - (used.get(key(x)) ?? -1e9) > window * 4);
  const choice = ok.length ? rnd(ok) : [...xs].sort((a, b) => (used.get(key(a)) ?? -1e9) - (used.get(key(b)) ?? -1e9))[0];
  used.set(key(choice), ++tick);
  return choice;
}

/** Marca una frase como dicha (y dice si ya se dijo hace poco). */
function seen(line: string): boolean {
  const last = used.get(line);
  used.set(line, ++tick);
  return last !== undefined && tick - last < 400;
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

const OPENERS = ['Oye,', 'Mira,', 'Pues', 'A ver,', 'Te cuento:', 'Fíjate,', 'Escucha,', 'Ostras,', 'Chacho,', 'Madre mía,', 'Por cierto,', 'Una cosa:', 'Entre tú y yo,', 'No te lo vas a creer, pero', 'Hablando de todo un poco,', 'Jo,', 'Bah,', '', '', '', '', ''];
const CLOSERS = ['', '', '', '', '', '', '', ', ¿eh?', ', te lo juro', ', como lo oyes', ', palabrita', ', lo que te diga', ', vamos', ', y punto', ', no te digo más', '. Así te lo digo', ', fíjate tú', ', que conste', ', ¿sabes?'];
const AGREE = ['¡Totalmente!', '¡Y que lo digas!', 'Ni más ni menos', 'Eso mismo pienso yo', 'Hombre, claro', 'Tal cual', 'Tienes más razón que un santo', 'Ahí le has dado'];
const DOUBT = ['Bueno... depende', 'Hombre, tampoco es para tanto', 'Yo no lo veo tan claro', 'Ya será menos', 'Eso habría que verlo', 'Mmm, no sé yo'];
const SURPRISE = ['¡Anda ya!', '¡No me digas!', '¿En serio?', '¡Qué me dices!', '¡Venga ya!', '¡Calla, calla!', '¡Hala!', '¿Pero qué me estás contando?'];
const SYMPATHY = ['Vaya tela...', 'Ánimo, que todo pasa', 'Uf, te entiendo', 'Qué faena', 'Eso no hay quien lo aguante', 'Ya verás como mejora'];
const GRUMPY = ['Pues vale', 'Ya, ya...', 'Me da igual, la verdad', 'Qué rollo', '¿Y a mí qué me cuentas?', 'Mira, déjame tranquilo/a'];
const CUNADO_ADD = ['Aunque yo lo haría de otra manera', 'Eso lo sé yo mejor que nadie', 'Te lo digo yo, que entiendo', 'Un primo mío lo hace mejor', 'Yo ya lo dije hace tiempo', 'Eso con un poco de cabeza se arregla'];
const COTILLA_ADD = ['¿Y quién más lo sabe?', 'Cuéntame más, cuéntame', '¿Y eso desde cuándo?', 'Esto no se lo digo a nadie. Bueno, a alguien sí'];
const OPTIMISTA_ADD = ['¡Todo va a salir bien!', 'Mírale el lado bueno', 'Mañana será otro día'];

const ANSWERS = ['Ni idea, la verdad', 'Mira debajo del sofá', 'Yo no he sido', '¿Otra vez con eso?', 'Pregúntale a otro/a', 'Pues ahora que lo dices...', 'Claro, hombre, claro'];

const REFRANES = [
  'A quien madruga, Dios le ayuda', 'No por mucho madrugar amanece más temprano', 'Más vale pájaro en mano que ciento volando',
  'En abril, aguas mil', 'Hasta el cuarenta de mayo no te quites el sayo', 'De tal palo, tal astilla', 'Cría cuervos y te sacarán los ojos',
  'A caballo regalado no le mires el diente', 'Quien mucho abarca, poco aprieta', 'El que avisa no es traidor', 'Ojos que no ven, corazón que no siente',
  'Al pan, pan, y al vino, vino', 'Dime con quién andas y te diré quién eres', 'Agua que no has de beber, déjala correr',
  'Cada maestrillo tiene su librillo', 'No hay mal que cien años dure', 'Las cuentas claras y el chocolate espeso', 'Más vale tarde que nunca',
];
const REFRAN_REPLIES = ['Eso decía mi abuela', 'Y cuánta razón tiene el refrán', 'Ya salió el filósofo', '¿Y eso a qué viene ahora?', 'Lo apunto en la nevera', 'Mi madre lo dice cada domingo'];

const SEASON_LINES: Record<string, string[]> = {
  primavera: ['con la primavera estoy de un alérgico que no veas', 'ya se puede ir a las terrazas sin abrigo', 'la primavera la sangre altera, dicen', 'han florecido los árboles del parque'],
  verano: ['hace un calor que derrite las farolas', 'yo en agosto me iría a la playa, pero a ver con qué dinero', 'a la siesta hay que hacerle un monumento', 'menos mal que existe el gazpacho'],
  otono: ['ya huele a castañas asadas', 'se nota que ha vuelto la rutina', 'me encanta este tiempo de mantita y serie', 'el parque está lleno de hojas'],
  invierno: ['hace un frío que pela', 'este año sí que nos toca la lotería', 'me paso el día pegado/a al radiador', 'en cuanto veo turrón en el súper, ya es Navidad'],
};
const EVENT_LINES: Record<string, [string, string][]> = {
  calor: [['Esto no es calor, es un castigo divino', '¡Y en casa sin aire acondicionado!'], ['Me voy a mudar dentro de la nevera', 'Hazme hueco']],
  lluvia: [['¿Has visto cómo llueve?', 'A cántaros. Y yo sin paraguas'], ['Con este tiempo lo que apetece es sofá y manta', 'Y un chocolate calentito']],
  nevada: [['¡Está nevando!', '¡Como en las películas!'], ['Con esta nieve no sale ni el perro', 'El perro es el único que quiere salir']],
  apagon: [['¿Alguien ha visto las velas?', 'En el cajón de las pilas que no funcionan'], ['Sin luz no hay ni tele ni wifi. ¿Qué hacemos?', 'Hablar, como antes']],
  campana: [['Me han dado ya tres folletos esta semana', 'Y una rosa. Y un bolígrafo'], ['¿Tú ya sabes a quién vas a votar?', 'Eso es secreto, como el voto']],
  sanisidro: [['¿Vas a ir de chulapo/a?', '¡Claro! Con su clavel y todo'], ['¿Rosquillas tontas o listas?', 'Las dos, que es fiesta']],
  verbena: [['¡Esta noche es la verbena!', 'Pienso bailar hasta que me echen'], ['¿Sabes bailar el chotis?', 'Sobre un ladrillo, como manda la tradición']],
  ofertas: [['Hay ofertas en el Mercadona', 'Pues yo me voy a llevar diez kilos de tomate'], ['Con las ofertas me he llenado la despensa', 'Previsor/a, como las hormigas']],
  reyes: [['¿Qué te han traído los Reyes?', 'Calcetines. Como todos los años'], ['¿Te ha salido el haba?', 'Calla, que me toca pagar a mí']],
  cabalgata: [['¡Mira, Baltasar!', '¡Que tire caramelos para aquí!'], ['Me he llevado un caramelazo en la frente', 'Gajes de la cabalgata']],
  carnaval: [['¿De qué vas disfrazado/a?', 'De persona normal. Es lo más difícil'], ['Ese disfraz es de premio', '¡Que lo diga el jurado!']],
  desfile: [['¿Quién va a ganar el concurso?', 'Seguro que los de Alcorcón otra vez'], ['¡Qué carroza más bonita!', 'Es la del Mercadona, toda de cartón']],
  halloween: [['¿Tienes caramelos para los niños?', 'He comprado una bolsa. Me he comido la mitad'], ['Esto de Halloween es americano', 'Y las castañas asadas no, ¿eh?']],
  navidad: [['¡Feliz Navidad!', '¡Igualmente! ¿Te ha tocado algo?'], ['Ya he comido turrón para todo el año', 'Y aún quedan los polvorones']],
};
const TIME_LINES: [number, number, string[]][] = [
  [6, 11, ['yo sin mi café no soy persona', 'he dormido fatal', 'qué mañana más bonita hace', 'hoy me he levantado con el pie izquierdo', 'me he tomado ya tres cafés y sigo dormido/a', 'la tostada con tomate de hoy estaba de diez', 'el despertador y yo no nos hablamos']],
  [11, 14, ['ya va siendo hora del vermut', 'me rugen las tripas', 'qué ganas de que llegue el finde', '¿a qué hora se come en esta casa?', 'llevo toda la mañana pensando en unas croquetas', 'el almuerzo de media mañana es sagrado']],
  [14, 17, ['después de comer, la siesta es obligatoria', 'he comido como un/a lima', 'me pesan los párpados', 'la sobremesa es lo mejor del día', 'con la tripa llena no pienso', 'un cafetito y una siesta de pijama y orinal']],
  [17, 21, ['ya se va notando la tarde', 'qué día más largo', 'me apetece un paseíto', 'a esta hora apetece una caña', 'la merienda no me la quita nadie', 'qué bonita está la luz a estas horas']],
  [21, 30, ['es tardísimo', 'yo ya debería estar en la cama', 'mañana no me levanto ni con grúa', 'a estas horas solo quedamos los búhos', 'una serie más y a dormir. O dos', 'esta noche cenamos algo ligerito']],
];

const FOOD = ['unas bravas', 'un bocata de calamares', 'una tortilla con cebolla', 'unas lentejas de las de mi madre', 'un cocido madrileño', 'unos churros con chocolate', 'una paella', 'unos huevos rotos', 'un plato de jamón', 'unas croquetas caseras', 'un gazpacho fresquito'];
const FOOD_REPLIES = ['¡Ay, calla, que me entra hambre!', 'Con cebolla, ¿eh? Sin cebolla no es tortilla', 'Eso como en casa de mi abuela, en ningún sitio', 'Invitas tú, ¿no?', 'Yo es que estoy a dieta... desde mañana'];
const MONEY_LINES = ['todo está carísimo', 'el aceite cuesta ya como el oro', 'a final de mes no llego ni de broma', 'me han subido el alquiler otra vez', 'la luz este mes ha sido un atraco'];
const MONEY_RICH = ['estamos ahorrando para unas vacaciones', 'este mes hemos podido darnos un capricho', 'a lo mejor reformamos la cocina'];

const NEIGHBOUR_TRAIT: Record<string, string[]> = {
  cunado: ['sabe de todo, según él/ella', 'te arregla el país en un café'],
  bromista: ['no para de contar chistes', 'tiene una gracia que no veas'],
  gloton: ['come por tres', 'siempre está en la barra del bar'],
  perezoso: ['no sale del sofá', 'se echa siestas de tres horas'],
  deportista: ['sale a correr a las seis de la mañana', 'está más fuerte que el vinagre'],
  romantico: ['se enamora cada semana', 'escribe poemas, dicen'],
  grunon: ['no saluda nunca', 'se queja hasta del sol'],
  cotilla: ['se entera de todo antes que nadie', 'tiene la oreja puesta en el rellano'],
  friki: ['se pasa la noche jugando a la consola', 'sabe datos de todo, hasta de pulpos'],
  fiestero: ['llega a casa a las tantas', 'monta unas fiestas que se oyen desde la plaza'],
  animalero: ['habla más con su perro que con la gente', 'quiere adoptar a medio refugio'],
  tiquismiquis: ['limpia el portal con lejía', 'tiene la casa como los chorros del oro'],
  optimista: ['siempre está de buen humor', 'le ve el lado bueno a todo'],
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function compose(opener: string, body: string, closer: string): string {
  let o = opener.trim();
  if (o.endsWith(':') && body.includes(':')) o = '';
  const text = o ? `${o} ${body}` : cap(body);
  return `${text}${closer}`.replace(/\s+/g, ' ').trim();
}
const line = (body: string) => compose(rnd(OPENERS), body, rnd(CLOSERS));

/** Respuesta según cómo es y cómo está quien contesta. */
function reaction(world: World, t: Agent, kind: 'news' | 'sad' | 'opinion' | 'happy'): string {
  const mood = moodScore(t);
  let r: string;
  if (hasTrait(t, 'grunon') && Math.random() < 0.5) r = rnd(GRUMPY);
  else if (kind === 'news') r = rnd(SURPRISE);
  else if (kind === 'sad') r = rnd(SYMPATHY);
  else if (kind === 'happy') r = rnd(['¡Qué bien!', '¡Me alegro un montón!', '¡Olé!', '¡Eso hay que celebrarlo!', '¡Bien hecho!']);
  else r = mood > 45 ? rnd(AGREE) : rnd(DOUBT);
  if (hasTrait(t, 'cunado') && kind === 'opinion' && Math.random() < 0.35) r += `. ${rnd(CUNADO_ADD)}`;
  else if (hasTrait(t, 'cotilla') && kind === 'news' && Math.random() < 0.5) r += ` ${rnd(COTILLA_ADD)}`;
  else if (hasTrait(t, 'optimista') && kind === 'sad' && Math.random() < 0.5) r += ` ${rnd(OPTIMISTA_ADD)}`;
  void world;
  return r;
}

// ---------------------------------------------------------------------------
// Temas: cada uno devuelve un pequeño diálogo (2 a 4 frases, alternando) o nada si no aplica
// ---------------------------------------------------------------------------

type Gen = (w: World, a: Agent, t: Agent) => string[] | undefined;

const GENS: Gen[] = [
  // El tiempo y la estación
  (w, _a, t) => [line(rnd(SEASON_LINES[w.seasonDef.id] ?? SEASON_LINES.primavera)), reaction(w, t, 'opinion')],
  // Lo que pasa en el barrio (eventos)
  (w, _a, _t) => {
    const ev = w.activeEvents().map((e) => e.id).find((id) => EVENT_LINES[id]);
    return ev ? [...rnd(EVENT_LINES[ev])] : undefined;
  },
  // La hora
  (w, _a, t) => {
    const h = w.hour < 6 ? w.hour + 24 : w.hour;
    const slot = TIME_LINES.find(([from, to]) => h >= from && h < to);
    return slot ? [line(rnd(slot[2])), reaction(w, t, 'opinion')] : undefined;
  },
  // Su trabajo
  (w, a, t) => {
    if (!a.job) return isAdult(a) ? [line(rnd(['sigo buscando curro', 'he echado veinte currículums esta semana', 'en el paro se aprende mucha paciencia'])), reaction(w, t, 'sad')] : undefined;
    const c = CAREERS[a.job.career];
    if (!c) return undefined;
    if (c.school) return [line(rnd([`mañana tengo examen de ${rnd(['mates', 'lengua', 'inglés', 'historia', 'física'])}`, 'el profe de gimnasia me tiene manía', 'en el recreo pasó una cosa graciosísima'])), rnd(['¿Y has estudiado?', '¡Ánimo, que tú puedes!', 'Yo a tu edad hacía pellas'])];
    const title = c.levels[a.job.level - 1].title.toLowerCase();
    const good = a.job.perf >= 55;
    const body = c.business
      ? rnd(['hoy en el bar no ha entrado ni el tato', 'la cuota de autónomos me va a matar', 'el bar va tirando, que no es poco'])
      : good
        ? rnd([`en el trabajo me va genial, ya soy ${title}`, 'creo que me van a ascender', 'mi jefe me ha felicitado delante de todos'])
        : rnd(['mi jefe me tiene frito/a', 'en el curro hay un ambiente que se corta con cuchillo', 'el lunes tengo una reunión que me da pánico']);
    return [line(body), reaction(w, t, good ? 'happy' : 'sad'), ...(Math.random() < 0.4 ? [rnd(['Ya te contaré', 'Así es la vida', 'Qué le vamos a hacer'])] : [])];
  },
  // Preguntarle por su trabajo
  (_w, _a, t) => {
    if (!t.job || CAREERS[t.job.career]?.school) return undefined;
    const c = CAREERS[t.job.career];
    return [rnd([`¿Qué tal de ${c.levels[t.job.level - 1].title.toLowerCase()}?`, '¿Cómo va el curro?', '¿Mucho lío en el trabajo?']), t.job.perf >= 55 ? rnd(['¡De lujo! Estoy que me salgo', 'Muy bien, la verdad', 'Mejor que nunca']) : rnd(['Uf, no me hables', 'Sobreviviendo, que no es poco', 'Mal, pero no me quejo. Bueno, sí me quejo'])];
  },
  // Su mascota
  (w, a, _t) => {
    const pet = w.state.agents.find((x) => x.kind === 'pet' && x.householdId === a.householdId);
    if (!pet) return undefined;
    const sp = SPECIES[pet.species].label.toLowerCase();
    const things = [
      `${pet.name} se ha comido una zapatilla entera`,
      `${pet.name} ha aprendido a abrir la nevera`,
      `${pet.name} me mira como si supiera algo que yo no sé`,
      `${pet.name} ronca más que mi abuelo`,
      `mi ${sp} es más listo que el hambre`,
      pet.tricks?.length ? `${pet.name} ya sabe ${pet.tricks[pet.tricks.length - 1].toLowerCase()}` : `estoy intentando enseñarle a ${pet.name} a sentarse`,
    ];
    return [line(rnd(things)), rnd(['¡Qué rico/a! ¡Tráelo/a un día!', 'Los animales son lo mejor que hay', 'Jajaja, ¡es un personaje!', `¿${pet.name}? ¡Qué nombre más bonito!`]), ...(Math.random() < 0.5 ? [rnd(['Es de la familia', 'No lo cambio por nada', 'Es mi debilidad'])] : [])];
  },
  // Pareja (o ex, o lío)
  (w, a, t) => {
    const pid = partnerOf(w.state, a.id);
    const p = pid ? w.agent(pid) : undefined;
    if (!p || p === t) return undefined;
    const rel = getRel(w.state, a.id, p.id);
    const good = rel.r >= 50;
    return [line(good ? rnd([`${p.name} me ha hecho la cena`, `con ${p.name} estoy mejor que nunca`, `${p.name} me ha dejado una nota en la nevera`, `${p.name} y yo vamos a hacer una escapada`]) : rnd([`con ${p.name} estamos un poco regular`, `${p.name} y yo discutimos por el mando de la tele`, `${p.name} ronca y no me deja dormir`])), reaction(w, t, good ? 'happy' : 'sad')];
  },
  // Cómo se siente (emociones con causa)
  (w, a, t) => {
    const e = (a.emotions ?? []).filter((x) => EMOTIONS[x.id]).sort((x, y) => Math.abs(EMOTIONS[y.id].value) - Math.abs(EMOTIONS[x.id].value))[0];
    if (!e) return undefined;
    const d = EMOTIONS[e.id];
    const about = e.about ? ` (${e.about})` : '';
    return [line(`hoy estoy ${d.value >= 0 ? 'de buenas' : 'de bajón'}: ${d.label.toLowerCase()}${about}`), reaction(w, t, d.value >= 0 ? 'happy' : 'sad')];
  },
  // Un recuerdo compartido
  (w, a, t) => {
    const mem = (getRel(w.state, a.id, t.id).mem ?? []).slice(-3);
    const m = mem.length ? rnd(mem) : undefined;
    if (!m) return undefined;
    const lines: Record<string, [string, string]> = {
      fiesta: ['¿Te acuerdas de la fiesta?', '¡Cómo olvidarla! Aún me duelen los pies'],
      boda: ['Todavía me acuerdo de la boda', 'Y del tío bailando encima de la mesa'],
      primer_beso: ['¿Te acuerdas de nuestro primer beso?', 'Cómo no me voy a acordar...'],
      perdon: ['Me alegro de que hiciéramos las paces', 'Y yo. La vida es muy corta'],
      insulto: ['Aún me acuerdo de lo que me dijiste...', 'Ya te pedí perdón, ¿no?'],
      pelea: ['Lo de la otra vez me dolió', 'Y a mí. Pero ya pasó'],
      cobra: ['Lo de la cobra... mejor no lo hablamos', 'Fue un momento muy incómodo'],
    };
    return lines[m.k] ? [...lines[m.k]] : undefined;
  },
  // Otro vecino (con nombre y cómo es)
  (w, a, t) => {
    const others = w.state.agents.filter((x) => x.kind === 'person' && !x.role && x !== a && x !== t && isAdult(x) && (getRel(w.state, a.id, x.id).f !== 0 || x.householdId === t.householdId));
    const x = others.length ? rnd(others) : undefined;
    if (!x) return undefined;
    const tr = traitsOf(x)[0];
    const desc = tr && NEIGHBOUR_TRAIT[tr.id] ? rnd(NEIGHBOUR_TRAIT[tr.id]) : rnd(['es muy majo/a', 'es un poco raro/a', 'siempre va con prisa']);
    return [line(`¿conoces a ${x.name}? ${cap(desc)}`), getRel(w.state, t.id, x.id).f > 20 ? rnd([`¡Claro! ${x.name} es amigo/a mío/a`, 'Sí, y me cae genial', 'Ya, ya, eso dicen']) : rnd(['Ni idea de quién es', 'Me suena de vista', 'Algo he oído...']), ...(hasTrait(t, 'cotilla') ? [rnd(['¿Y qué más sabes?', 'Sigue, sigue'])] : [])];
  },
  // Comida
  (_w, _a, _t) => [line(`me comería ${rnd(FOOD)}`), rnd(FOOD_REPLIES)],
  // Dinero
  (w, a, t) => {
    const funds = w.householdOf(a)?.funds ?? 0;
    return [line(funds > 5000 ? rnd(MONEY_RICH) : rnd(MONEY_LINES)), funds > 5000 ? rnd(['¡Qué envidia!', 'Pues invítame a algo, ¿no?', 'Algunos sí que viven bien']) : reaction(w, t, 'opinion')];
  },
  // Sueños (meta de vida)
  (_w, a, _t) => {
    const asp = a.aspiration && ASPIRATION_BY_ID[a.aspiration.id];
    if (!asp) return undefined;
    return [line(rnd([`mi gran meta en la vida es «${asp.label}»`, `estoy en ello: lo de «${asp.label}»`, `algún día lo conseguiré: «${asp.label}»`])), rnd(['Pues a por ello', '¡Tú puedes con eso y más!', 'Los sueños, sueños son', 'Yo te veo capaz']), ...(Math.random() < 0.4 ? [rnd(['Gracias, de verdad', 'Poco a poco', 'Ya te contaré'])] : [])];
  },
  // Lo que se le da bien
  (_w, a, _t) => {
    const best = Object.entries(a.skills ?? {}).sort((x, y) => y[1] - x[1])[0];
    if (!best || best[1] < 2) return undefined;
    const sk = SKILL_BY_ID[best[0]]?.label.toLowerCase() ?? best[0];
    return [line(`me estoy volviendo un crack en ${sk}`), rnd(['Ya será menos', '¡Qué arte tienes!', 'Demuéstramelo un día', '¿Me enseñas?'])];
  },
  // Hijos
  (w, a, _t) => {
    const kids = w.state.agents.filter((x) => x.parents?.includes(a.id));
    const k = kids.length ? rnd(kids) : undefined;
    if (!k) return undefined;
    return [line(rnd([`${k.name} está enorme`, `${k.name} me ha dicho una cosa que me ha dejado loco/a`, `${k.name} no para quieto/a`, `${k.name} ha sacado buenas notas`])), rnd(['¡Cómo crecen!', 'Es igualito/a que tú', 'Disfrútalo, que se pasa volando'])];
  },
  // Refranes
  (_w, _a, _t) => [line(`ya sabes: ${rnd(REFRANES).toLowerCase()}`), rnd(REFRAN_REPLIES)],
  // Su forma de ser (le pega a cada uno)
  (w, a, t) => {
    const tr = rnd(traitsOf(a));
    if (!tr) return undefined;
    const q = rnd(TRAIT_BY_ID[tr.id]?.quips ?? []);
    if (!q) return undefined;
    return [q, q.endsWith('?') ? rnd(ANSWERS) : reaction(w, t, 'opinion')];
  },
  // Algo que le gusta a `t` (si se sabe)
  (_w, a, t) => {
    const known = (a.known?.[t.id] ?? []).filter((x) => !x.startsWith('-'));
    if (!known.length) return undefined;
    const topics: Record<string, string> = { mascotas: '¿cómo están tus animales?', deporte: '¿viste el partido?', musica: '¿has escuchado algo nuevo?', arte: '¿estás pintando algo?', cocina: '¿qué has cocinado esta semana?', ciencia: '¿has leído algo interesante?', cotilleos: '¿qué se cuenta por ahí?', viajes: '¿a dónde te vas de vacaciones?' };
    const k = rnd(known);
    return topics[k] ? [line(topics[k]), rnd(['¡Uf, ni te imaginas!', '¡Gracias por preguntar!', 'Ay, pues mira, te cuento...', 'Me encanta que me preguntes eso'])] : undefined;
  },
];

/** Un diálogo de 2 a 4 frases (alternando a, t, a, t) que no se haya oído hace poco. */
export function smallTalk(world: World, a: Agent, t: Agent): string[] {
  for (let i = 0; i < 8; i++) {
    const gen = fresh(GENS, (g) => `gen:${GENS.indexOf(g)}:${a.id}`);
    const out = gen(world, a, t);
    if (!out || !out.length) continue;
    if (seen(out[0]) && i < 7) continue;
    return out.filter(Boolean);
  }
  return [line(rnd(SEASON_LINES[world.seasonDef.id] ?? SEASON_LINES.primavera)), reaction(world, t, 'opinion')];
}

/** Variante de un diálogo fijo: muletillas en la primera frase y, a veces, una respuesta distinta. */
export function varyPair(world: World, a: Agent, t: Agent, pair: readonly string[]): string[] {
  const out = [vary(pair[0]), ...pair.slice(1)];
  if (out.length >= 2 && Math.random() < 0.3 && !out[0].endsWith('?')) out[1] = `${out[1]}. ${reaction(world, t, 'opinion')}`;
  if (Math.random() < 0.25) out.push(rnd(['Ya ves', 'Así es la vida', 'Lo que yo te diga', 'En fin...', 'Bueno, vamos a dejarlo']));
  void a;
  return out;
}

/** Variante de una frase fija: a veces con muletilla delante o coletilla detrás. */
export function vary(text: string): string {
  if (Math.random() < 0.6 || text.endsWith('?') || text.endsWith('!')) return text;
  return compose(rnd(OPENERS.filter(Boolean)), text.charAt(0).toLowerCase() + text.slice(1), rnd(CLOSERS));
}

