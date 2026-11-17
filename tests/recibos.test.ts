import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import { hasEmotion } from '../src/sim/emotions';
import { DEADLINES, billAmount, debtsOf, rentBackCost, totalDebt, upcomingBills } from '../src/sim/systems/bills';
import { fullNeeds, goToDate, isolate, problems } from './helpers';

/** Partida aislada (sin sucesos al azar que den dinero) y sin un duro. */
function broke() {
  const w = World.createNew();
  isolate(w, ['a1', 'a2']);
  w.household.funds = 0;
  return w;
}

/** Avanza día a día (pasando por cada mañana), sin sucesos al azar que den dinero. */
function days(w: World, n: number) {
  const orig = Math.random;
  Math.random = () => 0.99;
  try {
    for (let i = 0; i < n; i++) {
      w.state.minutes = Math.floor(w.state.minutes / 1440 + 1) * 1440 - 1;
      w.tick(2);
    }
  } finally {
    Math.random = orig;
  }
}

describe('recibos: alquiler, luz y agua', () => {
  it('llegan cada mes en su día y salen en la agenda', () => {
    const w = World.createNew();
    const next = upcomingBills(w, 15);
    expect(next.map((b) => [w.dateOf(b.day).d, b.kind])).toEqual([[1, 'alquiler'], [5, 'luz'], [5, 'agua']]);
    w.state.minutes = (next[0].day - 1) * 1440 + 600;
    expect(w.state.minutes).toBeGreaterThan(0);
  });

  it('sin dinero, quedan pendientes; a los 10 días cortan la luz y el agua, y al pagar vuelven', () => {
    const w = broke();
    goToDate(w, '2027-03-31');
    days(w, 5); // del 1 al 5 de abril
    expect(debtsOf(w.household).map((d) => d.kind).sort()).toEqual(['agua', 'alquiler', 'luz']);
    expect(hasEmotion(w.agent('a1')!, 'deudas')).toBe(true);
    days(w, DEADLINES.cut);
    expect(w.hasPower('L0')).toBe(false);
    expect(w.hasWater('L0')).toBe(false);
    const tv = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    expect(w.checkObjectAction(w.agent('a1')!, tv, 'browse').reason).toMatch(/cortado/);
    const shower = w.objectsIn('L0').find((o) => o.def === 'shower')!;
    expect(w.checkObjectAction(w.agent('a1')!, shower, 'shower').reason).toMatch(/agua/);
    // Llega dinero: el banco cobra solo al día siguiente (con el reenganche), y vuelven la luz y el agua.
    w.household.funds = 5000;
    days(w, 1);
    expect(totalDebt(w.household)).toBe(0);
    expect(w.hasPower('L0')).toBe(true);
    expect(w.hasWater('L0')).toBe(true);
    expect(problems(w)).toEqual([]);
  });

  it('se puede pagar a mano en cuanto hay dinero', () => {
    const w = broke();
    goToDate(w, '2027-04-01');
    const [rent] = debtsOf(w.household);
    expect(w.payDebt(rent.id)).toMatch(/dinero/);
    w.household.funds = rent.amount;
    expect(w.payDebt(rent.id)).toBeUndefined();
    expect(w.household.funds).toBe(0);
    expect(debtsOf(w.household)).toEqual([]);
  });

  it('el alquiler: carta, burofax y desahucio; la familia a la calle y los peques y las mascotas, con la abuela', () => {
    const w = broke();
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    goToDate(w, '2027-04-01');
    days(w, DEADLINES.landlordLetter);
    expect(toasts.some((t) => t.includes('Carta del casero'))).toBe(true);
    days(w, DEADLINES.burofax - DEADLINES.landlordLetter);
    expect(toasts.some((t) => t.includes('Burofax'))).toBe(true);
    expect(w.evicted).toBe(false);
    days(w, DEADLINES.eviction - DEADLINES.burofax);
    expect(w.evicted).toBe(true);
    expect(toasts.some((t) => t.includes('DESAHUCIO'))).toBe(true);
    const lucia = w.agent('a1')!;
    expect(hasEmotion(lucia, 'desahuciado')).toBe(true);
    // Toby y Misi, con la abuela (fuera de la partida, sin pasar hambre).
    for (const pet of w.members.filter((m) => m.kind === 'pet')) expect(pet.travel?.arrive).toBe(Number.POSITIVE_INFINITY);
    // A casa no se puede volver.
    w.tick(60);
    expect(lucia.lotId).toBe('P');
    expect(w.canTravel(lucia, 'L0').reason).toMatch(/precintada/);
    // En la calle: dormir en el banco y comer en el comedor social.
    fullNeeds(lucia);
    lucia.needs.energy = 20;
    const bench = w.objectsIn('P').find((o) => o.def === 'bench')!;
    expect(w.command('a1', 'sleep_bench', { kind: 'object', id: bench.id })).toBe(true);
    w.tick(120);
    expect(lucia.needs.energy).toBeGreaterThan(20);
    const cart = w.objectsIn('P').find((o) => o.def === 'foodcart')!;
    lucia.current = null;
    lucia.needs.hunger = 20;
    expect(w.command('a1', 'free_meal', { kind: 'object', id: cart.id })).toBe(true);
    w.tick(40);
    expect(lucia.needs.hunger).toBeGreaterThan(20);
    expect(w.household.funds).toBe(0);
    // Los servicios sociales ayudan una vez al mes.
    expect(w.askAid()).toBeUndefined();
    expect(w.household.funds).toBe(400);
    expect(w.askAid()).toMatch(/hace poco/);
    // Con lo que se debe del alquiler y la fianza, se vuelve a casa (y vuelven los de la abuela).
    expect(w.rentBack()).toMatch(/Hacen falta/);
    w.household.funds = rentBackCost(w) + 100;
    expect(w.rentBack()).toBeUndefined();
    expect(w.evicted).toBe(false);
    w.tick(90);
    expect(w.members.filter((m) => m.kind === 'pet').every((p) => p.lotId === 'L0' && !p.travel)).toBe(true);
    expect(lucia.lotId === 'L0' || lucia.travel?.to === 'L0').toBe(true);
    expect(problems(w)).toEqual([]);
  }, 60_000);

  it('a los vecinos no les pasa nada de esto, y la partida se guarda con sus deudas', () => {
    const w = broke();
    goToDate(w, '2027-03-31');
    days(w, 5);
    const again = new World(migrate(JSON.parse(serialize(w.state))));
    expect(debtsOf(again.household).length).toBe(3);
    expect(w.state.households.filter((h) => h.id !== w.household.id).every((h) => !h.bills)).toBe(true);
    expect(billAmount(w, w.household, 'alquiler')).toBe(343);
  });
});
