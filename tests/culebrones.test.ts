import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { canMediate, canSnitch, mediate, snitch } from '../src/sim/systems/arcs';
import { getRel, isAdult, partnerOf, setRel } from '../src/sim/social';
import type { Arc } from '../src/sim/types';

/** Lleva el reloj hasta el siguiente paso del culebrón y deja pasar una hora. */
function advance(w: World, arc: Arc) {
  w.state.minutes = Math.max(w.state.minutes, arc.next - 30);
  w.tick(60);
}

function couple(w: World) {
  const x = w.state.agents.find((a) => a.kind === 'person' && !a.role && !w.isPlayerMember(a) && isAdult(a) && partnerOf(w.state, a.id) && w.agent(partnerOf(w.state, a.id))?.householdId === a.householdId)!;
  return { x, p: w.agent(partnerOf(w.state, x.id))! };
}

function single(w: World, notIn: string[]) {
  return w.state.agents.find((a) => a.kind === 'person' && !a.role && !w.isPlayerMember(a) && isAdult(a) && w.stageOf(a) !== 'elder' && !partnerOf(w.state, a.id) && !notIn.includes(a.householdId))!;
}

describe('culebrones del barrio', () => {
  it('un lío: rumores, los pillan, bronca, separación y mudanza (o sofá)', () => {
    const w = World.createNew();
    const { x, p } = couple(w);
    const y = single(w, [x.householdId, w.household.id]);
    const arc = w.startArc('lio', [x.id, y.id, p.id])!;
    expect(arc.step).toBe(0);
    expect(w.state.secrets?.some((s) => s.kind === 'lio' && s.about.includes(x.id))).toBe(true);
    expect(canSnitch(w, p)).toBe(true);
    for (let i = 0; i < 6 && !arc.end; i++) advance(w, arc);
    expect(arc.end).toBeDefined();
    expect(getRel(w.state, x.id, p.id).status).toBeUndefined();
    expect((w.state.news ?? []).some((n) => n.text.includes('bronca monumental'))).toBe(true);
    if (arc.end!.how === 'mudanza') expect(w.agent(x.id)!.householdId).toBe(y.householdId);
  });

  it('chivarse destapa el lío antes de tiempo', () => {
    const w = World.createNew();
    const { x, p } = couple(w);
    const y = single(w, [x.householdId, w.household.id]);
    const arc = w.startArc('lio', [x.id, y.id, p.id])!;
    snitch(w, w.agent('a1')!, p);
    expect(arc.step).toBe(1);
    expect(p.emotions?.some((e) => e.id === 'traicionado')).toBe(true);
    expect(canSnitch(w, p)).toBe(false);
  });

  it('mediar en una guerra de vecinos (con carisma) acaba en paces', () => {
    const w = World.createNew();
    const a = single(w, [w.household.id]);
    const b = single(w, [w.household.id, a.householdId]);
    const arc = w.startArc('pelea', [a.id, b.id])!;
    expect(canMediate(w, a)).toBe(true);
    const lucia = w.agent('a1')!;
    lucia.skills = { ...lucia.skills, carisma: 10 };
    const orig = Math.random;
    Math.random = () => 0.1;
    try {
      mediate(w, lucia, a);
    } finally {
      Math.random = orig;
    }
    expect(arc.end?.how).toContain('Lucía');
    expect(getRel(w.state, a.id, b.id).f).toBeGreaterThanOrEqual(30);
  });

  it('un romance acaba en boda en el parque, con invitación', () => {
    const w = World.createNew();
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    // Dos solteros de casas distintas (en algún barrio generado todos los solteros viven juntos: entonces se busca otro).
    const a = single(w, [w.household.id]);
    let b: ReturnType<typeof single> | undefined = single(w, [w.household.id, a.householdId]);
    for (const c of w.state.agents) {
      if (b) break;
      if (c.kind !== 'person' || c.role || w.isPlayerMember(c) || !isAdult(c) || w.stageOf(c) === 'elder' || c.householdId === a.householdId) continue;
      // Un adulto de otra casa que se queda soltero (su pareja, si tenía, deja de serlo).
      const pid = partnerOf(w.state, c.id);
      if (pid) setRel(w.state, c.id, pid, { ...getRel(w.state, c.id, pid), status: undefined });
      b = c;
    }
    expect(b).toBeDefined();
    const arc = w.startArc('romance', [a.id, b!.id])!;
    for (let i = 0; i < 5 && !arc.end; i++) advance(w, arc);
    expect(arc.end?.how).toBe('boda');
    expect(getRel(w.state, a.id, b!.id).status).toBe('married');
    expect(w.hasEvent('boda')).toBe(true);
    expect(toasts.some((t) => t.includes('Boda en el parque'))).toBe(true);
  });

  it('nunca a la vez más de dos, y nunca con la familia del jugador', () => {
    const w = World.createNew();
    w.state.activeAgentId = 'nadie';
    w.tick(20 * 1440);
    const arcs = w.state.arcs ?? [];
    expect(arcs.length).toBeGreaterThan(0);
    for (const arc of arcs) for (const id of arc.who) expect(w.household.memberIds).not.toContain(id);
    expect(arcs.filter((a) => !a.end).length).toBeLessThanOrEqual(2);
  }, 60_000);
});
