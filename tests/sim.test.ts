import { describe, expect, it } from 'vitest';
import { findPath } from '../src/sim/pathfinding';
import { World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import type { Agent } from '../src/sim/types';

function fullNeeds(a: Agent) {
  for (const k of Object.keys(a.needs) as (keyof Agent['needs'])[]) a.needs[k] = 95;
}

describe('pathfinding', () => {
  it('rodea las paredes', () => {
    const w = World.createNew();
    // Del baño (2,2) al salón (7,6): hay que salir por la puerta del baño (2,4).
    const path = findPath(w.grid, { x: 2, y: 2 }, { x: 7, y: 6 });
    expect(path).not.toBeNull();
    expect(path!.some((p) => p.x === 2 && p.y === 4)).toBe(true);
  });

  it('devuelve null si el destino es una pared', () => {
    const w = World.createNew();
    expect(findPath(w.grid, { x: 2, y: 2 }, { x: 0, y: 0 })).toBeNull();
  });
});

describe('simulación', () => {
  it('las necesidades bajan con el tiempo', () => {
    const w = World.createNew();
    const a = w.agent('a1')!;
    w.setActive('a3');
    fullNeeds(a);
    // Aislamos la bajada: sin autonomía para la persona activa.
    w.setActive('a1');
    const before = a.needs.bladder;
    w.tick(10);
    expect(a.needs.bladder).toBeLessThan(before);
  });

  it('una persona con hambre va a la nevera por su cuenta', () => {
    const w = World.createNew();
    w.setActive('a2');
    const a = w.agent('a1')!;
    fullNeeds(a);
    a.needs.hunger = 10;
    w.tick(0.5);
    expect(a.current?.actionId).toMatch(/eat|snack/);
    w.tick(60);
    expect(a.needs.hunger).toBeGreaterThan(50);
  });

  it('el personaje activo obedece órdenes', () => {
    const w = World.createNew();
    const a = w.activeAgent;
    const shower = w.state.objects.find((o) => o.def === 'shower')!;
    a.needs.hygiene = 30;
    expect(w.command(a.id, 'shower', { kind: 'object', id: shower.id })).toBe(true);
    w.tick(1);
    expect(a.current?.actionId).toBe('shower');
    w.tick(40);
    expect(a.needs.hygiene).toBeGreaterThan(80);
  });

  it('el perro es controlable cuando está activo', () => {
    const w = World.createNew();
    w.setActive('a3');
    const dog = w.activeAgent;
    expect(dog.kind).toBe('pet');
    const ball = w.state.objects.find((o) => o.def === 'ball')!;
    expect(w.optionsFor(dog.id, { kind: 'object', id: ball.id }).map((o) => o.def.id)).toEqual(['play_ball']);
    const fridge = w.state.objects.find((o) => o.def === 'fridge')!;
    expect(w.optionsFor(dog.id, { kind: 'object', id: fridge.id })).toEqual([]);
  });

  it('pasear al perro los saca de la parcela y vuelven', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    const dog = w.agent('a3')!;
    fullNeeds(lucia);
    fullNeeds(dog);
    w.command(lucia.id, 'walk_dog', { kind: 'agent', id: dog.id });
    let wasHidden = false;
    for (let i = 0; i < 200 && !wasHidden; i++) {
      w.tick(0.5);
      wasHidden = lucia.hidden && dog.hidden;
    }
    expect(wasHidden).toBe(true);
    w.tick(60);
    expect(lucia.hidden).toBe(false);
    expect(dog.hidden).toBe(false);
  });

  it('el comedero se vacía y se puede rellenar', () => {
    const w = World.createNew();
    const bowl = w.state.objects.find((o) => o.def === 'bowl')!;
    bowl.stock = 0;
    const dog = w.agent('a3')!;
    expect(w.checkObjectAction(dog, bowl, 'pet_eat').ok).toBe(false);
    const funds = w.household.funds;
    w.command('a1', 'fill_bowl', { kind: 'object', id: bowl.id });
    w.tick(30);
    expect(bowl.stock).toBe(3);
    expect(w.household.funds).toBe(funds - 10);
  });

  it('si la vejiga llega a 0 aparece un charco', () => {
    const w = World.createNew();
    const a = w.activeAgent;
    a.needs.bladder = 0.01;
    w.tick(0.5);
    expect(w.state.objects.some((o) => o.def === 'puddle')).toBe(true);
    expect(a.needs.bladder).toBe(100);
  });

  it('los personajes envejecen cada día', () => {
    const w = World.createNew();
    const age = w.agent('a1')!.ageDays;
    w.tick(24 * 60);
    expect(w.agent('a1')!.ageDays).toBe(age + 1);
  });

  it('una partida larga no se rompe', () => {
    const w = World.createNew();
    w.setActive('a3');
    w.tick(3 * 24 * 60);
    for (const a of w.state.agents) {
      for (const v of Object.values(a.needs)) expect(Number.isFinite(v)).toBe(true);
      expect(Number.isFinite(a.pos.x) && Number.isFinite(a.pos.y)).toBe(true);
    }
    // La familia se cuida sola razonablemente (salvo el activo, que espera órdenes).
    const lucia = w.agent('a1')!;
    expect(lucia.needs.hunger).toBeGreaterThan(0);
  });
});

describe('guardado', () => {
  it('serializa y recupera la partida', () => {
    const w = World.createNew();
    w.tick(90);
    const data = JSON.parse(serialize(w.state));
    const restored = new World(migrate(data));
    expect(restored.state.minutes).toBe(w.state.minutes);
    expect(restored.state.agents.map((a) => a.name)).toEqual(['Lucía', 'Mateo', 'Toby']);
  });

  it('rechaza datos que no son una partida', () => {
    expect(() => migrate({ foo: 1 })).toThrow();
  });
});
