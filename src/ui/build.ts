// Modo construcción: catálogo, colocar, mover y vender muebles, y reformas.

import { CATALOG, CATEGORIES, OBJECTS, QUALITY, SELL_RATIO, canRotate, priceOf, type CatalogCategory } from '../data/objects';
import { FLOORS, PAINT_PRICE, WALL_COLORS } from '../data/paint';
import { roomAt } from '../sim/rooms';
import type { HouseScene } from '../render/HouseScene';
import type { Target } from '../sim/world';
import { $, esc } from './dom';
import { Part } from './part';
import { vibrate } from '../prefs';

export class BuildMode extends Part {
  sceneRef?: () => HouseScene;
  buildCat: CatalogCategory = 'descanso';
  buildSel: { kind: 'buy'; def: string; rot?: 1 } | { kind: 'move'; id: string; def: string; rot?: 1 } | { kind: 'paint'; wall?: number; floor?: string } | null = null;
  /** Última casilla tocada al colocar (para recalcular al girar). */
  private lastTile: { x: number; y: number } | null = null;
  speedBeforeBuild = 1;
  buildTier: 1 | 2 | 3 = 2;

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    $('#build-btn').addEventListener('click', () => this.enterBuild());
    $('#build-exit').addEventListener('click', () => this.exitBuild());
    $('#build-catalog').addEventListener('click', () => this.hud.catalog.open(['pintura', 'reformas'].includes(this.buildCat) ? undefined : this.buildCat));
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
        const ex = this.world.nextExpansions().find((e) => e.plan === b.dataset.expand);
        if (ex && confirm(`¿Ampliar la casa por §${ex.price.toLocaleString('es-ES')}? (${ex.label})`)) {
          this.selectForBuild(null);
          this.world.expandHouse(ex.plan);
          this.renderBuild();
        }
        return;
      }
      if (b?.dataset.wall) return this.selectForBuild({ kind: 'paint', wall: Number(b.dataset.wall) });
      if (b?.dataset.floor) return this.selectForBuild({ kind: 'paint', floor: b.dataset.floor });
      if (!b?.dataset.item) return;
      const sel = this.buildSel;
      if (sel?.kind === 'buy' && sel.def === b.dataset.item) this.selectForBuild(null);
      else this.selectForBuild({ kind: 'buy', def: b.dataset.item });
    });
    $('#build-undo').addEventListener('click', () => {
      if (this.world.undoBuild()) {
        this.world.ui.ghost = null;
        this.renderBuild();
      }
    });
    $('#placebar').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.cancel !== undefined) return this.selectForBuild(null);
      if (b.dataset.place !== undefined) this.confirmPlace();
      if (b.dataset.rot !== undefined) this.toggleRotation();
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
    // Lo hecho en la obra ya no se deshace al salir.
    w.buildUndo = [];
    w.ui.building = false;
    w.state.speed = this.speedBeforeBuild;
    document.body.classList.remove('building');
    $('#build').hidden = true;
    this.hud.sheet.closeSheet();
    this.hud.render();
  }

  selectForBuild(sel: BuildMode['buildSel']) {
    this.buildSel = sel;
    this.lastTile = null;
    this.world.ui.ghost = null;
    const scene = this.sceneRef?.();
    if (scene) scene.selectingTile = !!sel;
    $('#placebar').hidden = !sel;
    if (sel?.kind === 'paint') {
      const what = sel.floor !== undefined ? FLOORS.find((f) => f.id === sel.floor)?.label : WALL_COLORS.find((c) => c.color === sel.wall)?.label;
      $('#placebar').innerHTML = `<span>${sel.floor !== undefined ? 'Suelo' : 'Paredes'}: <b>${esc(what ?? '')}</b> · toca una habitación</span><button class="icon-btn" data-cancel>✕</button>`;
    } else if (sel) {
      const d = OBJECTS[sel.def];
      $('#placebar').innerHTML = `<span>${sel.kind === 'move' ? 'Mover' : 'Colocar'}: <b>${esc(d.name)}</b> · toca el suelo</span>${canRotate(sel.def) ? '<button class="icon-btn" data-rot aria-label="Girar">↻</button>' : ''}<button class="icon-btn" data-cancel>✕</button>`;
    }
    this.renderBuild();
  }

  /** Girar lo que se está colocando o moviendo (y recalcular si cabe). */
  private toggleRotation() {
    const sel = this.buildSel;
    if (!sel || sel.kind === 'paint') return;
    sel.rot = sel.rot ? undefined : 1;
    if (this.lastTile) this.buildTap({ kind: 'tile', ...this.lastTile }, this.lastTile);
    else this.world.ui.ghost = null;
  }

  buildTap(target: Target, tile?: { x: number; y: number }) {
    const w = this.world;
    const sel = this.buildSel;
    if (sel?.kind === 'paint' && tile) {
      const room = roomAt(w.layoutOf(w.household.lotId), tile.x, tile.y);
      if (!room) {
        this.hud.toast('Toca el suelo de una habitación', '🎨');
        return;
      }
      if (w.paintRoom(room, sel.floor !== undefined ? { floor: sel.floor } : { wall: sel.wall })) vibrate(30);
      this.renderBuild();
      return;
    }
    if (sel && sel.kind !== 'paint' && tile) {
      this.lastTile = { x: tile.x, y: tile.y };
      const can = sel.kind === 'move' ? w.canPlace(sel.def, tile.x, tile.y, sel.id, sel.rot) : w.canPlace(sel.def, tile.x, tile.y, undefined, sel.rot);
      w.ui.ghost = { def: sel.def, x: tile.x, y: tile.y, ok: can.ok, ...(sel.rot ? { rot: sel.rot } : {}) };
      const d = OBJECTS[sel.def];
      const cost = this.world.priced(priceOf(d, this.buildTier));
      const price = sel.kind === 'buy' ? ` (§${cost})` : '';
      const poor = sel.kind === 'buy' && w.household.funds < cost;
      const label = !can.ok ? `🚫 ${esc(can.reason ?? 'No cabe')}` : poor ? '💸 No hay dinero' : `✓ ${sel.kind === 'move' ? 'Mover aquí' : `Colocar aquí${price}`}`;
      $('#placebar').innerHTML = `<button class="map-btn" data-place ${can.ok && !poor ? '' : 'disabled'}>${label}</button>${canRotate(sel.def) ? '<button class="icon-btn" data-rot aria-label="Girar">↻</button>' : ''}<button class="icon-btn" data-cancel>✕</button>`;
      return;
    }
    if (target.kind !== 'object') return;
    const o = w.object(target.id);
    if (!o || o.lotId !== w.household.lotId) return;
    const d = OBJECTS[o.def];
    const why = w.cantTouch(o);
    const paid = this.world.priced(priceOf(d, o.q ?? 2));
    const refund = d.price ? Math.floor(paid * SELL_RATIO) : 0;
    const ql = d.tiers ? ` · ${QUALITY[o.q ?? 2].label}` : '';
    $('#sheet').innerHTML = `<div class="sheet-card">
      <div class="sheet-head"><div><div class="sheet-title">${d.icon || '📦'} ${esc(d.name)}</div><div class="sheet-sub">${why ? esc(why) : d.price ? `Costó §${paid}${ql}` : 'No se puede vender'}</div></div>
      <button class="icon-btn" data-close>✕</button></div>
      <div class="sheet-actions">
        <button class="act" data-bmove="${o.id}" ${why ? 'disabled' : ''}><span class="act-icon">↔️</span><span class="act-label">Mover</span></button>
        ${canRotate(o.def) ? `<button class="act" data-brot="${o.id}" ${why ? 'disabled' : ''}><span class="act-icon">↻</span><span class="act-label">Girar</span></button>` : ''}
        <button class="act" data-bsell="${o.id}" ${why || !d.price ? 'disabled' : ''}><span class="act-icon">🏷️</span><span class="act-label">Vender<small class="info">+§${refund}</small></span></button>
      </div></div>`;
    this.hud.sheet.sheetTarget = target;
    $('#sheet').hidden = false;
  }

  confirmPlace() {
    const w = this.world;
    const sel = this.buildSel;
    const g = w.ui.ghost;
    if (!sel || !g || sel.kind === 'paint') return;
    const ok = sel.kind === 'move' ? w.moveObject(sel.id, g.x, g.y, sel.rot ? 1 : 0) : w.buy(sel.def, g.x, g.y, OBJECTS[sel.def].tiers ? this.buildTier : 2, sel.rot);
    if (!ok) return;
    vibrate(30);
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
    const undo = w.lastUndo();
    const ub = $<HTMLButtonElement>('#build-undo');
    ub.disabled = !undo;
    ub.title = undo ? `Deshacer: ${undo.label.toLowerCase()}` : 'Nada que deshacer';
    ub.setAttribute('aria-label', ub.title);
    const ex = w.nextExpansion();
    $('#build-tabs').innerHTML =
      CATEGORIES.map((c) => `<button class="comp ${c.id === this.buildCat ? 'on' : ''}" data-cat="${c.id}">${c.icon} ${esc(c.label)}</button>`).join('') +
      `<button class="comp ${this.buildCat === ('pintura' as CatalogCategory) ? 'on' : ''}" data-cat="pintura">🎨 Pintura</button>` +
      `<button class="comp ${this.buildCat === ('reformas' as CatalogCategory) ? 'on' : ''}" data-cat="reformas">🏗️ Reformas</button>`;
    const sel = this.buildSel;
    if (this.buildCat === ('pintura' as CatalogCategory)) {
      const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
      $('#build-tiers').innerHTML = `<div class="muted small build-note">Elige un color o un suelo y toca la habitación. Paredes §${PAINT_PRICE.wall}, suelo §${PAINT_PRICE.floor}.</div>`;
      $('#build-items').innerHTML =
        WALL_COLORS.map((c) => {
          const on = sel?.kind === 'paint' && sel.wall === c.color;
          return `<button class="item ${on ? 'on' : ''}" data-wall="${c.color}" ${w.household.funds < PAINT_PRICE.wall ? 'disabled' : ''}><span class="item-icon"><span class="swatch" style="background:${hex(c.color)}"></span></span><span class="item-name">${esc(c.label)}</span><span class="item-price">Pared</span></button>`;
        }).join('') +
        FLOORS.map((f) => {
          const on = sel?.kind === 'paint' && sel.floor === f.id;
          return `<button class="item ${on ? 'on' : ''}" data-floor="${f.id}" ${w.household.funds < PAINT_PRICE.floor ? 'disabled' : ''}><span class="item-icon"><span class="swatch floor-${f.kind}" style="background:${hex(f.color)}"></span></span><span class="item-name">${esc(f.label)}</span><span class="item-price">Suelo</span></button>`;
        }).join('');
      return;
    }
    if (this.buildCat === ('reformas' as CatalogCategory)) {
      $('#build-tiers').innerHTML = `<div class="muted small build-note">${ex ? 'Amplía la casa: elige cómo. Lo del jardín se corre solo.' : 'La casa ya está ampliada al máximo. ¡Menuda mansión!'}</div>`;
      $('#build-items').innerHTML = w
        .nextExpansions()
        .map((e) => `<button class="item" data-expand="${e.plan}" ${w.household.funds < e.price ? 'disabled' : ''}><span class="item-icon">${e.plan === 'bano' ? '🛁' : e.plan === 'dormitorios' ? '🛏️' : '🏗️'}</span><span class="item-name">${esc(e.label)}</span><span class="item-price">§${e.price.toLocaleString('es-ES')}</span></button>`)
        .join('');
      return;
    }
    const tiered = CATALOG.some((d) => d.category === this.buildCat && d.tiers);
    $('#build-tiers').innerHTML = tiered
      ? `<div class="tier-row"><span class="muted small">Calidad:</span>${([1, 2, 3] as const).map((q) => `<button class="comp ${this.buildTier === q ? 'on' : ''}" data-tier="${q}">${q === 3 ? '✨ ' : ''}${QUALITY[q].label}</button>`).join('')}</div>`
      : '';
    $('#build-items').innerHTML =
      CATALOG.filter((d) => d.category === this.buildCat)
        .map((d) => {
          const cost = this.world.priced(priceOf(d, this.buildTier));
          const poor = w.household.funds < cost;
          const chosen = sel?.kind === 'buy' && sel.def === d.id;
          const face = d.icon || `<span class="swatch" style="background:#${d.color.toString(16).padStart(6, '0')}"></span>`;
          return `<button class="item ${chosen ? 'on' : ''}" data-item="${d.id}" ${poor ? 'disabled' : ''}><span class="item-icon">${face}</span><span class="item-name">${esc(d.name)}</span><span class="item-price">§${cost}</span></button>`;
        })
        .join('');
  }
}
