// Menú de acciones al tocar algo de la escena: qué puede hacer el personaje activo.

import { CAREERS, JOB_CAREERS, scheduleText } from '../data/careers';
import { OBJECTS, QUALITY } from '../data/objects';
import { PET_TRAIT_BY_ID } from '../data/pets';
import { SPECIES, lifeStage } from '../data/species';
import { ROLE_LABEL } from '../data/street';
import { getRel, relLabel } from '../sim/social';
import { traitsOf } from '../sim/traits';
import type { SpeciesId } from '../sim/types';
import { MAX_MEMBERS, type Target } from '../sim/world';
import { $, esc } from './dom';
import { Part } from './part';

export class ActionSheet extends Part {
  sheetTarget: Target | null = null;

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    $('#sheet').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'sheet') return this.closeSheet();
      const b = el.closest('button');
      if (!b || !this.sheetTarget) return;
      if (b.dataset.close !== undefined) return this.closeSheet();
      if (b.dataset.bmove) {
        const o = this.world.object(b.dataset.bmove);
        if (o) this.hud.build.selectForBuild({ kind: 'move', id: o.id, def: o.def });
        return this.closeSheet();
      }
      if (b.dataset.bsell) {
        this.world.sellObject(b.dataset.bsell);
        this.hud.build.renderBuild();
        return this.closeSheet();
      }
      if (b.dataset.career) {
        this.world.command(this.world.activeAgent.id, 'find_job', this.sheetTarget, b.dataset.career);
        this.closeSheet();
        this.hud.render();
        return;
      }
      if (b.dataset.adopt) {
        this.world.command(this.world.activeAgent.id, 'adopt', this.sheetTarget, b.dataset.adopt);
        this.closeSheet();
        this.hud.render();
        return;
      }
      const action = b.dataset.action;
      if (action === 'adopt') return this.showAdoption();
      if (action === 'find_job') return this.showJobs();
      if (action) {
        this.world.command(this.world.activeAgent.id, action, this.sheetTarget);
        this.closeSheet();
        this.hud.render();
      }
    });
  }

  /** Se ha tocado algo de la escena: abre el menú con lo que puede hacer el personaje activo. */
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
      title = o.label ? `${d.icon} Aquí descansa ${o.label}` : `${d.icon} ${d.name}${d.tiers && o.q && o.q !== 2 ? ` (${QUALITY[o.q].short})` : ''}`;
      const parts: string[] = [];
      if (d.maxStock) parts.push(`Comida: ${o.stock ?? 0}/${d.maxStock}`);
      if (d.maxDirt) parts.push((o.dirt ?? 0) === 0 ? 'Limpio' : `Suciedad: ${o.dirt}/${d.maxDirt}`);
      if (o.def === 'fridge') {
        const owner = w.pantryOwner(o.lotId);
        if (owner) parts.push(`Raciones: ${owner.pantry ?? 0}${owner.delivery ? ' · pedido en camino' : ''}`);
      }
      const shut = w.closedReason(o.lotId);
      if (shut) parts.push(shut);
      const resident = w.residentOf(o.id);
      if (resident) parts.push(`Aquí vive ${resident.name}`);
      subtitle = parts.join(' · ');
    } else {
      const t = w.agent(target.id)!;
      title = `${SPECIES[t.species].icon} ${t.name}`;
      const rel = getRel(w.state, active.id, t.id);
      const relText = t.id === active.id ? '' : ` · ${relLabel(rel, active.kind, t.kind)}${rel.r > 0 && !rel.kin ? ` · 💕 ${Math.round(rel.r)}` : ''}`;
      const hh = w.householdOf(t);
      const from = hh && hh.id !== w.household.id ? ` · ${hh.name}` : '';
      const pt = t.kind === 'pet' ? PET_TRAIT_BY_ID[t.petTrait ?? ''] : undefined;
      const fav = t.kind === 'pet' ? w.favoriteOf(t) : undefined;
      const traitTxt = t.role
        ? ` · ${ROLE_LABEL[t.role as keyof typeof ROLE_LABEL] ?? ''}`
        : t.kind === 'person'
          ? ` · ${traitsOf(t).map((x) => `${x.icon} ${x.label}`).join(', ')}`
          : `${pt ? ` · ${pt.icon} ${pt.label}` : ''}${fav ? ` · ❤️ ${fav.name}` : ''}${t.tricks?.length ? ` · 🎪 ${t.tricks.length} ${t.tricks.length === 1 ? 'truco' : 'trucos'}` : ''}`;
      subtitle = `${SPECIES[t.species].label} · ${lifeStage(t.species, t.ageDays).label}${from}${relText}${traitTxt}`;
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
      this.hud.render();
    });
    this.sheetTarget = target;
    $('#sheet').hidden = false;
  }

  /** Buscar trabajo: elegir carrera. */
  showJobs() {
    const a = this.world.activeAgent;
    const items = JOB_CAREERS.map((c) => {
      const current = a.job?.career === c.id;
      return `<button class="act" data-career="${c.id}" ${current ? 'disabled' : ''}>
        <span class="act-icon">${c.icon}</span>
        <span class="act-label">${esc(c.name)} · ${esc(c.levels[0].title)}<small class="info">${c.business ? `Montarlo: §${c.startup?.toLocaleString('es-ES')} · ganancias variables · cuota §90/semana` : `§${c.levels[0].pay}/jornada`} · ${esc(scheduleText(c))}${current ? ' · (ya trabaja aquí)' : ''}</small></span>
      </button>`;
    }).join('');
    $('#sheet').querySelector('.sheet-card')!.innerHTML = `
      <div class="sheet-head">
        <div><div class="sheet-title">📰 Ofertas de trabajo</div><div class="sheet-sub">${a.job && !CAREERS[a.job.career].school ? `Ahora: ${esc(CAREERS[a.job.career].levels[a.job.level - 1].title)} (si cambias, empiezas desde abajo)` : `${esc(a.name)} no tiene trabajo`}</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <p class="sheet-note">Se va solo a su hora y vuelve al salir. Si va de buen humor, rinde más y asciende antes.</p>
      <div class="sheet-actions one-col">${items}</div>`;
  }

  /** Protectora: elegir qué mascota adoptar. */
  showAdoption() {
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

  closeSheet() {
    $('#sheet').hidden = true;
    this.sheetTarget = null;
  }
}
