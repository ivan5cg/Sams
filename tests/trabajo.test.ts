import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';
import { CAREERS } from '../src/data/careers';
import { WORK_TASKS } from '../src/data/work';
import { bossOf, company, matesOf, staffOf, workLotId } from '../src/sim/systems/work';
import { catchPetIllness, vetCost } from '../src/sim/systems/pets';
import { topicsFor, converse } from '../src/sim/conversation';
import { setRel } from '../src/sim/social';
import { socialOutcome } from '../src/sim/systems/social';
import { fullNeeds, isolate, problems } from './helpers';

/** Lunes 5 de enero de 2026, a las 8:00. */
const MONDAY = '2026-01-05';

const withRandom = <T>(value: number, fn: () => T): T => {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
};

/** Un mundo tranquilo para probar el trabajo (sin dilemas ni sorpresas de la empresa). */
function quiet(keep = ['a1', 'a2']): World {
  const w = World.createNew(undefined, { start: MONDAY });
  w.dilemmaChance = 0;
  w.corpChance = 0;
  isolate(w, keep);
  w.state.activeAgentId = 'nadie';
  return w;
}

describe('trabajar y estudiar a la vez', () => {
  it('un trabajo de medio tiempo se compagina con la universidad', () => {
    const w = quiet(['a1']);
    const lucia = w.agent('a1')!;
    w.household.funds = 5000;
    expect(w.state.prompt).toBeUndefined();
    expect(w.command('a1', 'enroll', { kind: 'object', id: w.objectsIn('L0').find((o) => o.def === 'computer')!.id }, 'derecho')).toBe(true);
    // Matricularse directamente (sin esperar a la tarea).
    lucia.job = { career: 'uni', level: 1, perf: 50 };
    lucia.study = { degree: 'derecho', progress: 0 };
    w.setJob(lucia, 'dependiente');
    expect(lucia.side?.career).toBe('dependiente');
    // Sigue estudiando.
    expect(lucia.study?.degree).toBe('derecho');
    expect(lucia.job?.career).toBe('uni');
    // El lunes va a clase por la mañana y a la tienda por la tarde.
    const f0 = w.household.funds;
    const reasons = new Set<string>();
    for (let m = 0; m < 15 * 60; m += 10) {
      w.tick(10);
      fullNeeds(lucia);
      if (lucia.travel?.reason) reasons.add(lucia.travel.reason);
    }
    expect(reasons.has('school')).toBe(true);
    expect(reasons.has('part')).toBe(true);
    expect(w.household.funds).toBeGreaterThan(f0);
    expect(lucia.study!.progress).toBeGreaterThan(0);
  });

  it('un adolescente puede trabajar de medio tiempo, pero no a jornada completa', () => {
    const w = World.createNew({ surname: 'Ruiz', people: [{ name: 'Ana', stage: 'adult', traits: ['optimista', 'cotilla'], color: 1 }, { name: 'Nico', stage: 'teen', traits: ['friki', 'perezoso'], color: 2 }], couple: false, pets: [] }, { start: MONDAY });
    const nico = w.agent('a2')!;
    w.setJob(nico, 'oficina');
    expect(nico.job?.career).toBe('school');
    w.setJob(nico, 'reparto');
    expect(nico.side?.career).toBe('reparto');
    expect(nico.job?.career).toBe('school');
    // Pero de teleoperador no (es para mayores de edad).
    const ana = w.agent('a1')!;
    w.setJob(ana, 'teleoperador');
    expect(ana.side?.career).toBe('teleoperador');
  });

  it('coger un trabajo de jornada completa que choca con el de medio tiempo deja el de medio tiempo', () => {
    const w = quiet(['a1']);
    const lucia = w.agent('a1')!;
    w.setJob(lucia, 'teleoperador'); // 15-19
    w.setJob(lucia, 'oficina'); // 9-17: choca
    expect(lucia.side).toBeUndefined();
    w.setJob(lucia, 'dependiente'); // 17-21: no choca con la oficina
    expect(lucia.side?.career).toBe('dependiente');
    expect(lucia.job?.career).toBe('oficina');
  });
});

