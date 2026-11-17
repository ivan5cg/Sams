import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { CAREERS, JOB_CAREERS } from '../src/data/careers';
import { DEGREES, SCHOLARSHIP_GRADE } from '../src/data/education';
import { SKILLS } from '../src/data/skills';
import { degreeReason, enroll, enrollReason, schoolDay, startLevel, studyAtHome } from '../src/sim/systems/education';
import { migrate, serialize } from '../src/save/serialize';
import { problems } from './helpers';

const FAMILIA = {
  surname: 'Ruiz',
  people: [
    { name: 'Ana', stage: 'adult' as const, traits: ['optimista', 'friki'] as [string, string], color: 1 },
    { name: 'Leo', stage: 'teen' as const, traits: ['friki', 'gloton'] as [string, string], color: 2 },
    { name: 'Noa', stage: 'child' as const, traits: ['bromista', 'gloton'] as [string, string], color: 3 },
  ],
  couple: false,
  pets: [],
};

describe('estudios', () => {
  it('en el colegio y el instituto se aprenden idiomas (que solo se aprenden estudiando)', () => {
    expect(SKILLS.filter((s) => s.studyOnly).map((s) => s.id)).toEqual(expect.arrayContaining(['idiomas', 'medicina', 'leyes', 'informatica', 'docencia', 'ciencias']));
    const w = World.createNew(FAMILIA);
    const leo = w.agent('a2')!;
    const noa = w.agent('a3')!;
    for (let i = 0; i < 8; i++) {
      schoolDay(w, leo);
      schoolDay(w, noa);
    }
    expect(leo.skills?.idiomas).toBeCloseTo(2, 1);
    expect(noa.skills?.idiomas).toBeCloseTo(1.2, 1);
    // Estudiar en casa sube las notas.
    const p0 = leo.job!.perf;
    studyAtHome(w, leo);
    expect(leo.job!.perf).toBe(Math.min(100, p0 + 6));
    // Yendo a clase de verdad (un día de instituto).
    w.state.minutes = 7 * 60;
    leo.skills = {};
    w.tick(9 * 60);
    expect(leo.skills.idiomas ?? 0).toBeGreaterThan(0);
  });

  it('la universidad: matrícula (o beca), clase, título y la profesión a la que lleva', () => {
    const w = World.createNew(FAMILIA);
    const ana = w.agent('a1')!;
    // Sin título, de médica no se puede.
    expect(degreeReason(ana, 'medicina')).toMatch(/Medicina/);
    w.setJob(ana, 'medicina');
    expect(ana.job).toBeUndefined();
    // Matrícula: §600.
    const f0 = w.household.funds;
    expect(enroll(w, ana, 'medicina')).toBeUndefined();
    expect(w.household.funds).toBe(f0 - DEGREES.medicina.cost);
    expect(ana.job?.career).toBe('uni');
    expect(enrollReason(w, ana, 'derecho')).toMatch(/Ya estudia/);
    // Días de clase (con notas normales) hasta graduarse.
    let days = 0;
    while (ana.study && days < 40) {
      schoolDay(w, ana);
      days++;
    }
    expect(ana.degrees).toEqual(['medicina']);
    expect(days).toBeGreaterThanOrEqual(7);
    expect(days).toBeLessThanOrEqual(12);
    expect(ana.skills?.medicina ?? 0).toBeGreaterThan(3);
    expect(ana.job).toBeUndefined();
    // Ahora sí: médica.
    w.setJob(ana, 'medicina');
    expect(ana.job?.career).toBe('medicina');
    expect(CAREERS.medicina.levels[0].pay).toBeGreaterThan(CAREERS.oficina.levels[0].pay);
    const again = new World(migrate(JSON.parse(serialize(w.state))));
    expect(again.agent('a1')?.degrees).toEqual(['medicina']);
    expect(problems(w)).toEqual([]);
  });

  it('con buenas notas en el instituto, beca; y algunas carreras te hacen empezar más arriba', () => {
    const w = World.createNew(FAMILIA);
    const ana = w.agent('a1')!;
    ana.lastGrade = SCHOLARSHIP_GRADE + 5;
    w.household.funds = 0;
    expect(enroll(w, ana, 'veterinaria')).toBeUndefined();
    expect(w.household.funds).toBe(0);
    ana.study = undefined;
    ana.degrees = ['veterinaria'];
    expect(startLevel(ana, 'veterinaria')).toBe(3);
    w.setJob(ana, 'veterinaria');
    expect(ana.job?.level).toBe(3);
  });

  it('al acabar el instituto se apunta la nota (y quien la tiene alta, tiene beca)', () => {
    const w = World.createNew(FAMILIA);
    const leo = w.agent('a2')!;
    leo.job!.perf = 85;
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    leo.ageDays = 19;
    w.state.minutes = Math.floor(w.state.minutes / 1440 + 1) * 1440 - 1;
    w.tick(2);
    expect(w.stageOf(leo)).toBe('young');
    expect(leo.lastGrade).toBe(85);
    expect(leo.job).toBeUndefined();
    expect(toasts.some((t) => t.includes('beca'))).toBe(true);
  });

  it('los vecinos con profesiones de carrera tienen su título', () => {
    expect(JOB_CAREERS.some((c) => c.degree)).toBe(true);
    for (let i = 0; i < 5; i++) {
      const w = World.createNew();
      for (const a of w.state.agents) {
        const deg = a.job && CAREERS[a.job.career]?.degree;
        if (deg) expect(a.degrees).toContain(deg);
      }
    }
  });
});
