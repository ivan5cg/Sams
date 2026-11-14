// Interfaz en HTML por encima del canvas: reloj, velocidad, retratos de la
// familia, necesidades del personaje activo, cola de acciones y menú contextual.

import { ACTIONS } from '../data/actions';
import { OBJECTS } from '../data/objects';
import { NEED_INFO, SPECIES, lifeStage, needLabel } from '../data/species';
import { NEED_KEYS, type Agent, type SpeciesId } from '../sim/types';
import { MAX_MEMBERS, TRAVEL_MINUTES, type Target, type World } from '../sim/world';

export interface HudCallbacks {
  onSave: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onNewGame: () => void;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function mood(a: Agent): { score: number; icon: string; label: string; color: string } {
  const vals = NEED_KEYS.map((k) => a.needs[k]);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const score = avg - vals.filter((v) => v < 20).length * 12;
  if (score > 70) return { score, icon: '😄', label: 'Muy feliz', color: '#3ddc4a' };
  if (score > 50) return { score, icon: '🙂', label: 'Bien', color: '#9bd84a' };
  if (score > 30) return { score, icon: '😐', label: 'Regular', color: '#f0c43c' };
  return { score, icon: '😫', label: 'Fatal', color: '#e8553d' };
}

function needColor(v: number) {
  if (v > 60) return '#4cd964';
  if (v > 30) return '#f4c430';
  return '#ff4d3d';
}

function hexColor(n: number) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export class Hud {
  private world: World;
  private lastQueueHtml = '';
  private lastPortraitsHtml = '';
  private needsFor = '';
  private sheetTarget: Target | null = null;

  constructor(world: World, private cb: HudCallbacks) {
    this.world = world;
    this.bind();
    setInterval(() => this.render(), 200);
    this.render();
  }

  setWorld(world: World) {
    this.world = world;
    this.needsFor = '';
    this.lastQueueHtml = this.lastPortraitsHtml = '';
    this.closeSheet();
    this.render();
  }

  toast(text: string, icon = 'ℹ️') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${icon}</span><span>${esc(text)}</span>`;
    box.prepend(el);
    while (box.children.length > 3) box.lastElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  // ---------------------------------------------------------------------------

  private bind() {
    $('#speed').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.speed) this.world.state.speed = Number(b.dataset.speed);
      this.render();
    });

    $('#portraits').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.id) return;
      this.world.setActive(b.dataset.id);
      this.closeSheet();
      this.render();
    });

    $('#queue').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.task) this.world.cancel(this.world.activeAgent.id, b.dataset.task);
      this.render();
    });

    $('#needs-toggle').addEventListener('click', () => {
      $('#panel').classList.toggle('collapsed');
    });

    $('#sheet').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'sheet') return this.closeSheet();
      const b = el.closest('button');
      if (!b || !this.sheetTarget) return;
      if (b.dataset.close !== undefined) return this.closeSheet();
      if (b.dataset.adopt) {
        this.world.command(this.world.activeAgent.id, 'adopt', this.sheetTarget, b.dataset.adopt);
        this.closeSheet();
        this.render();
        return;
      }
      const action = b.dataset.action;
      if (action === 'adopt') return this.showAdoption();
      if (action) {
        this.world.command(this.world.activeAgent.id, action, this.sheetTarget);
        this.closeSheet();
        this.render();
      }
    });

    $('#menu-btn').addEventListener('click', () => this.toggleMenu(true));
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
    $('#menu').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'menu') return this.toggleMenu(false);
      const b = el.closest('button');
      switch (b?.dataset.menu) {
        case 'close': this.toggleMenu(false); break;
        case 'save': this.cb.onSave(); this.toggleMenu(false); break;
        case 'export': this.cb.onExport(); break;
        case 'import': $<HTMLInputElement>('#import-file').click(); break;
        case 'new':
          if (confirm('¿Empezar una partida nueva? Se perderá la actual si no la has exportado.')) {
            this.cb.onNewGame();
            this.toggleMenu(false);
          }
          break;
      }
    });
    $<HTMLInputElement>('#import-file').addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const f = input.files?.[0];
      if (f) this.cb.onImport(f);
      input.value = '';
      this.toggleMenu(false);
    });
  }

  // ---------------------------------------------------------------------------
  // Mapa del barrio
  // ---------------------------------------------------------------------------

  private companions = new Set<string>();

  /** Puede acompañar al personaje activo: está en el mismo sitio y es libre de moverse. */
  private canAccompany(id: string): boolean {
    const w = this.world;
    const a = w.activeAgent;
    const c = w.agent(id);
    return !!c && c.id !== a.id && c.lotId === a.lotId && !c.travel && !c.home && !c.hidden;
  }

  private openMap() {
    this.companions.clear();
    this.closeSheet();
    $('#map').hidden = false;
    this.renderMap();
  }

  private closeMap() {
    $('#map').hidden = true;
  }

  private placeName(lotId: string): string {
    const lot = this.world.lotById(lotId);
    if (lot.householdId === this.world.household.id) return 'Casa';
    return lot.kind === 'park' ? 'Parque' : lot.name;
  }

  private renderMap() {
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

    const order = [w.household.lotId, 'P', ...w.state.lots.filter((l) => l.kind === 'home' && l.id !== w.household.lotId).map((l) => l.id)];
    const cards = order
      .map((lotId) => {
        const lot = w.lotById(lotId);
        const here = w.agentsIn(lotId);
        const coming = w.state.agents.filter((x) => x.travel?.to === lotId && w.isPlayerMember(x));
        const mine = lot.householdId === w.household.id;
        const hh = lot.householdId ? w.state.households.find((h) => h.id === lot.householdId) : undefined;
        const title = mine ? `🏡 Vuestra casa` : lot.kind === 'park' ? '🌳 Parque del barrio' : `🏠 ${esc(hh?.name ?? lot.name)}`;
        // Quién vive ahí y no está
        const awayResidents = hh && !mine ? hh.memberIds.map((id) => w.agent(id)!).filter((x) => x.lotId !== lotId || x.travel) : [];
        const go = w.canTravel(a, lotId);
        const goLabel = mine ? 'Volver a casa' : lot.kind === 'park' ? 'Ir al parque' : 'Ir de visita';
        const btns: string[] = [];
        if (a.lotId === lotId && !a.travel) btns.push(`<span class="here">📍 ${esc(a.name)} está aquí</span>`);
        else if (leaderOk) btns.push(`<button class="map-btn" data-go="${lotId}" ${go.ok ? '' : 'disabled'}>🚶 ${goLabel}</button>`);
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
        <div><div class="sheet-title">🗺️ El barrio</div><div class="sheet-sub">Ir andando a cualquier sitio lleva ${TRAVEL_MINUTES} minutos</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      ${compRow}
      <div class="places">${cards}</div>
    </div>`;
  }

