// Comprobación de una partida al cargarla o importarla: que los identificadores y los números
// sean lo que dicen ser. Así un fichero manipulado no puede colar HTML por un id o un número
// (los textos libres, como los nombres, se escapan siempre al pintarlos).

import { isISODate } from '../sim/date';
import { ILLNESSES } from '../data/illnesses';
import { DEGREES } from '../data/education';
import { SKILL_BY_ID } from '../data/skills';
import { BOOKS } from '../data/skillTree';
import { ASSET_BY_ID, PARTY_BY_ID } from '../data/finance';
import { ACTIONS } from '../data/actions';
import { CAREERS } from '../data/careers';
import { DILEMMA_BY_ID } from '../data/dilemmas';
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
  if (!isISODate(s.calendarStart)) throw new Broken('fecha de la partida');
  num(s.minutes, 'reloj');
  num(s.nextId, 'contador');
  optNum(s.speed, 'velocidad');
  if (s.aging !== undefined && !['off', 'normal', 'fast'].includes(s.aging)) throw new Broken('envejecimiento');
  id(s.playerHouseholdId, 'familia del jugador');
  id(s.activeAgentId, 'personaje activo');
  if (s.economy) {
    const e = s.economy;
    for (const k of ['priceIndex', 'wageIndex', 'inflation', 'unemployment', 'growth', 'rate', 'debt'] as const) num(e[k], `economía (${k})`);
    if (e.priceIndex <= 0 || e.wageIndex <= 0) throw new Broken('economía (índices)');
    if (!PARTY_BY_ID[e.gov?.party]) throw new Broken('Gobierno');
    num(e.gov.since, 'Gobierno');
    num(e.gov.approval, 'Gobierno');
    optNum(e.gov.elections, 'Gobierno');
    for (const [k, a] of Object.entries(e.assets ?? {})) {
      if (!ASSET_BY_ID[k]) throw new Broken(`bolsa (${k})`);
      num(a.price, `bolsa (${k})`);
      num(a.trend, `bolsa (${k})`);
      if (a.price <= 0) throw new Broken(`bolsa (${k})`);
      for (const v of a.hist ?? []) num(v, `bolsa (${k})`);
    }
    for (const sh of e.shocks ?? []) {
      if (!ASSET_BY_ID[sh.asset]) throw new Broken('sucesos de la bolsa');
      num(sh.drift, 'sucesos de la bolsa');
      num(sh.until, 'sucesos de la bolsa');
    }
    num(e.pressure?.inflation, 'economía');
    num(e.pressure?.unemployment, 'economía');
    num(e.pressure?.growth, 'economía');
  }
  const lotIds = new Set<string>();
  for (const l of arr(s.lots, 'parcelas') as WorldState['lots']) {
    id(l.id, 'parcela');
    if (lotIds.has(l.id)) throw new Broken(`parcela duplicada ${l.id}`);
    lotIds.add(l.id);
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
  if (!lotIds.size) throw new Broken('parcelas');
  const householdIds = new Set<string>();
  for (const h of arr(s.households, 'familias') as WorldState['households']) {
    id(h.id, 'familia');
    if (householdIds.has(h.id)) throw new Broken(`familia duplicada ${h.id}`);
    householdIds.add(h.id);
    id(h.lotId, `casa de ${h.id}`);
    if (!lotIds.has(h.lotId)) throw new Broken(`casa de ${h.id}`);
    str(h.name, `nombre de ${h.id}`);
    num(h.funds, `dinero de ${h.id}`);
    optNum(h.pantry, `despensa de ${h.id}`);
    if (h.expecting) {
      num(h.expecting.due, `embarazo de ${h.id}`);
      optId(h.expecting.mother, `embarazo de ${h.id}`);
      for (const p of arr(h.expecting.parents, `embarazo de ${h.id}`)) id(p, `embarazo de ${h.id}`);
    }
    if (h.delivery) {
      num(h.delivery.at, `pedido de ${h.id}`);
      num(h.delivery.amount, `pedido de ${h.id}`);
    }
    for (const b of h.books ?? []) if (!BOOKS[b]) throw new Broken(`libros de ${h.id}`);
    for (const [k, p] of Object.entries(h.portfolio ?? {})) {
      if (!ASSET_BY_ID[k]) throw new Broken(`inversiones de ${h.id}`);
      num(p.units, `inversiones de ${h.id}`);
      num(p.cost, `inversiones de ${h.id}`);
    }
    if (h.trip) {
      num(h.trip.start, `viaje de ${h.id}`);
      num(h.trip.end, `viaje de ${h.id}`);
      str(h.trip.dest, `viaje de ${h.id}`);
    }
    for (const m of arr(h.memberIds, `miembros de ${h.id}`)) id(m, `miembro de ${h.id}`);
    if (h.bills) {
      for (const d of arr(h.bills.debts, `recibos de ${h.id}`) as NonNullable<typeof h.bills>['debts']) {
        id(d.id, `recibo de ${h.id}`);
        if (!['alquiler', 'luz', 'agua', 'autonomos'].includes(d.kind)) throw new Broken(`recibo de ${h.id}`);
        num(d.amount, `recibo de ${h.id}`);
        num(d.due, `recibo de ${h.id}`);
      }
      optNum(h.bills.cut?.luz, `cortes de ${h.id}`);
      optNum(h.bills.cut?.agua, `cortes de ${h.id}`);
      optNum(h.bills.aid, `ayudas de ${h.id}`);
      if (h.bills.evicted) {
        num(h.bills.evicted.since, `desahucio de ${h.id}`);
        for (const a of arr(h.bills.evicted.away, `desahucio de ${h.id}`)) id(a, `desahucio de ${h.id}`);
      }
      for (const v of Object.values(h.bills.warned ?? {})) num(v, `avisos de ${h.id}`);
    }
    for (const l of h.ledger ?? []) {
      num(l.week, `cuentas de ${h.id}`);
      for (const v of [...Object.values(l.in ?? {}), ...Object.values(l.out ?? {})]) num(v, `cuentas de ${h.id}`);
    }
  }
  if (!householdIds.has(s.playerHouseholdId)) throw new Broken('familia del jugador');
  const objectIds = new Set<string>();
  for (const o of arr(s.objects, 'objetos') as WorldState['objects']) {
    id(o.id, 'objeto');
    if (objectIds.has(o.id)) throw new Broken(`objeto duplicado ${o.id}`);
    objectIds.add(o.id);
    id(o.lotId, `parcela de ${o.id}`);
    if (!lotIds.has(o.lotId)) throw new Broken(`parcela de ${o.id}`);
    if (!OBJECTS[o.def]) throw new Broken(`tipo de ${o.id}`);
    num(o.x, `posición de ${o.id}`);
    num(o.y, `posición de ${o.id}`);
    optNum(o.stock, `stock de ${o.id}`);
    optNum(o.dirt, `suciedad de ${o.id}`);
    optStr(o.label, `etiqueta de ${o.id}`);
    if (o.q !== undefined && ![1, 2, 3].includes(o.q)) throw new Broken(`calidad de ${o.id}`);
    if (o.rot !== undefined && o.rot !== 1) throw new Broken(`giro de ${o.id}`);
    if (o.used !== undefined && typeof o.used !== 'boolean') throw new Broken(`segunda mano de ${o.id}`);
  }
  const agentIds = new Set<string>();
  for (const a of arr(s.agents, 'personajes') as WorldState['agents']) {
    id(a.id, 'personaje');
    if (agentIds.has(a.id)) throw new Broken(`personaje duplicado ${a.id}`);
    agentIds.add(a.id);
    if (a.kind !== 'person' && a.kind !== 'pet') throw new Broken(`tipo de ${a.id}`);
    id(a.householdId, `familia de ${a.id}`);
    if (a.householdId !== 'calle' && !householdIds.has(a.householdId)) throw new Broken(`familia de ${a.id}`);
    id(a.lotId, `parcela de ${a.id}`);
    if (!lotIds.has(a.lotId)) throw new Broken(`parcela de ${a.id}`);
    str(a.name, `nombre de ${a.id}`);
    if (!SPECIES[a.species]) throw new Broken(`especie de ${a.id}`);
    num(a.ageDays, `edad de ${a.id}`);
    num(a.color, `color de ${a.id}`);
    num(a.pos?.x, `posición de ${a.id}`);
    num(a.pos?.y, `posición de ${a.id}`);
    for (const v of Object.values(a.needs ?? {})) num(v, `necesidades de ${a.id}`);
    optId(a.home, `casa de ${a.id}`);
    if (a.home !== undefined && a.home !== null && !objectIds.has(a.home)) throw new Broken(`casa de ${a.id}`);
    if (a.travel) {
      id(a.travel.from, `viaje de ${a.id}`);
      id(a.travel.to, `viaje de ${a.id}`);
      if (typeof a.travel.arrive !== 'number' || Number.isNaN(a.travel.arrive)) throw new Broken(`viaje de ${a.id}`);
      if (a.travel.reason !== undefined && !['work', 'school', 'trip', 'jail'].includes(a.travel.reason)) throw new Broken(`viaje de ${a.id}`);
      optNum(a.travel.mood, `viaje de ${a.id}`);
    }
    optId(a.via, `metro de ${a.id}`);
    optNum(a.rideUntil, `metro de ${a.id}`);
    optId(a.deliverTo, `reparto de ${a.id}`);
    optNum(a.visitUntil, `visita de ${a.id}`);
    optNum(a.starving, `hambre de ${a.id}`);
    optNum(a.carrying, `compra de ${a.id}`);
    optNum(a.alcohol, `alcohol de ${a.id}`);
    optNum(a.alcoholMax, `alcohol de ${a.id}`);
    optNum(a.gas, `gases de ${a.id}`);
    optNum(a.training, `adiestramiento de ${a.id}`);
    optNum(a.gen, `generación de ${a.id}`);
    optNum(a.traitChangedDay, `rasgo de ${a.id}`);
    optId(a.role, `papel de ${a.id}`);
    optId(a.post, `puesto de ${a.id}`);
    optId(a.petTrait, `carácter de ${a.id}`);
    for (const p of a.parents ?? []) id(p, `padres de ${a.id}`);
    for (const tr of a.traits ?? []) id(tr, `rasgo de ${a.id}`);
    for (const em of a.emotions ?? []) {
      id(em.id, `emoción de ${a.id}`);
      num(em.until, `emoción de ${a.id}`);
      optStr(em.about, `emoción de ${a.id}`);
    }
    if (a.aspiration) {
      id(a.aspiration.id, `meta de ${a.id}`);
      num(a.aspiration.stage, `meta de ${a.id}`);
    }
    for (const ad of a.aspirationsDone ?? []) id(ad, `meta de ${a.id}`);
    if (a.sex !== undefined && a.sex !== 'f' && a.sex !== 'm') throw new Broken(`sexo de ${a.id}`);
    optNum(a.cycle, `ciclo de ${a.id}`);
    for (const d of a.degrees ?? []) if (!DEGREES[d]) throw new Broken(`título de ${a.id}`);
    if (a.study) {
      if (!DEGREES[a.study.degree]) throw new Broken(`carrera de ${a.id}`);
      num(a.study.progress, `carrera de ${a.id}`);
    }
    optNum(a.lastGrade, `notas de ${a.id}`);
    for (const v of Object.values(a.done ?? {})) num(v, `encargos de ${a.id}`);
    for (const [k, v] of Object.entries(a.skills ?? {})) if (!SKILL_BY_ID[k] || typeof v !== 'number' || !Number.isFinite(v)) throw new Broken(`habilidad de ${a.id}`);
    if (a.longing) {
      id(a.longing.who, `ex de ${a.id}`);
      num(a.longing.since, `ex de ${a.id}`);
      optId(a.longing.rival, `ex de ${a.id}`);
    }
    if (a.illness) {
      if (!ILLNESSES[a.illness.id]) throw new Broken(`enfermedad de ${a.id}`);
      num(a.illness.since, `enfermedad de ${a.id}`);
      num(a.illness.until, `enfermedad de ${a.id}`);
      optNum(a.illness.medicated, `enfermedad de ${a.id}`);
      optId(a.illness.by, `enfermedad de ${a.id}`);
    }
    if (a.look) {
      optNum(a.look.skin, `aspecto de ${a.id}`);
      optNum(a.look.hair, `aspecto de ${a.id}`);
      optStr(a.look.hairStyle, `aspecto de ${a.id}`);
      optNum(a.look.pants, `aspecto de ${a.id}`);
      optStr(a.look.extra, `aspecto de ${a.id}`);
      if (a.look.extra !== undefined && !['none', 'glasses', 'beard', 'mustache'].includes(a.look.extra)) throw new Broken(`aspecto de ${a.id}`);
    }
    if (a.job) {
      if (!CAREERS[a.job.career]) throw new Broken(`trabajo de ${a.id}`);
      num(a.job.level, `trabajo de ${a.id}`);
      num(a.job.perf, `trabajo de ${a.id}`);
      optNum(a.job.lastShiftDay, `trabajo de ${a.id}`);
      optNum(a.job.dayOff, `trabajo de ${a.id}`);
      optNum(a.job.badDays, `trabajo de ${a.id}`);
      optNum(a.job.homeDay, `trabajo de ${a.id}`);
    }
    if (a.job?.bar) {
      if (!['barata', 'normal', 'cara'].includes(a.job.bar.menu)) throw new Broken(`bar de ${a.id}`);
      optStr(a.job.bar.staff, `bar de ${a.id}`);
      optNum(a.job.bar.week, `bar de ${a.id}`);
    }
    for (const w of a.wishes ?? []) {
      id(w.id, `deseo de ${a.id}`);
      str(w.label, `deseo de ${a.id}`);
      str(w.icon, `deseo de ${a.id}`);
      num(w.reward, `deseo de ${a.id}`);
    }
    for (const t of [a.current, ...(a.queue ?? [])]) {
      if (!t) continue;
      id(t.id, `tarea de ${a.id}`);
      if (!ACTIONS[t.actionId]) throw new Broken(`acción de ${a.id}`);
      if (!['walking', 'acting', 'waiting'].includes(t.phase)) throw new Broken(`fase de ${a.id}`);
      num(t.remaining, `tarea de ${a.id}`);
      optId(t.targetObjectId, `tarea de ${a.id}`);
      optId(t.targetAgentId, `tarea de ${a.id}`);
      optId(t.passiveOf, `tarea de ${a.id}`);
      optStr(t.param, `tarea de ${a.id}`);
      if (t.dest) {
        num(t.dest.x, `destino de ${a.id}`);
        num(t.dest.y, `destino de ${a.id}`);
      }
      if (t.goal) {
        num(t.goal.x, `meta de ${a.id}`);
        num(t.goal.y, `meta de ${a.id}`);
      }
    }
  }
  for (const h of s.households) {
    for (const m of h.memberIds) if (!agentIds.has(m)) throw new Broken(`miembro ${m} de ${h.id}`);
  }
  if (s.marketSold !== undefined && s.marketSold !== null) {
    num(s.marketSold.day, 'mercadillo');
    for (const x of arr(s.marketSold.ids, 'mercadillo')) str(x, 'mercadillo');
  }
  for (const [k, rel] of Object.entries(s.rels ?? {})) {
    for (const x of k.split('|')) id(x, 'relación');
    num(rel.f, `relación ${k}`);
    num(rel.r, `relación ${k}`);
    if (rel.status !== undefined && rel.status !== 'partner' && rel.status !== 'married') throw new Broken(`relación ${k}`);
    for (const m of rel.mem ?? []) {
      id(m.k, `recuerdo ${k}`);
      num(m.d, `recuerdo ${k}`);
      id(m.by, `recuerdo ${k}`);
    }
    optNum(rel.last, `relación ${k}`);
    optNum(rel.crisis, `relación ${k}`);
    optNum(rel.split, `relación ${k}`);
    optId(rel.banned, `relación ${k}`);
  }
  for (const sec of s.secrets ?? []) {
    id(sec.id, 'salseo');
    id(sec.kind, 'salseo');
    str(sec.text, 'salseo');
    num(sec.day, 'salseo');
    num(sec.juicy, 'salseo');
    for (const ab of arr(sec.about, 'salseo')) id(ab, 'salseo');
    for (const kn of arr(sec.known, 'salseo')) id(kn, 'salseo');
  }
  if (s.party) {
    id(s.party.lotId, 'fiesta');
    id(s.party.host, 'fiesta');
    num(s.party.until, 'fiesta');
    optId(s.party.birthday, 'fiesta');
  }
  if (s.dilemma) {
    if (!DILEMMA_BY_ID[s.dilemma.id]) throw new Broken('dilema');
    id(s.dilemma.agentId, 'dilema');
    num(s.dilemma.until, 'dilema');
  }
  for (const ev of s.events ?? []) {
    id(ev.id, 'evento');
    num(ev.until, 'evento');
    optId(ev.lotId, 'evento');
  }
  for (const lid of s.lottery ?? []) id(lid, 'lotería');
  for (const n of s.news ?? []) {
    num(n.day, 'noticias');
    str(n.text, 'noticias');
    for (const ab of arr(n.about, 'noticias')) id(ab, 'noticias');
  }
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
