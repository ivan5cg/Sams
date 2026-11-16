// Modo construcción: comprar, colocar, mover y vender muebles, y ampliar la casa.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { EXPANSIONS } from '../../data/lot';
import { OBJECTS, SELL_RATIO, priceOf } from '../../data/objects';
import { reachable } from '../pathfinding';
import type { Agent, PlacedObject } from '../types';
import type { World } from '../world';
import { endTask } from './tasks';

/** Solo se construye en la casa de la familia, estando allí. */
export function canBuildHere(w: World): boolean {
  return w.viewLotId === w.household.lotId && !w.state.familyGone;
}

/** ¿Cabe `defId` en (x, y)? Comprueba paredes, otros objetos y que no bloquee el paso. */
export function canPlace(w: World, defId: string, x: number, y: number, ignoreId?: string): { ok: boolean; reason?: string } {
  const lotId = w.household.lotId;
  const d = OBJECTS[defId];
  const layout = w.layoutOf(lotId);
  if (!d) return { ok: false };
  for (let ty = y; ty < y + d.h; ty++) {
    for (let tx = x; tx < x + d.w; tx++) {
      const t = layout.tiles[ty]?.[tx];
      if (!t) return { ok: false, reason: 'Fuera de la parcela' };
      if (t === 'wall' || t === 'door') return { ok: false, reason: t === 'door' ? 'Tapa una puerta' : 'Hay una pared' };
      if (tx === layout.entrance.x && ty === layout.entrance.y) return { ok: false, reason: 'Tapa la entrada' };
      const other = w.objectsIn(lotId).find((o) => o.id !== ignoreId && tx >= o.x && tx < o.x + w.objDef(o).w && ty >= o.y && ty < o.y + w.objDef(o).h);
      if (other) return { ok: false, reason: `Ahí está: ${w.objDef(other).name.toLowerCase()}` };
      if (!d.walkable && w.agentsIn(lotId).some((a) => !a.hidden && !a.home && Math.round(a.pos.x) === tx && Math.round(a.pos.y) === ty)) {
        return { ok: false, reason: 'Hay alguien ahí' };
      }
    }
  }
  if (d.walkable) return { ok: true };
  // Que no deje zonas o muebles inaccesibles.
  const grid = w.gridOf(lotId).map((row) => [...row]);
  const ignored = ignoreId ? w.object(ignoreId) : undefined;
  if (ignored && !w.objDef(ignored).walkable) {
    const od = w.objDef(ignored);
    for (let ty = ignored.y; ty < ignored.y + od.h; ty++) for (let tx = ignored.x; tx < ignored.x + od.w; tx++) grid[ty][tx] = true;
  }
  for (let ty = y; ty < y + d.h; ty++) for (let tx = x; tx < x + d.w; tx++) grid[ty][tx] = false;
  const reach = reachable(grid, layout.entrance);
  for (let ty = 0; ty < layout.h; ty++) {
    for (let tx = 0; tx < layout.w; tx++) {
      if (grid[ty][tx] && !reach.has(`${tx},${ty}`)) return { ok: false, reason: 'Bloquearía el paso' };
    }
  }
  const check = (o: { def: string; x: number; y: number }) => {
    const od = OBJECTS[o.def];
    if (!od.actions.length || od.walkable) return true;
    for (let ty = o.y - 1; ty <= o.y + od.h; ty++) {
      for (let tx = o.x - 1; tx <= o.x + od.w; tx++) {
        const inside = tx >= o.x && tx < o.x + od.w && ty >= o.y && ty < o.y + od.h;
        const diagonal = (tx < o.x || tx >= o.x + od.w) && (ty < o.y || ty >= o.y + od.h);
        if (!inside && !diagonal && reach.has(`${tx},${ty}`)) return true;
      }
    }
    return false;
  };
  if (!check({ def: defId, x, y })) return { ok: false, reason: 'No se podría usar' };
  for (const o of w.objectsIn(lotId)) {
    if (o.id === ignoreId) continue;
    if (!check(o)) return { ok: false, reason: `Dejaría sin acceso: ${w.objDef(o).name.toLowerCase()}` };
  }
  return { ok: true };
}

