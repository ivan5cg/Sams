import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate } from '../src/save/serialize';
import { isolate, madridHomes, oldSave } from './helpers';

describe('barrio (fase 3)', () => {
  const PARK = 'P';

  it('hay 10 familias, sus casas y el parque, con todas las especies', () => {
    const w = World.createNew();
    expect(madridHomes(w.state.households)).toHaveLength(10);
    expect(w.state.lots.filter((l) => l.kind === 'home' && l.district !== 'alcorcon')).toHaveLength(10);
    expect(w.state.lots.some((l) => l.kind === 'park')).toBe(true);
    const species = new Set(w.state.agents.filter((a) => a.householdId !== 'h1').map((a) => a.species));
    for (const s of ['human', 'dog', 'cat', 'guineapig', 'ferret', 'capybara']) expect(species.has(s as never), s).toBe(true);
    for (const h of w.state.households) {
      expect(h.memberIds.length).toBeGreaterThan(0);
      for (const id of h.memberIds) expect(w.agent(id)!.lotId).toBe(h.lotId);
    }
  });

  it('una partida de la fase 2 se migra al barrio sin perder a la familia', () => {
    const migrated = migrate(oldSave(2));
    const w = new World(migrated);
    expect(w.members.map((m) => m.name)).toEqual(['Lucía', 'Mateo', 'Toby', 'Misi']);
    expect(madridHomes(w.state.households)).toHaveLength(10);
    for (const o of w.state.objects) expect(o.lotId).toBeTruthy();
    for (const a of w.state.agents) expect(a.lotId).toBeTruthy();
  });

  it('se puede ir al parque con el perro y volver', () => {
    const w = World.createNew();
    expect(w.travel(['a1', 'a3'], PARK)).toBe(true);
    expect(w.viewLotId).toBe('L0');
    w.tick(20);
    expect(w.agent('a1')!.lotId).toBe(PARK);
    expect(w.agent('a3')!.lotId).toBe(PARK);
    expect(w.viewLotId).toBe(PARK);
    // En el parque puede comprar un perrito
    const cart = w.objectsIn(PARK).find((o) => o.def === 'foodcart')!;
    isolate(w, ['a1', 'a3']);
    w.agent('a1')!.needs.hunger = 30;
    w.command('a1', 'buy_hotdog', { kind: 'object', id: cart.id });
    const funds = w.household.funds;
    w.tick(30);
    expect(w.household.funds).toBe(funds - 5);
    w.travel(['a1', 'a3'], 'L0');
    w.tick(20);
    expect(w.agent('a1')!.lotId).toBe('L0');
  });

  it('de visita en casa ajena solo se pueden usar algunas cosas', () => {
    const w = World.createNew();
    w.travel(['a1'], 'L1');
    w.tick(20);
    const lucia = w.agent('a1')!;
    const bed = w.objectsIn('L1').find((o) => o.def === 'bed')!;
    const toilet = w.objectsIn('L1').find((o) => o.def === 'toilet')!;
    expect(w.checkObjectAction(lucia, bed, 'sleep').reason).toBe('Estás de visita');
    expect(w.checkObjectAction(lucia, toilet, 'toilet').reason).not.toBe('Estás de visita');
    // Los vecinos de esa casa pasan a simularse al detalle
    const hosts = w.agentsIn('L1').filter((a) => a.householdId !== 'h1');
    expect(hosts.length).toBeGreaterThan(0);
    w.tick(1);
    for (const h of hosts) expect(h.abstract).toBeFalsy();
  });

  it('invitar a los vecinos: vienen, se les puede despedir y se van', () => {
    const w = World.createNew();
    // Domingo a mediodía: casi nadie trabaja.
    w.state.minutes = 6 * 1440 + 12 * 60;
    const hid = w.lotById('L1').householdId!;
    for (const id of w.state.households.find((h) => h.id === hid)!.memberIds) w.agent(id)!.job = undefined;
    expect(w.invite(hid)).toBe(true);
    w.tick(20);
    const guests = w.agentsIn('L0').filter((a) => a.householdId === hid);
    expect(guests.length).toBeGreaterThan(0);
    const guest = guests.find((g) => g.kind === 'person')!;
    expect(guest.visitUntil).toBeGreaterThan(w.state.minutes);
    // Los invitados no duermen en tu cama
    const bed = w.objectsIn('L0').find((o) => o.def === 'bed')!;
    expect(w.checkObjectAction(guest, bed, 'sleep').ok).toBe(false);
    w.command('a1', 'say_goodbye', { kind: 'agent', id: guest.id });
    w.tick(90);
    expect(w.agentsIn('L0').filter((a) => a.householdId === hid)).toHaveLength(0);
    // Ya no está en vuestra casa: ha vuelto a la suya (o de ahí ha salido a otro sitio).
    const g = w.agent(guest.id)!;
    expect(g.lotId !== 'L0' || g.travel?.to !== 'L0').toBe(true);
    expect(g.visitUntil === undefined || g.lotId !== 'L0').toBe(true);
  });

  it('un día entero de barrio: los vecinos salen y vuelven, y todo sigue en orden', () => {
    const w = World.createNew();
    const visits: string[] = [];
    w.onToast((t) => {
      if (t.text.includes('de visita')) visits.push(t.text);
    });
    const t0 = performance.now();
    w.tick(2 * 24 * 60);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(8000);
    for (const a of w.state.agents) {
      for (const v of Object.values(a.needs)) expect(Number.isFinite(v)).toBe(true);
      expect(w.lotById(a.lotId)).toBeTruthy();
    }
    // De noche todos los vecinos han vuelto a casa
    w.state.minutes = Math.ceil(w.state.minutes / 1440) * 1440 + 3 * 60 - 1;
    w.tick(1);
    w.tick(60);
    const out = w.state.agents.filter((a) => a.householdId !== 'h1' && !a.role && a.lotId !== w.householdOf(a)!.lotId && !a.travel);
    expect(out.map((a) => `${a.name}@${a.lotId}`)).toEqual([]);
  });
});
