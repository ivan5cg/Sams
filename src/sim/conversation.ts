import { fresh, vary } from './phrases';
// Conversaciones interactivas: el jugador elige de qué hablar y el otro reacciona según sus gustos.

import { APOLOGY_TOPIC, FOLLOW_UPS, INTERESTS, INTEREST_LABEL, TOPICS, TOPIC_BY_ID, type Interest, type TopicDef } from '../data/dialogue';
import { CAREERS, gradeLabel } from '../data/careers';
import { DEGREES } from '../data/education';
import { LEAVE_LABEL } from '../data/work';
import { bossOf, companyName, hasWorkplace } from './systems/work';
import { MEMORY_TEXT, partnerOf } from './social';
import { attend } from './relations';
import { acceptChance, canRomance, changeRel, getRel } from './social';
import { hasTrait, traitsOf } from './traits';
import type { Agent } from './types';
import { moodScore, type World } from './world';

const hashStr = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const clamp = (v: number) => Math.max(0, Math.min(100, v));

const SKILL_INTEREST: Record<string, Interest> = {
  cocina: 'cocina',
  musica: 'musica',
  forma: 'deporte',
  logica: 'ciencia',
  arte: 'arte',
  carisma: 'cotilleos',
};

/** Gustos de una persona: dos o tres cosas que le encantan y una que no soporta. Siempre los mismos. */
export function interestsOf(a: Agent): { likes: Interest[]; dislike: Interest } {
  const h = hashStr(`${a.id}:${a.name}:gustos`);
  const first = h % INTERESTS.length;
  let second = (h >>> 4) % INTERESTS.length;
  if (second === first) second = (second + 1) % INTERESTS.length;
  const likes = new Set<Interest>([INTERESTS[first], INTERESTS[second]]);
  // Su mejor habilidad también le gusta.
  const best = Object.entries(a.skills ?? {}).sort((x, y) => y[1] - x[1])[0];
  if (best && best[1] >= 2 && SKILL_INTEREST[best[0]]) likes.add(SKILL_INTEREST[best[0]]);
  // Y lo que va con su forma de ser.
  for (const t of traitsOf(a)) for (const i of t.interests ?? []) likes.add(i);
  const others = INTERESTS.filter((i) => !likes.has(i));
  return { likes: [...likes], dislike: others[(h >>> 9) % others.length] };
}

export interface ConversationResult {
  say: string;
  reply: string;
  outcome: 'good' | 'meh' | 'bad';
  /** Gusto descubierto en esta respuesta. */
  learned?: Interest;
  /** Han quedado para ir al parque. */
  goPark?: boolean;
}

/** Cómo fue el turno anterior (para seguir el hilo). */
export interface LastTurn {
  topic: string;
  outcome: 'good' | 'meh' | 'bad';
}

/** Preguntas para seguir el hilo después de un tema. */
export function followUpsFor(last: LastTurn | undefined): TopicDef[] {
  if (!last) return [];
  if (last.outcome === 'bad' && !last.topic.startsWith('f_')) return [APOLOGY_TOPIC, ...(FOLLOW_UPS[last.topic]?.bad ?? [])];
  const f = FOLLOW_UPS[last.topic];
  if (!f) return [];
  return [...(last.outcome === 'good' ? f.good ?? [] : []), ...(f.any ?? [])];
}

