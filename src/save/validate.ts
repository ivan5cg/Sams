// Comprobación de una partida al cargarla o importarla: que los identificadores y los números
// sean lo que dicen ser. Así un fichero manipulado no puede colar HTML por un id o un número
// (los textos libres, como los nombres, se escapan siempre al pintarlos).

import { ACTIONS } from '../data/actions';
import { OBJECTS } from '../data/objects';
import { FLOOR_BY_ID } from '../data/paint';
import { SPECIES } from '../data/species';
import type { WorldState } from '../sim/types';

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

class Broken extends Error {
  constructor(what: string) {
    super(`La partida está dañada (${what})`);
  }
}

const id = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !SAFE_ID.test(v)) throw new Broken(what);
};
const optId = (v: unknown, what: string) => v === undefined || v === null || id(v, what);
const num = (v: unknown, what: string) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Broken(what);
};
const optNum = (v: unknown, what: string) => v === undefined || v === null || num(v, what);
const str = (v: unknown, what: string) => {
  if (typeof v !== 'string') throw new Broken(what);
};
const optStr = (v: unknown, what: string) => v === undefined || v === null || str(v, what);
const arr = (v: unknown, what: string): unknown[] => {
  if (!Array.isArray(v)) throw new Broken(what);
  return v;
};

/** Lanza un error con un mensaje claro si la partida no tiene la forma esperada. */
export function validateState(s: WorldState) {
  num(s.minutes, 'reloj');
  num(s.nextId, 'contador');
  optNum(s.speed, 'velocidad');
  id(s.playerHouseholdId, 'familia del jugador');
  id(s.activeAgentId, 'personaje activo');
  for (const l of arr(s.lots, 'parcelas') as WorldState['lots']) {
    id(l.id, 'parcela');
    str(l.name, `nombre de ${l.id}`);
    optId(l.householdId, `familia de ${l.id}`);
    optNum(l.size, `tamaño de ${l.id}`);
    for (const p of l.plans ?? []) if (!['jardin', 'bano', 'salon', 'dormitorios'].includes(p)) throw new Broken(`reforma de ${l.id}`);
    for (const [room, p] of Object.entries(l.paint ?? {})) {
      id(room, `habitación de ${l.id}`);
      optNum(p?.wall, `pintura de ${l.id}`);
      if (p?.floor !== undefined && !FLOOR_BY_ID[p.floor]) throw new Broken(`suelo de ${l.id}`);
    }
  }
  for (const h of arr(s.households, 'familias') as WorldState['households']) {
    id(h.id, 'familia');
    id(h.lotId, `casa de ${h.id}`);
    str(h.name, `nombre de ${h.id}`);
    num(h.funds, `dinero de ${h.id}`);
    optNum(h.pantry, `despensa de ${h.id}`);
    for (const m of arr(h.memberIds, `miembros de ${h.id}`)) id(m, `miembro de ${h.id}`);
    for (const l of h.ledger ?? []) {
      num(l.week, `cuentas de ${h.id}`);
      for (const v of [...Object.values(l.in ?? {}), ...Object.values(l.out ?? {})]) num(v, `cuentas de ${h.id}`);
    }
  }
  for (const a of arr(s.agents, 'personajes') as WorldState['agents']) {
    id(a.id, 'personaje');
    id(a.householdId, `familia de ${a.id}`);
    id(a.lotId, `parcela de ${a.id}`);
    str(a.name, `nombre de ${a.id}`);
    if (!SPECIES[a.species]) throw new Broken(`especie de ${a.id}`);
    num(a.ageDays, `edad de ${a.id}`);
    num(a.color, `color de ${a.id}`);
    num(a.pos?.x, `posición de ${a.id}`);
    num(a.pos?.y, `posición de ${a.id}`);
    for (const v of Object.values(a.needs ?? {})) num(v, `necesidades de ${a.id}`);
    optId(a.home, `casa de ${a.id}`);
    for (const w of a.wishes ?? []) {
      id(w.id, `deseo de ${a.id}`);
      str(w.label, `deseo de ${a.id}`);
      str(w.icon, `deseo de ${a.id}`);
      num(w.reward, `deseo de ${a.id}`);
    }
    for (const t of [a.current, ...(a.queue ?? [])]) if (t) id(t.id, `tarea de ${a.id}`);
  }
  for (const o of arr(s.objects, 'objetos') as WorldState['objects']) {
    id(o.id, 'objeto');
    id(o.lotId, `parcela de ${o.id}`);
    if (!OBJECTS[o.def]) throw new Broken(`tipo de ${o.id}`);
    num(o.x, `posición de ${o.id}`);
    num(o.y, `posición de ${o.id}`);
    optStr(o.label, `etiqueta de ${o.id}`);
    if (o.q !== undefined && ![1, 2, 3].includes(o.q)) throw new Broken(`calidad de ${o.id}`);
    if (o.rot !== undefined && o.rot !== 1) throw new Broken(`giro de ${o.id}`);
  }
  for (const k of Object.keys(s.rels ?? {})) for (const x of k.split('|')) id(x, 'relación');
  for (const sec of s.secrets ?? []) str(sec.text, 'salseo');
  if (s.feats) {
    for (const k of [...Object.keys(s.feats.got ?? {}), ...Object.keys(s.feats.challenges ?? {})]) id(k, 'logro');
    for (const v of [...Object.values(s.feats.got ?? {}), ...Object.values(s.feats.counts ?? {})]) num(v, 'logros');
    for (const c of Object.values(s.feats.challenges ?? {})) {
      num(c.since, 'reto');
      optNum(c.done, 'reto');
      optStr(c.failed, 'reto');
    }
  }
  for (const c of s.arcs ?? []) {
    id(c.id, 'culebrón');
    if (!['lio', 'pelea', 'romance'].includes(c.kind)) throw new Broken('tipo de culebrón');
    num(c.step, 'culebrón');
    num(c.next, 'culebrón');
    for (const x of arr(c.who, 'culebrón')) id(x, 'culebrón');
    if (c.end) str(c.end.how, 'culebrón');
  }
  for (const o of s.schedule ?? []) {
    id(o.id, 'orden programada');
    id(o.agentId, 'orden programada');
    num(o.at, 'hora de una orden');
    if (!ACTIONS[o.actionId]) throw new Broken('acción de una orden');
    optId(o.target?.id, 'objetivo de una orden');
    optNum(o.target?.x, 'objetivo de una orden');
    optNum(o.target?.y, 'objetivo de una orden');
    optStr(o.param, 'orden programada');
  }
}
