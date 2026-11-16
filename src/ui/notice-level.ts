// A qué nivel va cada aviso: urgente (se queda hasta tocarlo), familia (aviso normal)
// o barrio (no sale como aviso: va a la bandeja 🔔). Puro: se prueba sin navegador.

import { SEASONS } from '../data/seasons';
import type { Toast, World } from '../sim/world';

export type NoticeLevel = 'urgent' | 'family' | 'barrio';

/** Cosas que no pueden esperar: alguien está fatal o hay un problema serio. */
export const URGENT_ICONS = new Set(['😭', '🆘', '❗', '💦', '😵', '🥴', '🤮', '⚠️']);

/** Lo que pasa en el barrio (o en el calendario) y no exige hacer nada ahora. */
export const BARRIO_ICONS = new Set([
  '🌅', '🥵', '🥬', '🎩', '🗳️', '⚽', '🎆', '🍇', '🎄', '🚚', '📢', '🎤', '🌹', '👋', '🕯️', '🎶', '🎵',
  ...SEASONS.map((s) => s.icon),
]);

export function noticeLevel(t: Toast, w: World): NoticeLevel {
  const icon = t.icon ?? '';
  const who = t.agentId ? w.agent(t.agentId) : undefined;
  const mine = who ? w.isPlayerMember(who) : undefined;
  if (URGENT_ICONS.has(icon)) return mine === false ? 'barrio' : 'urgent';
  if (mine !== undefined) return mine ? 'family' : 'barrio';
  if (BARRIO_ICONS.has(icon)) return 'barrio';
  return 'family';
}
