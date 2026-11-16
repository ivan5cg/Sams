import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { CHALLENGE_REWARD } from '../src/sim/systems/feats';
import { isolate } from './helpers';

const hour = (w: World) => w.tick(60);

describe('logros y retos', () => {
  it('un bebé: logro, contador y generación siguiente', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    w.household.expecting = { parents: ['a1', 'a2'], due: w.state.minutes + 10 };
    hour(w);
    const baby = w.members.find((m) => m.ageDays === 0 && m.kind === 'person')!;
    expect(baby.gen).toBe(2);
    expect(w.state.feats?.counts.babies).toBe(1);
    expect(w.state.feats?.got.bebe).toBe(w.day);
  });

  it('MC Kalimotxo: tres temas dedicados', () => {
    const w = World.createNew();
    const rapper = w.state.agents.find((a) => a.role === 'rapero')!;
    for (let i = 0; i < 3; i++) w.startRap(rapper, w.agent('a1')!);
    hour(w);
    expect(w.state.feats?.got.kalimotxo).toBeDefined();
  });

  it('reto «vivir sin nevera»: se cumple a los 7 días sin ella y da premio', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const fridge = w.objectsIn('L0').find((o) => o.def === 'fridge')!;
    expect(w.sellObject(fridge.id)).toBe(true);
    w.startChallenge('sin_nevera');
    const f0 = w.household.funds;
    w.agent('a1')!.needs.hunger = 100;
    for (let d = 0; d < 7; d++) {
      w.state.minutes += 1440;
      hour(w);
    }
    expect(w.state.feats?.challenges.sin_nevera.done).toBeDefined();
    expect(w.household.funds).toBeGreaterThanOrEqual(f0 + CHALLENGE_REWARD - 1000); // menos las facturas
  });

  it('reto «vivir sin nevera»: comprar otra lo pierde', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const fridge = w.objectsIn('L0').find((o) => o.def === 'fridge')!;
    const { x, y } = fridge;
    w.sellObject(fridge.id);
    w.startChallenge('sin_nevera');
    w.state.minutes += 90;
    expect(w.buy('fridge', x, y)).toBe(true);
    hour(w);
    expect(w.state.feats?.challenges.sin_nevera.failed).toBe('Hay una nevera en casa');
  });

  it('las partidas antiguas empiezan sin logros', () => {
    const w = World.createNew();
    expect(w.state.feats).toEqual({ got: {}, counts: {}, challenges: {} });
  });
});
