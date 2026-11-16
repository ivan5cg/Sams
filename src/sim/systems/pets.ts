// Mascotas: adopción, trucos, persona favorita y comportamientos especiales (hurón, cobaya).
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { ACTIONS } from '../../data/actions';
import { isOutdoor } from '../../data/lot';
import { PET_TRAIT_BY_ID, TRICKS } from '../../data/pets';
import { SPECIES } from '../../data/species';
import { MAX_MEMBERS } from '../constants';
import { makeAgent, randomIndoorTile } from '../neighborhood';
import { isWalkable } from '../pathfinding';
import { getRel, setRel } from '../social';
import type { Agent, Household, PlacedObject, SpeciesId, Vec } from '../types';
import { clamp, moodScore, rand } from '../util';
import type { World } from '../world';
import { money } from './money';
import { beginTask, endTask } from './tasks';
import { countFeat } from './feats';

export function canAdopt(w: World, species: SpeciesId): { ok: boolean; reason?: string } {
  const sp = SPECIES[species];
  if (sp.kind !== 'pet') return { ok: false };
  if (w.members.length >= MAX_MEMBERS) return { ok: false, reason: `Máximo ${MAX_MEMBERS} en casa` };
  if (w.household.funds < sp.price) return { ok: false, reason: 'No hay dinero' };
  if (sp.habitat && !freeHabitat(w, sp.habitat)) return { ok: false, reason: 'Hace falta una jaula libre' };
  return { ok: true };
}

export function freeHabitat(w: World, defId: string): PlacedObject | undefined {
  return w.objectsIn(w.household.lotId).find((o) => o.def === defId && !w.residentOf(o.id));
}

export function adopt(w: World, species: SpeciesId): Agent | null {
  const check = canAdopt(w, species);
  if (!check.ok) {
    w.toast(`No se ha podido adoptar: ${check.reason ?? ''}`, '🚫');
    return null;
  }
  const sp = SPECIES[species];
  const used = new Set(w.state.agents.map((a) => a.name));
  const free = sp.names.filter((n) => !used.has(n));
  const name = free.length ? free[Math.floor(Math.random() * free.length)] : `${sp.label} ${w.state.nextId}`;
  const lotId = w.household.lotId;
  const entrance = w.layoutOf(lotId).entrance;
  const pet = makeAgent({
    id: w.newId('a'),
    name,
    species,
    ageDays: Math.round(rand(sp.stages[0].until, sp.stages[0].until + 5)),
    color: 0x999999,
    householdId: w.household.id,
    lotId,
    ...(sp.outdoor ? w.gardenOf(w.household.lotId) : entrance),
  });
  if (sp.habitat) {
    const home = freeHabitat(w, sp.habitat)!;
    pet.home = home.id;
    pet.pos = { x: home.x, y: home.y };
  }
  money(w, w.household, -sp.price, 'mascotas');
  countFeat(w, `adopt_${species}`);
  w.state.agents.push(pet);
  w.household.memberIds.push(pet.id);
  w.toast(`¡Bienvenido/a a casa, ${name}! (${sp.label.toLowerCase()})`, '🎉');
  w.addNews(`la ${w.household.name} ha adoptado ${species === 'guineapig' || species === 'capybara' ? 'una' : 'un'} ${sp.label.toLowerCase()}`, [pet.id]);
  return pet;
}

/** La persona de la familia a la que más quiere (si quiere a alguien de verdad). */
export function favoriteOf(w: World, pet: Agent): Agent | undefined {
  if (pet.kind !== 'pet') return undefined;
  let best: Agent | undefined;
  let bf = 25;
  for (const id of w.householdOf(pet)?.memberIds ?? []) {
    const p = w.agent(id);
    if (!p || p.kind !== 'person') continue;
    const f = getRel(w.state, pet.id, p.id).f;
    if (f > bf) {
      bf = f;
      best = p;
    }
  }
  return best;
}

/** Una sesión de adiestramiento: más rápido si es listo, si está contento y con su persona favorita. */
export function trainPet(w: World, person: Agent, pet: Agent) {
  const learn = PET_TRAIT_BY_ID[pet.petTrait ?? '']?.learn ?? 1;
  const fav = favoriteOf(w, pet) === person ? 1.3 : 1;
  const mood = moodScore(pet);
  if (mood < 25) {
    w.toastFor(person, `${pet.name} no está por la labor hoy`, SPECIES[pet.species].icon);
    return;
  }
  const before = pet.training ?? 0;
  pet.training = Math.min(100, before + 11 * learn * fav * (0.7 + mood / 160));
  const list = TRICKS[pet.species] ?? [];
  const known = Math.min(list.length, Math.floor(pet.training / 20));
  pet.tricks = pet.tricks ?? [];
  while (pet.tricks.length < known) {
    const trick = list[pet.tricks.length];
    pet.tricks.push(trick);
    w.feel(person, 'truco', pet.name);
    w.bump(person, 'tricks');
    if (w.isPlayerMember(person)) w.toast(`¡${pet.name} ha aprendido un truco: ${trick}!`, '🎪');
    w.addNews(`${pet.name}, la mascota de la ${w.householdOf(pet)?.name ?? 'familia'}, sabe ${trick.toLowerCase()}`, [pet.id]);
  }
}

