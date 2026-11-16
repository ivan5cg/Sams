import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { ECONOMY, incomeTax } from '../src/data/economy';
import { money, weeklyBill, weeklyMortgage } from '../src/sim/systems/money';
import { getRel } from '../src/sim/social';
import { fullNeeds, isolate } from './helpers';

describe('economía', () => {
  it('cada movimiento queda apuntado por categoría (esta semana y la anterior)', () => {
    const w = World.createNew();
    const h = w.household;
    money(w, h, 100, 'sueldo');
    money(w, h, -30, 'facturas');
    money(w, h, -20, 'facturas');
    expect(h.ledger?.at(-1)).toMatchObject({ week: 0, in: { sueldo: 100 }, out: { facturas: 50 } });
    w.state.minutes += 7 * 1440;
    money(w, h, 5, 'premios');
    w.state.minutes += 7 * 1440;
    money(w, h, 5, 'premios');
    expect(h.ledger?.map((l) => l.week)).toEqual([1, 2]);
  });

  it('las facturas dependen de la casa y la hipoteca sube con las reformas', () => {
    const w = World.createNew();
    const h = w.household;
    const bill0 = weeklyBill(w, h);
    const mort0 = weeklyMortgage(w, h);
    expect(mort0).toBe(ECONOMY.mortgage[0]);
    // Un mueble de lujo se nota en el recibo.
    const bed = w.objectsIn(h.lotId).find((o) => o.def === 'bed')!;
    bed.q = 3;
    expect(weeklyBill(w, h)).toBe(bill0 + ECONOMY.bills.perLuxury);
    h.funds = 50_000;
    expect(w.expandHouse()).toBe(true);
    expect(weeklyMortgage(w, h)).toBe(ECONOMY.mortgage[1]);
    expect(weeklyBill(w, h)).toBeGreaterThan(bill0);
    // Los okupas no pagan.
    const ok = w.state.households.find((x) => x.okupa);
    if (ok) expect(weeklyBill(w, ok) + weeklyMortgage(w, ok)).toBe(0);
  });

  it('Hacienda retiene por tramos (los sueldos bajos, nada)', () => {
    expect(incomeTax(80)).toBe(0);
    expect(incomeTax(100)).toBe(0);
    expect(incomeTax(150)).toBe(8);
    expect(incomeTax(300)).toBe(45);
  });

  it('un regalo cuesta dinero, sube la amistad y emociona', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    for (const id of ['a1', 'a2']) fullNeeds(w.agent(id)!);
    const f0 = w.household.funds;
    const rel0 = getRel(w.state, 'a1', 'a2').f;
    w.command('a1', 'give_gift', { kind: 'agent', id: 'a2' });
    w.tick(30);
    expect(w.household.funds).toBe(f0 - ECONOMY.gift);
    expect(getRel(w.state, 'a1', 'a2').f).toBeGreaterThan(rel0);
    expect(w.agent('a2')!.emotions?.some((e) => e.id === 'regalo')).toBe(true);
    expect(w.household.ledger?.at(-1)?.out.regalos).toBe(ECONOMY.gift);
  });

  it('ropa nueva y cursos online en el ordenador', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const lucia = w.agent('a1')!;
    fullNeeds(lucia);
    const pc = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    const color = lucia.color;
    const f0 = w.household.funds;
    w.command('a1', 'buy_clothes', { kind: 'object', id: pc.id });
    w.tick(40);
    expect(lucia.color).not.toBe(color);
    expect(w.household.funds).toBe(f0 - ECONOMY.clothes);
    const before = Math.floor(lucia.skills?.cocina ?? 0);
    w.command('a1', 'take_course', { kind: 'object', id: pc.id }, 'cocina');
    w.tick(150);
    expect(Math.floor(lucia.skills?.cocina ?? 0)).toBe(before + 1);
    expect(w.household.ledger?.at(-1)?.out).toMatchObject({ ropa: ECONOMY.clothes, cursos: ECONOMY.course });
  });
});