  private toggleMenu(open: boolean) {
    $('#menu').hidden = !open;
  }

  // ---------------------------------------------------------------------------
  // Menú contextual (al tocar algo en la casa)
  // ---------------------------------------------------------------------------

  handleTap(target: Target) {
    const w = this.world;
    const active = w.activeAgent;

    if (target.kind === 'tile') {
      this.closeSheet();
      if (w.gridOf(w.viewLotId)[target.y]?.[target.x]) w.command(active.id, 'move', target);
      return;
    }

    if (target.kind === 'agent' && target.id === active.id && !w.optionsFor(active.id, target).length) {
      this.closeSheet();
      return;
    }

    let title: string;
    let subtitle = '';
    if (target.kind === 'object') {
      const o = w.object(target.id)!;
      const d = OBJECTS[o.def];
      title = `${d.icon} ${d.name}`;
      const parts: string[] = [];
      if (d.maxStock) parts.push(`Comida: ${o.stock ?? 0}/${d.maxStock}`);
      if (d.maxDirt) parts.push((o.dirt ?? 0) === 0 ? 'Limpio' : `Suciedad: ${o.dirt}/${d.maxDirt}`);
      const resident = w.residentOf(o.id);
      if (resident) parts.push(`Aquí vive ${resident.name}`);
      subtitle = parts.join(' · ');
    } else {
      const t = w.agent(target.id)!;
      title = `${SPECIES[t.species].icon} ${t.name}`;
      subtitle = `${SPECIES[t.species].label} · ${lifeStage(t.species, t.ageDays).label} · ${mood(t).icon} ${mood(t).label}`;
    }

    const opts = w.optionsFor(active.id, target);
    const items = opts
      .map(
        (o) =>
          `<button class="act" data-action="${o.def.id}" ${o.ok ? '' : 'disabled'}>
            <span class="act-icon">${o.def.icon}</span>
            <span class="act-label">${esc(o.def.label)}${o.reason ? `<small>${esc(o.reason)}</small>` : ''}</span>
          </button>`,
      )
      .join('');

    const isMember = target.kind === 'agent' && target.id !== active.id && w.household.memberIds.includes(target.id);
    const switchBtn = isMember ? `<button class="act switch" data-switch="${target.id}"><span class="act-icon">🔁</span><span class="act-label">Controlar a ${esc(w.agent(target.id)!.name)}</span></button>` : '';

    $('#sheet').innerHTML = `
      <div class="sheet-card">
        <div class="sheet-head">
          <div><div class="sheet-title">${esc(title)}</div><div class="sheet-sub">${esc(subtitle)}</div></div>
          <button class="icon-btn" data-close>✕</button>
        </div>
        <div class="sheet-who">${target.kind === 'agent' && target.id === active.id ? 'Por su cuenta puede…' : `${esc(active.name)} puede…`}</div>
        <div class="sheet-actions">
          ${items || `<div class="empty">${esc(active.name)} no puede hacer nada con esto.</div>`}
          ${switchBtn}
        </div>
      </div>`;
    const sw = $('#sheet').querySelector<HTMLButtonElement>('[data-switch]');
    sw?.addEventListener('click', (e) => {
      e.stopPropagation();
      w.setActive(sw.dataset.switch!);
      this.closeSheet();
      this.render();
    });
    this.sheetTarget = target;
    $('#sheet').hidden = false;
  }

