// Menú de acciones al tocar algo de la escena: qué puede hacer el personaje activo.

import { DEGREES } from '../data/education';
import { BOOK_TIERS, BOOKS, RECIPES } from '../data/skillTree';
import { booksAt, bookReason, buyBookReason, recipeReason } from '../sim/systems/skillWorks';
import { marketPrice, secondhandOffers, secondhandReason, stallGoods, stallPrice } from '../sim/systems/places';
import { pricedLabel } from '../sim/systems/economy';
import { SKILL_BY_ID } from '../data/skills';
import { degreeReason, enrollReason, hasScholarship, startLevel } from '../sim/systems/education';
import { CAREERS, JOB_CAREERS, scheduleText } from '../data/careers';
import { OBJECTS, QUALITY, priceOf } from '../data/objects';
import { PET_TRAIT_BY_ID } from '../data/pets';
import { SPECIES, lifeStage } from '../data/species';
import { ROLE_LABEL } from '../data/street';
import { getRel } from '../sim/social';
import { mainTag } from '../sim/relations';
import { traitsOf } from '../sim/traits';
import type { SpeciesId } from '../sim/types';
import { MAX_MEMBERS, type Target } from '../sim/world';
import { $, esc } from './dom';
import { Part } from './part';

export class ActionSheet extends Part {
  sheetTarget: Target | null = null;
  /** Modo ⏰: elegir una acción la programa a una hora en vez de hacerla ya. */
  scheduling = false;

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    $('#sheet').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'sheet') return this.closeSheet();
      const b = el.closest('button');
      if (!b || !this.sheetTarget) return;
      if (b.dataset.close !== undefined) return this.closeSheet();
      if (b.dataset.sched !== undefined) {
        this.scheduling = !this.scheduling;
        return this.handleTap(this.sheetTarget);
      }
      if (b.dataset.schedgo) {
        const input = $('#sheet').querySelector<HTMLInputElement>('.sched-row input');
        const [hh, mm] = (input?.value || '20:00').split(':').map(Number);
        this.world.scheduleOrder(this.world.activeAgent.id, b.dataset.schedgo, this.sheetTarget, (hh || 0) * 60 + (mm || 0));
        this.scheduling = false;
        this.closeSheet();
        this.hud.render();
        return;
      }
      if (b.dataset.schedno !== undefined) {
        $('#sheet').querySelector('.sched-row')?.remove();
        return;
      }
      if (b.dataset.bmove) {
        const o = this.world.object(b.dataset.bmove);
        if (o) this.hud.build.selectForBuild({ kind: 'move', id: o.id, def: o.def });
        return this.closeSheet();
      }
      if (b.dataset.brot) {
        this.world.rotateObject(b.dataset.brot);
        this.hud.build.renderBuild();
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
      if (b.dataset.degree) {
        this.world.command(this.world.activeAgent.id, 'enroll', this.sheetTarget, b.dataset.degree);
        this.closeSheet();
        this.hud.render();
        return;
      }
      if (b.dataset.recipe) {
        this.world.command(this.world.activeAgent.id, b.dataset.recipeAction ?? 'cook', this.sheetTarget, b.dataset.recipe);
        this.closeSheet();
        this.hud.render();
        return;
      }
      if (b.dataset.buybook) {
        this.world.command(this.world.activeAgent.id, 'buy_book', this.sheetTarget, b.dataset.buybook);
        this.closeSheet();
        this.hud.render();
        return;
      }
      if (b.dataset.readbook) {
        this.world.command(this.world.activeAgent.id, 'read_skill_book', this.sheetTarget, b.dataset.readbook);
        this.closeSheet();
        this.hud.render();
        return;
      }
      if (b.dataset.secondhand) {
        this.world.command(this.world.activeAgent.id, 'buy_secondhand', this.sheetTarget, b.dataset.secondhand);
        this.closeSheet();
        this.hud.render();
        return;
      }
      if (b.dataset.stallsell) {
        this.world.command(this.world.activeAgent.id, 'sell_stall', this.sheetTarget, b.dataset.stallsell);
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
      if (action === 'enroll') return this.showDegrees();
      if ((action === 'cook' || action === 'bake') && !this.scheduling) return this.showRecipes(action);
      if (action === 'buy_book') return this.showBookShop();
      if (action === 'buy_secondhand') return this.showSecondhand();
      if (action === 'sell_stall') return this.showStallSale();
      if (action === 'invest') return this.hud.market.open(true);
      if (action === 'read_skill_book' && !this.scheduling) return this.showBooks();
      if (action && this.scheduling) return this.askTime(action);
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
      const tg = mainTag(w, active, t);
      const relText = t.id === active.id ? '' : ` · ${tg.icon} ${tg.label}${rel.r > 0 && !rel.kin ? ` · 💕 ${Math.round(rel.r)}` : ''}`;
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
            <span class="act-label">${esc(pricedLabel(this.world, o.def.label))}${o.reason ? `<small>${esc(o.reason)}</small>` : ''}</span>
          </button>`,
      )
      .join('');

    const isMember = target.kind === 'agent' && target.id !== active.id && w.household.memberIds.includes(target.id);
    // Se puede programar lo que se le manda a alguien de la familia (no las listas de trabajo o adopción).
    const canSchedule = w.isPlayerMember(active) && !!items;
    const switchBtn = isMember ? `<button class="act switch" data-switch="${target.id}"><span class="act-icon">🔁</span><span class="act-label">Controlar a ${esc(w.agent(target.id)!.name)}</span></button>` : '';

    $('#sheet').innerHTML = `
      <div class="sheet-card">
        <div class="sheet-head">
          <div><div class="sheet-title">${esc(title)}</div><div class="sheet-sub">${esc(subtitle)}</div></div>
          ${canSchedule ? `<button class="icon-btn sched-toggle ${this.scheduling ? 'on' : ''}" data-sched aria-label="Programar a una hora" aria-pressed="${this.scheduling}">⏰</button>` : ''}
          <button class="icon-btn" data-close>✕</button>
        </div>
        <div class="sheet-who">${this.scheduling && canSchedule ? `⏰ Elige qué programar para ${esc(active.name)}…` : target.kind === 'agent' && target.id === active.id ? 'Por su cuenta puede…' : `${esc(active.name)} puede…`}</div>
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

  /** Modo ⏰: ¿a qué hora? Por defecto, la próxima hora en punto. */
  private askTime(actionId: string) {
    const card = $('#sheet').querySelector('.sheet-card');
    if (!card) return;
    card.querySelector('.sched-row')?.remove();
    const next = (Math.floor((this.world.state.minutes % 1440) / 60) + 1) % 24;
    const label = $('#sheet').querySelector(`[data-action="${CSS.escape(actionId)}"] .act-label`)?.firstChild?.textContent?.trim() ?? '';
    const row = document.createElement('div');
    row.className = 'sched-row';
    row.innerHTML = `<label class="small">¿A qué hora? <input type="time" step="900" value="${String(next).padStart(2, '0')}:00" aria-label="Hora para ${esc(label)}" /></label>
      <button class="map-btn" data-schedgo="${esc(actionId)}">⏰ Programar</button>
      <button class="icon-btn" data-schedno aria-label="Cancelar">✕</button>`;
    card.append(row);
    row.querySelector('input')?.focus();
  }

  /** Cocinar u hornear: elegir receta (las de más nivel, con candado hasta llegar). */
  private showRecipes(actionId: 'cook' | 'bake') {
    const w = this.world;
    const a = w.activeAgent;
    const skill = actionId === 'bake' ? 'reposteria' : 'cocina';
    const lotId = (this.sheetTarget?.kind === 'object' && w.object(this.sheetTarget.id)?.lotId) || a.lotId;
    const lvl = Math.floor(a.skills?.[skill] ?? 0);
    const items = RECIPES.filter((r) => r.skill === skill)
      .map((r) => {
        const locked = lvl < r.level;
        const why = recipeReason(w, a, r, lotId);
        const extra = [r.portions > 1 ? `${r.portions} raciones` : '1 ración', r.family ? 'da de comer a la familia' : '', r.sell ? `se vende por §${r.sell + 15 * lvl}` : ''].filter(Boolean).join(' · ');
        return `<button class="act" data-recipe="${r.id}" data-recipe-action="${actionId}" ${why ? 'disabled' : ''}>
          <span class="act-icon">${locked ? '🔒' : r.icon}</span>
          <span class="act-label">${esc(r.label)}<small class="info">${locked ? `Se desbloquea con ${esc(SKILL_BY_ID[skill].label.toLowerCase())} ${r.level}` : `${esc(r.desc)} · ${esc(extra)}${why ? ` · ${esc(why)}` : ''}`}</small></span>
        </button>`;
      })
      .join('');
    $('#sheet').querySelector('.sheet-card')!.innerHTML = `
      <div class="sheet-head">
        <div><div class="sheet-title">${actionId === 'bake' ? '🧁 ¿Qué horneamos?' : '🍳 ¿Qué cocinamos?'}</div><div class="sheet-sub">${esc(a.name)}: ${esc(SKILL_BY_ID[skill].label.toLowerCase())} nivel ${lvl}. Con más nivel, más recetas</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <div class="sheet-actions one-col">${items}</div>`;
  }

  /** Mercadillo: los muebles de segunda mano de hoy (a mitad de precio, y regateando, menos). */
  private showSecondhand() {
    const w = this.world;
    const a = w.activeAgent;
    const lotId = (this.sheetTarget?.kind === 'object' && w.object(this.sheetTarget.id)?.lotId) || a.lotId;
    const items = secondhandOffers(w, lotId)
      .map((x) => {
        const d = OBJECTS[x.def];
        const why = x.sold ? 'Vendido' : secondhandReason(w, a, x.id);
        const price = marketPrice(a, 'buy_secondhand', x.price);
        const fresh = w.priced(priceOf(d, x.q));
        return `<button class="act" data-secondhand="${x.id}" ${why ? 'disabled' : ''}>
          <span class="act-icon">${d.icon || '🪑'}</span>
          <span class="act-label">${esc(d.name)}${d.tiers ? ` (${esc(QUALITY[x.q].label.toLowerCase())})` : ''} · §${price}<small class="info">Nuevo cuesta §${fresh}${why ? ` · ${esc(why)}` : ''}</small></span>
        </button>`;
      })
      .join('');
    $('#sheet').querySelector('.sheet-card')!.innerHTML = `
      <div class="sheet-head">
        <div><div class="sheet-title">🪑 Muebles de segunda mano</div><div class="sheet-sub">A mitad de precio (regateando, menos). Os lo llevan a casa, al primer hueco libre</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <p class="sheet-note">Lo de segunda mano se revende por menos. Cada semana hay género nuevo.</p>
      <div class="sheet-actions one-col">${items}</div>`;
  }

  /** Mercadillo: qué mueble de casa vender en el puesto (sale mejor que vendiéndolo desde la obra). */
  private showStallSale() {
    const w = this.world;
    const a = w.activeAgent;
    const items = stallGoods(w)
      .sort((x, y) => stallPrice(w, a, y) - stallPrice(w, a, x))
      .map((o) => {
        const d = OBJECTS[o.def];
        return `<button class="act" data-stallsell="${o.id}">
          <span class="act-icon">${d.icon || '📦'}</span>
          <span class="act-label">${esc(d.name)} · +§${stallPrice(w, a, o)}<small class="info">Desde la obra, §${w.sellRefund(o)}${o.used ? ' · de segunda mano' : ''}${o.broken ? ' · roto' : ''}</small></span>
        </button>`;
      })
      .join('');
    $('#sheet').querySelector('.sheet-card')!.innerHTML = `
      <div class="sheet-head">
        <div><div class="sheet-title">🏷️ ¿Qué vendemos?</div><div class="sheet-sub">${esc(a.name)} monta el puesto con lo que tengáis en casa. Con carisma se saca más</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <div class="sheet-actions one-col">${items || `<div class="empty">No tenéis nada en casa que se pueda vender.</div>`}</div>`;
  }

  /** Libros de habilidad por internet: dos tomos por habilidad. */
  private showBookShop() {
    const w = this.world;
    const a = w.activeAgent;
    const h = w.householdOf(a);
    const items = Object.values(BOOKS)
      .map((b) => {
        const s = SKILL_BY_ID[b.skill];
        const why = buyBookReason(w, a, b.id);
        const owned = h?.books?.includes(b.id);
        return `<button class="act" data-buybook="${b.id}" ${why ? 'disabled' : ''}>
          <span class="act-icon">${s.icon}</span>
          <span class="act-label">«${esc(b.title)}» · §${this.world.priced(b.price)}<small class="info">${esc(s.label)}, ${esc(BOOK_TIERS[b.tier].label.toLowerCase())}: enseña ${b.from ? `del nivel ${b.from} ` : ''}hasta el ${b.upTo}${owned ? ' · ✅ Ya lo tenéis' : why ? ` · ${esc(why)}` : ''}</small></span>
        </button>`;
      })
      .join('');
    $('#sheet').querySelector('.sheet-card')!.innerHTML = `
      <div class="sheet-head">
        <div><div class="sheet-title">📚 Libros de habilidad</div><div class="sheet-sub">Llegan a la estantería de casa y sirven para toda la familia</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <p class="sheet-note">Los libros enseñan lo básico (hasta el nivel 4) y lo avanzado (hasta el 7). De ahí para arriba, solo practicando. En la biblioteca están todos, gratis.</p>
      <div class="sheet-actions one-col">${items}</div>`;
  }

  /** Estantería: qué libro de habilidad estudiar. */
  private showBooks() {
    const w = this.world;
    const a = w.activeAgent;
    const lotId = (this.sheetTarget?.kind === 'object' && w.object(this.sheetTarget.id)?.lotId) || a.lotId;
    const books = booksAt(w, lotId);
    const items = books
      .map((b) => {
        const s = SKILL_BY_ID[b.skill];
        const why = bookReason(w, a, b.id, lotId);
        return `<button class="act" data-readbook="${b.id}" ${why ? 'disabled' : ''}>
          <span class="act-icon">${s.icon}</span>
          <span class="act-label">«${esc(b.title)}»<small class="info">${esc(s.label)} · hasta el nivel ${b.upTo} · ahora: ${Math.floor(a.skills?.[b.skill] ?? 0)}${why ? ` · ${esc(why)}` : ''}</small></span>
        </button>`;
      })
      .join('');
    $('#sheet').querySelector('.sheet-card')!.innerHTML = `
      <div class="sheet-head">
        <div><div class="sheet-title">📘 Estudiar un libro</div><div class="sheet-sub">${books.length} libro${books.length === 1 ? '' : 's'} de habilidad aquí</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <div class="sheet-actions one-col">${items || '<p class="muted small">No hay libros de habilidad. Se compran en el ordenador.</p>'}</div>`;
  }

  /** Buscar trabajo: elegir carrera. */
  showJobs() {
    const a = this.world.activeAgent;
    const items = JOB_CAREERS.map((c) => {
      const current = a.job?.career === c.id;
      const needs = degreeReason(a, c.id);
      const lvl = startLevel(a, c.id);
      return `<button class="act" data-career="${c.id}" ${current || needs ? 'disabled' : ''}>
        <span class="act-icon">${c.icon}</span>
        <span class="act-label">${esc(c.name)} · ${esc(c.levels[lvl - 1].title)}<small class="info">${needs ? `${esc(needs)} · ` : c.degree ? '🎓 Con tu título · ' : lvl > 1 ? '🎓 Empiezas más arriba por tu carrera · ' : ''}${c.business ? `Montarlo: §${this.world.priced(c.startup ?? 0).toLocaleString('es-ES')} · ganancias variables · cuota §${this.world.priced(90)}/semana` : `§${this.world.wage(c.levels[lvl - 1].pay)}/jornada`} · ${esc(scheduleText(c))}${current ? ' · (ya trabaja aquí)' : ''}</small></span>
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

  /** Universidad: elegir carrera (con beca, gratis). */
  showDegrees() {
    const a = this.world.activeAgent;
    const beca = hasScholarship(a);
    const items = Object.values(DEGREES)
      .map((d) => {
        const why = enrollReason(this.world, a, d.id);
        const c = CAREERS[d.career];
        return `<button class="act" data-degree="${d.id}" ${why ? 'disabled' : ''}>
          <span class="act-icon">${d.icon}</span>
          <span class="act-label">${esc(d.label)} · ${d.days} días<small class="info">${why ? `${esc(why)} · ` : ''}${beca ? 'Con beca: gratis' : `Matrícula §${d.cost}`} · lleva a ${esc(c.name.toLowerCase())}${d.startLevel ? ` (empiezas de ${esc(c.levels[d.startLevel - 1].title.toLowerCase())})` : ''} · aprende ${esc(SKILL_BY_ID[d.skill]?.label.toLowerCase() ?? '')}</small></span>
        </button>`;
      })
      .join('');
    $('#sheet').querySelector('.sheet-card')!.innerHTML = `
      <div class="sheet-head">
        <div><div class="sheet-title">🎓 Universidad</div><div class="sheet-sub">${beca ? `${esc(a.name)} tiene beca por sus notas del instituto` : 'Clase de lunes a viernes, de 9:00 a 14:00 (sin sueldo)'}</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <p class="sheet-note">Con buenas notas se acaba antes. Estudiar en casa o en la biblioteca sube las notas. Si trabaja, lo deja para estudiar.</p>
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
    this.scheduling = false;
    $('#sheet').hidden = true;
    this.sheetTarget = null;
  }
}
