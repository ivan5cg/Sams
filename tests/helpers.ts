/** Utilidades comunes de las pruebas. */
import { World } from '../src/sim/world';
import { serialize } from '../src/save/serialize';
import type { Agent } from '../src/sim/types';

/** Las familias de Madrid (las de Alcorcón van aparte). */
export const madridHomes = (hs: { lotId: string }[]) => hs.filter((h) => !h.lotId.startsWith('AL'));

/** Una partida con el formato de una versión anterior (sin barrio). */
export function oldSave(version: number) {
  const w = World.createNew();
  const st = JSON.parse(serialize(w.state));
  st.version = version;
  st.agents = st.agents.filter((a: { householdId: string }) => a.householdId === 'h1');
  st.objects = st.objects.filter((o: { lotId: string }) => o.lotId === 'L0');
  st.households = st.households.filter((h: { id: string }) => h.id === 'h1');
  for (const x of [...st.agents, ...st.objects, ...st.households]) delete x.lotId;
  delete st.lots;
  return st;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

/**
 * Una partida "como la habría guardado" la versión `version` del juego: se parte de una
 * partida nueva y se le quita, de la más reciente a la más antigua, cada cosa que llegó después.
 */
export function saveAt(version: number): Raw {
  if (version <= 2) {
    const st = oldSave(version);
    // Aún no había relaciones, trabajos, cunas, habilidades, despensa, emociones ni rasgos.
    delete st.rels;
    delete st.aging;
    delete st.events;
    delete st.secrets;
    delete st.news;
    for (const a of st.agents) for (const k of ['job', 'skills', 'petTrait', 'traits', 'emotions', 'aspiration', 'wishes', 'stats']) delete a[k];
    for (const h of st.households) delete h.pantry;
    st.objects = st.objects.filter((o: Raw) => o.def !== 'crib');
    if (version === 1) st.objects = st.objects.filter((o: Raw) => !['cage', 'pond', 'hammock', 'computer'].includes(o.def));
    return st;
  }
  const w = World.createNew();
  const st = JSON.parse(serialize(w.state));
  st.version = version;
  const dropLots = (ids: (id: string) => boolean) => {
    st.lots = st.lots.filter((l: Raw) => !ids(l.id));
    st.objects = st.objects.filter((o: Raw) => !ids(o.lotId));
    const gone = new Set(st.agents.filter((a: Raw) => ids(a.lotId) || a.role).map((a: Raw) => a.id));
    st.agents = st.agents.filter((a: Raw) => !gone.has(a.id));
    st.households = st.households.filter((h: Raw) => !ids(h.lotId));
    for (const k of Object.keys(st.rels ?? {})) if (k.split('|').some((id) => gone.has(id))) delete st.rels[k];
  };
  // v12: muebles girados y pintura por habitación.
  if (version <= 11) {
    for (const o of st.objects) delete o.rot;
    for (const l of st.lots) {
      delete l.paint;
      delete l.plans;
    }
  }
  // v11: órdenes programadas.
  if (version <= 10) {
    delete st.schedule;
    delete st.feats;
  }
  // v10: Alcorcón, el metro, la gente de la calle y el salseo.
  if (version <= 9) {
    dropLots((id) => ['MT', 'PL', 'BR'].includes(id) || id.startsWith('AL'));
    delete st.secrets;
  }
  // v9: emociones, metas de vida, mascotas con carácter, estaciones.
  if (version <= 8) {
    delete st.events;
    for (const a of st.agents) for (const k of ['petTrait', 'emotions', 'aspiration', 'stats']) delete a[k];
  }
  // v8: el Mercadona, los açaí y la despensa.
  if (version <= 7) {
    dropLots((id) => ['M', 'A1', 'A2'].includes(id));
    for (const h of st.households) delete h.pantry;
  }
  // v7: habilidades y estudio de pilates.
  if (version <= 6) {
    dropLots((id) => id === 'G');
    for (const a of st.agents) delete a.skills;
  }
  // v5: ciclo de vida (cunas).
  if (version <= 4) {
    st.objects = st.objects.filter((o: Raw) => o.def !== 'crib');
    delete st.aging;
  }
  // v4: relaciones, trabajos y colegio.
  if (version <= 3) {
    delete st.rels;
    for (const a of st.agents) delete a.job;
  }
  return st;
}

/**
 * Deja en escena solo a `keep`: los demás se van "de viaje" indefinidamente y no
 * llegan visitas espontáneas. Así las pruebas no dependen de lo que hagan los demás.
 */
export function isolate(w: World, keep: string[]) {
  for (const a of w.state.agents) {
    if (keep.includes(a.id)) continue;
    a.current = null;
    a.path = [];
    a.hidden = false;
    a.travel = { from: a.lotId, to: a.lotId, arrive: Number.POSITIVE_INFINITY };
  }
  (w as unknown as { noVisitsUntil: number }).noVisitsUntil = Number.POSITIVE_INFINITY;
  // Sin deseos: sus recompensas descuadrarían las cuentas de las pruebas.
  for (const a of w.state.agents) a.wishes = [];
  w.wishesEnabled = false;
}

export function fullNeeds(a: Agent) {
  for (const k of Object.keys(a.needs) as (keyof Agent['needs'])[]) a.needs[k] = 95;
}

/**
 * Comprueba que el mundo está sano: sin NaN, cada uno en una parcela que existe y en una
 * casilla por la que se puede andar, y las familias con sus miembros. Devuelve los fallos.
 */
export function problems(w: World): string[] {
  const out: string[] = [];
  const lots = new Set(w.state.lots.map((l) => l.id));
  for (const h of w.state.households) {
    if (!Number.isFinite(h.funds)) out.push(`${h.name}: dinero ${h.funds}`);
    if (!lots.has(h.lotId)) out.push(`${h.name}: parcela ${h.lotId} no existe`);
    for (const id of h.memberIds) if (!w.agent(id)) out.push(`${h.name}: falta el miembro ${id}`);
  }
  for (const a of w.state.agents) {
    const who = `${a.name} (${a.id})`;
    for (const [k, v] of Object.entries(a.needs)) if (!Number.isFinite(v) || v < 0 || v > 100) out.push(`${who}: ${k} = ${v}`);
    if (!Number.isFinite(a.pos.x) || !Number.isFinite(a.pos.y)) out.push(`${who}: posición ${a.pos.x},${a.pos.y}`);
    if (!lots.has(a.lotId)) out.push(`${who}: parcela ${a.lotId} no existe`);
    if (!a.role && !w.householdOf(a)) out.push(`${who}: sin familia`);
    if (a.travel || a.hidden || a.home || a.abstract) continue;
    const lay = w.layoutOf(a.lotId);
    const x = Math.round(a.pos.x), y = Math.round(a.pos.y);
    const tile = lay.tiles[y]?.[x];
    if (!tile) out.push(`${who}: fuera de ${a.lotId} en ${x},${y}`);
    else if (tile === 'wall') out.push(`${who}: dentro de una pared de ${a.lotId} en ${x},${y}`);
  }
  for (const o of w.state.objects) if (!lots.has(o.lotId)) out.push(`objeto ${o.id} (${o.def}): parcela ${o.lotId} no existe`);
  return out;
}
