// Ciclo de vida: mudanzas, nacimientos, crecer, morir, herencias, rasgos y metas de vida.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { HABITS, HABIT_TEXT } from '../../data/habits';
import { isOutdoor } from '../../data/lot';
import { SPECIES } from '../../data/species';
import { TRAITS, TRAIT_BY_ID } from '../../data/traits';
import { ASPIRATION_BY_ID, canAspire, suggestAspiration } from '../aspirations';
import { MAX_MEMBERS, MINUTES_PER_DAY } from '../constants';
import { generateFamily, generateOkupas, makeAgent, newbornLooks } from '../neighborhood';
import { isWalkable } from '../pathfinding';
import { changeRel, getRel, isAdult, setRel } from '../social';
import { traitsOf } from '../traits';
import type { Agent, Household, PlacedObject } from '../types';
import { clamp } from '../util';
import type { World } from '../world';
import { money } from './money';
import { districtOf, freeSpotNear, startTravel } from './travel';
import { countFeat } from './feats';

/** Si alguien no puede dejar su casa (p. ej. no dejaría solos a sus hijos), el motivo. */
export function cantMoveOut(w: World, t: Agent): string | undefined {
  const h = w.householdOf(t);
  if (!h) return undefined;
  const others = h.memberIds.map((id) => w.agent(id)!).filter((x) => x && x.id !== t.id && x.kind === 'person');
  if (others.length && !others.some((x) => isAdult(x))) return 'Tiene hijos a su cargo';
  return undefined;
}

/** `t` deja su familia y se viene a vivir con la del jugador. */
export function moveIn(w: World, t: Agent) {
  const old = w.householdOf(t);
  const mine = w.household;
  if (!old || old.id === mine.id) return;
  old.memberIds = old.memberIds.filter((id) => id !== t.id);
  t.householdId = mine.id;
  mine.memberIds.push(t.id);
  t.visitUntil = undefined;
  t.abstract = false;
  // Su nueva familia
  for (const m of w.members) if (m.id !== t.id && m.kind === 'person' && !getRel(w.state, m.id, t.id).f) changeRel(w.state, m.id, t.id, 30);
  w.toast(`¡${t.name} se viene a vivir con la ${mine.name}!`, '🏡');
  w.addNews(`${t.name} se ha ido a vivir con la ${mine.name}`, [t.id]);
  if (t.lotId !== mine.lotId) startTravel(w, t, mine.lotId);

  // Si se ha quedado sin personas, sus mascotas se vienen (si caben) y llega una familia nueva a esa casa.
  const left = old.memberIds.map((id) => w.agent(id)!).filter(Boolean);
  if (!left.some((x) => x.kind === 'person')) {
    const stay: Agent[] = [];
    for (const pet of left) {
      if (w.members.length < MAX_MEMBERS && !pet.home) {
        pet.householdId = mine.id;
        mine.memberIds.push(pet.id);
        pet.visitUntil = undefined;
        if (pet.lotId !== mine.lotId && !pet.travel) startTravel(w, pet, mine.lotId);
        w.toast(`${pet.name} también se viene`, SPECIES[pet.species].icon);
      } else stay.push(pet);
    }
    w.state.households = w.state.households.filter((x) => x.id !== old.id);
    const fresh = generateFamily(w.state, old.lotId);
    for (const pet of stay) {
      pet.householdId = fresh.id;
      fresh.memberIds.push(pet.id);
    }
    w.toast(`La ${fresh.name} se muda a ${w.lotById(old.lotId).name.replace('Casa de los ', 'la casa de los ')}`, '🚚');
  }
}

export function freeBed(w: World, lotId: string): PlacedObject | undefined {
  return w.objectsIn(lotId).find((o) => o.def === 'bed' && !o.broken && w.usersOf(o.id).length === 0);
}

export function freeCrib(w: World, lotId: string): PlacedObject | undefined {
  return w.objectsIn(lotId).find((o) => o.def === 'crib' && !w.residentOf(o.id));
}

