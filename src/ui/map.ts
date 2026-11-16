// Mapa del barrio: viajar (andando o en metro), acompañantes e invitaciones.

import { SPECIES } from '../data/species';
import type { Agent } from '../sim/types';
import { TRAVEL_MINUTES } from '../sim/world';
import { $, esc } from './dom';
import { Part } from './part';

/** Icono y botón de «ir» de cada local. */
const PLACE_ICON: Record<string, string> = { studio: '🧘', super: '🛒', acai: '🫐', bar: '🍺', metro: '🚇', library: '📚', gym: '🏋️', market: '🏺' };
const PLACE_GO: Record<string, string> = {
  super: 'Ir a hacer la compra',
  acai: 'Ir a por un açaí',
  bar: 'Ir de cañas',
  metro: 'Bajar al metro',
  library: 'Ir a estudiar',
  gym: 'Ir a entrenar',
  market: 'Ir al mercadillo',
};

export class NeighbourhoodMap extends Part {
  companions = new Set<string>();

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    $('#map-btn').addEventListener('click', () => this.openMap());
    $('#map').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'map') return this.closeMap();
      const b = el.closest('button');
      if (!b) return;
      if (b.dataset.close !== undefined) return this.closeMap();
      if (b.dataset.comp) {
        if (this.companions.has(b.dataset.comp)) this.companions.delete(b.dataset.comp);
        else this.companions.add(b.dataset.comp);
        return this.renderMap();
      }
      if (b.dataset.go) {
        const a = this.world.activeAgent;
        const ids = [a.id, ...[...this.companions].filter((id) => this.canAccompany(id))];
        if (this.world.travel(ids, b.dataset.go)) this.closeMap();
        return;
      }
      if (b.dataset.invite) {
        if (this.world.invite(b.dataset.invite)) this.closeMap();
        return;
      }
    });
  }

  /** Puede acompañar al personaje activo: está en el mismo sitio y es libre de moverse. */
  canAccompany(id: string): boolean {
    const w = this.world;
    const a = w.activeAgent;
    const c = w.agent(id);
    return !!c && c.id !== a.id && c.lotId === a.lotId && !c.travel && !c.home && !c.hidden;
  }

  openMap() {
    this.companions.clear();
    this.hud.sheet.closeSheet();
    $('#map').hidden = false;
    this.renderMap();
  }

  closeMap() {
    $('#map').hidden = true;
  }

  renderMap() {
    const w = this.world;
    const a = w.activeAgent;
    const chip = (x: Agent) => {
      const face = x.kind === 'person' ? esc(x.name) : `${SPECIES[x.species].icon} ${esc(x.name)}`;
      return `<span class="who-chip${w.isPlayerMember(x) ? ' mine' : ''}">${face}</span>`;
    };
    const travellers = w.members.filter((m) => this.canAccompany(m.id));
    const leaderOk = a.kind === 'person' && !a.travel;
    const compRow = leaderOk
      ? `<div class="map-comp"><span class="muted small">Con ${esc(a.name)} van:</span>${
          travellers.length
            ? travellers.map((m) => `<button class="comp ${this.companions.has(m.id) ? 'on' : ''}" data-comp="${m.id}">${m.kind === 'pet' ? SPECIES[m.species].icon : '🧑'} ${esc(m.name)}</button>`).join('')
            : '<span class="muted small">nadie más aquí</span>'
        }</div>`
      : `<div class="map-comp muted small">${a.travel ? `${esc(a.name)} va de camino.` : 'Las mascotas salen acompañadas: controla a una persona para viajar.'}</div>`;

    const dist = (id: string) => w.districtOf(id);
    const homeD = dist(w.household.lotId);
    const section = (d: string) => [
      ...w.state.lots.filter((l) => dist(l.id) === d && l.kind !== 'home').map((l) => l.id),
      ...w.state.lots.filter((l) => dist(l.id) === d && l.kind === 'home' && l.id !== w.household.lotId).map((l) => l.id),
    ];
    const other = homeD === 'alcorcon' ? 'madrid' : 'alcorcon';
    const header = (d: string) =>
      `<div class="map-district">${d === 'alcorcon' ? '🏙️ Alcorcón' : d === 'metro' ? '🚇 Metro' : '🏛️ Madrid'}${d !== homeD && d !== 'metro' ? ` <span class="muted small">· en metro, unos ${w.travelMinutes(a.lotId === w.household.lotId ? a.lotId : w.household.lotId, section(d)[0] ?? w.household.lotId)} min</span>` : ''}</div>`;
    const order: string[] = [w.household.lotId, ...section(homeD), `#${other}`, ...section(other), '#metro', ...section('metro')];
    const cards = [`<div class="map-district">${homeD === 'alcorcon' ? '🏙️ Alcorcón' : '🏛️ Madrid'}</div>`, ...order]
      .map((lotId) => {
        if (lotId.startsWith('<')) return lotId;
        if (lotId.startsWith('#')) return header(lotId.slice(1));
        const lot = w.lotById(lotId);
        const here = w.agentsIn(lotId);
        const coming = w.state.agents.filter((x) => x.travel?.to === lotId && w.isPlayerMember(x));
        const mine = lot.householdId === w.household.id;
        const hh = lot.householdId ? w.state.households.find((h) => h.id === lot.householdId) : undefined;
        const venueIcon = PLACE_ICON[lot.layout] ?? '🧘';
        const closed = lot.kind === 'venue' ? w.closedReason(lotId) : undefined;
        const title = mine ? `🏡 Vuestra casa` : lot.layout === 'plaza' ? `⛲ ${esc(lot.name)}` : hh?.okupa ? `🏚️ ${esc(lot.name)} <span class="muted small">· okupas</span>` : lot.kind === 'park' ? '🌳 Parque del barrio' : lot.kind === 'venue' ? `${venueIcon} ${esc(lot.name)}${closed ? ' <span class="muted small">· cerrado</span>' : ''}` : `🏠 ${esc(hh?.name ?? lot.name)}`;
        // Quién vive ahí y no está
        const awayResidents = hh && !mine ? hh.memberIds.map((id) => w.agent(id)!).filter((x) => x.lotId !== lotId || x.travel) : [];
        const go = w.canTravel(a, lotId);
        const venueGo = PLACE_GO[lot.layout] ?? 'Ir a clase';
        const baseGo = mine ? 'Volver a casa' : lot.layout === 'plaza' ? 'Ir a la plaza' : lot.kind === 'park' ? 'Ir al parque' : lot.kind === 'venue' ? venueGo : 'Ir de visita';
        const goLabel = w.needsMetro(a.lotId, lotId) ? `${baseGo} (en metro)` : baseGo;
        const btns: string[] = [];
        if (a.lotId === lotId && !a.travel) btns.push(`<span class="here">📍 ${esc(a.name)} está aquí</span>`);
        else if (leaderOk) btns.push(`<button class="map-btn" data-go="${lotId}" ${go.ok ? '' : 'disabled'}>${w.needsMetro(a.lotId, lotId) ? '🚇' : '🚶'} ${goLabel}</button>`);
        if (hh && !mine) {
          const inv = w.canInvite(hh.id);
          btns.push(`<button class="map-btn ghost" data-invite="${hh.id}" ${inv.ok ? '' : 'disabled'} title="${esc(inv.reason ?? '')}">📞 Invitar${inv.ok ? '' : ` · ${esc(inv.reason ?? '')}`}</button>`);
        }
        return `<div class="place ${a.lotId === lotId ? 'current' : ''}">
          <div class="place-title">${title}</div>
          <div class="place-who">${here.length ? here.map(chip).join('') : '<span class="muted small">No hay nadie</span>'}${coming.length ? `<span class="muted small">· de camino: ${coming.map((c) => esc(c.name)).join(', ')}</span>` : ''}</div>
          ${awayResidents.length ? `<div class="muted small">Fuera: ${awayResidents.map((x) => esc(x.name)).join(', ')}</div>` : ''}
          <div class="place-actions">${btns.join('')}</div>
        </div>`;
      })
      .join('');

    $('#map').innerHTML = `<div class="map-card">
      <div class="sheet-head">
        <div><div class="sheet-title">🗺️ El barrio</div><div class="sheet-sub">Andando, ${TRAVEL_MINUTES} minutos. Entre Madrid y Alcorcón se va en metro (Línea 10 + MetroSur)</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      ${this.miniMap()}
      ${compRow}
      <div class="places">${cards}</div>
    </div>`;
  }

  /** Mapa ilustrado: Madrid, la línea de metro y Alcorcón, con un botón por sitio. */
  miniMap(): string {
    const w = this.world;
    const a = w.activeAgent;
    const pos: Record<string, [number, number]> = {
      L0: [7, 21], L1: [19, 21], L2: [31, 21], L3: [43, 21], L4: [55, 21],
      G: [7, 42], P: [19, 42], M: [31, 42], A1: [43, 42], A2: [55, 42],
      L5: [7, 63], L6: [19, 63], L7: [31, 63], L8: [43, 63], L9: [55, 63],
      BI: [13, 84], GY: [31, 84], MK: [49, 84],
      MT: [66.5, 42], PL: [79, 21], BR: [93, 21], AL1: [79, 42], AL2: [93, 42], AL3: [86, 63],
    };
    const icon = (id: string) => {
      const lot = w.lotById(id);
      if (!lot) return '';
      if (lot.householdId === w.household.id) return '🏡';
      if (w.state.households.find((h) => h.id === lot.householdId)?.okupa) return '🏚️';
      return ({ park: '🌳', plaza: '⛲', ...PLACE_ICON } as Record<string, string>)[lot.layout] ?? '🏠';
    };
    const pins = Object.entries(pos)
      .filter(([id]) => w.lotById(id))
      .map(([id, [x, y]]) => {
        const lot = w.lotById(id);
        const here = a.lotId === id && !a.travel;
        const fam = w.members.some((m) => m.lotId === id && !m.travel && !m.hidden);
        const can = a.kind === 'person' && !a.travel && w.canTravel(a, id).ok;
        const name = lot.householdId === w.household.id ? 'Vuestra casa' : lot.name || 'Casa';
        return `<button class="pin ${here ? 'here' : ''}" style="left:${x}%;top:${y}%" ${can ? `data-go="${id}"` : 'disabled'} title="${esc(name)}" aria-label="${esc(name)}">${icon(id)}${fam ? '<i></i>' : ''}</button>`;
      })
      .join('');
    return `<div class="mini-map">
      <div class="mm-zone mm-madrid"><span>Madrid</span></div>
      <div class="mm-zone mm-alcorcon"><span>Alcorcón</span></div>
      <div class="mm-line"></div>
      ${pins}
    </div>`;
  }
}