describe('el tiempo vuela', () => {
  it('cuando todos trabajan, muy rápido; cuando todos duermen, rápido; si alguien está libre, normal', () => {
    const w = quiet();
    const [lucia, mateo] = [w.agent('a1')!, w.agent('a2')!];
    expect(w.autoSpeed()).toBeNull();
    lucia.travel = { from: 'L0', to: 'L0', arrive: w.state.minutes + 300, reason: 'work' };
    expect(w.autoSpeed()).toBeNull();
    mateo.travel = { from: 'L0', to: 'L0', arrive: w.state.minutes + 300, reason: 'part' };
    expect(w.autoSpeed()).toEqual({ mult: 60, why: 'trabajo' });
    mateo.travel = undefined;
    const bed = w.objectsIn('L0').find((o) => o.def === 'bed')!;
    mateo.current = { id: 't1', actionId: 'sleep', byPlayer: false, phase: 'acting', remaining: 300, targetObjectId: bed.id };
    expect(w.autoSpeed()?.why).toBe('sueño');
    lucia.travel = undefined;
    lucia.current = { id: 't2', actionId: 'sleep', byPlayer: false, phase: 'acting', remaining: 300, targetObjectId: bed.id };
    expect(w.autoSpeed()).toEqual({ mult: 25, why: 'sueño' });
    // Con una pregunta pendiente (el nombre del bebé...), no.
    w.state.prompt = { kind: 'naming', agentId: 'a1', until: w.state.minutes + 60 };
    expect(w.autoSpeed()).toBeNull();
  });
});

describe('bajas', () => {
  it('al nacer un bebé: baja por maternidad y paternidad, cobrando, y se le pone nombre', () => {
    const w = quiet();
    const [lucia, mateo] = [w.agent('a1')!, w.agent('a2')!];
    w.setJob(lucia, 'oficina');
    w.setJob(mateo, 'cocina');
    w.household.expecting = { parents: ['a1', 'a2'], due: w.state.minutes + 1, mother: 'a1', known: true };
    w.tick(2);
    expect(lucia.job!.leave?.kind).toBe('maternidad');
    expect(mateo.job!.leave?.kind).toBe('paternidad');
    const p = w.state.prompt;
    expect(p?.kind).toBe('naming');
    const babyId = p!.agentId;
    // Un nombre que ya existe no vale (y la pregunta sigue abierta).
    expect(w.nameBaby('Mateo')).toMatch(/Ya hay alguien/);
    expect(w.state.prompt).toBeDefined();
    expect(w.nameBaby('  Paquita  ')).toBeUndefined();
    expect(w.agent(babyId)!.name).toBe('Paquita');
    expect(w.state.prompt).toBeUndefined();
    // Al día siguiente, a su hora, no van: cobran la prestación.
    const f0 = w.household.funds;
    w.state.minutes = 1440 + 10 * 60;
    w.tick(1);
    expect(lucia.travel?.reason).toBeUndefined();
    expect(mateo.travel?.reason).toBeUndefined();
    expect(w.household.funds).toBeGreaterThan(f0);
    expect(lucia.job!.lastShiftDay).toBe(w.day);
  });

  it('enfermo con parte del médico: baja hasta que se cura (cobrando el 75 %)', () => {
    const w = quiet(['a1']);
    const lucia = w.agent('a1')!;
    w.setJob(lucia, 'oficina');
    w.catchIllness(lucia, 'gripe');
    expect(w.seeDoctor(lucia)).toBeUndefined();
    expect(lucia.job!.leave?.kind).toBe('enfermedad');
    const f0 = w.household.funds;
    w.state.minutes = 9 * 60 + 5;
    w.tick(1);
    expect(lucia.travel).toBeUndefined();
    expect(w.household.funds - f0).toBe(Math.round(w.wage(CAREERS.oficina.levels[0].pay) * 0.75));
    // Curada, se reincorpora.
    lucia.illness = undefined;
    lucia.job!.lastShiftDay = undefined;
    w.tick(1);
    expect(lucia.job!.leave).toBeUndefined();
    expect(lucia.travel?.reason).toBe('work');
  });
});

