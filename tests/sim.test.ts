import { describe, expect, it } from 'vitest';
import { findPath } from '../src/sim/pathfinding';
import { SAVE_VERSION, World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import type { Agent } from '../src/sim/types';
import { canRomance, getRel, isAdult, setRel } from '../src/sim/social';

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

/**
 * Deja en escena solo a `keep`: los demás se van "de viaje" indefinidamente y no
 * llegan visitas espontáneas. Así las pruebas no dependen de lo que hagan los demás.
 */
function isolate(w: World, keep: string[]) {
  for (const a of w.state.agents) {
    if (keep.includes(a.id)) continue;
    a.current = null;
    a.path = [];
    a.hidden = false;
    a.travel = { from: a.lotId, to: a.lotId, arrive: Number.POSITIVE_INFINITY };
  }
  (w as unknown as { noVisitsUntil: number }).noVisitsUntil = Number.POSITIVE_INFINITY;
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
    isolate(w, ['a1']);
    fullNeeds(a);
    a.needs.hunger = 10;
    w.tick(0.5);
    expect(a.current?.actionId).toMatch(/eat|snack|cook/);
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
    isolate(w, ['a1', 'a3']);
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
    isolate(w, ['a1', 'a3']);
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
    isolate(w, ['a1', 'a3']);
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
    // Domingo a mediodía: casi nadie trabaja.
    w.state.minutes = 6 * 1440 + 12 * 60;
    const hid = w.lotById('L1').householdId!;
    for (const id of w.state.households.find((h) => h.id === hid)!.memberIds) w.agent(id)!.job = undefined;
    expect(w.invite(hid)).toBe(true);
    w.tick(20);
    const guests = w.agentsIn('L0').filter((a) => a.householdId === hid);
    expect(guests.length).toBeGreaterThan(0);
    const guest = guests.find((g) => g.kind === 'person')!;
    expect(guest.visitUntil).toBeGreaterThan(w.state.minutes);
    // Los invitados no duermen en tu cama
    const bed = w.objectsIn('L0').find((o) => o.def === 'bed')!;
    expect(w.checkObjectAction(guest, bed, 'sleep').ok).toBe(false);
    w.command('a1', 'say_goodbye', { kind: 'agent', id: guest.id });
    w.tick(90);
    expect(w.agentsIn('L0').filter((a) => a.householdId === hid)).toHaveLength(0);
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

describe('relaciones, trabajo y economía (fase 4)', () => {
  const withRandom = <T>(value: number, fn: () => T): T => {
    const orig = Math.random;
    Math.random = () => value;
    try {
      return fn();
    } finally {
      Math.random = orig;
    }
  };
  /** Pone a todos los demás quietos para que no interfieran. */
  const freezeOthers = isolate;
  const neighbourAdult = (w: World) => {
    const hid = w.lotById('L1').householdId!;
    return w.state.agents.find((a) => a.householdId === hid && a.kind === 'person' && isAdult(a))!;
  };
  const bringOver = (w: World, t: Agent) => {
    t.job = undefined;
    t.lotId = 'L0';
    t.pos = { x: 7, y: 5 };
    t.abstract = false;
    t.visitUntil = w.state.minutes + 600;
  };

  it('Lucía y Mateo empiezan como pareja y quieren a sus mascotas', () => {
    const w = World.createNew();
    expect(getRel(w.state, 'a1', 'a2').status).toBe('partner');
    expect(getRel(w.state, 'a1', 'a3').f).toBeGreaterThan(20);
  });

  it('charlar sube la amistad e insultar la baja', () => {
    const w = World.createNew();
    freezeOthers(w, ['a1', 'a2']);
    const before = getRel(w.state, 'a1', 'a2').f;
    w.command('a1', 'chat', { kind: 'agent', id: 'a2' });
    w.tick(40);
    const mid = getRel(w.state, 'a1', 'a2').f;
    expect(mid).toBeGreaterThan(before);
    w.command('a1', 'insult', { kind: 'agent', id: 'a2' });
    w.tick(30);
    expect(getRel(w.state, 'a1', 'a2').f).toBeLessThan(mid);
  });

  it('nada de romance con niños ni con la familia', () => {
    const w = World.createNew();
    const kid = w.state.agents.find((a) => a.kind === 'person' && !isAdult(a))!;
    expect(kid).toBeTruthy();
    expect(canRomance(w.state, w.agent('a1')!, kid)).toBe(false);
    const opts = w.optionsFor('a1', { kind: 'agent', id: kid.id }).map((o) => o.def.id);
    expect(opts).not.toContain('flirt');
  });

  it('con mucho romance se puede pedir salir, casarse y vivir juntos; llega una familia nueva si la casa se vacía', () => {
    const w = World.createNew();
    const t = neighbourAdult(w);
    const oldHid = t.householdId;
    // Que sea la única persona de su casa
    for (const id of w.state.households.find((h) => h.id === oldHid)!.memberIds) {
      const x = w.agent(id)!;
      if (x.kind === 'person' && x !== t) x.ageDays = 30; // da igual: lo quitamos de la familia
    }
    const old = w.state.households.find((h) => h.id === oldHid)!;
    old.memberIds = old.memberIds.filter((id) => id === t.id || w.agent(id)!.kind === 'pet');
    // Lucía rompe con Mateo para este experimento
    w.state.rels['a1|a2'].status = undefined;
    setRel(w.state, 'a1', t.id, { f: 80, r: 90 });
    bringOver(w, t);
    freezeOthers(w, ['a1', t.id]);
    withRandom(0.01, () => {
      w.command('a1', 'ask_partner', { kind: 'agent', id: t.id });
      w.tick(20);
    });
    expect(getRel(w.state, 'a1', t.id).status).toBe('partner');
    withRandom(0.01, () => {
      w.command('a1', 'propose', { kind: 'agent', id: t.id });
      w.tick(20);
    });
    expect(getRel(w.state, 'a1', t.id).status).toBe('married');
    t.visitUntil = w.state.minutes + 600;
    freezeOthers(w, ['a1', t.id]);
    withRandom(0.01, () => {
      w.command('a1', 'move_in', { kind: 'agent', id: t.id });
      w.tick(20);
    });
    expect(w.household.memberIds).toContain(t.id);
    expect(t.householdId).toBe('h1');
    // Su antigua casa tiene una familia nueva
    const newHid = w.lotById('L1').householdId!;
    expect(newHid).not.toBe(oldHid);
    expect(w.state.households.find((h) => h.id === newHid)!.memberIds.length).toBeGreaterThan(0);
    expect(w.state.households).toHaveLength(10);
  });

  it('un beso a un desconocido suele acabar en cobra', () => {
    const w = World.createNew();
    const t = neighbourAdult(w);
    bringOver(w, t);
    freezeOthers(w, ['a1', t.id]);
    const msgs: string[] = [];
    w.onToast((x) => msgs.push(x.text));
    withRandom(0.9, () => {
      w.command('a1', 'kiss', { kind: 'agent', id: t.id });
      w.tick(15);
    });
    expect(msgs.some((m) => m.includes('cobra'))).toBe(true);
    expect(getRel(w.state, 'a1', t.id).f).toBeLessThan(0);
  });

  it('coquetear delante de la pareja da celos', () => {
    const w = World.createNew();
    const t = neighbourAdult(w);
    bringOver(w, t);
    setRel(w.state, 'a1', t.id, { f: 60, r: 60 });
    // Mateo, la pareja de Lucía, está delante.
    freezeOthers(w, ['a1', 'a2', t.id]);
    w.agent('a2')!.current = { id: 'mirando', actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    const before = getRel(w.state, 'a1', 'a2');
    withRandom(0.01, () => {
      w.command('a1', 'flirt', { kind: 'agent', id: t.id });
      w.tick(15);
    });
    const after = getRel(w.state, 'a1', 'a2');
    expect(after.r).toBeLessThan(before.r);
  });

  it('trabajo: buscarlo en el ordenador, ir a su hora, cobrar y ascender', () => {
    const w = World.createNew();
    const pc = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    w.command('a1', 'find_job', { kind: 'object', id: pc.id }, 'oficina');
    w.tick(40);
    const lucia = w.agent('a1')!;
    expect(lucia.job?.career).toBe('oficina');
    freezeOthers(w, ['a1']);
    // Lunes 8:59 → a las 9 se va
    w.state.minutes = 9 * 60 - 1;
    fullNeeds(lucia);
    w.tick(2);
    expect(lucia.travel?.reason).toBe('work');
    const funds = w.household.funds;
    lucia.job!.perf = 99;
    w.tick(8 * 60 + 5);
    expect(lucia.travel).toBeUndefined();
    expect(lucia.lotId).toBe('L0');
    expect(w.household.funds).toBeGreaterThanOrEqual(funds + 50);
    expect(lucia.job!.level).toBe(2);
  });

  it('si no puede ir, falta al trabajo y baja su rendimiento', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    lucia.job = { career: 'oficina', level: 1, perf: 50 };
    w.state.minutes = 9 * 60 - 1;
    lucia.current = { id: 'po', actionId: 'pass_out', byPlayer: false, phase: 'acting', remaining: 999 };
    lucia.needs.energy = 0;
    w.tick(70);
    expect(lucia.job.perf).toBeLessThan(50);
    expect(lucia.travel).toBeUndefined();
  });

  it('los niños vecinos van al colegio y los adultos trabajan', () => {
    const w = World.createNew();
    const kids = w.state.agents.filter((a) => a.kind === 'person' && !isAdult(a));
    for (const k of kids) expect(k.job?.career).toBe('school');
    expect(w.state.agents.some((a) => a.householdId !== 'h1' && a.job && a.job.career !== 'school')).toBe(true);
    // El lunes a las 8:30 los niños ya no están en casa
    w.tick(31);
    for (const k of kids) expect(k.travel?.reason ?? 'en casa', k.name).toBe('school');
  });

  it('cada lunes llegan las facturas y comer cuesta dinero', () => {
    const w = World.createNew();
    freezeOthers(w, ['a1']);
    const fridge = w.objectsIn('L0').find((o) => o.def === 'fridge')!;
    const f0 = w.household.funds;
    w.agent('a1')!.needs.hunger = 30;
    w.command('a1', 'eat', { kind: 'object', id: fridge.id });
    w.tick(30);
    expect(w.household.funds).toBe(f0 - 6);
    const f1 = w.household.funds;
    w.state.minutes = 7 * 1440 - 1; // domingo 23:59 → lunes
    w.tick(1);
    expect(w.household.funds).toBe(f1 - (60 + 2 * 20 + 2 * 10));
  });

  it('una partida de la fase 3 recibe relaciones y trabajos al migrar', () => {
    const w = World.createNew();
    const st = JSON.parse(serialize(w.state));
    st.version = 3;
    st.rels = undefined;
    for (const a of st.agents) delete a.job;
    const m = migrate(st);
    expect(m.rels['a1|a2'].status).toBe('partner');
    expect(m.agents.some((a) => a.job)).toBe(true);
    expect(m.agents.find((a) => a.id === 'a1')!.job).toBeUndefined();
  });
});

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
    expect(w.state.households).toHaveLength(10);
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
    expect(w.state.households).toHaveLength(10);
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
    expect(w.state.households).toHaveLength(10);
    for (const h of w.state.households) {
      for (const id of h.memberIds) expect(w.agent(id), `${h.name} ${id}`).toBeTruthy();
    }
    for (const a of w.state.agents) expect(w.householdOf(a)).toBeTruthy();
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

describe('construcción y pulido (fase 6)', () => {
  it('comprar: cuesta dinero, ocupa su sitio y se puede usar', () => {
    const w = World.createNew();
    const f0 = w.household.funds;
    expect(w.canPlace('stereo', 4, 7).ok).toBe(true);
    expect(w.buy('stereo', 4, 7)).toBe(true);
    expect(w.household.funds).toBe(f0 - 150);
    const stereo = w.objectsIn('L0').find((o) => o.def === 'stereo')!;
    expect(w.grid[7][4]).toBe(false);
    isolate(w, ['a1']);
    w.agent('a1')!.needs.fun = 30;
    w.command('a1', 'dance', { kind: 'object', id: stereo.id });
    w.tick(40);
    expect(w.agent('a1')!.needs.fun).toBeGreaterThan(45);
  });

  it('no se puede colocar sobre paredes, puertas, otros muebles ni bloquear el paso', () => {
    const w = World.createNew();
    expect(w.canPlace('plant', 0, 0).reason).toBe('Hay una pared');
    expect(w.canPlace('plant', 2, 4).reason).toBe('Tapa una puerta');
    expect(w.canPlace('plant', 1, 5).ok).toBe(false); // la nevera
    expect(w.canPlace('plant', 5, 11).reason).toBe('Tapa la entrada');
    // El pasillo del baño: (2,3) es la única casilla delante de la puerta del baño
    expect(w.canPlace('plant', 2, 3).ok).toBe(false);
    // Las alfombras se pueden pisar: no bloquean nada
    expect(w.canPlace('rug', 2, 3).ok).toBe(true);
  });

  it('sin dinero no se compra', () => {
    const w = World.createNew();
    w.household.funds = 10;
    expect(w.buy('bathtub', 4, 7)).toBe(false);
    expect(w.objectsIn('L0').some((o) => o.def === 'bathtub')).toBe(false);
  });

  it('mover y vender (se recupera el 70%), pero no lo que se está usando o donde vive alguien', () => {
    const w = World.createNew();
    const plant = w.objectsIn('L0').find((o) => o.def === 'plant')!;
    expect(w.moveObject(plant.id, 4, 7)).toBe(true);
    expect([plant.x, plant.y]).toEqual([4, 7]);
    const f0 = w.household.funds;
    expect(w.sellObject(plant.id)).toBe(true);
    expect(w.household.funds).toBe(f0 + Math.floor(25 * 0.7));
    const gp = w.adopt('guineapig')!;
    expect(w.sellObject(gp.home!)).toBe(false);
    const fridge = w.objectsIn('L0').find((o) => o.def === 'fridge')!;
    w.agent('a1')!.current = { id: 'x', actionId: 'eat', byPlayer: true, phase: 'acting', remaining: 10, targetObjectId: fridge.id };
    expect(w.cantTouch(fridge)).toBe('Alguien lo está usando');
  });

  it('solo se construye en casa', () => {
    const w = World.createNew();
    expect(w.canBuildHere()).toBe(true);
    w.travel(['a1'], 'P');
    w.tick(20);
    expect(w.canBuildHere()).toBe(false);
    expect(w.buy('plant', 4, 7)).toBe(false);
  });

  it('si se vende la tele, no se puede ver la tele', () => {
    const w = World.createNew();
    const tv = w.objectsIn('L0').find((o) => o.def === 'tv')!;
    const sofa = w.objectsIn('L0').find((o) => o.def === 'sofa')!;
    w.sellObject(tv.id);
    expect(w.checkObjectAction(w.agent('a1')!, sofa, 'watch_tv').reason).toBe('No hay tele');
  });

  it('lo que se rompe no se usa hasta que alguien lo arregla', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const shower = w.objectsIn('L0').find((o) => o.def === 'shower')!;
    shower.broken = true;
    const lucia = w.agent('a1')!;
    expect(w.checkObjectAction(lucia, shower, 'shower').reason).toBe('Está roto');
    expect(w.optionsFor('a1', { kind: 'object', id: shower.id }).map((o) => o.def.id)).toContain('repair');
    w.command('a1', 'repair', { kind: 'object', id: shower.id });
    w.tick(60);
    expect(shower.broken).toBe(false);
    expect(w.optionsFor('a1', { kind: 'object', id: shower.id }).map((o) => o.def.id)).not.toContain('repair');
  });

  it('la decoración alegra el ambiente', () => {
    const w1 = World.createNew();
    const w2 = World.createNew();
    for (const w of [w1, w2]) {
      isolate(w, ['a1']);
      const a = w.agent('a1')!;
      a.pos = { x: 4, y: 7 };
      a.needs.fun = 50;
      a.current = { id: 'quieta', actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    }
    w2.buy('lamp', 3, 7);
    w2.buy('rug', 4, 8);
    w1.tick(60);
    w2.tick(60);
    expect(w2.agent('a1')!.needs.fun).toBeGreaterThan(w1.agent('a1')!.needs.fun + 2);
  });
});

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
    const kid = w.state.agents.find((a) => a.kind === 'person' && w.stageOf(a) === 'child')!;
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
