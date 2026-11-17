// Habilidades: practicar, subir de nivel y lo que se gana con ellas.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { MAX_SKILL, SKILL_BY_ID } from '../../data/skills';
import { unlocksOf } from '../../data/skillTree';
import type { Agent } from '../types';
import { clamp, rand } from '../util';
import type { World } from '../world';
import { money } from './money';
import { wishEvent } from './wishes';

export function skillLevel(_w: World, a: Agent, id: string): number {
  return Math.floor(a.skills?.[id] ?? 0);
}

/** Practicar sube la habilidad (cada nivel cuesta más que el anterior). */
export function practice(w: World, a: Agent, skill: { id: string; rate: number }, dt: number, cap = MAX_SKILL) {
  if (a.kind !== 'person') return;
  a.skills = a.skills ?? {};
  const before = a.skills[skill.id] ?? 0;
  if (before >= cap) return;
  const after = Math.min(cap, before + (skill.rate * dt) / (1 + Math.floor(before) * 0.35));
  a.skills[skill.id] = after;
  if (Math.floor(after) > Math.floor(before)) levelUp(w, a, skill.id, Math.floor(after));
}

/** Sube de nivel: aviso, emoción, deseos y lo que se desbloquea. */
export function levelUp(w: World, a: Agent, skillId: string, level: number) {
  if (!w.isPlayerMember(a)) return;
  const s = SKILL_BY_ID[skillId];
  w.toast(`${a.name} ha subido a ${s.label.toLowerCase()} nivel ${level}`, s.icon);
  w.feel(a, 'nivel', s.label.toLowerCase());
  wishEvent(w, a, { skill: skillId, level });
  const news = unlocksOf(skillId).filter((u) => u.level === level);
  if (news.length) w.toast(`🔓 ${a.name} ya puede: ${news.map((u) => `${u.icon} ${u.label}`).join(', ')}`, '🔓', a.id);
}

/** Lo que da practicar: cuadros que se venden, propinas, notas, comida más rica. */
export function skillPayoff(w: World, a: Agent, actionId: string) {
  const h = w.householdOf(a);
  const mine = w.isPlayerMember(a);
  if (actionId === 'paint' && h) {
    const lvl = skillLevel(w, a, 'arte');
    const price = Math.round(10 + lvl * 15 + rand(0, 10 + lvl * 5));
    money(w, h, price, 'ventas');
    if (mine) w.toast(`${a.name} ha vendido un cuadro por §${price}`, '🖼️');
  }
  if (actionId === 'busk' && h) {
    const tips = Math.round(skillLevel(w, a, 'musica') * 8 + rand(0, 15));
    money(w, h, tips, 'propinas');
    if (mine) w.toast(`${a.name} ha sacado §${tips} en propinas`, '🪕');
  }
  if (actionId === 'homework' && a.job?.career === 'school') a.job.perf = Math.min(100, a.job.perf + 4);
  if (actionId === 'cook') a.needs.hunger = clamp(a.needs.hunger + skillLevel(w, a, 'cocina') * 3);
}