describe('amonestaciones, despidos y ascensos', () => {
  it('faltar sin avisar: amonestación; a la tercera, a la calle', () => {
    const w = quiet(['a1']);
    const lucia = w.agent('a1')!;
    w.setJob(lucia, 'oficina');
    for (let d = 0; d < 3; d++) {
      // Está fuera (de viaje por su cuenta) a la hora de entrar.
      w.state.minutes = d * 1440 + 10 * 60 + 5;
      lucia.hidden = true;
      w.tick(1);
      lucia.hidden = false;
      if (d < 2) expect(lucia.job?.strikes).toBe(d + 1);
    }
    expect(lucia.job).toBeUndefined();
    expect(lucia.emotions?.some((e) => e.id === 'despedido')).toBe(true);
  });

  it('el enchufado se lleva el ascenso; sin enchufado, asciende', () => {
    const w = quiet(['a1']);
    const lucia = w.agent('a1')!;
    w.setJob(lucia, 'oficina');
    w.corpChance = 1;
    const co = company(w, 'oficina');
    co.nephew = matesOf(w, 'oficina')[0].id;
    lucia.job!.perf = 100;
    withRandom(0.01, () => w.finishShift(lucia, 'work', 90));
    expect(lucia.job!.level).toBe(1);
    expect(lucia.emotions?.some((e) => e.id === 'enchufado')).toBe(true);
    co.nephew = undefined;
    lucia.job!.perf = 100;
    withRandom(0.5, () => w.finishShift(lucia, 'work', 90));
    expect(lucia.job!.level).toBe(2);
  });

  it('una fusión: rumores, y el día del ERE algunos se van a la calle con indemnización', () => {
    const w = quiet(['a1']);
    const lucia = w.agent('a1')!;
    w.setJob(lucia, 'banca');
    const co = company(w, 'banca');
    co.merger = { buyer: 'MegaCorp Global', day: w.day + 1 };
    lucia.job!.perf = 10;
    const f0 = w.household.funds;
    withRandom(0.05, () => w.tick(1440));
    expect(lucia.job).toBeUndefined();
    expect(w.household.funds).toBeGreaterThan(f0);
    expect(company(w, 'banca').name).toContain('MegaCorp Global');
  });
});

describe('las tareas de cada jornada y acompañar al trabajo', () => {
  it('cada profesión tiene su centro de trabajo, con jefe y compañeros', () => {
    const w = quiet(['a1']);
    w.setJob(w.agent('a1')!, 'banca');
    const lot = w.lotById(workLotId('banca'));
    expect(lot.kind).toBe('work');
    expect(bossOf(w, 'banca')?.name).toBe('Doña Inmaculada');
    expect(matesOf(w, 'banca').length).toBe(3);
    // Están dentro, en casillas por las que se anda.
    expect(problems(w)).toEqual([]);
  });

  it('si le acompañas, va a la oficina a la vista: haces sus tareas y al salir vuelve a casa', () => {
    const w = quiet(['a1']);
    const lucia = w.agent('a1')!;
    w.setJob(lucia, 'banca');
    fullNeeds(lucia);
    expect(w.escort(lucia)).toMatch(/próxima jornada/);
    w.state.activeAgentId = 'a1';
    w.state.minutes = 8 * 60;
    w.tick(1);
    expect(lucia.shift).toBeDefined();
    const tasks = lucia.job!.tasks!.list;
    expect(tasks.length).toBe(3);
    w.tick(20);
    expect(lucia.lotId).toBe(workLotId('banca'));
    // El jugador hace las tareas una a una en los muebles que tocan.
    for (const t of tasks) {
      const def = WORK_TASKS[t.id];
      const o = w.objectsIn(lucia.lotId).find((x) => x.def === def.obj)!;
      expect(w.optionsFor('a1', { kind: 'object', id: o.id }).some((op) => op.def.id === `wt_${t.id}` && op.ok)).toBe(true);
      expect(w.command('a1', `wt_${t.id}`, { kind: 'object', id: o.id })).toBe(true);
      for (let i = 0; i < 12 && !t.done; i++) {
        w.tick(10);
        fullNeeds(lucia);
      }
      expect(t.done, t.id).toBe(true);
    }
    // En la oficina no salen las cosas de casa (buscar trabajo, adoptar...).
    const pc = w.objectsIn(lucia.lotId).find((x) => x.def === 'computer')!;
    expect(w.optionsFor('a1', { kind: 'object', id: pc.id }).some((op) => op.def.id === 'find_job')).toBe(false);
    const perf0 = lucia.job!.perf;
    const f0 = w.household.funds;
    w.state.minutes = 15 * 60;
    w.tick(1);
    expect(lucia.shift).toBeUndefined();
    expect(lucia.travel?.to).toBe('L0');
    expect(w.household.funds).toBeGreaterThan(f0);
    expect(lucia.job!.perf).toBeGreaterThan(perf0);
    expect(problems(w)).toEqual([]);
  });

  it('si va solo y no está para nada, deja las tareas sin hacer y su rendimiento baja', () => {
    const w = quiet(['a1']);
    const lucia = w.agent('a1')!;
    w.setJob(lucia, 'oficina');
    lucia.job!.perf = 50;
    w.state.minutes = 9 * 60 + 1;
    w.tick(1);
    expect(lucia.job!.tasks?.list.length).toBe(3);
    withRandom(0.99, () => w.finishShift(lucia, 'work', 45));
    expect(lucia.job!.perf).toBeLessThan(50);
  });

  it('pedir un ascenso al jefe y portarse mal delante de él', () => {
    const w = quiet(['a1']);
    const lucia = w.agent('a1')!;
    w.setJob(lucia, 'oficina');
    const boss = bossOf(w, 'oficina')!;
    lucia.job!.escort = w.day;
    w.state.minutes = 9 * 60;
    w.tick(1);
    w.tick(20);
    boss.lotId = lucia.lotId;
    boss.pos = { x: lucia.pos.x + 1, y: lucia.pos.y };
    expect(w.checkSocialAction(lucia, boss, 'ask_promotion')).toMatchObject({ ok: true });
    // Con los de la calle de siempre no se puede pedir un ascenso.
    const otherBoss = staffOf(w, 'oficina').find((x) => x.role === 'colega')!;
    expect(w.checkSocialAction(lucia, otherBoss, 'ask_promotion').ok).toBe(false);
    setRel(w.state, lucia.id, boss.id, { f: 40, r: 0 });
    lucia.job!.perf = 80;
    withRandom(0.5, () => socialOutcome(w, lucia, boss, 'ask_promotion'));
    expect(lucia.job!.level).toBe(2);
    // Insultar al jefe: amonestación o despido.
    withRandom(0.99, () => socialOutcome(w, lucia, boss, 'insult'));
    expect(lucia.job?.strikes).toBe(1);
  });
});