export function births(w: World) {
  for (const h of w.state.households) {
    if (!h.expecting || w.state.minutes < h.expecting.due) continue;
    const crib = freeCrib(w, h.lotId);
    const mine = h.id === w.household.id;
    if (!crib || h.memberIds.length >= MAX_MEMBERS) {
      h.expecting.due += MINUTES_PER_DAY;
      if (mine) w.toast('El bebé no puede llegar: hace falta una cuna libre y sitio en casa', '🍼');
      continue;
    }
    const parents = h.expecting.parents.map((id) => w.agent(id)).filter((x): x is Agent => !!x);
    h.expecting = undefined;
    const { name, color } = newbornLooks(w.state);
    const baby = makeAgent({ id: w.newId('a'), name, species: 'human', ageDays: 0, color, householdId: h.id, lotId: h.lotId, x: crib.x, y: crib.y });
    baby.home = crib.id;
    baby.parents = parents.map((p) => p.id);
    baby.gen = Math.max(1, ...parents.map((p) => p.gen ?? 1)) + 1;
    if (mine) countFeat(w, 'babies');
    baby.traits = inheritTraits(w, parents);
    for (const p of parents) w.bump(p, 'babies');
    baby.abstract = !w.detailedLots().has(h.lotId);
    w.state.agents.push(baby);
    h.memberIds.push(baby.id);
    for (const m of h.memberIds.map((id) => w.agent(id)!).filter(Boolean)) {
      if (m === baby) continue;
      const parent = parents.includes(m);
      if (m.kind === 'person') setRel(w.state, m.id, baby.id, { f: parent ? 70 : 40, r: 0, kin: true });
      if (m.kind === 'person') w.feel(m, 'bebe', name);
      else setRel(w.state, m.id, baby.id, { f: 30, r: 0 });
    }
    if (mine) w.toast(`¡Ha nacido ${name}! Bienvenido/a al mundo${parents.length ? `, bebé de ${parents.map((p) => p.name).join(' y ')}` : ''}`, '👶');
    w.addNews(`ha nacido ${name}, el bebé de la ${h.name}`, [baby.id, ...parents.map((p) => p.id)]);
  }
}

/** Lo que cambia al pasar de una etapa de la vida a otra. */
export function onStageChange(w: World, a: Agent, after: string) {
  const mine = w.isPlayerMember(a);
  if (a.kind !== 'person') return;
  if (after === 'child') {
    // Sale de la cuna y empieza el colegio.
    const crib = w.object(a.home);
    a.home = undefined;
    if (crib) a.pos = freeSpotNear(w, a.lotId, { x: crib.x, y: crib.y + 1 });
    a.current = null;
    a.job = { career: 'school', level: 1, perf: 50 };
    if (mine) w.toast(`${a.name} ya camina y empieza el colegio`, '🎒');
  } else if (after === 'young' && a.job?.career === 'school') {
    a.job = undefined;
    if (mine) w.toast(`${a.name} ha terminado el colegio y ya puede buscar trabajo`, '🎓');
    if (mine) {
      a.traitPick = true;
      w.toast(`${a.name} ya es adulto/a: en su perfil puedes elegir uno de sus rasgos`, '🧬');
    }
  } else if (after === 'elder' && a.job && a.job.career !== 'school') {
    a.job = undefined;
    if (mine) w.toast(`${a.name} se jubila. ¡A disfrutar! (pensión de §30 al día)`, '🏖️');
  }
}

/** Probabilidad diaria de morir de viejo: empieza unos días antes del final de la última etapa. */
export function deathChance(_w: World, a: Agent): number {
  const stages = SPECIES[a.species].stages;
  const last = stages[stages.length - 1].until;
  const from = last - 8;
  if (a.ageDays < from) return 0;
  if (a.ageDays >= last) return 1;
  return (a.ageDays - from + 1) / 10;
}

