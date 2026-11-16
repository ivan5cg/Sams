// Deseos de la familia: cumplirlos, perseguirlos y los turnos de conversación.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { ACTIONS } from '../../data/actions';
import type { Agent } from '../types';
import { clamp } from '../util';
import { matchWish, newWish } from '../wishes';
import type { World } from '../world';
import { checkObjectAction } from './checks';
import { command, endTask } from './tasks';
import { travel } from './travel';

/** Algo ha pasado: si cumple un deseo de la familia, recompensa. */
export function wishEvent(w: World, a: Agent, ev: { action?: string; target?: string; targetHousehold?: string; lotKind?: string; layout?: string; skill?: string; level?: number }) {
  if (!w.wishesEnabled || !w.isPlayerMember(a) || !a.wishes?.length) return;
  const wish = matchWish(a, ev, w.household.id);
  if (!wish) return;
  a.wishes = a.wishes.filter((x) => x !== wish);
  w.household.funds += wish.reward;
  a.needs.fun = clamp(a.needs.fun + 15);
  a.needs.social = clamp(a.needs.social + 5);
  w.toast(`¡Deseo cumplido! ${a.name}: ${wish.label} (+§${wish.reward})`, '⭐');
  w.say(a.id, '¡Sí! ¡Lo he conseguido!', 'say');
  w.feel(a, 'deseo');
  w.bump(a, 'wishes_done');
  const next = newWish(w, a);
  if (next) a.wishes.push(next);
}

/** Atajo: el personaje se pone a cumplir un deseo (si se puede desde donde está). */
export function pursueWish(w: World, agentId: string, wishId: string): boolean {
  const a = w.agent(agentId);
  const wish = a?.wishes?.find((x) => x.id === wishId);
  if (!a || !wish) return false;
  if (wish.kind === 'place') {
    const want = wish.lot === 'venue' ? 'studio' : wish.lot;
    const lot = w.state.lots.find((l) => l.layout === want);
    if (lot) return travel(w, [a.id], lot.id);
    return false;
  }
  if (wish.kind === 'skill') {
    w.toast(`Para subir habilidades: cocinar, tocar, pintar, hacer deporte, ajedrez, charlar...`, '💡');
    return false;
  }
  if (wish.kind === 'action' && wish.action) {
    const def = ACTIONS[wish.action];
    if (def.target === 'self') return command(w, a.id, wish.action, { kind: 'agent', id: a.id });
    if (def.target === 'agent' && def.targetRoles) {
      const npc = w.agentsIn(a.lotId).find((x) => x.role && def.targetRoles!.includes(x.role) && !x.hidden);
      if (npc) return command(w, a.id, wish.action, { kind: 'agent', id: npc.id });
      const post = w.state.agents.find((x) => x.role && def.targetRoles!.includes(x.role))?.post;
      if (post && post !== a.lotId) {
        w.toast(`${a.name} va a ${w.lotById(post).name}`, '💡');
        return travel(w, [a.id], post);
      }
      return false;
    }
    if (def.target === 'agent') {
      if (wish.target === 'vecino') {
        const n = w.agentsIn(a.lotId).find((x) => x.kind === 'person' && x.householdId !== a.householdId && w.stageOf(x) !== 'baby');
        if (!n) {
          w.toast('No hay vecinos por aquí: prueba en el parque o invítalos a casa', '💡');
          return false;
        }
        return command(w, a.id, wish.action, { kind: 'agent', id: n.id });
      }
      const t = w.agent(wish.target);
      if (!t || t.lotId !== a.lotId || t.travel) {
        w.toast(`${t?.name ?? 'Esa persona'} no está aquí`, '💡');
        return false;
      }
      return command(w, a.id, wish.action, { kind: 'agent', id: t.id });
    }
    const o = w.objectsIn(a.lotId).find((x) => w.objDef(x).actions.includes(wish.action!) && checkObjectAction(w, a, x, wish.action!).ok);
    // Cosas que se hacen fuera de casa: primero, ir allí.
    const away: Record<string, string> = { shop_small: 'super', shop_big: 'super', acai_bowl: 'acai', smoothie: 'acai', selfie: 'acai', cana: 'bar', calamares: 'bar', bravas: 'bar', play_mus: 'bar', churros: 'plaza', throw_coin: 'plaza' };
    if (!o && away[wish.action]) {
      const lot = w.state.lots.find((l) => l.layout === away[wish.action!]);
      if (lot && lot.id !== a.lotId) {
        w.toast(`${a.name} va a ${lot.name}. Allí, toca la caja o la barra`, '💡');
        return travel(w, [a.id], lot.id);
      }
    }
    if (!o) {
      w.toast('Aquí no se puede: hace falta estar en casa (o comprar el mueble)', '💡');
      return false;
    }
    return command(w, a.id, wish.action, { kind: 'object', id: o.id });
  }
  return false;
}

/** Un turno de conversación interactiva (la lógica está en conversation.ts). */
export function onTalkTurn(w: World, a: Agent, t: Agent, res: { say: string; reply: string; goPark?: boolean }, firstTurn: boolean) {
  w.say(a.id, res.say);
  w.say(t.id, res.reply);
  if (firstTurn) wishEvent(w, a, { action: 'talk', target: t.id, targetHousehold: t.householdId });
  if (res.goPark) {
    const park = w.state.lots.find((l) => l.kind === 'park');
    if (park) {
      endTask(w, a);
      endTask(w, t);
      travel(w, [a.id, t.id], park.id);
      if (!w.isPlayerMember(t)) t.visitUntil = w.state.minutes + 180;
    }
  }
}
