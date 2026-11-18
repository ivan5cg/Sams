import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate } from '../src/save/serialize';
import { calendarEvents } from '../src/sim/agenda';
import { MARKETS, SECONDHAND_RATIO, homemadePrice, secondhandOffers, stallGoods, stallPrice } from '../src/sim/systems/places';
import { fullNeeds, isolate, problems, saveAt } from './helpers';

/** El primer día de la partida que cae en ese día de la semana (0 = lunes... 6 = domingo). */
function dayWith(w: World, wd: number): number {
  for (let d = 1; d <= 7; d++) if (w.dateOf(d).wd === wd) return d;
  throw new Error('sin día');
}

/** Pone a alguien en el mercadillo, junto a la entrada, el día que se pone, a las 10:00. */
function atMarket(w: World, id: string, lotId: string) {
  const day = dayWith(w, MARKETS[lotId].wd);
  w.state.minutes = (day - 1) * 1440 + 10 * 60;
  const a = w.agent(id)!;
  a.lotId = lotId;
  a.travel = undefined;
  a.current = null;
  a.queue = [];
  a.path = [];
  const e = w.layoutOf(lotId).entrance;
  a.pos = { x: e.x, y: e.y - 1 };
  fullNeeds(a);
  return a;
}
const obj = (w: World, lotId: string, def: string) => w.objectsIn(lotId).find((o) => o.def === def)!;

