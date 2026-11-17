// La economía del país: inflación (sube los precios de todo y, con retraso, los sueldos), paro (despidos y
// trabajo más difícil de encontrar), crecimiento, tipos de interés del Banco Central y deuda pública. El
// Gobierno marca la política (gasto o recortes) y puede salir corrupto, sea del partido que sea; si cae su
// popularidad, hay elecciones anticipadas. La bolsa se mueve con todo eso y con los sucesos del día.
// La economía va acelerada: cada semana de juego son dos meses económicos y cada día, una semana de bolsa.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { CAREERS } from '../../data/careers';
import { ANALYSIS_LEVEL, ASSETS, ASSET_BY_ID, COMMISSION, CORRUPT_CHANCE, EVENT_CHANCE, MACRO, MARKET_EVENTS, PARTIES, PARTY_BY_ID, POLICY_EFFECTS, type MarketEvent, type Policy } from '../../data/finance';
import { isAdult } from '../social';
import type { Agent, EconomyState, WorldState } from '../types';
import type { World } from '../world';
import { money } from './money';
import { skillLevel } from './skills';

/** Precios iniciales de cada activo. */
const START_PRICE: Record<string, number> = { indice: 100, banco: 12, electrica: 18, ladrillo: 8, tecno: 45, churros: 25, bono: 100, oro: 180, cripto: 5 };

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const gauss = () => {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};
const pct = (v: number, digits = 1) => `${v.toLocaleString('es-ES', { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`;

/** Una economía nueva: Gobierno al azar (corrupto o no) y la bolsa a sus precios de partida. */
export function newEconomy(day = 1): EconomyState {
  const party = PARTIES[Math.floor(Math.random() * PARTIES.length)];
  return {
    priceIndex: 1,
    wageIndex: 1,
    inflation: MACRO.inflation,
    unemployment: MACRO.unemployment,
    growth: MACRO.growth,
    rate: MACRO.rate,
    debt: MACRO.debt,
    gov: { party: party.id, since: day, corrupt: Math.random() < CORRUPT_CHANCE, approval: MACRO.approval },
    assets: Object.fromEntries(ASSETS.map((x) => [x.id, { price: START_PRICE[x.id] ?? 10, trend: 0, hist: [START_PRICE[x.id] ?? 10] }])),
    shocks: [],
    pressure: { inflation: 0, unemployment: 0, growth: 0 },
    news: [],
    history: [{ day, ipc: 100, inflation: MACRO.inflation, unemployment: MACRO.unemployment, indice: START_PRICE.indice }],
  };
}

/** La economía de la partida (se crea si no la hay). */
export function econ(w: World | { state: WorldState }): EconomyState {
  const s = w.state;
  if (!s.economy) s.economy = newEconomy(Math.floor(s.minutes / 1440) + 1);
  return s.economy;
}

// --- Lo que nota la familia ---

/** Un precio de los de antes, con la inflación acumulada. */
export function priced(w: World, n: number): number {
  return Math.round(n * econ(w).priceIndex);
}
/** Un sueldo de los de antes, con las subidas acumuladas. */
export function wage(w: World, n: number): number {
  return Math.round(n * econ(w).wageIndex);
}
export function policyOf(w: World): Policy {
  return PARTY_BY_ID[econ(w).gov.party]?.policy ?? 0;
}
/** Hacienda: con más gasto público, más impuestos. */
export function taxMult(w: World): number {
  return POLICY_EFFECTS[policyOf(w)].tax;
}
export function aidAmount(w: World, base: number): number {
  return Math.round(priced(w, base) * POLICY_EFFECTS[policyOf(w)].aid);
}
export function pensionAmount(w: World, base: number): number {
  return Math.round(priced(w, base) * POLICY_EFFECTS[policyOf(w)].pension);
}
/** Cambia «§12» por lo que cuesta ahora en los textos de las acciones. */
export function pricedLabel(w: World, text: string): string {
  return text.replace(/§(\d+)/g, (_m, n) => `§${priced(w, Number(n))}`);
}

