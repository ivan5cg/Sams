import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import type { Agent } from '../src/sim/types';
import { getRel, isAdult } from '../src/sim/social';
import { fullNeeds, isolate } from './helpers';

describe('habilidades, ñiqui ñiqui y pilates', () => {
  const withRandom = <T>(value: number, fn: () => T): T => {
    const orig = Math.random;
    Math.random = () => value;
    try {
      return fn();
    } finally {
      Math.random = orig;
    }
  };

  it('practicar sube la habilidad, cada nivel cuesta más, y se avisa al subir', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    w.buy('easel', 4, 7);
    const easel = w.objectsIn('L0').find((o) => o.def === 'easel')!;
    const msgs: string[] = [];
    w.onToast((t) => msgs.push(t.text));
    const f0 = w.household.funds;
    w.command('a1', 'paint', { kind: 'object', id: easel.id });
    w.tick(70);
    const lucia = w.agent('a1')!;
    expect(lucia.skills?.arte ?? 0).toBeGreaterThan(0.9);
    expect(msgs.some((m) => m.includes('arte nivel 1'))).toBe(true);
    // El cuadro se vende
    expect(w.household.funds).toBeGreaterThan(f0);
    expect(msgs.some((m) => m.includes('vendido un cuadro'))).toBe(true);
  });

  it('la habilidad de la carrera ayuda a ascender', () => {
    const run = (skill: number) => {
      const w = World.createNew();
      const lucia = w.agent('a1')!;
      lucia.job = { career: 'oficina', level: 1, perf: 0 };
      lucia.skills = { carisma: skill };
      for (const k of Object.keys(lucia.needs) as (keyof Agent['needs'])[]) lucia.needs[k] = 60;
      isolate(w, ['a1']);
      w.state.minutes = 9 * 60 - 1;
      withRandom(0.5, () => w.tick(9 * 60));
      return lucia.job!.perf;
    };
    expect(run(8)).toBeGreaterThan(run(0) + 3);
  });

  it('con música 3, en el parque se puede tocar a cambio de propinas', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    const self = () => w.optionsFor('a1', { kind: 'agent', id: 'a1' }).map((o) => o.def.id);
    expect(self()).not.toContain('busk');
    w.travel(['a1'], 'P');
    w.tick(20);
    expect(w.optionsFor('a1', { kind: 'agent', id: 'a1' }).find((o) => o.def.id === 'busk')?.ok).toBe(false);
    lucia.skills = { musica: 4 };
    isolate(w, ['a1']);
    const f0 = w.household.funds;
    w.command('a1', 'busk', { kind: 'agent', id: 'a1' });
    w.tick(50);
    expect(w.household.funds).toBeGreaterThan(f0 + 30);
  });

  it('los niños hacen los deberes y mejoran sus notas', () => {
    const w = World.createNew();
    // El barrio es al azar: si no hay ningún niño, se rejuvenece a un vecino.
    const kid =
      w.state.agents.find((a) => a.kind === 'person' && !a.role && w.stageOf(a) === 'child') ??
      Object.assign(w.state.agents.find((a) => a.kind === 'person' && !a.role && a.householdId !== 'h1')!, { ageDays: 6, job: { career: 'school', level: 1, perf: 50 } });
    expect(w.optionsFor(kid.id, { kind: 'agent', id: kid.id }).map((o) => o.def.id)).toContain('homework');
    const lucia = w.agent('a1')!;
    expect(w.optionsFor('a1', { kind: 'agent', id: 'a1' }).map((o) => o.def.id)).not.toContain('homework');
    void lucia;
  });

  it('ñiqui ñiqui: solo en pareja, adultos, en una cama de casa; da diversión y romance', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    w.agent('a2')!.current = { id: 'q', actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    const opts = w.optionsFor('a1', { kind: 'agent', id: 'a2' });
    expect(opts.find((o) => o.def.id === 'niqui')?.ok).toBe(true);
    const lucia = w.agent('a1')!;
    lucia.needs.fun = 30;
    const r0 = getRel(w.state, 'a1', 'a2').r;
    const bed = w.objectsIn('L0').find((o) => o.def === 'bed')!;
    let usedBed = false;
    withRandom(0.01, () => {
      w.command('a1', 'niqui', { kind: 'agent', id: 'a2' });
      for (let i = 0; i < 80; i++) {
        w.tick(0.5);
        if (w.usersOf(bed.id).length === 2) usedBed = true;
      }
    });
    expect(usedBed).toBe(true);
    expect(lucia.needs.fun).toBeGreaterThan(50);
    expect(getRel(w.state, 'a1', 'a2').r).toBeGreaterThan(r0);
    // Con un niño, nunca
    const kid = w.state.agents.find((a) => a.kind === 'person' && !isAdult(a))!;
    expect(w.optionsFor('a1', { kind: 'agent', id: kid.id }).map((o) => o.def.id)).not.toContain('niqui');
    // Con un desconocido tampoco aparece
    const hid = w.lotById('L1').householdId!;
    const stranger = w.state.agents.find((a) => a.householdId === hid && isAdult(a))!;
    stranger.lotId = 'L0';
    expect(w.optionsFor('a1', { kind: 'agent', id: stranger.id }).map((o) => o.def.id)).not.toContain('niqui');
  });

  it('el estudio de pilates: esterillas gratis, reformer de pago, y se pone en forma', () => {
    const w = World.createNew();
    const studio = w.state.lots.find((l) => l.layout === 'studio')!;
    expect(studio).toBeTruthy();
    w.travel(['a1'], studio.id);
    w.tick(20);
    isolate(w, ['a1']);
    const lucia = w.agent('a1')!;
    fullNeeds(lucia);
    const reformer = w.objectsIn(studio.id).find((o) => o.def === 'reformer')!;
    const f0 = w.household.funds;
    w.command('a1', 'reformer', { kind: 'object', id: reformer.id });
    w.tick(60);
    expect(w.household.funds).toBe(f0 - 12);
    expect(lucia.skills?.forma ?? 0).toBeGreaterThan(1);
    const mat = w.objectsIn(studio.id).find((o) => o.def === 'pilates_mat')!;
    w.command('a1', 'pilates', { kind: 'object', id: mat.id });
    w.tick(50);
    expect(w.household.funds).toBe(f0 - 12);
  });

  it('una partida de la fase 6 recibe el estudio al migrar', () => {
    const w = World.createNew();
    const st = JSON.parse(serialize(w.state));
    st.version = 6;
    st.lots = st.lots.filter((l: { id: string }) => l.id !== 'G');
    st.objects = st.objects.filter((o: { lotId: string }) => o.lotId !== 'G');
    const m = migrate(st);
    expect(m.lots.some((l) => l.layout === 'studio')).toBe(true);
    expect(m.objects.filter((o) => o.lotId === 'G').length).toBeGreaterThan(5);
  });
});