describe('vida corporativa', () => {
  it('afterwork: si va por su cuenta, vuelve con algo que contar', () => {
    const w = quiet(['a1']);
    const lucia = w.agent('a1')!;
    w.setJob(lucia, 'oficina');
    w.state.prompt = { kind: 'event', event: 'afterwork', agentId: 'a1', career: 'oficina', until: w.state.minutes + 60 };
    const toasts: string[] = [];
    w.onToast((t) => toasts.push(t.text));
    withRandom(0.3, () => w.answerInvite('solo'));
    expect(w.state.prompt).toBeUndefined();
    expect(lucia.travel?.reason).toBe('event');
    expect(toasts.some((t) => t.includes('afterwork'))).toBe(true);
  });

  it('cena de Navidad: si le acompañas, se juega en el restaurante con el jefe y los compañeros', () => {
    const w = quiet(['a1']);
    const lucia = w.agent('a1')!;
    w.setJob(lucia, 'oficina');
    w.state.prompt = { kind: 'event', event: 'navidad', agentId: 'a1', career: 'oficina', until: w.state.minutes + 60 };
    w.answerInvite('contigo');
    expect(w.state.corp?.event?.kind).toBe('navidad');
    expect(bossOf(w, 'oficina')!.lotId).toBe('RT');
    w.tick(20);
    expect(lucia.lotId).toBe('RT');
    expect(problems(w)).toEqual([]);
    w.tick(5 * 60);
    expect(w.state.corp?.event).toBeUndefined();
    expect(bossOf(w, 'oficina')!.lotId).toBe(workLotId('oficina'));
  });

  it('sin contestar, la invitación caduca (no va)', () => {
    const w = quiet(['a1']);
    w.setJob(w.agent('a1')!, 'oficina');
    w.state.prompt = { kind: 'event', event: 'comida', agentId: 'a1', career: 'oficina', until: w.state.minutes + 5 };
    w.tick(10);
    expect(w.state.prompt).toBeUndefined();
    expect(w.state.corp?.event).toBeUndefined();
  });
});