/** Avisos de economía de hoy: se juntan en uno solo al final del día (para no llenar la pantalla). */
let batch: { text: string; icon: string }[] | null = null;

function say(w: World, text: string, icon: string) {
  if (batch) batch.push({ text, icon });
  else w.toast(text, icon);
}

function headline(w: World, text: string, icon: string, loud = true) {
  const e = econ(w);
  e.news = [{ day: w.day, text, icon }, ...e.news].slice(0, 12);
  if (loud) say(w, text, icon);
  w.addNews(text.charAt(0).toLowerCase() + text.slice(1), []);
}

// --- Cada día ---

export function dailyEconomy(w: World) {
  batch = [];
  try {
    economyDay(w);
  } finally {
    const msgs = batch;
    batch = null;
    if (msgs.length) w.toast(msgs.length === 1 ? msgs[0].text : `${msgs[0].text} (y ${msgs.length - 1} más en ☰ → 📈 Economía)`, msgs[0].icon);
  }
}

function economyDay(w: World) {
  const e = econ(w);
  // Los precios suben un poco cada día (la inflación de dos meses, repartida en la semana).
  e.priceIndex *= 1 + e.inflation / 100 / 6 / 7;
  marketDay(w);
  if (Math.random() < EVENT_CHANCE) randomEvent(w);
  jobsDay(w);
  if (e.gov.elections === w.day) holdElections(w, true);
  if (w.weekday === 0 && w.day > 1) weeklyEconomy(w);
}

/** La bolsa de hoy: tendencia de la economía, de cada valor y de los sucesos, más el azar. */
function marketDay(w: World) {
  const e = econ(w);
  e.shocks = e.shocks.filter((s) => s.until >= w.day);
  for (const a of ASSETS) {
    const st = e.assets[a.id] ?? (e.assets[a.id] = { price: START_PRICE[a.id] ?? 10, trend: 0, hist: [] });
    if (Math.random() < 0.15) st.trend = gauss() * a.vol * 0.4;
    let drift = a.ret + 0.03 * a.growth * (e.growth - MACRO.growth) + 0.02 * a.rate * (e.rate - MACRO.rate) + 0.02 * a.inflation * (e.inflation - MACRO.target) + st.trend;
    if (a.id === 'bono') drift = e.rate / 100 - Math.max(0, e.debt - 120) * 0.003;
    for (const s of e.shocks) if (s.asset === a.id) drift += s.drift;
    const r = drift / 52 - (a.vol * a.vol) / 104 + (a.vol / Math.sqrt(52)) * gauss();
    st.price = Math.max(0.01, st.price * Math.exp(r));
    st.hist = [...st.hist, Math.round(st.price * 100) / 100].slice(-30);
  }
}

/** Variación del fondo índice en los últimos `days` días (en tanto por uno). */
export function indexChange(w: World, days: number): number {
  const h = econ(w).assets.indice?.hist ?? [];
  if (h.length < 2) return 0;
  const from = h[Math.max(0, h.length - 1 - days)];
  return from ? h[h.length - 1] / from - 1 : 0;
}

/** Variación de un activo desde ayer. */
export function dayChange(w: World, assetId: string): number {
  const h = econ(w).assets[assetId]?.hist ?? [];
  return h.length >= 2 ? h[h.length - 1] / h[h.length - 2] - 1 : 0;
}

/** Un suceso que mueve la bolsa (y a veces la economía). */
export function applyEvent(w: World, ev: MarketEvent) {
  const e = econ(w);
  for (const [id, j] of Object.entries(ev.jump)) {
    const st = e.assets[id];
    if (st) st.price = Math.max(0.01, st.price * (1 + j));
  }
  for (const [id, d] of Object.entries(ev.drift ?? {})) e.shocks.push({ asset: id, drift: d, until: w.day + (ev.days ?? 3) });
  const m = ev.macro ?? {};
  e.pressure.inflation += m.inflation ?? 0;
  e.pressure.unemployment += m.unemployment ?? 0;
  e.pressure.growth += m.growth ?? 0;
  e.debt += m.debt ?? 0;
  e.gov.approval = clampN(e.gov.approval + (m.approval ?? 0), 0, 100);
  if (ev.id === 'escandalo') e.gov.exposed = true;
  headline(w, ev.title, ev.icon);
}

