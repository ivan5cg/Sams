import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { getRel, isAdult } from '../src/sim/social';
import { converse, interestsOf, knownText, topicsFor } from '../src/sim/conversation';
import { traitAffinity, traitsOf } from '../src/sim/traits';
import { chatPair, contextPairs } from '../src/sim/chatter';
import { CUNADO_LINES } from '../src/data/dialogue';
import { fullNeeds, isolate } from './helpers';

describe('diálogos, conversaciones y deseos', () => {
  const withRandom = <T>(value: number, fn: () => T): T => {
    const orig = Math.random;
    Math.random = () => value;
    try {
      return fn();
    } finally {
      Math.random = orig;
    }
  };

  it('cada persona tiene gustos fijos y un tema que no soporta', () => {
    const w = World.createNew();
    const a = w.agent('a1')!;
    const g1 = interestsOf(a), g2 = interestsOf(a);
    expect(g1).toEqual(g2);
    expect(g1.likes.length).toBeGreaterThanOrEqual(2);
    expect(g1.likes).not.toContain(g1.dislike);
  });

  it('hablar de lo que le gusta sube la amistad y descubre el gusto; lo que odia, la baja', () => {
    const w = World.createNew();
    const a = w.agent('a1')!, t = w.agent('a2')!;
    const { likes, dislike } = interestsOf(t);
    const f0 = getRel(w.state, a.id, t.id).f;
    const good = withRandom(0.3, () => converse(w, a, t, likes[0]));
    expect(good.outcome).toBe('good');
    expect(getRel(w.state, a.id, t.id).f).toBeGreaterThan(f0);
    expect(knownText(a, t)).toContain('Le encanta');
    const f1 = getRel(w.state, a.id, t.id).f;
    const bad = withRandom(0.3, () => converse(w, a, t, dislike));
    expect(bad.outcome).toBe('bad');
    expect(getRel(w.state, a.id, t.id).f).toBeLessThan(f1);
    expect(knownText(a, t)).toContain('No soporta');
  });

  it('los temas cambian en cada turno y siempre hay opciones', () => {
    const w = World.createNew();
    const a = w.agent('a1')!, t = w.agent('a2')!;
    const t0 = topicsFor(w, a, t, 0).map((x) => x.id);
    const t1 = topicsFor(w, a, t, 1).map((x) => x.id);
    expect(t0.length).toBeGreaterThanOrEqual(3);
    expect(t0).not.toEqual(t1);
    // Con la pareja se puede coquetear
    expect(t0).toContain('coquetear');
  });

  it('proponer ir al parque: si acepta, se van los dos', () => {
    const w = World.createNew();
    const a = w.agent('a1')!, t = w.agent('a2')!;
    w.state.minutes = 6 * 1440 + 11 * 60; // domingo
    const res = withRandom(0.1, () => converse(w, a, t, 'parque'));
    expect(res.goPark).toBe(true);
    w.onTalkTurn(a, t, res, true);
    w.tick(20);
    expect(a.lotId).toBe('P');
    expect(t.lotId).toBe('P');
  });

  it('cada persona de la familia tiene 3 deseos; cumplir uno da dinero y sale otro', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    expect(lucia.wishes).toHaveLength(3);
    expect(w.agent('a3')!.wishes).toBeUndefined(); // las mascotas no
    isolate(w, ['a1']);
    w.wishesEnabled = true;
    lucia.wishes = [{ id: 'x', kind: 'place', label: 'Ir al parque', icon: '🌳', lot: 'park', reward: 40 }];
    const f0 = w.household.funds;
    w.travel(['a1'], 'P');
    w.tick(20);
    expect(w.household.funds).toBe(f0 + 40);
    expect(lucia.wishes.find((x) => x.id === 'x')).toBeUndefined();
    expect(lucia.wishes.length).toBeGreaterThan(0);
  });

  it('tocar un deseo pone al personaje a cumplirlo', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a3']);
    const lucia = w.agent('a1')!;
    w.wishesEnabled = true;
    lucia.wishes = [{ id: 'y', kind: 'action', label: 'Jugar con Toby', icon: '🎾', action: 'play_pet', target: 'a3', reward: 30 }];
    w.agent('a3')!.current = { id: 'q', actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    const f0 = w.household.funds;
    expect(w.pursueWish('a1', 'y')).toBe(true);
    w.tick(40);
    expect(w.household.funds).toBe(f0 + 30);
  });

  it('las frases de la conversación llegan a la escena', () => {
    const w = World.createNew();
    const a = w.agent('a1')!, t = w.agent('a2')!;
    const res = converse(w, a, t, 'dia');
    w.onTalkTurn(a, t, res, true);
    expect(w.ui.speech.map((s) => s.agentId)).toEqual(['a1', 'a2']);
  });
});

