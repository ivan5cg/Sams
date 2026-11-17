// Modo construcción: comprar, colocar, mover y vender muebles, y ampliar la casa.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { EXPANSIONS, houseLayout } from '../../data/lot';
import { OBJECTS, SELL_RATIO, canRotate, priceOf, sizeOf } from '../../data/objects';
import { reachable } from '../pathfinding';
import { roomsOf } from '../rooms';
import { FLOOR_BY_ID, PAINT_PRICE } from '../../data/paint';
import type { Agent, PlacedObject, RoomPaint } from '../types';
import type { World } from '../world';
import { endTask } from './tasks';
import { money } from './money';
import { priced } from './economy';

/** Solo se construye en la casa de la familia, estando allí. */
export function canBuildHere(w: World): boolean {
  return w.viewLotId === w.household.lotId && !w.state.familyGone;
}

/** ¿Cabe `defId` en (x, y)? Comprueba paredes, otros objetos y que no bloquee el paso. */
export function canPlace(w: World, defId: string, x: number, y: number, ignoreId?: string, rot?: 1): { ok: boolean; reason?: string } {
  const lotId = w.household.lotId;
  const def = OBJECTS[defId];
  const layout = w.layoutOf(lotId);
  if (!def) return { ok: false };
  const d = { ...sizeOf({ def: defId, rot }), walkable: def.walkable };
  for (let ty = y; ty < y + d.h; ty++) {
    for (let tx = x; tx < x + d.w; tx++) {
      const t = layout.tiles[ty]?.[tx];
      if (!t) return { ok: false, reason: 'Fuera de la parcela' };
      if (t === 'wall' || t === 'door') return { ok: false, reason: t === 'door' ? 'Tapa una puerta' : 'Hay una pared' };
      if (tx === layout.entrance.x && ty === layout.entrance.y) return { ok: false, reason: 'Tapa la entrada' };
      const other = w.objectsIn(lotId).find((o) => o.id !== ignoreId && tx >= o.x && tx < o.x + sizeOf(o).w && ty >= o.y && ty < o.y + sizeOf(o).h);
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
    const od = sizeOf(ignored);
    for (let ty = ignored.y; ty < ignored.y + od.h; ty++) for (let tx = ignored.x; tx < ignored.x + od.w; tx++) grid[ty][tx] = true;
  }
  for (let ty = y; ty < y + d.h; ty++) for (let tx = x; tx < x + d.w; tx++) grid[ty][tx] = false;
  const reach = reachable(grid, layout.entrance);
  for (let ty = 0; ty < layout.h; ty++) {
    for (let tx = 0; tx < layout.w; tx++) {
      if (grid[ty][tx] && !reach.has(`${tx},${ty}`)) return { ok: false, reason: 'Bloquearía el paso' };
    }
  }
  const check = (o: { def: string; x: number; y: number; rot?: 1 }) => {
    const od0 = OBJECTS[o.def];
    if (!od0.actions.length || od0.walkable) return true;
    const od = sizeOf(o);
    for (let ty = o.y - 1; ty <= o.y + od.h; ty++) {
      for (let tx = o.x - 1; tx <= o.x + od.w; tx++) {
        const inside = tx >= o.x && tx < o.x + od.w && ty >= o.y && ty < o.y + od.h;
        const diagonal = (tx < o.x || tx >= o.x + od.w) && (ty < o.y || ty >= o.y + od.h);
        if (!inside && !diagonal && reach.has(`${tx},${ty}`)) return true;
      }
    }
    return false;
  };
  if (!check({ def: defId, x, y, rot })) return { ok: false, reason: 'No se podría usar' };
  for (const o of w.objectsIn(lotId)) {
    if (o.id === ignoreId) continue;
    if (!check(o)) return { ok: false, reason: `Dejaría sin acceso: ${w.objDef(o).name.toLowerCase()}` };
  }
  return { ok: true };
}

export function buy(w: World, defId: string, x: number, y: number, q: 1 | 2 | 3 = 2, rot?: 1): boolean {
  const d = OBJECTS[defId];
  if (!d?.price || !canBuildHere(w)) return false;
  const price = priced(w, priceOf(d, q));
  if (w.household.funds < price) {
    w.toast('No hay dinero suficiente', '💸');
    return false;
  }
  const can = canPlace(w, defId, x, y, undefined, rot);
  if (!can.ok) {
    if (can.reason) w.toast(can.reason, '🚫');
    return false;
  }
  money(w, w.household, -price, 'muebles');
  const id = w.newId('o');
  w.state.objects.push({
    id,
    def: defId,
    lotId: w.household.lotId,
    x,
    y,
    ...(rot ? { rot } : {}),
    ...(d.tiers && q !== 2 ? { q } : {}),
    ...(d.maxStock ? { stock: 0 } : {}),
    ...(d.maxDirt ? { dirt: 0 } : {}),
  });
  w.rebuildGrid();
  w.emit({ type: 'sound', id: 'buy', lotId: w.household.lotId });
  pushUndo(w, { kind: 'buy', id, price, label: d.name });
  return true;
}

/** Las ampliaciones posibles ahora (las plantillas de la siguiente reforma). */
export function nextExpansions(w: World) {
  const size = w.lotById(w.household.lotId)?.size ?? 1;
  return EXPANSIONS.filter((e) => e.size === size + 1);
}

/** La siguiente ampliación posible de la casa (la primera plantilla), si queda alguna. */
export function nextExpansion(w: World) {
  return nextExpansions(w)[0];
}

/** Amplía la casa de la familia con la plantilla `plan`: el plano crece y lo del jardín se corre. */
export function expandHouse(w: World, plan?: string): boolean {
  const options = nextExpansions(w);
  const ex = options.find((e) => e.plan === plan) ?? options[0];
  const lot = w.lotById(w.household.lotId);
  if (!ex || !lot || !canBuildHere(w)) return false;
  if (w.household.funds < ex.price) {
    w.toast('No hay dinero suficiente para la reforma', '💸');
    return false;
  }
  const before = w.layoutFor(lot);
  // Las paredes nuevas no pueden caer encima de un mueble.
  const after = houseLayout(ex.size, [...(lot.plans ?? []), ex.plan]);
  const edge = before.w - 3;
  for (const o of w.objectsIn(lot.id)) {
    const ox = ex.shiftX && o.x >= edge ? o.x + ex.shiftX : o.x;
    const d = sizeOf(o);
    for (let y = o.y; y < o.y + d.h; y++) {
      for (let x = ox; x < ox + d.w; x++) {
        if (after.tiles[y]?.[x] === 'wall' && !w.objDef(o).walkable) {
          w.toast(`Para esta reforma hay que quitar antes: ${w.objDef(o).name.toLowerCase()}`, '🚧');
          return false;
        }
      }
    }
  }
  money(w, w.household, -ex.price, 'reformas');
  if (ex.shiftX) {
    // Todo lo que estaba en el jardín de la derecha se corre para dejar sitio a la habitación.
    for (const o of w.objectsIn(lot.id)) if (o.x >= edge) o.x += ex.shiftX;
    for (const a of w.agentsIn(lot.id)) {
      if (a.pos.x >= edge - 0.5) a.pos = { x: a.pos.x + ex.shiftX, y: a.pos.y };
      a.path = [];
      if (a.current && !a.home) endTask(w, a);
    }
  }
  lot.size = ex.size;
  lot.plans = [...(lot.plans ?? []), ex.plan];
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

/** Mueve un mueble (y, si se dice `rot`, lo deja girado o no: 1 o 0). */
export function moveObject(w: World, id: string, x: number, y: number, rot?: 0 | 1): boolean {
  const o = w.object(id);
  if (!o || !canBuildHere(w)) return false;
  const newRot = rot === undefined ? o.rot : rot ? 1 : undefined;
  const why = cantTouch(w, o);
  const can = why ? { ok: false, reason: why } : canPlace(w, o.def, x, y, id, newRot);
  if (!can.ok) {
    if (can.reason) w.toast(can.reason, '🚫');
    return false;
  }
  pushUndo(w, { kind: 'move', id, x: o.x, y: o.y, rot: o.rot, label: w.objDef(o).name });
  o.x = x;
  o.y = y;
  if (newRot) o.rot = newRot;
  else delete o.rot;
  w.rebuildGrid();
  return true;
}

/** Girar un mueble donde está (90°). */
export function rotateObject(w: World, id: string): boolean {
  const o = w.object(id);
  if (!o || !canRotate(o.def)) return false;
  return moveObject(w, id, o.x, o.y, o.rot ? 0 : 1);
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
  const refund = Math.floor(priced(w, priceOf(d, o.q ?? 2)) * SELL_RATIO);
  money(w, w.household, refund, 'ventas');
  pushUndo(w, { kind: 'sell', obj: { ...o }, refund, label: d.name });
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

/** Pinta las paredes y/o cambia el suelo de una habitación de la casa. */
export function paintRoom(w: World, roomId: string, patch: RoomPaint): boolean {
  if (!canBuildHere(w)) return false;
  const lot = w.lotById(w.household.lotId);
  const layout = w.layoutFor(lot);
  if (!roomsOf(layout).rooms.some((r) => r.id === roomId)) return false;
  if (patch.floor !== undefined && !FLOOR_BY_ID[patch.floor]) return false;
  const before = lot.paint?.[roomId];
  const next = { ...before, ...patch };
  if (before && next.wall === before.wall && next.floor === before.floor) return false;
  const price = (patch.wall !== undefined ? PAINT_PRICE.wall : 0) + (patch.floor !== undefined ? PAINT_PRICE.floor : 0);
  if (w.household.funds < price) {
    w.toast('No hay dinero para la pintura', '💸');
    return false;
  }
  lot.paint = { ...lot.paint, [roomId]: next };
  money(w, w.household, -price, 'reformas');
  pushUndo(w, { kind: 'paint', roomId, before: before ? { ...before } : undefined, price, label: patch.floor !== undefined ? 'Suelo nuevo' : 'Pintura' });
  return true;
}

// --- Deshacer (solo en la sesión de obra: no se guarda) --------------------------

export type UndoEntry =
  | { kind: 'buy'; id: string; price: number; label: string }
  | { kind: 'move'; id: string; x: number; y: number; rot?: 1; label: string }
  | { kind: 'sell'; obj: PlacedObject; refund: number; label: string }
  | { kind: 'paint'; roomId: string; before: RoomPaint | undefined; price: number; label: string };

const MAX_UNDO = 20;

export function pushUndo(w: World, e: UndoEntry) {
  w.buildUndo.push(e);
  if (w.buildUndo.length > MAX_UNDO) w.buildUndo.shift();
}

/** Lo último que se puede deshacer (para el botón). */
export function lastUndo(w: World): UndoEntry | undefined {
  return w.buildUndo[w.buildUndo.length - 1];
}

/** Deshace lo último de la obra y devuelve (o cobra) el dinero. */
export function undoBuild(w: World): boolean {
  const e = w.buildUndo.pop();
  if (!e || !canBuildHere(w)) return false;
  const h = w.household;
  if (e.kind === 'buy') {
    const o = w.object(e.id);
    if (!o || cantTouch(w, o)) {
      w.toast('Eso ya no se puede deshacer', '🚫');
      return false;
    }
    w.state.objects = w.state.objects.filter((x) => x !== o);
    money(w, h, e.price, 'muebles');
  } else if (e.kind === 'move') {
    const o = w.object(e.id);
    if (!o || !canPlace(w, o.def, e.x, e.y, o.id, e.rot).ok || cantTouch(w, o)) {
      w.toast('No se puede volver a dejar donde estaba', '🚫');
      return false;
    }
    o.x = e.x;
    o.y = e.y;
    if (e.rot) o.rot = e.rot;
    else delete o.rot;
  } else if (e.kind === 'sell') {
    if (h.funds < e.refund || !canPlace(w, e.obj.def, e.obj.x, e.obj.y, undefined, e.obj.rot).ok) {
      w.toast(h.funds < e.refund ? 'No hay dinero para recuperarlo' : 'Ya no cabe donde estaba', '🚫');
      return false;
    }
    money(w, h, -e.refund, 'ventas');
    w.state.objects.push({ ...e.obj });
  } else if (e.kind === 'paint') {
    const lot = w.lotById(h.lotId);
    lot.paint = lot.paint ?? {};
    if (e.before) lot.paint[e.roomId] = e.before;
    else delete lot.paint[e.roomId];
    money(w, h, e.price, 'reformas');
  }
  w.rebuildGrid();
  w.toast(`Deshecho: ${e.label.toLowerCase()}`, '↩️');
  return true;
}