function randomEvent(w: World) {
  const e = econ(w);
  const ok = MARKET_EVENTS.filter((ev) => (ev.needs === 'corrupt' ? e.gov.corrupt && !e.gov.exposed : ev.needs === 'debt' ? e.debt > 120 : true));
  const total = ok.reduce((s, ev) => s + (ev.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const ev of ok) {
    r -= ev.weight ?? 1;
    if (r <= 0) return applyEvent(w, ev);
  }
}

// --- Trabajo y paro ---

/** Probabilidad de que no te cojan en una entrevista (a partir del 12 % de paro, y más cuanto más paro). */
export function hiringFailChance(w: World): number {
  return clampN((econ(w).unemployment - 12) / 35, 0, 0.6);
}

/** Despidos (EREs) cuando el paro pasa del 12 %, y vecinos en paro que encuentran algo. */
function jobsDay(w: World) {
  const u = econ(w).unemployment;
  const layoff = Math.max(0, u - 12) / 100 / 20;
  const jobs = Object.values(CAREERS).filter((c) => !c.school && !c.business && !c.degree);
  for (const a of w.state.agents) {
    if (a.kind !== 'person' || a.role || !isAdult(a) || w.stageOf(a) === 'elder') continue;
    const c = a.job && CAREERS[a.job.career];
    if (c && !c.school && !c.business) {
      if (Math.random() < layoff) {
        a.job = undefined;
        w.feel(a, 'despedido');
        if (w.isPlayerMember(a)) w.toast(`ERE en la empresa de ${a.name}: a la calle. Con un ${pct(u)} de paro, a ver cuánto tarda en encontrar algo`, '📦', a.id);
      }
    } else if (!a.job && !w.isPlayerMember(a) && Math.random() < 0.1 * (1 - u / 40)) {
      const pick = jobs[Math.floor(Math.random() * jobs.length)];
      a.job = { career: pick.id, level: 1, perf: 50 };
    }
  }
}

// --- Cada semana (un mes económico) ---

export function weeklyEconomy(w: World) {
  const e = econ(w);
  const s = policyOf(w);
  const c = e.gov.corrupt ? 1 : 0;
  // El Banco Central sube los tipos si hay inflación y los baja si no.
  const oldRate = e.rate;
  e.rate = Math.round(clampN(MACRO.rate + 1.2 * (e.inflation - MACRO.target), 0, 12) * 4) / 4;
  if (Math.abs(e.rate - oldRate) >= 0.5) {
    const bono = e.assets.bono;
    if (bono) bono.price *= 1 - 0.07 * (e.rate - oldRate);
    headline(w, e.rate > oldRate ? `El Banco Central sube los tipos al ${pct(e.rate, 2)} para frenar la inflación: hipotecas más caras` : `El Banco Central baja los tipos al ${pct(e.rate, 2)}: crédito más barato`, '🏛️');
  }
  const p = e.pressure;
  e.inflation = clampN(0.65 * e.inflation + 0.35 * (MACRO.target + 3.5 * s + 3 * c + (e.growth - MACRO.growth) * 0.5) - 0.12 * (e.rate - MACRO.rate) + p.inflation * 0.5, -2, 30);
  e.unemployment = clampN(0.8 * e.unemployment + 0.2 * (MACRO.unemployment - 3 * s + 1.5 * c + 0.6 * (e.rate - MACRO.rate) - (e.growth - MACRO.growth) * 1.5) + p.unemployment * 0.5, 2, 40);
  e.growth = clampN(0.5 * e.growth + 0.5 * (MACRO.growth + 0.8 * s - 1.5 * c - 0.4 * (e.rate - MACRO.rate) - Math.max(0, e.debt - 110) * 0.05) + p.growth * 0.5 + gauss() * 0.3, -8, 8);
  e.debt = clampN(e.debt + 1.5 * s + 1 * c - 0.3 * (e.growth - MACRO.growth), 20, 250);
  e.pressure = { inflation: p.inflation * 0.5, unemployment: p.unemployment * 0.5, growth: p.growth * 0.5 };
  // Popularidad del Gobierno: crecimiento, paro e inflación (y los escándalos).
  e.gov.approval = clampN(0.6 * e.gov.approval + 0.4 * (60 + (e.growth - 2) * 6 - (e.unemployment - 10) * 2 - Math.max(0, e.inflation - 3) * 3 - (e.gov.exposed ? 15 : 0)), 0, 100);
  if (e.gov.corrupt && !e.gov.exposed && Math.random() < 0.2) applyEvent(w, MARKET_EVENTS.find((x) => x.id === 'escandalo')!);
  if (e.gov.approval < 25 && e.gov.elections === undefined && w.day - e.gov.since > 14) {
    e.gov.elections = w.day + 7;
    headline(w, `Moción de censura: el Gobierno del ${PARTY_BY_ID[e.gov.party].short} cae. Elecciones anticipadas dentro de una semana`, '🗳️');
  }
  // El IPC de estas semanas (dos meses económicos).
  const monthly = e.inflation / 6;
  const mine = w.members.some((m) => m.job && !CAREERS[m.job.career]?.school);
  headline(w, `IPC: los precios suben un ${pct(monthly)} en dos meses (inflación del ${pct(e.inflation)} al año). Paro: ${pct(e.unemployment)}`, '🧾', false);
  // Los sueldos persiguen a los precios (más deprisa si hay poco paro y los sindicatos aprietan).
  const gap = e.priceIndex / e.wageIndex - 1;
  if (gap > 0.002) {
    const catchUp = e.unemployment < 12 ? 0.6 : e.unemployment < 20 ? 0.4 : 0.2;
    e.wageIndex *= 1 + gap * catchUp;
    if (mine) say(w, `Los sueldos suben un ${pct(gap * catchUp * 100)} para compensar la inflación${catchUp < 0.6 ? ' (con tanto paro, los sindicatos no consiguen más)' : ''}`, '💶');
  }
  dividends(w);
  e.history = [...e.history, { day: w.day, ipc: Math.round(e.priceIndex * 1000) / 10, inflation: Math.round(e.inflation * 10) / 10, unemployment: Math.round(e.unemployment * 10) / 10, indice: Math.round((e.assets.indice?.price ?? 100) * 10) / 10 }].slice(-26);
}

/** Dividendos de la semana (siete «semanas de bolsa»). */
function dividends(w: World) {
  for (const h of w.state.households) {
    let total = 0;
    for (const [id, pos] of Object.entries(h.portfolio ?? {})) {
      const a = ASSET_BY_ID[id];
      const st = econ(w).assets[id];
      if (a && st && a.div) total += pos.units * st.price * a.div * (7 / 52);
    }
    total = Math.round(total);
    if (total > 0) {
      money(w, h, total, 'dividendos');
      if (h.id === w.household.id) say(w, `Dividendos de vuestras acciones: +§${total}`, '💰');
    }
  }
}

// --- Elecciones ---

/** Elecciones (las de mayo o las anticipadas): el Gobierno repite si es popular; si no, gana otro. */
export function holdElections(w: World, early = false) {
  const e = econ(w);
  const keeps = Math.random() < e.gov.approval / 100;
  const others = PARTIES.filter((p) => p.id !== e.gov.party);
  const winner = keeps ? PARTY_BY_ID[e.gov.party] : others[Math.floor(Math.random() * others.length)];
  const changed = winner.id !== e.gov.party;
  e.gov = { party: winner.id, since: w.day, corrupt: changed ? Math.random() < CORRUPT_CHANCE : e.gov.corrupt, exposed: changed ? undefined : e.gov.exposed, approval: changed ? 55 : Math.max(e.gov.approval, 40) };
  headline(w, changed ? `${early ? 'Elecciones anticipadas' : 'Elecciones'}: gana el ${winner.name} (${winner.short}). «${winner.slogan}»` : `${early ? 'Elecciones anticipadas' : 'Elecciones'}: el ${winner.short} repite en el Gobierno`, winner.icon);
  // La bolsa recibe al nuevo Gobierno: los recortes le gustan, el gasto le asusta un poco.
  const idx = e.assets.indice;
  if (idx && changed) idx.price *= 1 - 0.02 * winner.policy;
}

// --- Invertir ---

export function commission(w: World, a: Agent): number {
  return skillLevel(w, a, 'inversion') >= COMMISSION.proLevel ? COMMISSION.pro : COMMISSION.base;
}

/** ¿Puede ver la tendencia de los valores? (análisis, con inversión 2). */
export function canAnalyze(w: World, a: Agent): boolean {
  return skillLevel(w, a, 'inversion') >= ANALYSIS_LEVEL;
}

/** Valor de mercado de lo que tiene una familia invertido. */
export function portfolioValue(w: World, h = w.household): number {
  return Math.round(Object.entries(h.portfolio ?? {}).reduce((s, [id, p]) => s + p.units * (econ(w).assets[id]?.price ?? 0), 0));
}

export function buyReason(w: World, a: Agent, assetId: string, amount: number): string | undefined {
  const x = ASSET_BY_ID[assetId];
  if (!x) return 'Ese valor no existe';
  if (!isAdult(a)) return 'Los menores no pueden invertir';
  if (x.minSkill && skillLevel(w, a, 'inversion') < x.minSkill) return `Producto complejo: el banco pide inversión ${x.minSkill} (test de idoneidad)`;
  if (amount <= 0) return 'Nada que comprar';
  if ((w.householdOf(a)?.funds ?? 0) < amount) return 'No hay dinero';
  return undefined;
}

/** Comprar §`amount` de un activo (con comisión). */
export function buyAsset(w: World, a: Agent, assetId: string, amount: number): string | undefined {
  const why = buyReason(w, a, assetId, amount);
  if (why) return why;
  const h = w.householdOf(a)!;
  const st = econ(w).assets[assetId];
  const units = (amount * (1 - commission(w, a))) / st.price;
  money(w, h, -amount, 'bolsa');
  const pos = (h.portfolio ??= {})[assetId] ?? { units: 0, cost: 0 };
  h.portfolio[assetId] = { units: pos.units + units, cost: pos.cost + amount };
  return undefined;
}

/** Vender una parte (0 a 1) de lo que se tiene de un activo. Hacienda se lleva el 19 % de lo ganado. */
export function sellAsset(w: World, a: Agent, assetId: string, fraction = 1): string | undefined {
  const h = w.householdOf(a);
  const pos = h?.portfolio?.[assetId];
  if (!h || !pos || pos.units <= 0) return 'No tenéis de eso';
  const f = clampN(fraction, 0, 1);
  const st = econ(w).assets[assetId];
  const gross = pos.units * f * st.price * (1 - commission(w, a));
  const cost = pos.cost * f;
  const gain = gross - cost;
  const tax = gain > 0 ? gain * 0.19 : 0;
  money(w, h, Math.round(gross), 'bolsa');
  if (tax >= 1) money(w, h, -Math.round(tax), 'hacienda');
  if (f >= 0.999) delete h.portfolio![assetId];
  else h.portfolio![assetId] = { units: pos.units * (1 - f), cost: pos.cost * (1 - f) };
  if (w.isPlayerMember(a)) w.toast(gain >= 0 ? `Vendido con ganancias: +§${Math.round(gain)}${tax >= 1 ? ` (Hacienda se queda §${Math.round(tax)})` : ''}` : `Vendido con pérdidas: −§${Math.round(-gain)}`, gain >= 0 ? '📈' : '📉');
  return undefined;
}

// --- Para el panel ---

export function governmentText(w: World): string {
  const e = econ(w);
  const p = PARTY_BY_ID[e.gov.party];
  return `${p.icon} ${p.name} (${p.short})`;
}