  /** Protectora: elegir qué mascota adoptar. */
  private showAdoption() {
    const w = this.world;
    const pets = (Object.keys(SPECIES) as SpeciesId[]).filter((id) => SPECIES[id].kind === 'pet');
    const items = pets
      .map((id) => {
        const sp = SPECIES[id];
        const check = w.canAdopt(id);
        const extra = sp.habitat ? 'Vive en su jaula' : sp.outdoor ? 'Le gusta el jardín y el agua' : sp.aloof ? 'Independiente' : '';
        return `<button class="act" data-adopt="${id}" ${check.ok ? '' : 'disabled'}>
          <span class="act-icon">${sp.icon}</span>
          <span class="act-label">${esc(sp.label)} · §${sp.price}<small class="${check.ok ? 'info' : ''}">${esc(check.reason ?? extra)}</small></span>
        </button>`;
      })
      .join('');
    $('#sheet').querySelector('.sheet-card')!.innerHTML = `
      <div class="sheet-head">
        <div><div class="sheet-title">🏠 Protectora de animales</div><div class="sheet-sub">Tenéis § ${w.household.funds.toLocaleString('es-ES')} · ${w.members.length}/${MAX_MEMBERS} en casa</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <div class="sheet-who">¿A quién adoptáis?</div>
      <div class="sheet-actions">${items}</div>`;
  }

  private closeSheet() {
    $('#sheet').hidden = true;
    this.sheetTarget = null;
  }

  // ---------------------------------------------------------------------------
  // Render periódico
  // ---------------------------------------------------------------------------

