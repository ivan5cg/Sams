// Conversaciones interactivas: el jugador elige de qué hablar y el otro reacciona según sus gustos.

import { INTERESTS, INTEREST_LABEL, TOPICS, TOPIC_BY_ID, type Interest, type TopicDef } from '../data/dialogue';
import { acceptChance, canRomance, changeRel, getRel } from './social';
import { hasTrait, traitsOf } from './traits';
import type { Agent } from './types';
import { moodScore, type World } from './world';

const hashStr = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
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

/** Temas que se pueden elegir ahora (cambian en cada turno). */
export function topicsFor(world: World, a: Agent, t: Agent, turn: number): TopicDef[] {
  const rel = getRel(world.state, a.id, t.id);
  const pool: TopicDef[] = [];
  const interestTopics = TOPICS.filter((x) => x.interest);
  // Rotación según el turno para que cambien las opciones
  const start = (hashStr(a.id + t.id) + turn * 3) % interestTopics.length;
  pool.push(interestTopics[start], interestTopics[(start + 1) % interestTopics.length]);
  pool.push(TOPIC_BY_ID[turn % 2 === 0 ? 'dia' : 'cumplido']);
  pool.push(TOPIC_BY_ID[['chiste', 'precios', 'quejarse'][turn % 3]]);
  if (world.gossipFor(a, t) && !pool.some((x) => x.id === 'cotilleos')) pool.push(TOPIC_BY_ID.cotilleos);
  if (canRomance(world.state, a, t) && (rel.r >= 10 || rel.f >= 30)) pool.push(TOPIC_BY_ID.coquetear);
  const lot = world.lotById(a.lotId);
  if (lot.kind !== 'park' && world.hour >= 8 && world.hour < 20 && !t.home && world.isPlayerMember(a)) pool.push(TOPIC_BY_ID.parque);
  return pool;
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
  const topic = TOPIC_BY_ID[topicId];
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
  } else if (topic.id === 'parque') {
    pGood = rel.f >= 15 && !world.busySoon(t, 2) && world.canTravel(t, 'P').ok ? 0.85 : 0;
    pBad = 0.1;
  }

  const r = Math.random();
  const outcome: ConversationResult['outcome'] = r < pGood ? 'good' : r < pGood + Math.max(0, pBad) ? 'bad' : 'meh';
  const interestBonus = learned && outcome === 'good' ? 3 : 0;
  const df = outcome === 'good' ? 6 + interestBonus : outcome === 'meh' ? 1 : -4;
  const dr = topic.id === 'coquetear' ? (outcome === 'good' ? 8 : outcome === 'bad' ? -4 : 1) : topic.id === 'cumplido' && outcome === 'good' && canRomance(world.state, a, t) ? 1 : 0;
  changeRel(world.state, a.id, t.id, df, dr);
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

  const say = fill(pick(topic.say), world, a, t);
  let reply = fill(pick(topic[outcome]), world, a, t);
  // El cuñado siempre tiene que añadir algo
  if (hasTrait(t, 'cunado') && outcome !== 'bad' && Math.random() < 0.4) reply += pick([' Aunque yo lo haría de otra manera', ' Eso lo sé yo mejor que nadie', ' Te lo digo yo, que entiendo']) + '.';
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
