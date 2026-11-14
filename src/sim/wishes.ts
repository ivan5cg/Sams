// Deseos: pequeños objetivos de cada persona de la familia. Cumplirlos da dinero y ánimo.

import { ACTIONS } from '../data/actions';
import { SKILLS } from '../data/skills';
import type { Agent, Wish } from './types';
import type { World } from './world';

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Deseos de "hacer algo con un objeto" y el objeto que hace falta. */
const OBJECT_WISHES: { action: string; label: string; icon: string; def: string }[] = [
  { action: 'cook', label: 'Cocinar algo rico', icon: '🍳', def: 'fridge' },
  { action: 'watch_tv', label: 'Ver la tele un rato', icon: '📺', def: 'sofa' },
  { action: 'bath', label: 'Darse un baño relajante', icon: '🛁', def: 'bathtub' },
  { action: 'read', label: 'Leer un libro', icon: '📖', def: 'bookshelf' },
  { action: 'dance', label: 'Bailar', icon: '💃', def: 'stereo' },
  { action: 'play_guitar', label: 'Tocar la guitarra', icon: '🎸', def: 'guitar' },
  { action: 'paint', label: 'Pintar un cuadro', icon: '🎨', def: 'easel' },
  { action: 'play_games', label: 'Jugar a la consola', icon: '🎮', def: 'gamebox' },
  { action: 'play_chess', label: 'Jugar al ajedrez', icon: '♟️', def: 'chess' },
  { action: 'run', label: 'Salir a correr en la cinta', icon: '🏃', def: 'treadmill' },
  { action: 'play_toys', label: 'Jugar con los juguetes', icon: '🧸', def: 'toybox' },
];

let seq = 0;
const wid = () => `w${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Un deseo nuevo que tenga sentido para esta persona ahora. */
export function newWish(world: World, a: Agent): Wish | null {
  const home = world.household.lotId;
  const homeObjects = new Set(world.objectsIn(home).map((o) => o.def));
  const has = new Set((a.wishes ?? []).map((w) => `${w.action ?? ''}:${w.target ?? ''}:${w.lot ?? ''}:${w.skill ?? ''}:${w.money ?? ''}`));
  const options: Wish[] = [];
  const reward = () => 20 + Math.round(Math.random() * 4) * 10;
  const stage = world.stageOf(a);
  if (stage === 'baby') return null;
  const canDo = (actionId: string) => {
    const def = ACTIONS[actionId];
    if (def.actorStages && !def.actorStages.includes(stage)) return false;
    return true;
  };

  for (const w of OBJECT_WISHES) {
    if (homeObjects.has(w.def) && canDo(w.action)) options.push({ id: wid(), kind: 'action', label: w.label, icon: w.icon, action: w.action, reward: reward() });
  }
  for (const m of world.members) {
    if (m === a) continue;
    if (m.kind === 'person' && world.stageOf(m) !== 'baby') {
      options.push({ id: wid(), kind: 'action', label: `Abrazar a ${m.name}`, icon: '🤗', action: 'hug', target: m.id, reward: reward() });
      options.push({ id: wid(), kind: 'action', label: `Contarle un chiste a ${m.name}`, icon: '😂', action: 'joke', target: m.id, reward: reward() });
    } else if (m.kind === 'pet') {
      options.push({ id: wid(), kind: 'action', label: `Jugar con ${m.name}`, icon: '🎾', action: 'play_pet', target: m.id, reward: reward() });
      if (m.species === 'dog') options.push({ id: wid(), kind: 'action', label: `Sacar a pasear a ${m.name}`, icon: '🦮', action: 'walk_dog', target: m.id, reward: reward() });
    }
  }
  if (stage !== 'child') {
    options.push({ id: wid(), kind: 'action', label: 'Conversar con un vecino', icon: '💬', action: 'talk', target: 'vecino', reward: reward() + 10 });
    options.push({ id: wid(), kind: 'place', label: 'Ir al parque', icon: '🌳', lot: 'park', reward: reward() });
    options.push({ id: wid(), kind: 'place', label: 'Ir al estudio de pilates', icon: '🧘', lot: 'studio', reward: reward() });
    options.push({ id: wid(), kind: 'place', label: 'Tomarse algo en un local de açaí', icon: '🫐', lot: 'acai', reward: reward() });
    options.push({ id: wid(), kind: 'action', label: 'Hacer la compra en el Mercadona', icon: '🛒', action: 'shop_small', reward: reward() });
    options.push({ id: wid(), kind: 'action', label: 'Comerse un açaí bowl', icon: '🫐', action: 'acai_bowl', reward: reward() });
    const sk = pick(SKILLS);
    const lvl = Math.floor(a.skills?.[sk.id] ?? 0) + 1;
    if (lvl <= 10) options.push({ id: wid(), kind: 'skill', label: `Llegar a ${sk.label.toLowerCase()} nivel ${lvl}`, icon: sk.icon, skill: sk.id, level: lvl, reward: 40 + lvl * 10 });
  }
  if (stage === 'child' || stage === 'teen') options.push({ id: wid(), kind: 'action', label: 'Hacer los deberes', icon: '📝', action: 'homework', reward: reward() });
  const fresh = options.filter((w) => !has.has(`${w.action ?? ''}:${w.target ?? ''}:${w.lot ?? ''}:${w.skill ?? ''}:${w.money ?? ''}`));
  return fresh.length ? pick(fresh) : null;
}

/** Que cada persona de la familia tenga sus 3 deseos. */
export function topUpWishes(world: World) {
  for (const m of world.members) {
    if (m.kind !== 'person') continue;
    m.wishes = m.wishes ?? [];
    while (m.wishes.length < 3) {
      const w = newWish(world, m);
      if (!w) break;
      m.wishes.push(w);
    }
  }
}

/** ¿Lo que acaba de pasar cumple algún deseo? */
export function matchWish(a: Agent, ev: { action?: string; target?: string; targetHousehold?: string; lotKind?: string; layout?: string; skill?: string; level?: number }, playerHousehold: string): Wish | undefined {
  return (a.wishes ?? []).find((w) => {
    // La compra grande también vale para el deseo de hacer la compra.
    const sameAction = ev.action === w.action || (w.action === 'shop_small' && ev.action === 'shop_big');
    if (w.kind === 'action' && sameAction) {
      if (!w.target) return true;
      if (w.target === 'vecino') return !!ev.targetHousehold && ev.targetHousehold !== playerHousehold;
      return w.target === ev.target;
    }
    if (w.kind === 'place') return ev.layout === (w.lot === 'venue' ? 'studio' : w.lot) || (w.lot === 'park' && ev.lotKind === 'park');
    if (w.kind === 'skill') return ev.skill === w.skill && (ev.level ?? 0) >= (w.level ?? 99);
    return false;
  });
}