  render() {
    const w = this.world;
    const a = w.activeAgent;

    $('#clock').textContent = `Día ${w.day} · ${w.clock}`;
    $('#funds').textContent = `§ ${w.household.funds.toLocaleString('es-ES')}`;
    $('#family').textContent = `📍 ${this.placeName(w.viewLotId)} · ${w.household.name}`;
    for (const b of $('#speed').querySelectorAll<HTMLButtonElement>('button')) {
      b.classList.toggle('on', Number(b.dataset.speed) === w.state.speed);
    }

    // Retratos
    const portraits = w.members
      .map((m) => {
        const md = mood(m);
        const face = m.kind === 'person' ? esc(m.name[0]) : SPECIES[m.species].icon;
        const bg = m.kind === 'person' ? hexColor(m.color) : '#3a3f55';
        return `<button class="portrait ${m.id === a.id ? 'active' : ''} ${m.hidden || m.travel || m.lotId !== w.viewLotId ? 'away' : ''}" data-id="${m.id}" style="--ring:${md.color};--bg:${bg}" aria-label="${esc(m.name)}">
          <span class="face">${face}</span><span class="pmood">${md.icon}</span>
        </button>`;
      })
      .join('');
    if (portraits !== this.lastPortraitsHtml) {
      $('#portraits').innerHTML = portraits;
      this.lastPortraitsHtml = portraits;
    }

    // Cabecera del panel
    const md = mood(a);
    const stage = lifeStage(a.species, a.ageDays);
    $('#who').innerHTML = `<b>${esc(a.name)}</b> <span class="muted">${esc(stage.label)} · ${a.ageDays} días</span> <span title="${md.label}">${md.icon}</span>`;

    // Cola de acciones
    const tasks = [a.current, ...a.queue].filter((t) => t && t.actionId !== 'idle');
    const travelChip = a.travel ? `<div class="chip now"><span>🚶</span><span class="chip-l">De camino a: ${esc(this.placeName(a.travel.to))}</span></div>` : '';
    let queueHtml = travelChip + tasks
      .map((t, i) => {
        const def = ACTIONS[t!.actionId];
        const target = t!.targetAgentId ? w.agent(t!.targetAgentId)?.name : '';
        const label = t!.passiveOf ? `${def.verb} con ${w.agent(t!.passiveOf)?.name ?? ''}` : `${i === 0 ? def.verb : def.label}${target ? ` · ${target}` : ''}`;
        const cancel = def.forced || t!.passiveOf ? '' : `<button class="x" data-task="${t!.id}" aria-label="Cancelar">✕</button>`;
        return `<div class="chip ${i === 0 ? 'now' : ''} ${t!.byPlayer ? '' : 'auto'}"><span>${def.icon}</span><span class="chip-l">${esc(label)}</span>${cancel}</div>`;
      })
      .join('');
    if (!queueHtml) {
      const own = w.optionsFor(a.id, { kind: 'agent', id: a.id }).length > 0;
      const where = a.home ? 'Toca su jaula' : 'Toca algo';
      queueHtml = `<div class="hint">${a.kind === 'pet' ? '🐾' : '👆'} ${where}${own ? ` o a ${esc(a.name)}` : ''} para darle una orden</div>`;
    }
    if (queueHtml !== this.lastQueueHtml) {
      $('#queue').innerHTML = queueHtml;
      this.lastQueueHtml = queueHtml;
    }

    // Necesidades
    if (this.needsFor !== a.id) {
      $('#needs').innerHTML = NEED_KEYS.map(
        (k) => `<div class="need"><span class="ni">${NEED_INFO[k].icon}</span><span class="nl">${esc(needLabel(a.species, k))}</span><div class="bar"><div class="fill" data-need="${k}"></div></div></div>`,
      ).join('');
      this.needsFor = a.id;
    }
    for (const el of $('#needs').querySelectorAll<HTMLElement>('.fill')) {
      const v = a.needs[el.dataset.need as keyof Agent['needs']];
      el.style.width = `${v}%`;
      el.style.background = needColor(v);
    }
  }
}
