import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate } from '../src/save/serialize';
import { squareOf, stationOf } from '../src/sim/neighborhood';
import { fullNeeds, isolate, problems, saveAt } from './helpers';

describe('Getafe, el tercer barrio', () => {
  it('tiene su Cerro, su club de pádel y tres casas con vecinos', () => {
    const w = World.createNew();
    // Hay nombres para todos (sin «Lola 704»).
    expect(w.state.agents.filter((a) => /\d/.test(a.name))).toEqual([]);
    for (const id of ['GP', 'PD', 'GE1', 'GE2', 'GE3']) expect(w.lotById(id)?.district, id).toBe('getafe');
    const fams = w.state.households.filter((h) => ['GE1', 'GE2', 'GE3'].includes(h.lotId));
    expect(fams.length).toBe(3);
    for (const h of fams) expect(h.memberIds.length).toBeGreaterThan(0);
    expect(w.objectsIn('PD').filter((o) => o.def === 'padel_court').length).toBe(2);
    expect(squareOf('getafe')).toBe('GP');
    expect(stationOf('getafe')).toBe('Getafe Central');
    expect(problems(w)).toEqual([]);
  });

  it('desde Madrid se va en metro (MetroSur hasta Getafe Central) y se llega', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.state.minutes = 10 * 60;
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    expect(w.needsMetro('L0', 'PD')).toBe(true);
    expect(w.travel(['a1'], 'PD')).toBe(true);
    const lucia = w.agent('a1')!;
    for (let i = 0; i < 12 && lucia.lotId !== 'PD'; i++) w.tick(10);
    expect(lucia.lotId).toBe('PD');
    expect(toasts.some((t) => t.includes('Getafe Central'))).toBe(true);
    // Un pádel: §8, y se nota en la forma física.
    lucia.travel = undefined;
    fullNeeds(lucia);
    const f0 = w.household.funds;
    const forma0 = lucia.skills?.forma ?? 0;
    const court = w.objectsIn('PD').find((o) => o.def === 'padel_court')!;
    expect(w.command('a1', 'play_padel', { kind: 'object', id: court.id })).toBe(true);
    w.tick(80);
    expect(w.household.funds).toBe(f0 - 8);
    expect(lucia.skills?.forma ?? 0).toBeGreaterThan(forma0);
    expect(toasts.some((t) => t.includes('pádel'))).toBe(true);
  });

  it('las partidas de antes reciben Getafe con sus vecinos', () => {
    const old = migrate(saveAt(14));
    expect(old.lots.filter((l) => l.district === 'getafe').length).toBe(5);
    expect(old.households.filter((h) => h.lotId.startsWith('GE')).length).toBe(3);
    expect(problems(new World(old))).toEqual([]);
  });

  it('los de Getafe hacen vida en su barrio', () => {
    const w = World.createNew();
    w.state.activeAgentId = 'nadie';
    const local = new Set(w.state.households.filter((h) => h.lotId.startsWith('GE')).flatMap((h) => h.memberIds));
    const seen = new Set<string>();
    for (let i = 0; i < 48; i++) {
      w.tick(60);
      for (const id of ['GP', 'PD']) for (const a of w.agentsIn(id)) if (local.has(a.id) && !a.travel) seen.add(id);
    }
    // Al Cerro o al pádel: algún día van a uno y algún día a otro.
    expect(seen.size).toBeGreaterThan(0);
    expect(problems(w)).toEqual([]);
  }, 60_000);
});
