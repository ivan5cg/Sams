// Modo construcción: catálogo, colocar, mover y vender muebles, y reformas.

import { CATALOG, CATEGORIES, OBJECTS, QUALITY, SELL_RATIO, priceOf, type CatalogCategory } from '../data/objects';
import type { HouseScene } from '../render/HouseScene';
import type { Target } from '../sim/world';
import { $, esc } from './dom';
import { Part } from './part';

export class BuildMode extends Part {
  sceneRef?: () => HouseScene;
  buildCat: CatalogCategory = 'descanso';
  buildSel: { kind: 'buy'; def: string } | { kind: 'move'; id: string; def: string } | null = null;
  speedBeforeBuild = 1;
  buildTier: 1 | 2 | 3 = 2;

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    $('#build-btn').addEventListener('click', () => this.enterBuild());
    $('#build-exit').addEventListener('click', () => this.exitBuild());
    $('#build-tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.cat) return;
      this.buildCat = b.dataset.cat as CatalogCategory;
      this.renderBuild();
    });
    $('#build-tiers').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.tier) return;
      this.buildTier = Number(b.dataset.tier) as 1 | 2 | 3;
      if (this.buildSel?.kind === 'buy') this.selectForBuild(this.buildSel);
      else this.renderBuild();
    });
    $('#build-items').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && b.dataset.expand !== undefined) {
        const ex = this.world.nextExpansion();
        if (ex && confirm(`¿Ampliar la casa por §${ex.price.toLocaleString('es-ES')}? (${ex.label})`)) {
          this.selectForBuild(null);
          this.world.expandHouse();
          this.renderBuild();
        }
        return;
      }
      if (!b?.dataset.item) return;
      const sel = this.buildSel;
      if (sel?.kind === 'buy' && sel.def === b.dataset.item) this.selectForBuild(null);
      else this.selectForBuild({ kind: 'buy', def: b.dataset.item });
    });
    $('#placebar').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.cancel !== undefined) return this.selectForBuild(null);
      if (b.dataset.place !== undefined) this.confirmPlace();
    });
  }

  setScene(get: () => HouseScene) {
    this.sceneRef = get;
  }

  enterBuild() {
    const w = this.world;
    if (!w.canBuildHere()) {
      this.hud.toast('Solo se puede construir en vuestra casa (y estando en ella)', '🏡');
      return;
    }
    this.hud.sheet.closeSheet();
    this.speedBeforeBuild = w.state.speed || 1;
    w.state.speed = 0;
    w.ui.building = true;
    document.body.classList.add('building');
    $('#build').hidden = false;
    this.renderBuild();
  }

  exitBuild() {
    const w = this.world;
    this.selectForBuild(null);
    w.ui.building = false;
    w.state.speed = this.speedBeforeBuild;
    document.body.classList.remove('building');
    $('#build').hidden = true;
    this.hud.sheet.closeSheet();
    this.hud.render();
  }

  selectForBuild(sel: BuildMode['buildSel']) {
    this.buildSel = sel;
    this.world.ui.ghost = null;
    const scene = this.sceneRef?.();
    if (scene) scene.selectingTile = !!sel;
    $('#placebar').hidden = !sel;
    if (sel) {
      const d = OBJECTS[sel.def];
      $('#placebar').innerHTML = `<span>${sel.kind === 'move' ? 'Mover' : 'Colocar'}: <b>${esc(d.name)}</b> · toca el suelo</span><button class="icon-btn" data-cancel>✕</button>`;
    }
    this.renderBuild();
  }

  buildTap(target: Target, tile?: { x: number; y: number }) {
    const w = this.world;
    const sel = this.buildSel;
    if (sel && tile) {
      const can = sel.kind === 'move' ? w.canPlace(sel.def, tile.x, tile.y, sel.id) : w.canPlace(sel.def, tile.x, tile.y);
      w.ui.ghost = { def: sel.def, x: tile.x, y: tile.y, ok: can.ok };
      const d = OBJECTS[sel.def];
      const cost = priceOf(d, this.buildTier);
      const price = sel.kind === 'buy' ? ` (§${cost})` : '';
      const poor = sel.kind === 'buy' && w.household.funds < cost;
      const label = !can.ok ? `🚫 ${esc(can.reason ?? 'No cabe')}` : poor ? '💸 No hay dinero' : `✓ ${sel.kind === 'move' ? 'Mover aquí' : `Colocar aquí${price}`}`;
      $('#placebar').innerHTML = `<button class="map-btn" data-place ${can.ok && !poor ? '' : 'disabled'}>${label}</button><button class="icon-btn" data-cancel>✕</button>`;
      return;
    }
    if (target.kind !== 'object') return;
    const o = w.object(target.id);
    if (!o || o.lotId !== w.household.lotId) return;
    const d = OBJECTS[o.def];
    const why = w.cantTouch(o);
    const paid = priceOf(d, o.q ?? 2);
    const refund = d.price ? Math.floor(paid * SELL_RATIO) : 0;
    const ql = d.tiers ? ` · ${QUALITY[o.q ?? 2].label}` : '';
    $('#sheet').innerHTML = `<div class="sheet-card">
      <div class="sheet-head"><div><div class="sheet-title">${d.icon || '📦'} ${esc(d.name)}</div><div class="sheet-sub">${why ? esc(why) : d.price ? `Costó §${paid}${ql}` : 'No se puede vender'}</div></div>
      <button class="icon-btn" data-close>✕</button></div>
      <div class="sheet-actions">
        <button class="act" data-bmove="${o.id}" ${why ? 'disabled' : ''}><span class="act-icon">↔️</span><span class="act-label">Mover</span></button>
        <button class="act" data-bsell="${o.id}" ${why || !d.price ? 'disabled' : ''}><span class="act-icon">🏷️</span><span class="act-label">Vender<small class="info">+§${refund}</small></span></button>
      </div></div>`;
    this.hud.sheet.sheetTarget = target;
    $('#sheet').hidden = false;
  }

  confirmPlace() {
    const w = this.world;
    const sel = this.buildSel;
    const g = w.ui.ghost;
    if (!sel || !g) return;
    const ok = sel.kind === 'move' ? w.moveObject(sel.id, g.x, g.y) : w.buy(sel.def, g.x, g.y, OBJECTS[sel.def].tiers ? this.buildTier : 2);
    if (!ok) return;
    if (sel.kind === 'move') this.selectForBuild(null);
    else {
      // Se puede seguir colocando más del mismo.
      w.ui.ghost = null;
      $('#placebar').innerHTML = `<span>Colocado. Toca otro sitio para poner otro, o ✕ para terminar</span><button class="icon-btn" data-cancel>✕</button>`;
    }
    this.renderBuild();
  }

  renderBuild() {
    if ($('#build').hidden) return;
    const w = this.world;
    $('#build-funds').textContent = `§ ${w.household.funds.toLocaleString('es-ES')}`;
    const ex = w.nextExpansion();
    $('#build-tabs').innerHTML =
      CATEGORIES.map((c) => `<button class="comp ${c.id === this.buildCat ? 'on' : ''}" data-cat="${c.id}">${c.icon} ${esc(c.label)}</button>`).join('') +
      `<button class="comp ${this.buildCat === ('reformas' as CatalogCategory) ? 'on' : ''}" data-cat="reformas">🏗️ Reformas</button>`;
    const sel = this.buildSel;
    if (this.buildCat === ('reformas' as CatalogCategory)) {
      $('#build-tiers').innerHTML = `<div class="muted small build-note">${ex ? `Amplía la casa: <b>${esc(ex.label)}</b>. Lo del jardín se corre solo.` : 'La casa ya está ampliada al máximo. ¡Menuda mansión!'}</div>`;
      $('#build-items').innerHTML = ex
        ? `<button class="item" data-expand ${w.household.funds < ex.price ? 'disabled' : ''}><span class="item-icon">🏗️</span><span class="item-name">Ampliar la casa</span><span class="item-price">§${ex.price.toLocaleString('es-ES')}</span></button>`
        : '';
      return;
    }
    const tiered = CATALOG.some((d) => d.category === this.buildCat && d.tiers);
    $('#build-tiers').innerHTML = tiered
      ? `<div class="tier-row"><span class="muted small">Calidad:</span>${([1, 2, 3] as const).map((q) => `<button class="comp ${this.buildTier === q ? 'on' : ''}" data-tier="${q}">${q === 3 ? '✨ ' : ''}${QUALITY[q].label}</button>`).join('')}</div>`
      : '';
    $('#build-items').innerHTML =
      CATALOG.filter((d) => d.category === this.buildCat)
        .map((d) => {
          const cost = priceOf(d, this.buildTier);
          const poor = w.household.funds < cost;
          const chosen = sel?.kind === 'buy' && sel.def === d.id;
          const face = d.icon || `<span class="swatch" style="background:#${d.color.toString(16).padStart(6, '0')}"></span>`;
          return `<button class="item ${chosen ? 'on' : ''}" data-item="${d.id}" ${poor ? 'disabled' : ''}><span class="item-icon">${face}</span><span class="item-name">${esc(d.name)}</span><span class="item-price">§${cost}</span></button>`;
        })
        .join('');
  }
}