/** Al llegar a casa, la mascota recibe a su persona favorita. */
export function petGreeting(w: World, a: Agent) {
  if (a.kind !== 'person' || !w.isPlayerMember(a)) return;
  for (const pet of w.members) {
    if (pet.kind !== 'pet' || pet.lotId !== a.lotId || pet.travel || pet.hidden || pet.home) continue;
    if (favoriteOf(w, pet) !== a) continue;
    pet.needs.social = clamp(pet.needs.social + 20);
    a.needs.social = clamp(a.needs.social + 8);
    w.feel(a, 'mimos', pet.name);
    const how: Partial<Record<SpeciesId, string>> = { dog: 'moviendo el rabo como loco', cat: 'restregándose por sus piernas', ferret: 'dando saltitos', capybara: 'con toda la calma del mundo' };
    w.toastOnce(`${pet.id}:greet`, `¡${pet.name} recibe a ${a.name} ${how[pet.species] ?? 'muy contento'}!`, SPECIES[pet.species].icon, 360);
  }
}

export function neighbourAdopts(w: World, h: Household, species: SpeciesId) {
  const sp = SPECIES[species];
  const used = new Set(w.state.agents.map((a) => a.name));
  const name = sp.names.find((n) => !used.has(n)) ?? `${sp.label} ${w.state.nextId}`;
  const pet = makeAgent({ id: w.newId('a'), name, species, ageDays: sp.stages[0].until, color: 0x999999, householdId: h.id, lotId: h.lotId, ...(sp.outdoor ? w.gardenOf(h.lotId) : randomIndoorTile()) });
  if (sp.habitat) {
    const cage = w.objectsIn(h.lotId).find((o) => o.def === sp.habitat && !w.residentOf(o.id))!;
    pet.home = cage.id;
    pet.pos = { x: cage.x, y: cage.y };
  }
  pet.abstract = !w.detailedLots().has(h.lotId);
  w.state.agents.push(pet);
  h.memberIds.push(pet.id);
  for (const id of h.memberIds) {
    const m = w.agent(id);
    if (m?.kind === 'person') setRel(w.state, m.id, pet.id, { f: 40, r: 0 });
  }
}

export function nearestHammock(w: World, lotId: string, p: Vec): PlacedObject | undefined {
  let best: PlacedObject | undefined;
  for (const o of w.objectsIn(lotId)) {
    if (o.def !== 'hammock') continue;
    if (!best || Math.hypot(o.x - p.x, o.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) best = o;
  }
  return best;
}

export function nearHammock(w: World, o: PlacedObject): boolean {
  const h = nearestHammock(w, o.lotId, o);
  return !!h && Math.hypot(h.x - o.x, h.y - o.y) <= 2.5;
}

/** El hurón esconde lo que ha robado cerca de su hamaca. */
export function hideObject(w: World, ferret: Agent, o: PlacedObject) {
  const layout = w.layoutOf(o.lotId);
  const grid = w.gridOf(o.lotId);
  const h = nearestHammock(w, o.lotId, ferret.pos) ?? { x: Math.round(ferret.pos.x), y: Math.round(ferret.pos.y) };
  const spots: Vec[] = [];
  for (let y = h.y - 2; y <= h.y + 2; y++) {
    for (let x = h.x - 2; x <= h.x + 2; x++) {
      if (isWalkable(grid, x, y) && !w.objectAt(o.lotId, x, y) && !isOutdoor(layout.tiles[y][x])) spots.push({ x, y });
    }
  }
  if (!spots.length) return;
  const s = spots[Math.floor(Math.random() * spots.length)];
  o.x = s.x;
  o.y = s.y;
  const what: Record<string, string> = { ball: 'la pelota', slippers: 'las zapatillas' };
  if (w.isPlayerMember(ferret)) w.toastOnce(`${ferret.id}:steal`, `¡${ferret.name} ha escondido ${what[o.def] ?? w.objDef(o).name.toLowerCase()}!`, '🫣', 120);
}

/** La cobaya chilla y alguien de su familia viene a hacerle caso. */
export function callForAttention(w: World, pet: Agent) {
  let best: { p: Agent; d: number } | null = null;
  for (const p of w.agentsIn(pet.lotId)) {
    if (p.kind !== 'person' || w.stageOf(p) === 'baby' || p.householdId !== pet.householdId || p.hidden || w.isActive(p) || p.queue.length) continue;
    const c = p.current;
    if (c && (c.byPlayer || c.passiveOf || !ACTIONS[c.actionId].interruptible)) continue;
    const d = Math.hypot(p.pos.x - pet.pos.x, p.pos.y - pet.pos.y);
    if (!best || d < best.d) best = { p, d };
  }
  if (!best) {
    if (w.isPlayerMember(pet)) {
      const baby = pet.kind === 'person';
      w.toastOnce(`${pet.id}:squeak`, baby ? `${pet.name} está llorando y no hay nadie para atenderle` : `${pet.name} chilla pidiendo atención`, baby ? '😭' : '📣', 240, pet.id);
    }
    return;
  }
  let care = 'pet_animal';
  if (pet.kind === 'person') {
    care = pet.needs.hunger < 50 ? 'feed_baby' : pet.needs.bladder < 50 || pet.needs.hygiene < 50 ? 'change_diaper' : 'rock_baby';
  }
  endTask(w, best.p);
  beginTask(w, best.p, { id: w.newId('t'), actionId: care, byPlayer: false, phase: 'walking', remaining: 0, targetAgentId: pet.id });
}
