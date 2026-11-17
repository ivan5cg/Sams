import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import { hasEmotion } from '../src/sim/emotions';
import { haggleChance } from '../src/sim/systems/places';
import { calendarEvents } from '../src/sim/agenda';
import { fullNeeds, isolate, problems, saveAt } from './helpers';

/** Pone a alguien dentro de un local, junto a la puerta, a una hora del día `day`. */
function at(w: World, id: string, lotId: string, day: number, hour: number) {
  w.state.minutes = (day - 1) * 1440 + hour * 60;
  const a = w.agent(id)!;
  a.lotId = lotId;
  a.travel = undefined;
  a.current = null;
  a.queue = [];
  a.path = [];
  const e = w.layoutOf(lotId).entrance;
  a.pos = { x: e.x, y: e.y - 1 };
  fullNeeds(a);
  return a;
}
const obj = (w: World, lotId: string, def: string) => w.objectsIn(lotId).find((o) => o.def === def)!;

describe('sitios nuevos: biblioteca, gimnasio y mercadillo', () => {
  it('están en el barrio (también en las partidas de antes) y se puede ir', () => {
    const w = World.createNew();
    for (const id of ['BI', 'GY', 'MK']) {
      expect(w.lotById(id)?.district, id).toBe('madrid');
      expect(w.objectsIn(id).length, id).toBeGreaterThan(5);
    }
    w.state.minutes = 10 * 60;
    expect(w.canTravel(w.agent('a1')!, 'GY').ok).toBe(true);
    const old = migrate(saveAt(13));
    expect(old.lots.filter((l) => ['BI', 'GY', 'MK'].includes(l.id)).length).toBe(3);
    expect(problems(new World(old))).toEqual([]);
    // Se guardan y se cargan.
    const again = new World(migrate(JSON.parse(serialize(w.state))));
    expect(again.objectsIn('MK').some((o) => o.def === 'stall_junk')).toBe(true);
  });

  it('horarios: la biblioteca cierra los domingos, el gimnasio de noche y el mercadillo solo abre el domingo por la mañana', () => {
    const w = World.createNew();
    const when = (day: number, h: number, lot: string) => {
      w.state.minutes = (day - 1) * 1440 + h * 60;
      return w.closedReason(lot);
    };
    expect(when(1, 10, 'BI')).toBeUndefined();
    expect(when(1, 8, 'BI')).toMatch(/9:00/);
    expect(when(7, 10, 'BI')).toMatch(/domingos/);
    expect(when(1, 6, 'GY')).toMatch(/7:00/);
    expect(when(1, 22, 'GY')).toBeUndefined();
    expect(when(1, 10, 'MK')).toMatch(/domingos/);
    expect(when(7, 10, 'MK')).toBeUndefined();
    expect(when(7, 15, 'MK')).toMatch(/14:30/);
    expect(calendarEvents(w.dateOf(7)).some((e) => e.id === 'mercadillo')).toBe(true);
  });

  it('en la biblioteca los deberes cunden el doble; estudiar sube la lógica', () => {
    const w = World.createNew({ surname: 'Ruiz', people: [{ name: 'Ana', stage: 'adult', traits: ['friki', 'optimista'], color: 1 }, { name: 'Leo', stage: 'teen', traits: ['friki', 'gloton'], color: 2 }], couple: false, pets: [] });
    isolate(w, ['a1', 'a2']);
    const leo = at(w, 'a2', 'BI', 2, 16);
    const ana = at(w, 'a1', 'BI', 2, 16);
    leo.job!.perf = 50;
    expect(w.command('a2', 'homework_lib', { kind: 'object', id: obj(w, 'BI', 'study_table').id })).toBe(true);
    expect(w.command('a1', 'study', { kind: 'object', id: w.objectsIn('BI').filter((o) => o.def === 'study_table')[1].id })).toBe(true);
    w.tick(70);
    expect(leo.job!.perf).toBeGreaterThanOrEqual(58);
    expect(ana.skills?.logica ?? 0).toBeGreaterThan(0);
    // Un pedo en la biblioteca no pasa desapercibido.
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    w.command('a1', 'fart', { kind: 'agent', id: 'a1' });
    w.tick(5);
    expect(toasts.some((t) => t.includes('Shhh'))).toBe(true);
  });

  it('el gimnasio cuesta §5 por sesión y el saco quita el enfado', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const lucia = at(w, 'a1', 'GY', 2, 10);
    w.feel(lucia, 'enfadado');
    const f0 = w.household.funds;
    expect(w.command('a1', 'box', { kind: 'object', id: obj(w, 'GY', 'punching_bag').id })).toBe(true);
    w.tick(30);
    expect(w.household.funds).toBe(f0 - 5);
    expect(hasEmotion(lucia, 'enfadado')).toBe(false);
    expect(hasEmotion(lucia, 'desfogado')).toBe(true);
    const forma0 = lucia.skills?.forma ?? 0;
    w.command('a1', 'lift_weights', { kind: 'object', id: obj(w, 'GY', 'weights').id });
    w.tick(50);
    expect(lucia.skills?.forma ?? 0).toBeGreaterThan(forma0);
  });

  it('mercadillo: regatear (con carisma, más fácil) deja la siguiente compra a mitad de precio', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const lucia = at(w, 'a1', 'MK', 7, 10);
    const base = haggleChance(w, lucia);
    lucia.skills = { ...lucia.skills, carisma: 5 };
    expect(haggleChance(w, lucia)).toBeGreaterThan(base);
    // Con la rebaja conseguida, la ropa sale a §13 en vez de §25 (y la rebaja se gasta).
    w.feel(lucia, 'regateo');
    expect(w.costOf('market_clothes', lucia)).toBe(13);
    const f0 = w.household.funds;
    const color0 = lucia.color;
    expect(w.command('a1', 'market_clothes', { kind: 'object', id: obj(w, 'MK', 'stall_clothes').id })).toBe(true);
    w.tick(25);
    expect(w.household.funds).toBe(f0 - 13);
    expect(lucia.color).not.toBe(color0);
    expect(hasEmotion(lucia, 'regateo')).toBe(false);
    // La fruta del mercadillo, a casa (más barata que en el Mercadona).
    expect(w.command('a1', 'market_food', { kind: 'object', id: obj(w, 'MK', 'stall_fruit').id })).toBe(true);
    w.tick(25);
    expect(lucia.carrying).toBe(8);
    // Rebuscar entre los trastos nunca rompe nada.
    for (let i = 0; i < 10; i++) {
      w.command('a1', 'rummage', { kind: 'object', id: obj(w, 'MK', 'stall_junk').id });
      w.tick(25);
    }
    expect(problems(w)).toEqual([]);
  });

  it('el mercadillo, fuera del domingo, cerrado: no se puede comprar', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const lucia = at(w, 'a1', 'MK', 3, 10);
    const opt = w.checkObjectAction(lucia, obj(w, 'MK', 'stall_fruit'), 'market_food');
    expect(opt.ok).toBe(false);
    expect(opt.reason).toMatch(/domingos/);
  });

  it('los domingos por la mañana, los vecinos van al mercadillo', () => {
    const w = World.createNew();
    w.state.activeAgentId = 'nadie';
    w.state.minutes = 6 * 1440 + 8 * 60;
    let seen = 0;
    for (let i = 0; i < 6 * 4; i++) {
      w.tick(15);
      seen = Math.max(seen, w.agentsIn('MK').filter((a) => !a.travel && !w.isPlayerMember(a)).length);
    }
    expect(seen).toBeGreaterThan(0);
    expect(problems(w)).toEqual([]);
  }, 60_000);
});
