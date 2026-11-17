import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import { ASSET_BY_ID, EVENT_BY_ID } from '../src/data/finance';
import { CAREERS } from '../src/data/careers';
import { applyEvent, dailyEconomy, econ, hiringFailChance, holdElections, portfolioValue, pricedLabel, weeklyEconomy } from '../src/sim/systems/economy';
import { costOf } from '../src/sim/systems/calendar';
import { degreeReason } from '../src/sim/systems/education';
import { problems, saveAt } from './helpers';

/** Azar con semilla, para que la economía sea la misma en cada prueba. */
function seeded<T>(seed: number, fn: () => T): T {
  let s = seed;
  const orig = Math.random;
  Math.random = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

describe('economía: inflación, paro, Gobierno y bolsa', () => {
  it('con inflación sube todo (compra, muebles, recibos) y los sueldos van detrás', () => {
    const w = World.createNew();
    const e = econ(w);
    const shop0 = costOf(w, 'shop_small');
    expect(shop0).toBe(45);
    e.inflation = 12;
    seeded(1, () => {
      for (let d = 0; d < 21; d++) dailyEconomy(w);
      for (let k = 0; k < 3; k++) {
        e.inflation = 12;
        weeklyEconomy(w);
      }
    });
    expect(e.priceIndex).toBeGreaterThan(1.02);
    expect(costOf(w, 'shop_small')).toBeGreaterThan(shop0);
    expect(w.priced(900)).toBeGreaterThan(900);
    expect(pricedLabel(w, 'Compra pequeña (§45 · 8 raciones)')).toContain(`§${w.priced(45)}`);
    // Los sueldos suben, pero por detrás de los precios.
    expect(e.wageIndex).toBeGreaterThan(1);
    expect(e.wageIndex).toBeLessThanOrEqual(e.priceIndex);
    // El Banco Central sube los tipos para frenarla.
    expect(e.rate).toBeGreaterThan(2);
  });

  it('mucho gasto público: menos paro y más inflación y deuda; los recortes, al revés', () => {
    const run = (party: string) =>
      seeded(7, () => {
        const w = World.createNew();
        const e = econ(w);
        e.gov = { party, since: 1, corrupt: false, approval: 60 };
        for (let k = 0; k < 10; k++) weeklyEconomy(w);
        return e;
      });
    const left = run('poc');
    const right = run('plm');
    expect(left.unemployment).toBeLessThan(right.unemployment);
    expect(left.inflation).toBeGreaterThan(right.inflation);
    expect(left.debt).toBeGreaterThan(right.debt);
  });

  it('un Gobierno corrupto (del partido que sea) acaba destapado, cae en las encuestas y hay elecciones', () => {
    for (const party of ['poc', 'uc', 'plm']) {
      const w = World.createNew();
      const e = econ(w);
      e.gov = { party, since: 1, corrupt: true, approval: 50 };
      w.state.minutes += 20 * 1440;
      seeded(3, () => {
        for (let k = 0; k < 30 && !e.gov.exposed; k++) weeklyEconomy(w);
      });
      expect(e.gov.exposed).toBe(true);
      expect(e.news.some((n) => n.text.includes('corrupción'))).toBe(true);
      e.gov.approval = 10;
      weeklyEconomy(w);
      expect(e.gov.elections).toBeGreaterThan(w.day);
      seeded(5, () => holdElections(w, true));
      expect(e.gov.elections).toBeUndefined();
    }
  });

  it('invertir: comprar con comisión, cobrar dividendos, vender con ganancias y pagar a Hacienda', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    w.household.funds = 2000;
    expect(w.buyAsset('a1', 'electrica', 1000)).toBeUndefined();
    expect(w.household.funds).toBe(1000);
    expect(portfolioValue(w)).toBe(980); // 2 % de comisión
    // Los productos complejos piden saber de inversión.
    expect(w.buyAsset('a1', 'cripto', 100)).toMatch(/inversión 4/);
    lucia.skills = { inversion: 4 };
    expect(w.buyAsset('a1', 'cripto', 100)).toBeUndefined();
    // Dividendos el lunes.
    const f0 = w.household.funds;
    seeded(2, () => weeklyEconomy(w));
    expect(w.household.funds).toBeGreaterThan(f0);
    // La eléctrica sube un 50 %: al vender, ganancia y el 19 % para Hacienda.
    econ(w).assets.electrica.price *= 1.5;
    const f1 = w.household.funds;
    expect(w.sellAsset('a1', 'electrica', 1)).toBeUndefined();
    const got = w.household.funds - f1;
    expect(got).toBeGreaterThan(1300);
    expect(got).toBeLessThan(1470);
    expect(w.household.portfolio?.electrica).toBeUndefined();
    expect(w.household.ledger?.at(-1)?.out?.hacienda ?? 0).toBeGreaterThan(50);
  });

  it('los sucesos mueven las cotizaciones y la economía', () => {
    const w = World.createNew();
    const e = econ(w);
    const banco = e.assets.banco.price;
    const ladrillo = e.assets.ladrillo.price;
    applyEvent(w, EVENT_BY_ID.crisis_bancaria);
    expect(e.assets.banco.price).toBeCloseTo(banco * 0.85, 5);
    expect(e.pressure.unemployment).toBeGreaterThan(0);
    applyEvent(w, EVENT_BY_ID.burbuja);
    expect(e.assets.ladrillo.price).toBeLessThan(ladrillo * 0.8);
    expect(e.news[0].text).toMatch(/burbuja/);
    // La bolsa se mueve cada día (y guarda el historial).
    seeded(4, () => {
      for (let d = 0; d < 10; d++) dailyEconomy(w);
    });
    expect(e.assets.indice.hist.length).toBeGreaterThan(5);
    expect(Object.keys(e.assets)).toEqual(expect.arrayContaining(Object.keys(ASSET_BY_ID)));
  });

  it('con mucho paro cuesta encontrar trabajo; la bolsa pide carrera de Economía y la banca no', () => {
    const w = World.createNew();
    const e = econ(w);
    expect(hiringFailChance(w)).toBe(0);
    e.unemployment = 30;
    expect(hiringFailChance(w)).toBeGreaterThan(0.4);
    const lucia = w.agent('a1')!;
    const pc = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    const orig = Math.random;
    Math.random = () => 0.01;
    try {
      w.command('a1', 'find_job', { kind: 'object', id: pc.id }, 'banca');
      w.tick(30);
    } finally {
      Math.random = orig;
    }
    expect(lucia.job).toBeUndefined();
    expect(w.optionsFor('a1', { kind: 'object', id: pc.id }).find((o) => o.def.id === 'find_job')?.reason).toMatch(/currículums/);
    expect(degreeReason(lucia, 'bolsa')).toMatch(/Economía/);
    expect(degreeReason(lucia, 'banca')).toBeUndefined();
    expect(CAREERS.bolsa.levels.at(-1)!.pay).toBeGreaterThan(CAREERS.banca.levels.at(-1)!.pay);
  });

  it('una partida de la versión 25 recibe su economía; y se guarda con las inversiones', () => {
    const w = new World(migrate(saveAt(25)));
    expect(w.state.economy?.priceIndex).toBe(1);
    expect(problems(w)).toEqual([]);
    w.buyAsset('a1', 'indice', 200);
    const again = new World(migrate(JSON.parse(serialize(w.state))));
    expect(again.household.portfolio?.indice?.cost).toBe(200);
    expect(again.economy.gov.party).toBe(w.economy.gov.party);
  });
});
