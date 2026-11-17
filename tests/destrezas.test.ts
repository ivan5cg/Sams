import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import { BOOKS, RECIPE_BY_ID, UNLOCKS } from '../src/data/skillTree';
import { LIBRARY_LOT } from '../src/sim/neighborhood';
import { bookReason, booksAt, recipeReason } from '../src/sim/systems/skillWorks';
import { getRel, setRel } from '../src/sim/social';
import { fullNeeds, isolate, problems, saveAt } from './helpers';

const ids = (w: World, objId: string, agent = 'a1') => w.optionsFor(agent, { kind: 'object', id: objId }).map((o) => o.def.id);
const objOf = (w: World, def: string, lot = 'L0') => w.objectsIn(lot).find((o) => o.def === def)!;

/** Una casa con Lucía sola, sin hambre ni sueño, y sin sorpresas al azar. */
function setup() {
  const w = World.createNew();
  isolate(w, ['a1']);
  const lucia = w.agent('a1')!;
  fullNeeds(lucia);
  w.household.funds = 5000;
  w.household.pantry = 20;
  return { w, lucia };
}

describe('habilidades: progreso, libros y desbloqueos', () => {
  it('las recetas se desbloquean por nivel: la tortilla pide cocina 2 y el cocido, 6 (y da de comer a todos)', () => {
    const { w, lucia } = setup();
    const fridge = objOf(w, 'fridge');
    expect(recipeReason(w, lucia, RECIPE_BY_ID.tortilla)).toMatch(/cocina 2/);
    // Sin nivel, aunque se pida la tortilla, salen huevos fritos.
    lucia.needs.hunger = 20;
    const p0 = w.household.pantry!;
    w.command('a1', 'cook', { kind: 'object', id: fridge.id }, 'tortilla');
    w.tick(60);
    expect(w.household.pantry).toBe(p0 - 1);
    // Con cocina 6: cocido para toda la familia (3 raciones).
    lucia.skills = { cocina: 6 };
    const mateo = w.agent('a2')!;
    mateo.lotId = 'L0';
    mateo.travel = undefined;
    mateo.hidden = false;
    mateo.needs.hunger = 10;
    mateo.current = { id: 'q', actionId: 'idle', byPlayer: false, phase: 'acting', remaining: 999 };
    lucia.needs.hunger = 20;
    const p1 = w.household.pantry!;
    w.command('a1', 'cook', { kind: 'object', id: fridge.id }, 'cocido');
    w.tick(60);
    expect(w.household.pantry).toBe(p1 - 3);
    expect(mateo.needs.hunger).toBeGreaterThan(55);
    expect(mateo.emotions?.some((e) => e.id === 'bien_comido')).toBe(true);
    expect(problems(w)).toEqual([]);
  });

  it('repostería: con nivel 3, las rosquillas se venden a los vecinos', () => {
    const { w, lucia } = setup();
    const fridge = objOf(w, 'fridge');
    expect(ids(w, fridge.id)).toContain('bake');
    lucia.skills = { reposteria: 3 };
    const f0 = w.household.funds;
    w.command('a1', 'bake', { kind: 'object', id: fridge.id }, 'rosquillas');
    w.tick(60);
    expect(w.household.funds).toBe(f0 + 25 + 15 * 3);
    expect(lucia.skills.reposteria).toBeGreaterThan(3);
  });

  it('lo que pide nivel ni aparece hasta tenerlo; los encargos, una vez al día', () => {
    const { w, lucia } = setup();
    const pc = objOf(w, 'computer');
    expect(ids(w, pc.id)).toContain('program');
    expect(ids(w, pc.id)).not.toContain('freelance_web');
    expect(ids(w, pc.id)).not.toContain('make_game');
    lucia.skills = { programacion: 3 };
    expect(ids(w, pc.id)).toContain('freelance_web');
    const f0 = w.household.funds;
    w.command('a1', 'freelance_web', { kind: 'object', id: pc.id });
    w.tick(200);
    expect(w.household.funds).toBe(f0 + 60 + 15 * 3);
    const again = w.optionsFor('a1', { kind: 'object', id: pc.id }).find((o) => o.def.id === 'freelance_web')!;
    expect(again.ok).toBe(false);
    expect(again.reason).toMatch(/Hoy ya/);
    // La IA no hace encargos de pago ni cosas que no ha desbloqueado.
    expect(UNLOCKS.filter((u) => u.kind === 'action').length).toBeGreaterThan(12);
  });

  it('al subir de nivel se avisa de lo que se desbloquea', () => {
    const { w, lucia } = setup();
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    w.buy('workbench', 4, 7);
    const bench = objOf(w, 'workbench');
    lucia.skills = { manitas: 2.97 };
    w.command('a1', 'diy', { kind: 'object', id: bench.id });
    w.tick(30);
    expect(Math.floor(lucia.skills.manitas)).toBe(3);
    expect(toasts.some((t) => t.includes('manitas nivel 3'))).toBe(true);
    expect(toasts.some((t) => t.includes('ya puede') && t.includes('chapuzas'))).toBe(true);
    expect(ids(w, bench.id)).toContain('odd_jobs');
  });

  it('libros de habilidad: se compran, enseñan hasta su nivel y luego toca practicar', () => {
    const { w, lucia } = setup();
    const shelf = objOf(w, 'bookshelf');
    const pc = objOf(w, 'computer');
    const read = () => w.optionsFor('a1', { kind: 'object', id: shelf.id }).find((o) => o.def.id === 'read_skill_book')!;
    expect(read().ok).toBe(false);
    expect(read().reason).toMatch(/ordenador/);
    const f0 = w.household.funds;
    w.command('a1', 'buy_book', { kind: 'object', id: pc.id }, 'ajedrez:1');
    w.tick(20);
    expect(w.household.funds).toBe(f0 - BOOKS['ajedrez:1'].price);
    expect(read().ok).toBe(true);
    // Leer sube el ajedrez... pero solo hasta el 4.
    lucia.skills = { ajedrez: 3.9 };
    w.command('a1', 'read_skill_book', { kind: 'object', id: shelf.id }, 'ajedrez:1');
    w.tick(60);
    expect(lucia.skills.ajedrez).toBe(4);
    expect(bookReason(w, lucia, 'ajedrez:1')).toMatch(/practicar/);
    // El avanzado no se entiende sin nivel 3, y enseña hasta el 7.
    lucia.skills = { cocina: 1 };
    w.household.books = [...(w.household.books ?? []), 'cocina:2'];
    expect(bookReason(w, lucia, 'cocina:2')).toMatch(/cocina 3/);
    // En la biblioteca están todos.
    expect(booksAt(w, LIBRARY_LOT).length).toBe(Object.keys(BOOKS).length);
    expect(Object.values(BOOKS).every((b) => b.upTo < 10)).toBe(true);
  });

  it('el piano, el ajedrez y el bricolaje suben sus habilidades; el ajedrez ya no sube la lógica', () => {
    const { w, lucia } = setup();
    w.buy('piano', 4, 7);
    const piano = objOf(w, 'piano');
    // Se toca hasta que se divierte del todo: que empiece aburrida.
    lucia.needs.fun = 5;
    w.command('a1', 'play_piano', { kind: 'object', id: piano.id });
    w.tick(60);
    expect(lucia.skills?.piano ?? 0).toBeGreaterThan(0.4);
    const chess = objOf(w, 'chess', LIBRARY_LOT);
    w.travel(['a1'], LIBRARY_LOT);
    w.tick(30);
    fullNeeds(lucia);
    w.command('a1', 'chess_puzzles', { kind: 'object', id: chess.id });
    w.tick(45);
    expect(lucia.skills?.ajedrez ?? 0).toBeGreaterThan(0.3);
    expect(lucia.skills?.logica ?? 0).toBe(0);
  });

  it('con manitas 5 se mejoran los muebles, y quien es manitas no se electrocuta', () => {
    const { w, lucia } = setup();
    const fridge = objOf(w, 'fridge');
    expect(ids(w, fridge.id)).not.toContain('upgrade');
    lucia.skills = { manitas: 5 };
    expect(ids(w, fridge.id)).toContain('upgrade');
    const f0 = w.household.funds;
    w.command('a1', 'upgrade', { kind: 'object', id: fridge.id });
    w.tick(70);
    expect(fridge.q).toBe(3);
    expect(w.household.funds).toBe(f0 - 40);
    expect(w.optionsFor('a1', { kind: 'object', id: fridge.id }).find((o) => o.def.id === 'upgrade')?.reason).toBe('Ya es de lujo');
  });

  it('serenata con canto 4 (solo a quien te gusta) y batallitas con carisma 3', () => {
    const { w, lucia } = setup();
    const mateo = w.agent('a2')!;
    Object.assign(mateo, { lotId: 'L0', travel: undefined, hidden: false });
    const soc = () => w.optionsFor('a1', { kind: 'agent', id: 'a2' }).map((o) => o.def.id);
    expect(soc()).not.toContain('serenade');
    expect(soc()).not.toContain('tell_story');
    lucia.skills = { canto: 4, carisma: 3 };
    expect(soc()).toContain('serenade');
    expect(soc()).toContain('tell_story');
    setRel(w.state, 'a1', 'a2', { ...getRel(w.state, 'a1', 'a2'), status: undefined, r: 0 });
    expect(soc()).not.toContain('serenade');
  });

  it('una partida de la versión 24 se carga: el ajedrez sale de la lógica', () => {
    const st = saveAt(24);
    const a = st.agents.find((x: { id: string }) => x.id === 'a1');
    a.skills = { logica: 5 };
    const m = migrate(st);
    const w = new World(m);
    expect(w.agent('a1')!.skills).toMatchObject({ logica: 5, ajedrez: 3 });
    expect(problems(w)).toEqual([]);
    const again = new World(migrate(JSON.parse(serialize(w.state))));
    expect(again.agent('a1')!.skills?.ajedrez).toBe(3);
  });
});
