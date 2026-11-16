import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import { fullNeeds, isolate } from './helpers';

describe('Mercadona, açaí y la compra', () => {
  it('hay un Mercadona y dos locales de açaí en el barrio, accesibles', () => {
    const w = World.createNew();
    expect(w.state.lots.filter((l) => l.layout === 'super')).toHaveLength(1);
    expect(w.state.lots.filter((l) => l.layout === 'acai')).toHaveLength(2);
  });

  it('con la nevera vacía no se puede comer en casa', () => {
    const w = World.createNew();
    w.household.pantry = 0;
    const fridge = w.objectsIn('L0').find((o) => o.def === 'fridge')!;
    expect(w.checkObjectAction(w.agent('a1')!, fridge, 'eat').reason).toContain('Mercadona');
  });

  it('hacer la compra en el Mercadona: se paga, se lleva a casa y llena la nevera', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.household.pantry = 0;
    w.state.minutes = 10 * 60;
    w.travel(['a1'], 'M');
    w.tick(20);
    const lucia = w.agent('a1')!;
    expect(lucia.lotId).toBe('M');
    const checkout = w.objectsIn('M').find((o) => o.def === 'checkout')!;
    const f0 = w.household.funds;
    w.command('a1', 'shop_big', { kind: 'object', id: checkout.id });
    w.tick(50);
    expect(w.household.funds).toBe(f0 - 95);
    expect(lucia.carrying).toBe(20);
    w.travel(['a1'], 'L0');
    w.tick(20);
    expect(w.household.pantry).toBe(20);
    expect(lucia.carrying).toBe(0);
  });

  it('el Mercadona tiene horario', () => {
    const w = World.createNew();
    w.state.minutes = 23 * 60;
    const lucia = w.agent('a1')!;
    lucia.lotId = 'M';
    const checkout = w.objectsIn('M').find((o) => o.def === 'checkout')!;
    expect(w.checkObjectAction(lucia, checkout, 'shop_small').reason).toContain('cerrado');
  });

  it('no se puede ir a una tienda cerrada, y al cerrar echan a todo el mundo', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.state.minutes = 8 * 60;
    expect(w.canTravel(w.agent('a1')!, 'M').reason).toContain('cerrado');
    w.state.minutes = 21 * 60;
    expect(w.travel(['a1'], 'A1')).toBe(true);
    w.tick(20);
    expect(w.agent('a1')!.lotId).toBe('A1');
    w.tick(65);
    const lucia = w.agent('a1')!;
    expect(lucia.lotId === 'L0' || lucia.travel?.to === 'L0').toBe(true);
  });

  it('si la nevera se queda vacía, alguien libre de la familia va solo a comprar y vuelve con la compra', () => {
    const w = World.createNew();
    w.state.minutes = 10 * 60 - 1;
    w.household.pantry = 1;
    isolate(w, ['a1', 'a2']);
    w.state.activeAgentId = 'a1';
    const mateo = w.agent('a2')!;
    fullNeeds(mateo);
    w.tick(2);
    expect(mateo.errand).toBe('compra');
    w.tick(120);
    expect(w.household.pantry).toBeGreaterThan(5);
    expect(mateo.lotId).toBe('L0');
  });

  it('la compra a domicilio llega a las 4 horas', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.household.pantry = 0;
    const pc = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    w.command('a1', 'order_groceries', { kind: 'object', id: pc.id });
    w.tick(20);
    expect(w.household.delivery).toBeTruthy();
    w.tick(4 * 60);
    expect(w.household.pantry).toBe(8);
  });

  it('en el açaí: un bowl cuesta 9 y quita el hambre; la selfie divierte', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.state.minutes = 12 * 60;
    w.travel(['a1'], 'A1');
    w.tick(20);
    const lucia = w.agent('a1')!;
    lucia.needs.hunger = 30;
    lucia.needs.fun = 30;
    const bar = w.objectsIn('A1').find((o) => o.def === 'acai_counter')!;
    const neon = w.objectsIn('A1').find((o) => o.def === 'neon_sign')!;
    const f0 = w.household.funds;
    w.command('a1', 'acai_bowl', { kind: 'object', id: bar.id });
    w.command('a1', 'selfie', { kind: 'object', id: neon.id });
    w.tick(45);
    expect(w.household.funds).toBe(f0 - 9);
    expect(lucia.needs.hunger).toBeGreaterThan(60);
    expect(lucia.needs.fun).toBeGreaterThan(30);
  });

  it('una partida antigua recibe las tiendas y la despensa', () => {
    const w = World.createNew();
    const st = JSON.parse(serialize(w.state));
    st.version = 7;
    st.lots = st.lots.filter((l: { layout: string }) => !['super', 'acai'].includes(l.layout));
    st.objects = st.objects.filter((o: { lotId: string }) => !['M', 'A1', 'A2'].includes(o.lotId));
    for (const h of st.households) delete h.pantry;
    const m = migrate(st);
    expect(m.lots.some((l) => l.layout === 'super')).toBe(true);
    expect(m.households.every((h) => h.pantry === 15)).toBe(true);
  });
});
