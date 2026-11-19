import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../src/data/actions';
import { converse } from '../src/sim/conversation';
import { makeAgent } from '../src/sim/neighborhood';
import { findPath, isWalkable } from '../src/sim/pathfinding';
import { relTags } from '../src/sim/relations';
import { getRel, grudgeOf, relKey, setRel } from '../src/sim/social';
import { moveOut } from '../src/sim/systems/breakups';
import { catchAffair } from '../src/sim/systems/gossip';
import { die, moveIn, moveToHousehold, onStageChange } from '../src/sim/systems/lifecycle';
import { beginTask, completeTask } from '../src/sim/systems/tasks';
import { bookTrip, tripsHour } from '../src/sim/systems/trips';
import { World } from '../src/sim/world';
import { fullNeeds, isolate, problems } from './helpers';

function withRandom<T>(value: number, fn: () => T): T {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

describe('regresiones fase 1: tareas y cuerpo', () => {
  it('la habilidad manitas reduce la duración real de repair (acción de objeto)', () => {
    const setupRepair = (level: number) => {
      const w = World.createNew();
      isolate(w, ['a1']);
      const lucia = w.agent('a1')!;
      fullNeeds(lucia);
      lucia.skills = { manitas: level };
      const tv = w.objectsIn('L0').find((o) => o.def === 'tv')!;
      tv.broken = true;
      const tile = w.interactTiles(tv)[0];
      lucia.pos = { ...tile };
      expect(w.command('a1', 'repair', { kind: 'object', id: tv.id })).toBe(true);
      w.tick(0.05);
      return lucia.current!.remaining;
    };

    const baseRem = setupRepair(0);
    const skilledRem = setupRepair(6);
    expect(baseRem).toBe(ACTIONS.repair.duration);
    expect(skilledRem).toBe(ACTIONS.repair.duration * 0.5);
  });

  it('beginTask rechaza acciones self no forzadas si no cumplen checkSelfAction', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    lucia.skills = { musica: 0 };
    const ok = beginTask(w, lucia, { id: 'tc1', actionId: 'concert', byPlayer: true, phase: 'walking', remaining: 0 });
    expect(ok).toBe(false);
    expect(lucia.current).toBeNull();
  });

  it('completeTask corta tras electrocución mortal sin reparar el objeto', () => {
    const w = World.createNew();
    isolate(w, ['a1', 'a2']);
    const lucia = w.agent('a1')!;
    const tv = w.objectsIn('L0').find((o) => o.def === 'tv')!;
    tv.broken = true;
    lucia.skills = { manitas: 0 };
    const task = { id: 'tr1', actionId: 'repair', byPlayer: true, phase: 'acting' as const, remaining: 0, targetObjectId: tv.id };
    lucia.current = task;
    withRandom(0.001, () => completeTask(w, lucia, task));
    expect(w.agent('a1')).toBeUndefined();
    expect(tv.broken).toBe(true);
  });

  it('completeTask conserva pass_out si drink sustituye a.current al terminar', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    lucia.alcohol = 85;
    w.state.minutes = 20 * 60;
    const task = { id: 'td1', actionId: 'drink_beer', byPlayer: true, phase: 'acting' as const, remaining: 0 };
    lucia.current = task;
    completeTask(w, lucia, task);
    expect(lucia.current?.actionId).toBe('pass_out');
  });
});

