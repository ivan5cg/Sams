import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { GARCIA, familyProblems, randomFamily, type FamilySpec } from '../src/sim/family';
import { getRel } from '../src/sim/social';
import { migrate, serialize } from '../src/save/serialize';
import { problems } from './helpers';

const custom: FamilySpec = {
  surname: 'Pérez',
  people: [
    { name: 'Rosa', stage: 'adult', traits: ['optimista', 'animalero'], color: 0x52b788, look: { skin: 0x8d5524, hair: 0xe6c35c, hairStyle: 'curly' } },
    { name: 'Paco', stage: 'adult', traits: ['grunon', 'cunado'], color: 0xe76f51 },
    { name: 'Nerea', stage: 'teen', traits: ['friki', 'bromista'], color: 0x9b5de5 },
    { name: 'Leo', stage: 'child', traits: ['fiestero', 'gloton'], color: 0x48cae4 },
  ],
  couple: true,
  pets: [{ species: 'guineapig', name: 'Bolita' }],
};

describe('crear tu familia', () => {
  it('sin elegir nada, la familia García de siempre', () => {
    const w = World.createNew();
    expect(w.household.name).toBe('Familia García');
    expect(w.members.map((m) => m.name)).toEqual(['Lucía', 'Mateo', 'Toby', 'Misi']);
    expect(familyProblems(GARCIA)).toEqual([]);
  });

  it('una familia propia: nombres, edades, rasgos, aspecto, pareja, colegio y mascota en su jaula', () => {
    expect(familyProblems(custom)).toEqual([]);
    const w = World.createNew(custom);
    expect(w.household.name).toBe('Familia Pérez');
    expect(w.members.map((m) => m.name)).toEqual(['Rosa', 'Paco', 'Nerea', 'Leo', 'Bolita']);
    const [rosa, paco, nerea, leo, bolita] = w.members;
    expect(w.stageOf(rosa)).toBe('adult');
    expect(w.stageOf(leo)).toBe('child');
    expect(rosa.traits).toEqual(['optimista', 'animalero']);
    expect(rosa.look?.hairStyle).toBe('curly');
    expect(getRel(w.state, rosa.id, paco.id).status).toBe('partner');
    expect(getRel(w.state, rosa.id, nerea.id).kin).toBe(true);
    expect(nerea.job?.career).toBe('school');
    expect(leo.job?.career).toBe('school');
    expect(rosa.job).toBeUndefined();
    expect(w.object(bolita.home)?.def).toBe('cage');
    expect(problems(w)).toEqual([]);
    // Se guarda y se carga igual (con su aspecto).
    const again = new World(migrate(JSON.parse(serialize(w.state))));
    expect(again.agent(rosa.id)?.look?.skin).toBe(0x8d5524);
    w.tick(1440);
    expect(problems(w)).toEqual([]);
  });

  it('el creador avisa de lo que falta', () => {
    expect(familyProblems({ surname: '', people: [], couple: false, pets: [] })).toEqual(expect.arrayContaining(['Falta el apellido', 'Hace falta al menos una persona']));
    expect(familyProblems({ surname: 'X', people: [{ name: 'Leo', stage: 'child', traits: ['friki', 'bromista'], color: 1 }], couple: false, pets: [] })[0]).toMatch(/adulto/);
    expect(familyProblems({ ...custom, people: [{ ...custom.people[0], traits: ['grunon', 'optimista'] }] })[0]).toMatch(/rasgos/);
    expect(familyProblems({ ...custom, people: [custom.people[0], { ...custom.people[1], name: 'rosa' }] })[0]).toMatch(/mismo nombre/);
  });

  it('las familias al azar siempre son válidas y se pueden jugar', () => {
    for (let i = 0; i < 25; i++) {
      const f = randomFamily();
      expect(familyProblems(f)).toEqual([]);
      const w = World.createNew(f);
      expect(problems(w)).toEqual([]);
    }
  });
});