export function buy(w: World, defId: string, x: number, y: number, q: 1 | 2 | 3 = 2): boolean {
  const d = OBJECTS[defId];
  if (!d?.price || !canBuildHere(w)) return false;
  const price = priceOf(d, q);
  if (w.household.funds < price) {
    w.toast('No hay dinero suficiente', '💸');
    return false;
  }
  const can = canPlace(w, defId, x, y);
  if (!can.ok) {
    if (can.reason) w.toast(can.reason, '🚫');
    return false;
  }
  w.household.funds -= price;
  w.state.objects.push({
    id: w.newId('o'),
    def: defId,
    lotId: w.household.lotId,
    x,
    y,
    ...(d.tiers && q !== 2 ? { q } : {}),
    ...(d.maxStock ? { stock: 0 } : {}),
    ...(d.maxDirt ? { dirt: 0 } : {}),
  });
  w.rebuildGrid();
  w.emit({ type: 'sound', id: 'buy', lotId: w.household.lotId });
  return true;
}

/** La siguiente ampliación posible de la casa (si queda alguna). */
export function nextExpansion(w: World) {
  const size = w.lotById(w.household.lotId)?.size ?? 1;
  return EXPANSIONS.find((e) => e.size === size + 1);
}

/** Amplía la casa de la familia: el plano crece y lo del jardín se corre. */
export function expandHouse(w: World): boolean {
  const ex = nextExpansion(w);
  const lot = w.lotById(w.household.lotId);
  if (!ex || !lot || !canBuildHere(w)) return false;
  if (w.household.funds < ex.price) {
    w.toast('No hay dinero suficiente para la reforma', '💸');
    return false;
  }
  const before = w.layoutFor(lot);
  w.household.funds -= ex.price;
  if (ex.shiftX) {
    // Todo lo que estaba en el jardín de la derecha se corre para dejar sitio a la habitación.
    const edge = before.w - 3;
    for (const o of w.objectsIn(lot.id)) if (o.x >= edge) o.x += ex.shiftX;
    for (const a of w.agentsIn(lot.id)) {
      if (a.pos.x >= edge - 0.5) a.pos = { x: a.pos.x + ex.shiftX, y: a.pos.y };
      a.path = [];
      if (a.current && !a.home) endTask(w, a);
    }
  }
  lot.size = ex.size;
  w.rebuildGrid();
  for (const m of w.members) if (m.kind === 'person') w.feel(m, 'casa_nueva');
  w.toast(`¡Reforma terminada! ${ex.label}. Los albañiles se han dejado un bocadillo a medias`, '🏗️');
  w.addNews(`la ${w.household.name} ha hecho obras en casa. Han estado tres semanas con el taladro`, []);
  return true;
}

/** Motivo por el que no se puede mover o vender un objeto (o undefined si se puede). */
export function cantTouch(w: World, o: PlacedObject): string | undefined {
  if (o.lotId !== w.household.lotId) return 'No es vuestro';
  if (w.usersOf(o.id).length) return 'Alguien lo está usando';
  if (w.residentOf(o.id)) return `Aquí vive ${w.residentOf(o.id)!.name}`;
  return undefined;
}

export function moveObject(w: World, id: string, x: number, y: number): boolean {
  const o = w.object(id);
  if (!o || !canBuildHere(w)) return false;
  const why = cantTouch(w, o);
  const can = why ? { ok: false, reason: why } : canPlace(w, o.def, x, y, id);
  if (!can.ok) {
    if (can.reason) w.toast(can.reason, '🚫');
    return false;
  }
  o.x = x;
  o.y = y;
  w.rebuildGrid();
  return true;
}

export function sellObject(w: World, id: string): boolean {
  const o = w.object(id);
  if (!o || !canBuildHere(w)) return false;
  const d = w.objDef(o);
  const why = !d.price ? 'Esto no se puede vender' : cantTouch(w, o);
  if (why) {
    w.toast(why, '🚫');
    return false;
  }
  const refund = Math.floor(priceOf(d, o.q ?? 2) * SELL_RATIO);
  w.household.funds += refund;
  w.state.objects = w.state.objects.filter((x) => x !== o);
  w.rebuildGrid();
  w.toast(`Vendido: ${d.name.toLowerCase()} (+§${refund})`, '🏷️');
  return true;
}

/** Decoración bonita alrededor (plantas, lámparas, alfombras...). */
export function decorAround(w: World, a: Agent): number {
  if (a.kind !== 'person' || a.hidden) return 0;
  let sum = 0;
  for (const o of w.objectsIn(a.lotId)) {
    const d = (w.objDef(o).decor ?? 0) + (o.q === 3 ? 1 : 0);
    if (d && Math.abs(o.x - a.pos.x) <= 2 && Math.abs(o.y - a.pos.y) <= 2) sum += d;
  }
  return Math.min(sum, 3);
}