describe('regresiones fase 1: ciclo de vida, mudanzas y muertes', () => {
  it('moveOut construye grid de la nueva parcela y transfiere el embarazo de la madre', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    const oldHhId = w.household.id;
    w.household.expecting = { parents: ['a1', 'a2'], due: w.state.minutes + 2000, mother: 'a1', known: true };
    const why = moveOut(w, lucia);
    expect(why).toBeUndefined();
    const newHh = w.householdOf(lucia)!;
    expect(newHh.id).not.toBe(oldHhId);
    expect(w.gridOf(newHh.lotId).length).toBeGreaterThan(0);
    expect(newHh.expecting?.mother).toBe('a1');
    expect(w.household.expecting).toBeUndefined();
    expect(problems(w)).toEqual([]);
  });

  it('moveToHousehold y moveIn transfieren el embarazo si se muda la madre', () => {
    const w = World.createNew();
    const mother = w.state.agents.find((a) => a.kind === 'person' && a.sex === 'f' && !w.isPlayerMember(a) && !a.role)!;
    const srcHh = w.householdOf(mother)!;
    const targetHh = w.state.households.find((h) => h.id !== srcHh.id && h.id !== w.household.id && h.memberIds.some((id) => w.agent(id)?.kind === 'person'))!;
    srcHh.expecting = { parents: [mother.id], due: w.state.minutes + 2000, mother: mother.id, known: true };
    moveToHousehold(w, mother, targetHh);
    expect(targetHh.expecting?.mother).toBe(mother.id);
    expect(srcHh.expecting).toBeUndefined();

    w.household.expecting = undefined;
    moveIn(w, mother);
    expect(w.householdOf(mother)?.expecting?.mother).toBe(mother.id);
    expect(targetHh.expecting).toBeUndefined();
  });

  it('onStageChange limpia estudios universitarios al hacerse elder', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    lucia.study = { degree: 'medicina', progress: 4 };
    lucia.job = { career: 'uni', level: 1, perf: 60 };
    onStageChange(w, lucia, 'elder');
    expect(lucia.study).toBeUndefined();
    expect(lucia.job).toBeUndefined();
  });

  it('die limpia tareas dependientes, dilemas, programación, embarazo y bebés huérfanos sin romper activeAgent', () => {
    const w = World.createNew();
    // Dejamos solo personas (sin mascotas) y añadimos un bebé para probar hogar huérfano.
    for (const pet of w.members.filter((m) => m.kind === 'pet')) die(w, pet, 'old');
    const lucia = w.agent('a1')!;
    const mateo = w.agent('a2')!;
    const crib = w.objectsIn('L0').find((o) => o.def === 'crib')!;
    const baby = makeAgent({ id: w.newId('a'), name: 'Pepe', species: 'human', ageDays: 0, color: 0, householdId: w.household.id, lotId: 'L0', x: crib.x, y: crib.y });
    baby.home = crib.id;
    w.state.agents.push(baby);
    w.household.memberIds.push(baby.id);

    lucia.current = { id: 'p_chat', actionId: 'chat', byPlayer: false, phase: 'acting', remaining: 10, passiveOf: mateo.id };
    w.state.dilemma = { id: 'horas_extra', agentId: mateo.id, until: w.state.minutes + 100 };
    w.state.schedule = [{ id: 'sch1', agentId: mateo.id, at: w.state.minutes + 60, actionId: 'sleep', target: { kind: 'object', id: crib.id } }];
    w.household.expecting = { parents: [lucia.id, mateo.id], due: w.state.minutes + 2000, mother: mateo.id, known: true };

    die(w, mateo, 'old');
    expect(lucia.current).toBeNull();
    expect(w.state.dilemma).toBeUndefined();
    expect(w.state.schedule).toEqual([]);
    expect(w.household.expecting).toBeUndefined();

    // Muere la última persona no bebé: el bebé huérfano se retira y viewLotId sigue seguro.
    die(w, lucia, 'old');
    expect(w.agent(baby.id)).toBeUndefined();
    expect(w.state.familyGone).toBe(true);
    expect(() => w.viewLotId).not.toThrow();
    expect(w.activeAgent).toBeTruthy();
  });
});