describe('mercadillos de cada semana: comprar barato y vender lo vuestro', () => {
  it('hay uno en cada barrio, cada uno su día, con su puesto para vender', () => {
    const w = World.createNew();
    const lots = Object.keys(MARKETS).map((id) => w.lotById(id));
    expect(lots.map((l) => l.name)).toEqual(['El Rastro', 'Mercadillo de Alcorcón', 'Mercadillo de Getafe']);
    expect(lots.map((l) => l.district)).toEqual(['madrid', 'alcorcon', 'getafe']);
    for (const l of lots) {
      expect(l.layout).toBe('market');
      expect(obj(w, l.id, 'stall_own')).toBeDefined();
      // Abierto su día por la mañana; por la tarde, y el día de antes, cerrado.
      const day = dayWith(w, MARKETS[l.id].wd);
      w.state.minutes = (day - 1) * 1440 + 10 * 60;
      expect(w.closedReason(l.id)).toBeUndefined();
      w.state.minutes = (day - 1) * 1440 + 15 * 60;
      expect(w.closedReason(l.id)).toMatch(/14:30/);
      w.state.minutes = ((day + 5) % 7) * 1440 + 10 * 60;
      expect(w.closedReason(l.id)).toMatch(new RegExp(MARKETS[l.id].days));
    }
    const ids = [6, 5, 2].map((wd) => calendarEvents(w.dateOf(dayWith(w, wd))).map((e) => e.id));
    expect(ids[0]).toContain('mercadillo');
    expect(ids[1]).toContain('mercadillo_alcorcon');
    expect(ids[2]).toContain('mercadillo_getafe');
  });

  it('una partida de antes (v26) recibe los mercadillos nuevos y el puesto en El Rastro', () => {
    const old = saveAt(26);
    expect(old.lots.some((l: { id: string }) => l.id === 'MA')).toBe(false);
    const w = new World(migrate(JSON.parse(JSON.stringify(old))));
    expect(w.lotById('MK').name).toBe('El Rastro');
    for (const id of ['MK', 'MA', 'MG']) expect(obj(w, id, 'stall_own'), id).toBeDefined();
    expect(w.objectsIn('MK').filter((o) => o.def === 'stall_own')).toHaveLength(1);
    expect(problems(w)).toEqual([]);
  });

  it('muebles de segunda mano: a mitad de precio, a casa, y cada uno se vende una sola vez', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.household.funds = 5000;
    const lucia = atMarket(w, 'a1', 'MA');
    const offers = secondhandOffers(w, 'MA');
    expect(offers).toHaveLength(4);
    // El género del día no cambia al volver a mirarlo.
    expect(secondhandOffers(w, 'MA')).toEqual(offers);
    const offer = offers[0];
    const n0 = w.objectsIn('L0').length;
    const f0 = w.household.funds;
    expect(w.command('a1', 'buy_secondhand', { kind: 'object', id: obj(w, 'MA', 'stall_junk').id }, offer.id)).toBe(true);
    w.tick(25);
    expect(w.household.funds).toBe(f0 - offer.price);
    const bought = w.objectsIn('L0').filter((o) => o.used);
    expect(w.objectsIn('L0')).toHaveLength(n0 + 1);
    expect(bought.map((o) => o.def)).toEqual([offer.def]);
    expect(secondhandOffers(w, 'MA')[0].sold).toBe(true);
    // Otra vez el mismo: ya está vendido y no se cobra.
    const f1 = w.household.funds;
    w.command('a1', 'buy_secondhand', { kind: 'object', id: obj(w, 'MA', 'stall_junk').id }, offer.id);
    w.tick(25);
    expect(w.household.funds).toBe(f1);
    expect(w.objectsIn('L0').filter((o) => o.used)).toHaveLength(1);
    // Regateando, el siguiente sale a mitad de precio.
    w.feel(lucia, 'regateo');
    const next = secondhandOffers(w, 'MA')[1];
    w.command('a1', 'buy_secondhand', { kind: 'object', id: obj(w, 'MA', 'stall_junk').id }, next.id);
    w.tick(25);
    expect(w.household.funds).toBe(f1 - Math.round(next.price / 2));
    expect(problems(w)).toEqual([]);
  });

  it('vender en el puesto da más que vender desde la obra; lo de segunda mano no deja negocio', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.household.funds = 5000;
    const lucia = atMarket(w, 'a1', 'MK');
    const goods = stallGoods(w);
    expect(goods.length).toBeGreaterThan(0);
    const tv = goods.find((o) => o.def === 'tv') ?? goods[0];
    const price = stallPrice(w, lucia, tv);
    expect(price).toBeGreaterThan(w.sellRefund(tv));
    const f0 = w.household.funds;
    expect(w.command('a1', 'sell_stall', { kind: 'object', id: obj(w, 'MK', 'stall_own').id }, tv.id)).toBe(true);
    w.tick(40);
    expect(w.household.funds).toBe(f0 + price);
    expect(w.object(tv.id)).toBeUndefined();
    // Comprado de segunda mano, ni con todo el carisma del mundo se revende por más de lo que costó.
    lucia.skills = { ...lucia.skills, carisma: 10 };
    for (const offer of secondhandOffers(w, 'MK')) {
      const before = new Set(w.objectsIn('L0').map((o) => o.id));
      w.command('a1', 'buy_secondhand', { kind: 'object', id: obj(w, 'MK', 'stall_junk').id }, offer.id);
      w.tick(25);
      const o = w.objectsIn('L0').find((x) => !before.has(x.id));
      if (!o) continue;
      expect(o.used).toBe(true);
      expect(stallPrice(w, lucia, o)).toBeLessThanOrEqual(offer.price);
      expect(w.sellRefund(o)).toBeLessThan(offer.price);
      expect(SECONDHAND_RATIO).toBe(0.5);
    }
    expect(problems(w)).toEqual([]);
  });

  it('dulces caseros: gastan 4 raciones de la nevera, dan más con repostería y una vez al día', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const lucia = atMarket(w, 'a1', 'MG');
    w.household.pantry = 10;
    const p0 = homemadePrice(w, lucia);
    lucia.skills = { ...lucia.skills, reposteria: 5 };
    const price = homemadePrice(w, lucia);
    expect(price).toBeGreaterThan(p0);
    const f0 = w.household.funds;
    const stall = obj(w, 'MG', 'stall_own');
    expect(w.command('a1', 'sell_homemade', { kind: 'object', id: stall.id })).toBe(true);
    w.tick(60);
    expect(w.household.pantry).toBe(6);
    expect(w.household.funds).toBeGreaterThanOrEqual(f0 + price);
    expect(w.checkObjectAction(lucia, stall, 'sell_homemade').reason).toMatch(/Hoy ya/);
    // Sin raciones en casa, no hay dulces.
    w.household.pantry = 2;
    w.state.minutes += 7 * 1440;
    expect(w.checkObjectAction(lucia, stall, 'sell_homemade').reason).toMatch(/raciones/);
  });

  it('el día de mercadillo, los vecinos de cada barrio van al suyo', () => {
    const w = World.createNew();
    w.state.activeAgentId = 'nadie';
    const day = dayWith(w, MARKETS.MA.wd);
    w.state.minutes = (day - 1) * 1440 + 8 * 60;
    let seen = 0;
    for (let i = 0; i < 6 * 4; i++) {
      w.tick(15);
      seen = Math.max(seen, w.agentsIn('MA').filter((a) => !a.travel && !w.isPlayerMember(a)).length);
    }
    expect(seen).toBeGreaterThan(0);
    // Y de los otros mercadillos, cerrados, nadie.
    expect(w.agentsIn('MG').filter((a) => !a.travel)).toHaveLength(0);
  });
});