/** Alguien deja la partida: muere, se escapa o se lo llevan. */
export function die(w: World, a: Agent, cause: 'old' | 'hunger' | 'social' | 'runaway') {
  const h = w.householdOf(a);
  const mine = w.isPlayerMember(a);
  const texts = {
    old: `${a.name} ha fallecido a los ${a.ageDays} días. Descanse en paz`,
    hunger: `${a.name} ha muerto de hambre`,
    social: `Los servicios sociales se han llevado a ${a.name} por falta de cuidados`,
    runaway: `${a.name} se ha escapado de casa en busca de comida`,
  };
  const knownByPlayer = w.members.some((m) => m !== a && (getRel(w.state, m.id, a.id).f >= 15 || getRel(w.state, m.id, a.id).status));
  if (mine || knownByPlayer) w.toast(mine ? texts[cause] : `${texts[cause]} (${h?.name ?? ''})`, cause === 'old' || cause === 'hunger' ? '🕊️' : '💔', a.id);
  // Luto: su familia y quien le quería.
  if (cause === 'old' || cause === 'hunger') {
    for (const o of w.state.agents) {
      if (o === a) continue;
      const rel = getRel(w.state, o.id, a.id);
      if (o.householdId === a.householdId || rel.f >= 45 || rel.status) {
        o.needs.fun = clamp(o.needs.fun - 25);
        o.needs.social = clamp(o.needs.social - 15);
        if (o.kind === 'person') w.feel(o, 'luto', a.name);
      }
    }
    if (h && mine) placeGrave(w, h.lotId, a);
  }
  if (cause === 'old' && a.kind === 'person') w.addNews(`ha fallecido ${a.name}, de la ${h?.name ?? 'vecindad'}. Que en paz descanse`, [a.id]);
  const lastPerson = !!h && a.kind === 'person' && !h.memberIds.some((id) => id !== a.id && w.agent(id)?.kind === 'person');
  if (lastPerson && h) inherit(w, h, a);

  // Fuera del mundo
  w.state.agents = w.state.agents.filter((x) => x !== a);
  if (h) h.memberIds = h.memberIds.filter((id) => id !== a.id);
  for (const k of Object.keys(w.state.rels)) if (k.split('|').includes(a.id)) delete w.state.rels[k];
  for (const x of w.state.households) if (x.expecting?.parents.includes(a.id)) x.expecting.parents = x.expecting.parents.filter((id) => id !== a.id);
  if (w.state.activeAgentId === a.id) {
    const next = w.members.find((m) => m.kind === 'person') ?? w.members[0];
    if (next) w.state.activeAgentId = next.id;
  }
  if (lastPerson && h) {
    if (h.id === w.household.id) {
      w.state.familyGone = true;
      w.state.speed = 0;
      w.toast(`La ${h.name} se ha quedado sin nadie. Elige con qué familia del barrio continuar`, '🕯️');
    } else {
      replaceFamily(w, h, []);
    }
  }
}

export function placeGrave(w: World, lotId: string, a: Agent) {
  const layout = w.layoutOf(lotId);
  const grid = w.gridOf(lotId);
  for (let y = 0; y < layout.h; y++) {
    for (let x = layout.w - 1; x >= 0; x--) {
      if (!isOutdoor(layout.tiles[y][x]) || !isWalkable(grid, x, y) || w.objectAt(lotId, x, y)) continue;
      if (y === layout.entrance.y) continue; // no tapar el camino de entrada
      w.state.objects.push({ id: w.newId('o'), def: 'grave', lotId, x, y, label: a.name });
      return;
    }
  }
}

/** Herencia: el dinero de una familia que se extingue pasa a su pariente o pareja más cercano. */
export function inherit(w: World, h: Household, last: Agent) {
  if (h.funds <= 0) return;
  let best: { heir: Agent; score: number } | null = null;
  for (const [k, rel] of Object.entries(w.state.rels)) {
    const ids = k.split('|');
    if (!ids.includes(last.id)) continue;
    const other = w.agent(ids[0] === last.id ? ids[1] : ids[0]);
    if (!other || other.kind !== 'person' || other.householdId === h.id) continue;
    const score = (rel.kin ? 200 : 0) + (rel.status ? 150 : 0) + rel.f;
    if (score >= 60 && (!best || score > best.score)) best = { heir: other, score };
  }
  if (!best) return;
  const to = w.householdOf(best.heir);
  if (!to) return;
  money(w, to, h.funds, 'herencia');
  if (to.id === w.household.id) w.toast(`${best.heir.name} hereda §${h.funds} de ${last.name}`, '💰');
  h.funds = 0;
}