/** Temas que se pueden elegir ahora (cambian en cada turno). Primero, los que siguen el hilo de lo anterior. */
export function topicsFor(world: World, a: Agent, t: Agent, turn: number, last?: LastTurn, used: string[] = []): TopicDef[] {
  const rel = getRel(world.state, a.id, t.id);
  const pool: TopicDef[] = [...followUpsFor(last)];
  const add = (x: TopicDef | undefined) => {
    if (x && !pool.some((p) => p.id === x.id) && !used.includes(x.id)) pool.push(x);
  };
  const interestTopics = TOPICS.filter((x) => x.interest && !used.includes(x.id));
  // Rotación según el turno para que cambien las opciones
  const list = interestTopics.length ? interestTopics : TOPICS.filter((x) => x.interest);
  const start = (hashStr(a.id + t.id) + turn * 3) % list.length;
  add(list[start]);
  add(list[(start + 1) % list.length]);
  // Lo de su vida: el trabajo, la familia, los planes, y algún recuerdo compartido.
  if (t.kind === 'person' && !['baby', 'child'].includes(world.stageOf(t))) add(TOPIC_BY_ID[turn % 2 === 0 ? 'trabajo' : 'familia']);
  else add(TOPIC_BY_ID.dia);
  add(TOPIC_BY_ID[turn % 2 === 0 ? 'dia' : 'cumplido']);
  if ((rel.mem ?? []).some((m) => MEMORY_TEXT[m.k])) add(TOPIC_BY_ID.recuerdo);
  add(TOPIC_BY_ID[['chiste', 'precios', 'quejarse', 'planes'][turn % 4]]);
  if (world.gossipFor(a, t) && !pool.some((x) => x.id === 'cotilleos')) add(TOPIC_BY_ID.cotilleos);
  if (canRomance(world.state, a, t) && (rel.r >= 10 || rel.f >= 30)) add(TOPIC_BY_ID.coquetear);
  const lot = world.lotById(a.lotId);
  if (lot.kind !== 'park' && world.hour >= 8 && world.hour < 20 && !t.home && world.isPlayerMember(a)) add(TOPIC_BY_ID.parque);
  return pool;
}