describe('regresiones fase 1: viajes, relaciones, rencores y culebrones', () => {
  it('tripsHour ignora presos o llegadas infinitas y no duplica noticias', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    const mateo = w.agent('a2')!;
    const dog = w.agent('a3')!;
    expect(bookTrip(w, mateo)).toBe(true);
    lucia.travel = { from: 'L0', to: 'L0', arrive: w.state.minutes + 10_000, reason: 'jail' };
    dog.travel = { from: 'L0', to: 'L0', arrive: Number.POSITIVE_INFINITY };
    w.state.minutes = w.household.trip!.start + 10;
    tripsHour(w);
    tripsHour(w);
    expect(lucia.travel.reason).toBe('jail');
    expect(dog.travel.arrive).toBe(Number.POSITIVE_INFINITY);
    expect(mateo.travel?.reason).toBe('trip');
    expect((w.state.news ?? []).filter((n) => n.text.includes('fin de semana'))).toHaveLength(1);
  });

  it('converse actualiza attend (rel.last) cuando el resultado no es malo', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    const mateo = w.agent('a2')!;
    w.state.minutes += 5 * 1440;
    const key = relKey(lucia.id, mateo.id);
    w.state.rels[key].last = 1;
    withRandom(0.0, () => converse(w, lucia, mateo, 'dia'));
    expect(getRel(w.state, lucia.id, mateo.id).last).toBe(w.day);
  });

  it('kinTag usa el sexo del hijo/hija y setupFamilyLife rellena parents en vecinos jóvenes', () => {
    const w = World.createNew();
    const lucia = w.agent('a1')!;
    const son = makeAgent({ id: 'a_son', name: 'Hugo', species: 'human', ageDays: 5, color: 0, householdId: 'h1', lotId: 'L0', x: 5, y: 5 });
    son.sex = 'm';
    son.parents = ['a1'];
    const daughter = makeAgent({ id: 'a_dau', name: 'Alba', species: 'human', ageDays: 5, color: 0, householdId: 'h1', lotId: 'L0', x: 6, y: 5 });
    daughter.sex = 'f';
    daughter.parents = ['a1'];
    w.state.agents.push(son, daughter);
    setRel(w.state, lucia.id, son.id, { f: 50, r: 0, kin: true });
    setRel(w.state, lucia.id, daughter.id, { f: 50, r: 0, kin: true });

    expect(relTags(w, lucia, son).some((t) => t.label === 'Su hijo')).toBe(true);
    expect(relTags(w, lucia, daughter).some((t) => t.label === 'Su hija')).toBe(true);

    const neighbourYoung = w.state.agents.filter((a) => a.kind === 'person' && !w.isPlayerMember(a) && !a.role && w.stageOf(a) !== 'adult' && a.ageDays < 20);
    for (const y of neighbourYoung) {
      const h = w.householdOf(y);
      const hasAdults = h?.memberIds.some((id) => {
        const m = w.agent(id);
        return m && m.kind === 'person' && m.ageDays >= 20;
      });
      if (hasAdults) expect(y.parents?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('grudgeOf limpia el rencor simétricamente tras perdon', () => {
    const rel = {
      f: 0,
      r: 0,
      mem: [
        { k: 'pelea', d: 1, by: 'a1' },
        { k: 'perdon', d: 1, by: 'a1' },
      ],
    };
    expect(grudgeOf(rel, 'a1', 'a2', 2)).toBeUndefined();
    expect(grudgeOf(rel, 'a2', 'a1', 2)).toBeUndefined();
  });

  it('catchAffair registra fecha de ruptura (split) fuera de culebrones activos', () => {
    const w = World.createNew();
    const h = w.state.households.find((x) => {
      if (x.id === w.household.id) return false;
      const people = x.memberIds.map((id) => w.agent(id)!).filter((a) => a?.kind === 'person');
      return people.length >= 2 && !!getRel(w.state, people[0].id, people[1].id).status;
    })!;
    const [cheater, betrayed] = h.memberIds.map((id) => w.agent(id)!).filter((a) => a.kind === 'person');
    const lover = w.state.agents.find((a) => a.kind === 'person' && a.householdId !== h.id && a.householdId !== w.household.id && !a.role)!;
    withRandom(0.1, () => catchAffair(w, cheater, lover, betrayed, 'pillado'));
    expect(getRel(w.state, cheater.id, betrayed.id).split).toBe(w.day);
  });
});

describe('regresiones fase 4: pathfinding e índices autovalidados', () => {
  it('findPath con Min-Heap evita diagonales cortando esquinas y encuentra ruta óptima', () => {
    const grid = [
      [true, false, true],
      [false, true, true],
      [true, true, true],
    ];
    const path = findPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(path).toBeNull();

    const openGrid = [
      [true, true, true, true],
      [true, false, false, true],
      [true, true, true, true],
    ];
    const p2 = findPath(openGrid, { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(p2).not.toBeNull();
    expect(p2!.every((pt) => isWalkable(openGrid, pt.x, pt.y))).toBe(true);
    expect(p2).toHaveLength(3);
  });

  it('cachés de World reflejan altas y bajas directas en state', () => {
    const w = World.createNew();
    const a = makeAgent({ id: 'a_cache_test', name: 'Prueba', species: 'human', ageDays: 25, color: 0, householdId: w.household.id, lotId: 'L0', x: 5, y: 5 });
    w.state.agents.push(a);
    expect(w.agent('a_cache_test')).toBe(a);
    w.state.agents = w.state.agents.filter((x) => x.id !== 'a_cache_test');
    expect(w.agent('a_cache_test')).toBeUndefined();

    const objId = 'o_cache_test';
    const obj = { id: objId, def: 'chair', lotId: 'L0', x: 1, y: 1 };
    w.state.objects.push(obj);
    expect(w.object(objId)).toBe(obj);
    expect(w.objectsIn('L0').some((o) => o.id === objId)).toBe(true);
    w.state.objects = w.state.objects.filter((o) => o.id !== objId);
    expect(w.object(objId)).toBeUndefined();
    expect(w.objectsIn('L0').some((o) => o.id === objId)).toBe(false);
  });
});