/** Una familia vecina desaparece: llega otra nueva a su casa (con las mascotas que quedaron). */
export function replaceFamily(w: World, old: Household, extraPets: Agent[]) {
  const pets = [...old.memberIds.map((id) => w.agent(id)!).filter(Boolean), ...extraPets];
  w.state.households = w.state.households.filter((x) => x.id !== old.id);
  if (districtOf(w, old.lotId) === 'alcorcon' && Math.random() < 0.4) {
    generateOkupas(w.state, old.lotId);
    w.addNews('unos okupas se han metido en la casa vacía de Alcorcón', []);
    return;
  }
  const fresh = generateFamily(w.state, old.lotId);
  for (const pet of pets) {
    pet.householdId = fresh.id;
    fresh.memberIds.push(pet.id);
  }
  if (w.detailedLots().has(old.lotId)) for (const id of fresh.memberIds) w.agent(id)!.abstract = true;
  w.toast(`La ${fresh.name} se muda al barrio`, '🚚');
  w.addNews(`han llegado vecinos nuevos: la ${fresh.name}`, fresh.memberIds);
}

/** La familia del jugador se ha extinguido: seguir con otra del barrio. */
export function continueWith(w: World, householdId: string) {
  const old = w.household;
  const next = w.state.households.find((h) => h.id === householdId);
  if (!next || next.id === old.id) return;
  w.state.playerHouseholdId = next.id;
  w.state.familyGone = false;
  const person = next.memberIds.map((id) => w.agent(id)!).find((m) => m.kind === 'person');
  w.state.activeAgentId = (person ?? w.agent(next.memberIds[0]))!.id;
  // Las mascotas que quedaron en la antigua casa se van con la familia nueva de esa casa.
  const oldLot = w.lotById(old.lotId);
  if (oldLot.name === 'Vuestra casa') oldLot.name = `Casa de los ${old.name.replace('Familia ', '')}`;
  replaceFamily(w, old, []);
  w.toast(`Ahora juegas con la ${next.name}`, '🏡');
}

/** Los hijos sacan un rasgo de su padre o de su madre; el otro es suyo. */
export function inheritTraits(_w: World, parents: Agent[]): string[] {
  const pool = parents.flatMap((p) => traitsOf(p).map((t) => t.id));
  const any = () => TRAITS[Math.floor(Math.random() * TRAITS.length)].id;
  const first = pool.length ? pool[Math.floor(Math.random() * pool.length)] : any();
  let second = any();
  for (let i = 0; i < 20 && (second === first || [first, second].sort().join() === 'grunon,optimista'); i++) second = any();
  if (second === first) second = first === 'bromista' ? 'optimista' : 'bromista';
  return [first, second];
}