const pickOf = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** Respuestas con lo que le pasa de verdad a `t` (su trabajo, su familia, lo que vivisteis). */
function lifeReply(world: World, a: Agent, t: Agent, topicId: string, outcome: 'good' | 'meh' | 'bad'): { say?: string; reply?: string } {
  const job = t.job && CAREERS[t.job.career];
  const side = t.side && CAREERS[t.side.career];
  const stage = world.stageOf(t);
  if (topicId === 'trabajo') {
    if (outcome === 'bad') return {};
    let r: string;
    if (job?.school && t.job!.career === 'uni' && t.study) {
      const d = DEGREES[t.study.degree];
      const pct = d ? Math.round((t.study.progress / d.days) * 100) : 0;
      r = `Estudiando ${d?.label ?? 'la carrera'}: llevo un ${pct} % y voy de ${gradeLabel(t.job!.perf).toLowerCase()}`;
    } else if (job?.school) r = t.job!.perf >= 60 ? `En el ${stage === 'teen' ? 'insti' : 'cole'} muy bien: voy de ${gradeLabel(t.job!.perf).toLowerCase()}` : `En el ${stage === 'teen' ? 'insti' : 'cole'}, regular. Me han puesto un ${gradeLabel(t.job!.perf).toLowerCase()}`;
    else if (t.job?.leave) r = `Estoy de ${LEAVE_LABEL[t.job.leave.kind]}, así que ni me acuerdo del trabajo`;
    else if (job) {
      const title = job.levels[t.job!.level - 1].title.toLowerCase();
      const where = hasWorkplace(t.job!.career) && world.state.corp?.companies[t.job!.career] ? ` en ${companyName(world, t.job!.career)}` : '';
      if (t.job!.strikes) r = `De ${title}${where}... me han dado un toque y ando con pies de plomo`;
      else if (t.job!.perf >= 70) r = `De ${title}${where}. ¡Muy bien! Creo que me ascienden pronto`;
      else if (t.job!.perf < 30) r = `De ${title}${where}. Fatal, no doy abasto con las tareas`;
      else r = outcome === 'good' ? `De ${title}${where}. Contento/a, la verdad` : `De ${title}${where}. Tirando, como todo el mundo`;
    } else if (stage === 'elder') r = 'Jubiladísimo/a. Mi trabajo ahora es mirar obras y echar la siesta';
    else r = 'En paro. Mandando currículums como loco/a';
    if (side) r += `. Y por las tardes, de ${side.levels[t.side!.level - 1].title.toLowerCase()}`;
    return { reply: r };
  }
  if (topicId === 'f_trabajo_jefe') {
    const career = t.job && hasWorkplace(t.job.career) && world.state.corp?.companies[t.job.career] ? t.job.career : t.side && hasWorkplace(t.side.career) && world.state.corp?.companies[t.side.career] ? t.side.career : undefined;
    const boss = career ? bossOf(world, career) : undefined;
    if (!job || job.school) return { reply: job?.school ? 'Mi jefe es el profe de mates. Y me tiene manía' : 'Ahora mismo mi jefe soy yo. Y es un tirano' };
    if (!boss) return { reply: outcome === 'bad' ? 'Mi jefe es un explotador. Ya está, ya lo he dicho' : 'Bien, mientras me deje en paz' };
    const f = getRel(world.state, t.id, boss.id).f;
    return { reply: f >= 30 ? `¿${boss.name}? Me adora. El otro día me invitó a café` : f <= -20 ? `${boss.name} no me traga. Y yo a ${boss.name}, tampoco` : `${boss.name} es como todos los jefes: ni fu ni fa` };
  }
  if (topicId === 'f_trabajo_futuro') {
    if (!job || job.school) return { reply: stage === 'teen' ? 'Yo quiero ser youtuber. O astronauta. Lo que pague más' : 'Encontrar algo que me guste, que no es poco' };
    const top = t.job!.level >= job.levels.length;
    return { reply: top ? 'Más arriba no se puede llegar. Ahora, a disfrutarlo' : `Llegar a ${job.levels[Math.min(job.levels.length - 1, t.job!.level)].title.toLowerCase()}. Paso a paso` };
  }
  if (topicId === 'familia') {
    if (outcome === 'bad') return {};
    const h = world.householdOf(t);
    const people = (h?.memberIds ?? []).map((id) => world.agent(id)).filter((x): x is Agent => !!x && x !== t);
    const partner = world.agent(partnerOf(world.state, t.id));
    const kids = people.filter((x) => x.kind === 'person' && x.parents?.includes(t.id));
    const pets = people.filter((x) => x.kind === 'pet');
    const bits: string[] = [];
    if (partner) bits.push(`${partner.name} está ${partner.job && !CAREERS[partner.job.career]?.school ? 'liado/a con el trabajo' : 'tan bien, en casa'}`);
    if (kids.length) bits.push(`${kids.map((k) => k.name).join(' y ')} ${kids.length > 1 ? 'están' : 'está'} ${world.stageOf(kids[0]) === 'baby' ? 'para comérselo/a' : 'enorme'}`);
    if (pets.length) bits.push(`${pets[0].name} ${pets[0].illness ? 'anda malito/a, la verdad' : 'tan feliz, comiendo como un descosido'}`);
    if (h?.expecting && h.expecting.parents.includes(t.id)) bits.push('¡y viene un bebé en camino!');
    if (!bits.length) return { reply: 'Pues vivo solo/a, así que todos bien: yo' };
    return { reply: `${outcome === 'good' ? 'Muy bien, gracias. ' : ''}${bits.join(', ')}` };
  }
  if (topicId === 'recuerdo') {
    const rel = getRel(world.state, a.id, t.id);
    const mem = [...(rel.mem ?? [])].reverse().find((m) => MEMORY_TEXT[m.k]);
    if (!mem) return {};
    const mt = MEMORY_TEXT[mem.k];
    const by = mem.by === a.id ? a.name : t.name;
    const other = mem.by === a.id ? t.name : a.name;
    const text = mt.text.replace('{by}', by === a.name ? 'yo' : 'tú').replace('{other}', other === a.name ? 'mí' : 'ti');
    return { say: `¿Te acuerdas de cuando ${text}?`, reply: mt.bad ? (outcome === 'good' ? 'Bueno, eso ya es agua pasada' : 'Prefiero no acordarme de eso') : outcome === 'good' ? '¡Cómo olvidarlo! Qué buenos tiempos' : 'Sí, sí... me acuerdo' };
  }
  if (topicId === 'planes') {
    if (outcome !== 'good') return {};
    const likes = interestsOf(t).likes;
    const plan: Record<string, string> = { mascotas: 'Llevar al perro al parque grande', deporte: 'Ver el partido con los amigos', musica: 'Ir a un concierto en Malasaña', arte: 'Pasarme por el Prado, que los domingos es gratis', cocina: 'Hacer una paella para toda la familia', ciencia: 'Ir al planetario', cotilleos: 'Tomar un café con las vecinas, ya sabes', viajes: 'Escaparme al pueblo' };
    return { reply: `${plan[pickOf(likes)] ?? 'Descansar'}. ¡Tengo unas ganas!` };
  }
  return {};
}

