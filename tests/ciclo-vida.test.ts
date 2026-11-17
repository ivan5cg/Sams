import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import { getRel, setRel } from '../src/sim/social';
import { isolate, madridHomes } from './helpers';

describe('ciclo de vida (fase 5)', () => {
  const withRandom = <T>(value: number, fn: () => T): T => {
    const orig = Math.random;
    Math.random = () => value;
    try {
      return fn();
    } finally {
      Math.random = orig;
    }
  };

  it('la pareja puede tener un bebé, que nace a los 3 días en su cuna', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    w.agent('a2')!.current = { id: 'quieto', actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    withRandom(0.01, () => {
      w.command('a1', 'try_baby', { kind: 'agent', id: 'a2' });
      w.tick(40);
    });
    expect(w.household.expecting).toBeTruthy();
    w.tick(3 * 1440);
    const baby = w.members.find((m) => m.ageDays <= 3 && m.kind === 'person');
    expect(baby).toBeTruthy();
    expect(w.stageOf(baby!)).toBe('baby');
    expect(w.object(baby!.home)!.def).toBe('crib');
    expect(getRel(w.state, 'a1', baby!.id).kin).toBe(true);
  });

  it('el bebé solo hace cosas de bebé y la familia lo cuida', () => {
    const w = World.createNew();
    w.household.expecting = { parents: ['a1', 'a2'], due: w.state.minutes };
    w.tick(1);
    const baby = w.members.find((m) => m.ageDays === 0)!;
    const fridge = w.objectsIn('L0').find((o) => o.def === 'fridge')!;
    expect(w.optionsFor(baby.id, { kind: 'object', id: fridge.id }).filter((o) => o.ok)).toEqual([]);
    const opts = w.optionsFor('a1', { kind: 'agent', id: baby.id }).map((o) => o.def.id);
    expect(opts).toContain('feed_baby');
    expect(opts).not.toContain('chat');
    // Con hambre, alguien de la familia le da el biberón
    isolate(w, ['a1', 'a2', baby.id]);
    w.state.activeAgentId = 'a3';
    baby.needs.hunger = 10;
    w.tick(90);
    expect(baby.needs.hunger).toBeGreaterThan(30);
  });

  it('al crecer sale de la cuna y va al colegio; al hacerse adulto, deja el colegio', () => {
    const w = World.createNew();
    w.household.expecting = { parents: ['a1', 'a2'], due: w.state.minutes };
    w.tick(1);
    const baby = w.members.find((m) => m.ageDays === 0)!;
    baby.ageDays = 2;
    w.state.minutes = Math.ceil(w.state.minutes / 1440) * 1440 - 1;
    w.tick(1);
    expect(w.stageOf(baby)).toBe('child');
    expect(baby.home).toBeUndefined();
    expect(baby.job?.career).toBe('school');
    baby.ageDays = 19;
    w.tick(1440);
    expect(w.stageOf(baby)).toBe('young');
    expect(baby.job).toBeUndefined();
  });

  it('los ancianos se jubilan, cobran pensión y mueren de viejos dejando una lápida', () => {
    const w = World.createNew();
    const mateo = w.agent('a2')!;
    mateo.job = { career: 'oficina', level: 2, perf: 0 };
    mateo.ageDays = 74;
    w.state.minutes = 1440 - 1;
    w.tick(1);
    expect(w.stageOf(mateo)).toBe('elder');
    expect(mateo.job).toBeUndefined();
    mateo.ageDays = 99;
    const lucia = w.agent('a1')!;
    lucia.needs.fun = 90;
    w.tick(1440);
    expect(w.agent('a2')).toBeUndefined();
    expect(w.members.map((m) => m.name)).not.toContain('Mateo');
    const grave = w.objectsIn('L0').find((o) => o.def === 'grave')!;
    expect(grave.label).toBe('Mateo');
    expect(lucia.needs.fun).toBeLessThan(90);
  });

  it('con el envejecimiento desactivado nadie envejece ni muere', () => {
    const w = World.createNew();
    w.setAging('off');
    const ages = new Map(w.state.agents.map((a) => [a.id, a.ageDays]));
    w.tick(3 * 1440);
    for (const [id, age] of ages) expect(w.agent(id)?.ageDays, id).toBe(age);
  });

  it('cuando muere el último de una familia vecina, hereda su pariente y llega otra familia', () => {
    const w = World.createNew();
    const hid = w.lotById('L1').householdId!;
    const h = w.state.households.find((x) => x.id === hid)!;
    const people = h.memberIds.map((id) => w.agent(id)!).filter((a) => a.kind === 'person');
    for (const p of people.slice(1)) w.die(p, 'old');
    const last = people[0];
    setRel(w.state, 'a1', last.id, { f: 50, r: 0, kin: true });
    h.funds = 1000;
    const f0 = w.household.funds;
    w.die(last, 'old');
    expect(w.household.funds).toBe(f0 + 1000);
    const newHid = w.lotById('L1').householdId!;
    expect(newHid).not.toBe(hid);
    expect(madridHomes(w.state.households)).toHaveLength(10);
  });

  it('si tu familia se queda sin personas, puedes seguir con otra del barrio', () => {
    const w = World.createNew();
    w.die(w.agent('a1')!, 'old');
    w.die(w.agent('a2')!, 'old');
    expect(w.state.familyGone).toBe(true);
    const other = w.lotById('L2').householdId!;
    w.continueWith(other);
    expect(w.state.familyGone).toBe(false);
    expect(w.household.id).toBe(other);
    expect(w.activeAgent.householdId).toBe(other);
    expect(madridHomes(w.state.households)).toHaveLength(10);
    // La partida sigue
    w.tick(600);
  });

  it('un bebé desatendido mucho tiempo se lo llevan los servicios sociales', () => {
    const w = World.createNew();
    w.household.expecting = { parents: ['a1', 'a2'], due: w.state.minutes };
    w.tick(1);
    const baby = w.members.find((m) => m.ageDays === 0)!;
    isolate(w, [baby.id]);
    baby.needs.hunger = 0;
    w.tick(400);
    expect(w.agent(baby.id)).toBeUndefined();
  });

  it('generaciones: una semana larga de barrio sin romperse', () => {
    const w = World.createNew();
    w.setAging('fast');
    w.state.activeAgentId = 'nadie';
    w.tick(10 * 1440);
    // Diez casas siempre con familia (y algún piso más si alguien se ha ido de casa tras romper).
    expect(madridHomes(w.state.households).length).toBeGreaterThanOrEqual(10);
    for (const h of w.state.households) {
      for (const id of h.memberIds) expect(w.agent(id), `${h.name} ${id}`).toBeTruthy();
    }
    for (const a of w.state.agents) if (!a.role) expect(w.householdOf(a)).toBeTruthy();
  });

  it('una partida de la fase 4 recibe cunas al migrar', () => {
    const w = World.createNew();
    const st = JSON.parse(serialize(w.state));
    st.version = 4;
    st.objects = st.objects.filter((o: { def: string }) => o.def !== 'crib');
    delete st.aging;
    const m = migrate(st);
    expect(m.aging).toBe('normal');
    for (const lot of m.lots.filter((l) => l.kind === 'home')) {
      expect(m.objects.filter((o) => o.lotId === lot.id && o.def === 'crib')).toHaveLength(2);
    }
  });
});