/** Los hábitos cambian a la gente: quien corre mucho acaba siendo deportista. */
export function evolveTraits(w: World) {
  for (const m of w.members) {
    if (m.kind !== 'person' || !['teen', 'young', 'adult', 'elder'].includes(w.stageOf(m))) continue;
    if (m.traitChangedDay !== undefined && w.day - m.traitChangedDay < 7) continue;
    const ts = traitsOf(m).map((t) => t.id);
    let best: { trait: string; ratio: number; sum: number } | undefined;
    for (const h of HABITS) {
      if (ts.includes(h.trait)) continue;
      const sum = h.actions.reduce((acc, k) => acc + (m.stats?.[k] ?? 0), 0) - (m.stats?.[`base_${h.trait}`] ?? 0);
      const ratio = sum / h.min;
      if (ratio >= 1 && (!best || ratio > best.ratio)) best = { trait: h.trait, ratio, sum };
    }
    if (!best) continue;
    // Se pierde el rasgo que menos encaja con lo que hace ahora (y nunca gruñón y optimista a la vez).
    const habitRatio = (t: string) => {
      const h = HABITS.find((x) => x.trait === t);
      return h ? h.actions.reduce((acc, k) => acc + (m.stats?.[k] ?? 0), 0) / h.min : 0;
    };
    const clash = best.trait === 'grunon' ? 'optimista' : best.trait === 'optimista' ? 'grunon' : '';
    const out = ts.includes(clash) ? clash : [...ts].sort((x, y) => habitRatio(x) - habitRatio(y))[0];
    m.traits = ts.map((t) => (t === out ? best!.trait : t));
    m.traitChangedDay = w.day;
    m.stats = m.stats ?? {};
    m.stats[`base_${best.trait}`] = (m.stats[`base_${best.trait}`] ?? 0) + best.sum;
    const nt = TRAIT_BY_ID[best.trait];
    const ot = TRAIT_BY_ID[out];
    w.toast(`${HABIT_TEXT[best.trait] ?? 'Con el tiempo...'} ¡${m.name} se ha vuelto ${nt.label.toLowerCase()}!${ot ? ` (ya no es ${ot.label.toLowerCase()})` : ''}`, nt.icon);
    w.addNews(`${m.name} ha cambiado mucho: ahora es ${nt.label.toLowerCase()}`, [m.id]);
  }
}

/** Cambia un rasgo (al hacerse adulto se puede elegir uno). */
export function pickTrait(w: World, a: Agent, oldId: string, newId: string) {
  const ts = traitsOf(a).map((t) => t.id);
  if (!a.traitPick || !ts.includes(oldId) || ts.includes(newId)) return;
  if ((newId === 'grunon' && ts.includes('optimista') && oldId !== 'optimista') || (newId === 'optimista' && ts.includes('grunon') && oldId !== 'grunon')) return;
  a.traits = ts.map((t) => (t === oldId ? newId : t));
  a.traitPick = false;
  w.toast(`${a.name} ahora es ${TRAIT_BY_ID[newId].label.toLowerCase()}`, TRAIT_BY_ID[newId].icon);
}

export function setAspiration(w: World, a: Agent, id: string) {
  if (!ASPIRATION_BY_ID[id] || !canAspire(w, a)) return;
  a.aspiration = { id, stage: 0 };
  w.toast(`${a.name} tiene una nueva meta de vida: ${ASPIRATION_BY_ID[id].label}`, ASPIRATION_BY_ID[id].icon);
}

/** Cada hora: ¿alguien de la familia ha cumplido una etapa de su meta? */
export function checkAspirations(w: World) {
  if (!w.wishesEnabled) return;
  for (const m of w.members) {
    if (!canAspire(w, m)) continue;
    if (!m.aspiration) {
      m.aspiration = { id: suggestAspiration(m), stage: 0 };
      continue;
    }
    const def = ASPIRATION_BY_ID[m.aspiration.id];
    const st = def?.stages[m.aspiration.stage];
    if (!def || !st || !st.done(w, m)) continue;
    m.aspiration.stage++;
    const last = m.aspiration.stage >= def.stages.length;
    const reward = last ? 1500 : 150 * m.aspiration.stage;
    money(w, w.household, reward, 'metas');
    if (last) {
      w.feel(m, 'orgulloso', def.label, 72);
      m.aspirationsDone = [...(m.aspirationsDone ?? []), def.id];
      w.toast(`¡${m.name} ha cumplido su meta de vida: ${def.label}! +§${reward}`, '🏆');
      w.addNews(`${m.name} ha cumplido su sueño: ${def.label.toLowerCase()}`, [m.id]);
      w.say(m.id, '¡Lo he conseguido! ¡Mi sueño!', 'say');
    } else {
      w.feel(m, 'orgulloso', def.label);
      w.toast(`Meta de ${m.name}: «${st.label}» ✓ (+§${reward})`, def.icon);
    }
  }
}