/** Lo que conoce `a` de los gustos de `t`. */
export function knownInterests(a: Agent, t: Agent): Interest[] {
  return (a.known?.[t.id] ?? []) as Interest[];
}

function fill(text: string, world: World, a: Agent, t: Agent): string {
  const pet = world.state.agents.find((x) => x.kind === 'pet' && x.householdId === a.householdId);
  const news = world.gossipFor(a, t) ?? 'han llegado vecinos nuevos al barrio';
  return text.replace('{pet}', pet?.name ?? 'mi mascota').replace('{news}', news).replace('{other}', t.name);
}

/** Un turno de conversación: aplica los efectos y devuelve lo que dice cada uno. */
export function converse(world: World, a: Agent, t: Agent, topicId: string): ConversationResult {
  const topic = TOPIC_BY_ID[topicId] ?? TOPIC_BY_ID.dia;
  const rel = getRel(world.state, a.id, t.id);
  const { likes, dislike } = interestsOf(t);
  const charm = Math.floor(a.skills?.carisma ?? 0) * 0.04;
  // Su forma de ser cuenta: con un gruñón cuesta más, con un optimista menos.
  const temper = hasTrait(t, 'grunon') ? -0.15 : hasTrait(t, 'optimista') ? 0.1 : 0;
  const base = 0.45 + rel.f / 200 + (moodScore(t) - 50) / 200 + charm + temper;
  let pGood = base;
  let pBad = 0.15 - charm / 2;
  let learned: Interest | undefined;

  if (topic.interest) {
    if (likes.includes(topic.interest)) {
      pGood = 0.9;
      pBad = 0;
      learned = topic.interest;
    } else if (dislike === topic.interest) {
      pGood = 0.05;
      pBad = 0.8;
      learned = undefined;
    } else {
      pGood = 0.25 + charm;
      pBad = 0.15;
    }
  } else if (topic.id === 'dia') {
    pGood = rel.f >= -10 ? 0.75 + charm : 0.3;
  } else if (topic.id === 'cumplido') {
    pGood = rel.f < -20 ? 0.15 : 0.6 + rel.f / 200 + charm;
  } else if (topic.id === 'chiste') {
    pGood = 0.5 + charm + (hasTrait(a, 'bromista') ? 0.25 : 0) + (hasTrait(t, 'bromista') || hasTrait(t, 'cunado') ? 0.15 : 0) + temper;
  } else if (topic.id === 'precios') {
    // A cuñados y gruñones les encanta quejarse de lo caro que está todo.
    pGood = hasTrait(t, 'cunado') || hasTrait(t, 'grunon') ? 0.95 : 0.55 + temper;
  } else if (topic.id === 'quejarse') {
    pGood = rel.f >= 40 ? 0.85 : 0.2;
    pBad = rel.f >= 40 ? 0.05 : 0.4;
  } else if (topic.id === 'coquetear') {
    pGood = acceptChance(world.state, a, t, 'flirt') + charm + (hasTrait(t, 'romantico') ? 0.15 : 0);
    pBad = 1 - pGood - 0.15;
  } else if (topic.followUp) {
    // Seguir el hilo de algo que ha ido bien suele salir bien; pedir perdón, depende de cuánto os queráis.
    pGood = topic.id === 'f_perdon' ? 0.55 + rel.f / 200 + charm : 0.7 + rel.f / 300 + charm + temper;
    pBad = topic.id === 'f_perdon' ? 0.15 : 0.08;
    if (topic.id === 'f_coquetear') {
      pGood = acceptChance(world.state, a, t, 'flirt') + charm + 0.1;
      pBad = 1 - pGood - 0.15;
    }
  } else if (topic.id === 'trabajo' || topic.id === 'familia' || topic.id === 'planes') {
    pGood = rel.f >= -10 ? 0.65 + rel.f / 300 + charm + temper : 0.25;
    pBad = rel.f < -20 ? 0.5 : 0.08;
  } else if (topic.id === 'recuerdo') {
    const mem = [...(rel.mem ?? [])].reverse().find((m) => MEMORY_TEXT[m.k]);
    const sad = mem && MEMORY_TEXT[mem.k]?.bad;
    pGood = sad ? 0.3 + rel.f / 200 : 0.85;
    pBad = sad ? 0.45 : 0.05;
  } else if (topic.id === 'parque') {
    pGood = rel.f >= 15 && !world.busySoon(t, 2) && world.canTravel(t, 'P').ok ? 0.85 : 0;
    pBad = 0.1;
  }

  const r = Math.random();
  const outcome: ConversationResult['outcome'] = r < pGood ? 'good' : r < pGood + Math.max(0, pBad) ? 'bad' : 'meh';
  const interestBonus = learned && outcome === 'good' ? 3 : 0;
  const df = topic.id === 'f_perdon' ? (outcome === 'good' ? 8 : outcome === 'meh' ? 2 : -2) : outcome === 'good' ? 6 + interestBonus + (topic.followUp ? 2 : 0) : outcome === 'meh' ? 1 : -4;
  const flirty = topic.id === 'coquetear' || topic.id === 'f_coquetear';
  const dr = flirty ? (outcome === 'good' ? (topic.id === 'f_coquetear' ? 12 : 8) : outcome === 'bad' ? -4 : 1) : topic.id === 'cumplido' && outcome === 'good' && canRomance(world.state, a, t) ? 1 : 0;
  changeRel(world.state, a.id, t.id, df, dr);
  if (outcome !== 'bad') attend(world, a, t);
  const social = outcome === 'good' ? 10 : outcome === 'meh' ? 3 : -3;
  a.needs.social = clamp(a.needs.social + social);
  t.needs.social = clamp(t.needs.social + Math.max(2, social));
  if (outcome === 'good') {
    a.needs.fun = clamp(a.needs.fun + 4);
    t.needs.fun = clamp(t.needs.fun + 4);
  }
  // Practicar carisma
  a.skills = a.skills ?? {};
  a.skills.carisma = Math.min(10, (a.skills.carisma ?? 0) + 0.12 / (1 + Math.floor(a.skills.carisma ?? 0) * 0.35));

  // Descubrir gustos (también cuando algo no le gusta nada)
  let discovered: Interest | undefined;
  if (topic.interest && (outcome === 'good' || dislike === topic.interest)) {
    a.known = a.known ?? {};
    const list = a.known[t.id] ?? [];
    const tag = dislike === topic.interest ? `-${topic.interest}` : topic.interest;
    if (!list.includes(tag)) {
      a.known[t.id] = [...list, tag];
      if (outcome === 'good') discovered = topic.interest;
    }
  }

  const life = lifeReply(world, a, t, topic.id, outcome);
  const say = life.say ?? vary(fill(fresh(topic.say), world, a, t));
  let reply = life.reply ?? fill(fresh(topic[outcome]), world, a, t);
  // El cuñado siempre tiene que añadir algo
  if (hasTrait(t, 'cunado') && outcome !== 'bad' && Math.random() < 0.4) reply += fresh([' Aunque yo lo haría de otra manera', ' Eso lo sé yo mejor que nadie', ' Te lo digo yo, que entiendo', ' Un primo mío lo hace mejor', ' Yo ya lo dije hace tiempo']) + '.';
  return { say, reply, outcome, learned: discovered, goPark: topic.id === 'parque' && outcome === 'good' };
}

/** Descripción de lo que se sabe de sus gustos ("Le encanta la música · No soporta el deporte"). */
export function knownText(a: Agent, t: Agent): string {
  const known = a.known?.[t.id] ?? [];
  const likes = known.filter((k) => !k.startsWith('-')).map((k) => INTEREST_LABEL[k as Interest]);
  const hates = known.filter((k) => k.startsWith('-')).map((k) => INTEREST_LABEL[k.slice(1) as Interest]);
  const parts: string[] = [];
  // "Le encanta la música" / "Le encantan las mascotas" / "Le encantan la música y el arte"
  const plural = likes.length > 1 || /^(los|las) /.test(likes[0] ?? '');
  if (likes.length) parts.push(`Le ${plural ? 'encantan' : 'encanta'} ${likes.join(' y ')}`);
  if (hates.length) parts.push(`No soporta ${hates.join(' ni ')}`);
  return parts.join(' · ');
}
