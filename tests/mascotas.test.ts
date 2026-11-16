import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, World } from '../src/sim/world';
import { migrate } from '../src/save/serialize';
import { isolate, madridHomes, oldSave } from './helpers';

describe('mascotas (fase 2)', () => {
  const findObj = (w: World, def: string) => w.state.objects.find((o) => o.def === def)!;

  it('se pueden adoptar las cuatro especies nuevas y cuesta dinero', () => {
    const w = World.createNew();
    w.household.funds = 1000;
    for (const s of ['cat', 'guineapig', 'ferret', 'capybara'] as const) {
      expect(w.adopt(s), s).not.toBeNull();
    }
    expect(w.household.funds).toBe(1000 - 120 - 40 - 90 - 300);
    expect(w.members.map((m) => m.species)).toEqual(['human', 'human', 'dog', 'cat', 'cat', 'guineapig', 'ferret', 'capybara']);
  });

  it('no se puede adoptar sin dinero, sin jaula libre o con la casa llena', () => {
    const w = World.createNew();
    w.household.funds = 10;
    expect(w.canAdopt('capybara').ok).toBe(false);
    w.household.funds = 5000;
    w.adopt('guineapig');
    expect(w.canAdopt('guineapig').reason).toMatch(/jaula/);
    while (w.members.length < 8) w.adopt('ferret');
    expect(w.canAdopt('dog').ok).toBe(false);
  });

  it('la adopción desde el ordenador funciona como orden', () => {
    const w = World.createNew();
    const pc = findObj(w, 'computer');
    w.command('a1', 'adopt', { kind: 'object', id: pc.id }, 'ferret');
    w.tick(40);
    expect(w.members.some((m) => m.species === 'ferret')).toBe(true);
  });

  it('la cobaya vive en su jaula, la ensucia y alguien la limpia', () => {
    const w = World.createNew();
    const gp = w.adopt('guineapig')!;
    const cage = findObj(w, 'cage');
    expect(gp.home).toBe(cage.id);
    w.setActive(gp.id);
    expect(w.command(gp.id, 'move', { kind: 'tile', x: 5, y: 5 })).toBe(false);
    expect(w.optionsFor(gp.id, { kind: 'object', id: findObj(w, 'fridge').id })).toEqual([]);
    gp.needs.bladder = 10;
    w.command(gp.id, 'cage_pee', { kind: 'object', id: cage.id });
    w.tick(10);
    expect(cage.dirt).toBe(1);
    expect(gp.pos).toEqual({ x: cage.x, y: cage.y });
    w.setActive('a1');
    w.command('a1', 'clean_cage', { kind: 'object', id: cage.id });
    w.tick(30);
    expect(cage.dirt).toBe(0);
  });

  it('el arenero se llena y el gato ya no puede usarlo', () => {
    const w = World.createNew();
    const box = findObj(w, 'litterbox');
    box.dirt = 4;
    const cat = w.agent('a4')!;
    expect(w.checkObjectAction(cat, box, 'use_litter').ok).toBe(false);
    expect(w.checkObjectAction(w.agent('a1')!, box, 'clean_litter').ok).toBe(true);
  });

  it('el gato a veces rechaza los mimos', () => {
    const w = World.createNew();
    const cat = w.agent('a4')!;
    const orig = Math.random;
    Math.random = () => 0; // siempre rechaza
    try {
      w.command('a1', 'pet_animal', { kind: 'agent', id: cat.id });
      w.tick(15);
      expect(w.agent('a1')!.current?.actionId).not.toBe('pet_animal');
    } finally {
      Math.random = orig;
    }
  });

  it('el hurón roba la pelota y la esconde junto a su hamaca', () => {
    const w = World.createNew();
    const ferret = w.adopt('ferret')!;
    const ball = findObj(w, 'ball');
    const hammock = findObj(w, 'hammock');
    // Que nadie más esté jugando con la pelota.
    isolate(w, [ferret.id]);
    w.setActive(ferret.id);
    w.command(ferret.id, 'steal', { kind: 'object', id: ball.id });
    w.tick(30);
    expect(Math.hypot(ball.x - hammock.x, ball.y - hammock.y)).toBeLessThanOrEqual(2.9);
  });

  it('la capibara relaja a quien está cerca', () => {
    const w = World.createNew();
    const capy = w.adopt('capybara')!;
    const lucia = w.agent('a1')!;
    w.setActive('a1');
    capy.pos = { x: 6, y: 5 };
    lucia.pos = { x: 7, y: 5 };
    lucia.needs.fun = 50;
    // Que nadie más se meta por medio.
    isolate(w, [capy.id, 'a1']);
    capy.current = { id: 'quieta', actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    w.tick(30);
    // Sin capibara, la diversión habría bajado 3 puntos; con ella sube.
    expect(lucia.needs.fun).toBeGreaterThan(50);
  });

  it('migra una partida de la fase 1 añadiendo los objetos nuevos y el barrio', () => {
    const old = oldSave(1);
    old.objects = old.objects.filter((o: { def: string }) => !['cage', 'pond', 'hammock', 'computer'].includes(o.def));
    const migrated = migrate(old);
    expect(migrated.version).toBe(SAVE_VERSION);
    const home = migrated.objects.filter((o) => o.lotId === 'L0');
    for (const d of ['cage', 'pond', 'hammock', 'computer']) expect(home.some((o) => o.def === d), d).toBe(true);
    expect(madridHomes(migrated.households)).toHaveLength(10);
  });
});
