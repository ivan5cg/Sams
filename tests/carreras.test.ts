import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { DILEMMA_BY_ID } from '../src/data/dilemmas';
import { BAR_STAFF, workDays } from '../src/data/careers';
import { fullNeeds, isolate } from './helpers';

const withRandom = <T>(value: number, fn: () => T): T => {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
};

describe('carreras y negocio', () => {
  it('dilemas: la opción especial solo aparece con la habilidad o el rasgo', () => {
    const w = World.createNew();
    const mateo = w.agent('a2')!;
    w.setJob(mateo, 'oficina');
    const d = DILEMMA_BY_ID.merito;
    const special = d.options[0];
    expect(special.needs?.skill?.[0]).toBe('carisma');
    expect(w.canChoose(mateo, special)).toBe(false);
    // Sin el carisma, elegirla no vale: se queda con la última opción.
    w.state.dilemma = { id: 'merito', agentId: 'a2', until: w.state.minutes + 60 };
    const perf0 = mateo.job!.perf;
    w.resolveDilemma(0);
    expect(mateo.job!.perf).toBe(perf0);
    mateo.skills = { ...mateo.skills, carisma: 6 };
    expect(w.canChoose(mateo, special)).toBe(true);
    w.state.dilemma = { id: 'merito', agentId: 'a2', until: w.state.minutes + 60 };
    w.resolveDilemma(0);
    expect(mateo.job!.perf).toBe(perf0 + 15);
    // Y por rasgo: el animalero se gana al chihuahua.
    const lucia = w.agent('a1')!;
    expect(w.canChoose(lucia, DILEMMA_BY_ID.chihuahua.options[0])).toBe(lucia.traits!.includes('animalero'));
  });

  it('teletrabajo: informes desde el ordenador, una vez al día', () => {
    const w = World.createNew();
    isolate(w, ['a1']);
    const lucia = w.agent('a1')!;
    fullNeeds(lucia);
    w.setJob(lucia, 'oficina');
    // Por la tarde, con la jornada ya acabada (si no, a las 9 se va a la oficina).
    w.state.minutes = 18 * 60;
    const pc = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    expect(w.checkObjectAction(lucia, pc, 'work_home').ok).toBe(true);
    const perf0 = lucia.job!.perf;
    w.command('a1', 'work_home', { kind: 'object', id: pc.id });
    w.tick(140);
    expect(lucia.job!.perf).toBeGreaterThanOrEqual(perf0 + 8);
    expect(w.checkObjectAction(lucia, pc, 'work_home').reason).toBe('Hoy ya ha teletrabajado');
    // En la cocina no se teletrabaja.
    w.setJob(w.agent('a2')!, 'cocina');
    expect(w.checkObjectAction(w.agent('a2')!, pc, 'work_home').ok).toBe(false);
  });

  it('el bar: la carta cara gana más en un buen día y la barata menos; una decisión por semana', () => {
    const pay = (menu: 'barata' | 'normal' | 'cara', staff = false) => {
      const w = World.createNew();
      const mateo = w.agent('a2')!;
      w.household.funds = 5000;
      w.setJob(mateo, 'negocio');
      if (menu !== 'normal' || staff) expect(w.setBarPlan(mateo, { menu, staff })).toBeUndefined();
      const f0 = w.household.funds;
      withRandom(0.5, () => w.finishShift(mateo, 'work', 60));
      return { gain: w.household.funds - f0, w, mateo };
    };
    const barata = pay('barata').gain, normal = pay('normal').gain, cara = pay('cara').gain;
    expect(cara).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(barata);
    const conCamarero = pay('normal', true);
    expect(conCamarero.gain).toBe(Math.round(normal * BAR_STAFF.boost) - BAR_STAFF.wage);
    expect(conCamarero.mateo.job!.bar!.staff).toBeTruthy();
    // Ya se ha cambiado esta semana: hasta el lunes, nada.
    expect(conCamarero.w.setBarPlan(conCamarero.mateo, { sunday: true })).toMatch(/lunes/);
    conCamarero.w.state.minutes += 7 * 1440;
    expect(conCamarero.w.setBarPlan(conCamarero.mateo, { sunday: true })).toBeUndefined();
    expect(workDays(conCamarero.mateo.job!)).toContain(6);
  });
});

describe('fin de semana fuera', () => {
  it('se reserva entre semana, se van el sábado y vuelven el domingo descansados', () => {
    const w = World.createNew();
    w.state.activeAgentId = 'nadie';
    const lucia = w.agent('a1')!;
    const pc = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    expect(w.checkObjectAction(lucia, pc, 'book_trip').ok).toBe(true);
    const f0 = w.household.funds;
    w.bookTrip(lucia);
    expect(w.household.funds).toBe(f0 - 600);
    expect(w.household.trip?.dest).toBeTruthy();
    expect(w.checkObjectAction(lucia, pc, 'book_trip').reason).toBe('Ya tenéis un viaje reservado');
    // Hasta el sábado a mediodía: todos de viaje (las mascotas de casa también).
    w.tick(5 * 1440 + 4 * 60);
    for (const m of w.members) if (!m.home) expect(m.travel?.reason, m.name).toBe('trip');
    // El domingo por la noche, de vuelta.
    w.tick(1440 + 10 * 60);
    for (const m of w.members) expect(m.travel).toBeUndefined();
    expect(lucia.emotions?.some((e) => e.id === 'vacaciones')).toBe(true);
    expect(w.household.trip).toBeUndefined();
  }, 60_000);

  it('el viernes ya no se reserva', () => {
    const w = World.createNew();
    w.state.minutes += 4 * 1440;
    const pc = w.objectsIn('L0').find((o) => o.def === 'computer')!;
    expect(w.checkObjectAction(w.agent('a1')!, pc, 'book_trip').reason).toMatch(/lunes a jueves/);
  });
});