describe('personalidad, noticias y charlas a la española', () => {
  it('cada persona tiene 2 rasgos; Mateo es cuñado y tragón', () => {
    const w = World.createNew();
    for (const a of w.state.agents.filter((x) => x.kind === 'person')) expect(traitsOf(a)).toHaveLength(2);
    expect(traitsOf(w.agent('a2')!).map((t) => t.id)).toEqual(['cunado', 'gloton']);
    expect(traitsOf(w.agent('a3')!)).toEqual([]); // las mascotas no
  });

  it('al tragón le entra el hambre antes', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    const lucia = w.agent('a1')!, mateo = w.agent('a2')!;
    for (const a of [lucia, mateo]) {
      fullNeeds(a);
      a.current = { id: `q${a.id}`, actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    }
    w.state.activeAgentId = 'nadie';
    w.tick(60);
    expect(mateo.needs.hunger).toBeLessThan(lucia.needs.hunger - 1);
  });

  it('a cada uno le apetecen más las cosas de su forma de ser', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!, mateo = w.agent('a2')!;
    expect(traitAffinity(lucia, 'run')).toBeGreaterThan(1);
    expect(traitAffinity(mateo, 'snack')).toBeGreaterThan(1);
    expect(traitAffinity(mateo, 'chat')).toBeGreaterThan(1);
  });

  it('lo que pasa en el barrio se convierte en noticia y se cotillea', () => {
    const w = World.createNew();
    const hid = w.lotById('L1').householdId!;
    const n = w.state.agents.find((a) => a.householdId === hid && a.kind === 'person' && isAdult(a))!;
    n.job = { career: 'oficina', level: 1, perf: 99 };
    n.lotId = 'L1';
    w.state.minutes = 9 * 60 - 1;
    w.tick(9 * 60);
    expect((w.state.news ?? []).some((x) => x.text.includes(n.name) && x.text.includes('ascendido'))).toBe(true);
    const gossip = w.gossipFor(w.agent('a1')!, w.agent('a2')!);
    expect(gossip).toContain(n.name);
    expect(topicsFor(w, w.agent('a1')!, w.agent('a2')!, 0).map((t) => t.id)).toContain('cotilleos');
  });

  it('las charlas dependen del día, la hora y lo que pasa', () => {
    const w = World.createNew(); // lunes por la mañana
    const pairs = contextPairs(w, w.agent('a1')!, w.agent('a2')!).map((p) => p[0]);
    expect(pairs).toContain('Odio los lunes...');
    expect(pairs.some((p) => p.includes('desayunado'))).toBe(true);
    expect(pairs.some((p) => p.includes('Toby') || p.includes('Misi'))).toBe(true);
    // El cuñado suelta sus cosas (con una secuencia de azar fija: si no, a veces salían justo 5).
    let cunado = 0;
    let seed = 42;
    const orig = Math.random;
    Math.random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    try {
      for (let i = 0; i < 60; i++) {
        const first = chatPair(w, w.agent('a2')!, w.agent('a1')!)[0].toLowerCase();
        if (CUNADO_LINES.some((c) => first.includes(c[0].toLowerCase().slice(1, 16)))) cunado++;
      }
    } finally {
      Math.random = orig;
    }
    expect(cunado).toBeGreaterThan(5);
  });
});
