// Los sitios nuevos de la fase 5: la biblioteca (lógica y deberes, en silencio), el gimnasio
// (pesas y saco de boxeo para desfogarse) y el mercadillo del domingo (barato, y regateando,
// más). Horarios, precios con rebaja y lo que pasa al terminar cada cosa.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { ECONOMY } from '../../data/economy';
import { MINUTES_PER_DAY } from '../constants';
import { forget, hasEmotion } from '../emotions';
import { CLOTHES } from '../neighborhood';
import { hasTrait } from '../traits';
import type { Agent } from '../types';
import type { World } from '../world';
import { money } from './money';
import { skillLevel } from './skills';
import { startTravel } from './travel';

/** Lo que se compra en el mercadillo (y se puede regatear). */
export const MARKET_BUYS = new Set(['market_food', 'market_clothes', 'rummage']);

/** Horario de cada sitio nuevo (o nada si no es uno de ellos). */
export function placeClosedReason(layout: string | undefined, minutes: number): string | undefined {
  const m = minutes % MINUTES_PER_DAY;
  const wd = Math.floor(minutes / MINUTES_PER_DAY) % 7;
  if (layout === 'library') {
    if (wd === 6) return 'Los domingos, la biblioteca está cerrada';
    if (m < 9 * 60 || m >= 21 * 60) return 'Está cerrada (abre de 9:00 a 21:00)';
  }
  if (layout === 'gym' && (m < 7 * 60 || m >= 23 * 60)) return 'Está cerrado (abre de 7:00 a 23:00)';
  if (layout === 'padel' && (m < 8 * 60 || m >= 23 * 60)) return 'Las pistas, de 8:00 a 23:00';
  if (layout === 'market' && (wd !== 6 || m < 9 * 60 || m >= 14 * 60 + 30)) return 'El mercadillo solo se pone los domingos, de 9:00 a 14:30';
  return undefined;
}

/** Precio con la rebaja de haber regateado (solo en el mercadillo). */
export function marketPrice(a: Agent | undefined, actionId: string, cost: number): number {
  if (a && MARKET_BUYS.has(actionId) && hasEmotion(a, 'regateo')) return Math.round(cost * ECONOMY.haggleDiscount);
  return cost;
}

/** Probabilidad de que el del puesto baje el precio. */
export function haggleChance(w: World, a: Agent): number {
  return Math.min(0.9, 0.3 + 0.08 * skillLevel(w, a, 'carisma') + (hasTrait(a, 'cunado') ? 0.1 : 0) + (hasTrait(a, 'grunon') ? -0.1 : 0));
}

const FINDS: { p: number; text: string; icon: string; effect: (w: World, a: Agent) => void }[] = [
  { p: 0.3, text: 'un libro viejo de ajedrez. Ya sabe dos aperturas más', icon: '📕', effect: (_w, a) => (a.skills = { ...a.skills, logica: Math.min(10, (a.skills?.logica ?? 0) + 0.5) }) },
  { p: 0.25, text: 'un vinilo de Raphael en perfecto estado', icon: '💿', effect: (w, a) => w.feel(a, 'chollo') },
  { p: 0.15, text: 'un jarrón que parecía de la abuela... y lo ha revendido en Wallapop', icon: '🏺', effect: (w, a) => {
    const h = w.householdOf(a);
    if (h) money(w, h, ECONOMY.resale, 'ventas');
    w.feel(a, 'chollo');
  } },
  { p: 0.3, text: 'nada: solo cables de un Nokia y un cenicero de Benidorm', icon: '🙃', effect: () => {} },
];

/** Al terminar una acción en uno de los sitios nuevos. */
export function placeTask(w: World, a: Agent, actionId: string) {
  const mine = w.isPlayerMember(a);
  const say = (text: string, icon: string) => mine && w.toast(text, icon, a.id);
  // Lo comprado con rebaja gasta la rebaja.
  if (MARKET_BUYS.has(actionId)) forget(a, 'regateo');
  switch (actionId) {
    case 'homework_lib':
      // En la biblioteca cunden más que en casa (en casa, +4).
      if (a.job?.career === 'school') a.job.perf = Math.min(100, a.job.perf + 8);
      say(`${a.name} ha hecho los deberes en la biblioteca. Sin la tele, cunde el doble`, '📝');
      break;
    case 'box':
      for (const e of ['enfadado', 'insultado', 'celos']) forget(a, e);
      w.feel(a, 'desfogado');
      say(`${a.name} se ha desfogado con el saco. Ya no se acuerda ni de por qué estaba enfadado/a`, '🥊');
      break;
    case 'market_food': {
      a.carrying = (a.carrying ?? 0) + 8;
      say(`${a.name} vuelve del mercadillo con 8 raciones de fruta y verdura. «¡Que me las quitan de las manos!»`, '🍊');
      const h = w.householdOf(a);
      if (a.errand === 'compra' && h && a.lotId !== h.lotId) {
        a.errand = undefined;
        startTravel(w, a, h.lotId);
      }
      break;
    }
    case 'market_clothes': {
      const options = CLOTHES.filter((c) => c !== a.color);
      a.color = options[Math.floor(Math.random() * options.length)];
      w.feel(a, 'estreno');
      say(`${a.name} estrena ropa de mercadillo. Parece de marca (casi)`, '👕');
      break;
    }
    case 'rummage': {
      let r = Math.random();
      const find = FINDS.find((f) => (r -= f.p) < 0) ?? FINDS[FINDS.length - 1];
      find.effect(w, a);
      say(`${a.name} ha encontrado ${find.text}`, find.icon);
      break;
    }
    case 'haggle':
      if (hasEmotion(a, 'regateo')) {
        say(`${a.name} ya tiene la rebaja: ¡a comprar!`, '🤝');
      } else if (Math.random() < haggleChance(w, a)) {
        w.feel(a, 'regateo');
        say(`«Venga, para ti, a mitad de precio». ¡${a.name} ha regateado como nadie!`, '🤝');
      } else {
        say(`«¡Que me quitas el pan de mis hijos!». A ${a.name} no le bajan ni un euro`, '😤');
      }
      break;
    case 'play_padel': {
      // El pádel: siempre hay un cuñado que lo comenta toda la semana.
      const rivals = w.agentsIn(a.lotId).filter((x) => x !== a && x.kind === 'person' && !x.travel && x.current?.actionId === 'play_padel');
      const won = Math.random() < 0.5 + 0.05 * skillLevel(w, a, 'forma');
      if (won) w.feel(a, 'fiesta', undefined, 3);
      say(
        won
          ? `${a.name} ha ganado al pádel 6-4${rivals[0] ? ` a ${rivals[0].name}` : ''}. Lo va a contar en todas las comidas familiares`
          : `${a.name} ha perdido al pádel. Dice que la pala era mala y que el sol le daba de cara`,
        '🎾',
      );
      break;
    }
    case 'fart':
    case 'sing':
      if (w.lotById(a.lotId)?.layout === 'library') {
        say(`¡Shhh! La bibliotecaria ha mirado fatal a ${a.name}`, '🤫');
        for (const x of w.agentsIn(a.lotId)) if (x !== a && x.kind === 'person' && !x.travel) x.needs.fun = Math.max(0, x.needs.fun - 5);
      }
      break;
  }
}