describe('mascotas: salud y veterinario', () => {
  it('el veterinario cura, pero la factura duele; sin dinero, queda a deber', () => {
    const w = quiet(['a1', 'a3']);
    const lucia = w.agent('a1')!, toby = w.agent('a3')!;
    expect(catchPetIllness(w, toby, 'calcetin')).toBe(true);
    const cost = vetCost(w, toby);
    expect(cost).toBeGreaterThan(1000);
    w.household.funds = 300;
    expect(w.checkSocialAction(lucia, toby, 'vet').ok).toBe(true);
    socialOutcome(w, lucia, toby, 'vet');
    expect(toby.illness?.treated).toBe(true);
    expect(w.household.funds).toBe(0);
    expect(w.household.bills?.debts.some((d) => d.kind === 'veterinario' && d.amount === cost - 300)).toBe(true);
    // Ya tratado: no hace falta volver.
    expect(w.checkSocialAction(lucia, toby, 'vet').ok).toBe(false);
  });

  it('una enfermedad grave sin tratar puede acabar con la mascota', () => {
    const w = quiet(['a3']);
    const toby = w.agent('a3')!;
    catchPetIllness(w, toby, 'moquillo');
    // Tras los primeros días de margen, sin veterinario...
    withRandom(0.01, () => w.tick(3 * 1440));
    expect(w.agent('a3')).toBeUndefined();
  });

  it('descuidada (con hambre y sola), acaba con desnutrición', () => {
    const w = quiet(['a3']);
    const toby = w.agent('a3')!;
    toby.neglect = 30;
    w.tick(1440);
    expect(w.agent('a3')?.illness?.id ?? 'muerta').toMatch(/desnutricion|muerta/);
  });
});

describe('conversaciones que siguen el hilo', () => {
  it('después de un buen «qué tal», sale una pregunta para seguir; después de meter la pata, pedir perdón', () => {
    const w = quiet();
    const a = w.agent('a1')!, t = w.agent('a2')!;
    expect(topicsFor(w, a, t, 1, { topic: 'dia', outcome: 'good' })[0].id).toBe('f_dia_eso');
    expect(topicsFor(w, a, t, 1, { topic: 'musica', outcome: 'bad' })[0].id).toBe('f_perdon');
    // Las preguntas de la vida del otro ya usadas no se repiten.
    expect(topicsFor(w, a, t, 0, undefined, ['trabajo']).some((x) => x.id === 'trabajo')).toBe(false);
  });

  it('al preguntar por el trabajo, responde con lo suyo de verdad', () => {
    const w = quiet();
    const a = w.agent('a1')!, t = w.agent('a2')!;
    w.setJob(t, 'banca');
    const res = withRandom(0.1, () => converse(w, a, t, 'trabajo'));
    expect(res.reply).toContain('cajero/a');
    expect(res.reply).toContain('Banco Chulapo');
    w.setJob(t, 'camarero');
    const res2 = withRandom(0.1, () => converse(w, a, t, 'trabajo'));
    expect(res2.reply).toContain('por las tardes');
    const fam = withRandom(0.1, () => converse(w, a, t, 'familia'));
    expect(fam.reply).toContain('Lucía');
  });
});

describe('guardar y cargar', () => {
  it('con trabajos de medio tiempo, centros de trabajo, empresa y preguntas pendientes', () => {
    const w = quiet(['a1', 'a2']);
    const lucia = w.agent('a1')!;
    w.setJob(lucia, 'oficina');
    w.setJob(lucia, 'dependiente');
    lucia.job!.strikes = 1;
    lucia.job!.leave = { kind: 'enfermedad', until: 3 };
    company(w, 'oficina').merger = { buyer: 'X', day: 5 };
    catchPetIllness(w, w.agent('a3')!, 'otitis');
    w.state.prompt = { kind: 'naming', agentId: 'a1', until: 999 };
    const again = new World(migrate(JSON.parse(serialize(w.state))));
    expect(again.agent('a1')!.side?.career).toBe('dependiente');
    expect(again.state.corp?.companies.oficina.merger?.buyer).toBe('X');
    expect(again.state.lots.some((l) => l.kind === 'work')).toBe(true);
    expect(problems(again)).toEqual([]);
  });

  it('una semana entera de partida con trabajo, medio tiempo y vida de empresa, sin errores', () => {
    const w = World.createNew(undefined, { start: '2026-12-14' });
    w.state.activeAgentId = 'nadie';
    w.setJob(w.agent('a1')!, 'oficina');
    w.setJob(w.agent('a2')!, 'camarero');
    w.agent('a1')!.job!.escort = w.day;
    w.tick(7 * 1440);
    expect(problems(w)).toEqual([]);
  }, 60_000);
});
