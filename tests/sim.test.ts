import { describe, expect, it } from 'vitest';
import { findPath } from '../src/sim/pathfinding';
import { SAVE_VERSION, World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import type { Agent } from '../src/sim/types';

/** Una partida con el formato de una versión anterior (sin barrio). */
function oldSave(version: number) {
  const w = World.createNew();
  const st = JSON.parse(serialize(w.state));
  st.version = version;
  st.agents = st.agents.filter((a: { householdId: string }) => a.householdId === 'h1');
  st.objects = st.objects.filter((o: { lotId: string }) => o.lotId === 'L0');
  st.households = st.households.filter((h: { id: string }) => h.id === 'h1');
  for (const x of [...st.agents, ...st.objects, ...st.households]) delete x.lotId;
  delete st.lots;
  return st;
}

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

  it('en cada parcela, desde la entrada se llega a todas las casillas libres y a todos los objetos', () => {
    const w = World.createNew();
    for (const lot of w.state.lots) {
      const grid = w.gridOf(lot.id);
      const layout = w.layoutOf(lot.id);
      for (let y = 0; y < layout.h; y++) {
        for (let x = 0; x < layout.w; x++) {
          if (!grid[y][x]) continue;
          expect(findPath(grid, layout.entrance, { x, y }), `${lot.id} casilla ${x},${y}`).not.toBeNull();
        }
      }
      for (const o of w.objectsIn(lot.id)) {
        if (!w.objDef(o).actions.length) continue;
        const tiles = w.interactTiles(o);
        expect(tiles.some((t) => findPath(grid, layout.entrance, t)), `${lot.id} ${o.def}`).toBe(true);
      }
    }
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
    for (const o of w.agentsIn('L0')) if (o !== a) o.current = { id: `i${o.id}`, actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
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
    for (const p of w.state.agents) if (p.kind === 'pet') fullNeeds(p);
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
    expect(restored.members.map((a) => a.name)).toEqual(['Lucía', 'Mateo', 'Toby', 'Misi']);
    expect(restored.state.agents.length).toBe(w.state.agents.length);
  });

  it('rechaza datos que no son una partida', () => {
    expect(() => migrate({ foo: 1 })).toThrow();
  });
});

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
    for (const a of w.state.agents) {
      if (a !== ferret) a.current = { id: `i${a.id}`, actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    }
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
    for (const a of w.agentsIn('L0')) a.current = { id: `x${a.id}`, actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
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
    expect(migrated.households).toHaveLength(10);
  });
});

describe('partida larga con todas las especies', () => {
  it('la familia y sus mascotas se cuidan solas durante 3 días', () => {
    const w = World.createNew();
    w.household.funds = 5000;
    for (const s of ['guineapig', 'ferret', 'capybara'] as const) w.adopt(s);
    // Nadie activo: todos van en autonomía.
    w.state.activeAgentId = 'nadie';
    const problems: string[] = [];
    w.onToast((t) => {
      if (/desplomado|pis encima|pis en casa/.test(t.text)) problems.push(t.text);
    });
    w.tick(3 * 24 * 60);
    // Algún accidente aislado puede pasar; lo que no puede es que sea lo normal.
    expect(problems.length, problems.join('\n')).toBeLessThanOrEqual(2);
    for (const a of w.state.agents) expect(a.needs.hunger, a.name).toBeGreaterThan(0);
  });
});

describe('barrio (fase 3)', () => {
  const PARK = 'P';

  it('hay 10 familias, sus casas y el parque, con todas las especies', () => {
    const w = World.createNew();
    expect(w.state.households).toHaveLength(10);
    expect(w.state.lots.filter((l) => l.kind === 'home')).toHaveLength(10);
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
    expect(w.state.households).toHaveLength(10);
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
    w.state.minutes = 12 * 60;
    expect(w.invite('h2')).toBe(true);
    w.tick(20);
    const guests = w.agentsIn('L0').filter((a) => a.householdId === 'h2');
    expect(guests.length).toBeGreaterThan(0);
    const guest = guests.find((g) => g.kind === 'person')!;
    expect(guest.visitUntil).toBeGreaterThan(w.state.minutes);
    // Los invitados no duermen en tu cama
    const bed = w.objectsIn('L0').find((o) => o.def === 'bed')!;
    expect(w.checkObjectAction(guest, bed, 'sleep').ok).toBe(false);
    w.command('a1', 'say_goodbye', { kind: 'agent', id: guest.id });
    w.tick(90);
    expect(w.agentsIn('L0').filter((a) => a.householdId === 'h2')).toHaveLength(0);
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
    const out = w.state.agents.filter((a) => a.householdId !== 'h1' && a.lotId !== w.householdOf(a)!.lotId && !a.travel);
    expect(out.map((a) => `${a.name}@${a.lotId}`)).toEqual([]);
  });
});
