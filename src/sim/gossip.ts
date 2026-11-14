// Salseo: secretos del barrio. Se inventan (líos, deudas, broncas...), se cuentan de unos a otros,
// las vecinas cotillas acaban sabiéndolo todo y, al final, se entera todo el barrio.

import { GOSSIP_TEMPLATES } from '../data/street';
import { getRel, isAdult, partnerOf, relKey } from './social';
import type { Agent, Secret, WorldState } from './types';

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Vecinos normales (ni de la familia del jugador ni gente de la calle) que son adultos. */
export function gossipables(state: WorldState, playerHousehold: string): Agent[] {
  return state.agents.filter((a) => a.kind === 'person' && !a.role && a.householdId !== playerHousehold && isAdult(a));
}

export function addSecret(state: WorldState, s: Omit<Secret, 'id' | 'day'> & { day: number }): Secret | undefined {
  state.secrets = state.secrets ?? [];
  if (state.secrets.some((x) => x.text === s.text)) return undefined;
  const sec: Secret = { id: `s${state.nextId++}`, ...s };
  state.secrets.unshift(sec);
  if (state.secrets.length > 40) state.secrets.length = 40;
  return sec;
}

/** Un salseo nuevo entre vecinos (o un lío, que es lo más jugoso). */
export function inventGossip(state: WorldState, playerHousehold: string, day: number): Secret | undefined {
  const people = gossipables(state, playerHousehold);
  if (people.length < 2) return undefined;
  // Un lío: alguien con pareja y otra persona de otra casa.
  if (Math.random() < 0.3) {
    const x = pick(people.filter((p) => partnerOf(state, p.id)));
    if (x) {
      const pid = partnerOf(state, x.id)!;
      const y = pick(people.filter((p) => p !== x && p.id !== pid && p.householdId !== x.householdId && !getRel(state, x.id, p.id).kin));
      const partner = state.agents.find((a) => a.id === pid);
      if (y && partner) {
        const key = relKey(x.id, y.id);
        const rel = state.rels[key] ?? { f: 20, r: 0 };
        state.rels[key] = { ...rel, f: Math.max(rel.f, 30), r: Math.max(rel.r, 60), affair: true };
        return addSecret(state, { kind: 'lio', text: `${x.name} tiene un lío con ${y.name}, y ${partner.name} no sabe nada`, about: [x.id, y.id, partner.id], known: [x.id, y.id], juicy: 3, day });
      }
    }
  }
  const t = pick(GOSSIP_TEMPLATES);
  const x = pick(people);
  const others = people.filter((p) => p !== x);
  const y = pick(others);
  const pid = partnerOf(state, x.id);
  const partner = pid ? state.agents.find((a) => a.id === pid) : undefined;
  if (t.needs === 'partner' && !partner) return undefined;
  if (t.needs === 'single' && partner) return undefined;
  if (t.needs === 'jobless' && x.job) return undefined;
  if (t.needs === 'job' && !x.job) return undefined;
  if (t.needs === 'two' && !y) return undefined;
  const text = t.text.replace('{x}', x.name).replace('{y}', y?.name ?? '').replace('{p}', partner?.name ?? '');
  const about = [x.id, ...(t.needs === 'two' && y ? [y.id] : []), ...(t.needs === 'partner' && partner ? [partner.id] : [])];
  return addSecret(state, { kind: 'cotilleo', text, about, known: [x.id], juicy: t.juicy, day });
}

/** Cada día los secretos corren: de boca en boca, y las cotillas acaban sabiéndolo todo. */
export function spreadGossip(state: WorldState, playerHousehold: string, day: number): Secret[] {
  const nowPublic: Secret[] = [];
  const chismosas = state.agents.filter((a) => a.role === 'chismosa');
  const people = gossipables(state, playerHousehold);
  for (const s of state.secrets ?? []) {
    if (s.public) continue;
    for (const c of chismosas) if (!s.known.includes(c.id) && Math.random() < 0.3) s.known.push(c.id);
    if (Math.random() < 0.35) {
      const p = pick(people);
      if (p && !s.known.includes(p.id)) s.known.push(p.id);
    }
    const byChismosas = s.known.filter((id) => chismosas.some((c) => c.id === id)).length;
    if (byChismosas >= 2 && day - s.day >= 3 && Math.random() < 0.2 + s.juicy * 0.05) {
      s.public = true;
      nowPublic.push(s);
    }
  }
  return nowPublic;
}

/** Lo más jugoso que sabe `teller` y que `listener` no sabe. */
export function bestSecretFor(state: WorldState, teller: string[], listener: string[]): Secret | undefined {
  const cand = (state.secrets ?? []).filter((s) => s.known.some((id) => teller.includes(id)) && !s.known.some((id) => listener.includes(id)) && !s.public);
  cand.sort((a, b) => b.juicy - a.juicy || b.day - a.day);
  return cand[0];
}
