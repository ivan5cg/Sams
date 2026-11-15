import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { chatPair } from '../src/sim/chatter';
import { smallTalk } from '../src/sim/phrases';

describe('diálogos con profundidad', () => {
  it('las charlas casi no se repiten', () => {
    const w = World.createNew();
    const people = w.state.agents.filter((a) => a.kind === 'person' && !a.role);
    const firsts: string[] = [];
    for (let i = 0; i < 300; i++) {
      const a = people[i % people.length];
      const t = people[(i * 7 + 3) % people.length];
      if (a === t) continue;
      const lines = chatPair(w, a, t);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      for (const l of lines) expect(typeof l).toBe('string');
      firsts.push(lines.join(' / '));
    }
    const unique = new Set(firsts).size;
    // Casi todas distintas
    expect(unique / firsts.length).toBeGreaterThan(0.85);
    // En una charla seguida entre las mismas dos personas, nada se repite en 20 turnos
    const a = w.agent('a1')!, t = w.agent('a2')!;
    const seq = Array.from({ length: 20 }, () => smallTalk(w, a, t).join(' / '));
    expect(new Set(seq).size).toBe(20);
  });
});
