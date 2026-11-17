// Catálogo de muebles (☰ → 🛋️, o desde la obra): cada mueble con su dibujo, para qué sirve, lo que
// sube, su tamaño, calidades y precio. Se busca, se ordena y se compra para colocarlo en casa.

import { ACTIONS } from '../data/actions';
import { CATALOG, CATEGORIES, QUALITY, priceOf, type CatalogCategory, type ObjectDef } from '../data/objects';
import { NEED_INFO } from '../data/species';
import { NEED_KEYS } from '../sim/types';
import { $, esc } from './dom';
import { Part } from './part';

type Sort = 'cheap' | 'dear' | 'name';

/** Lo que hace un mueble, en palabras (las acciones de la gente; las de las mascotas, aparte). */
export function usesOf(d: ObjectDef): { people: string[]; pets: string[]; needs: string[] } {
  const people: string[] = [];
  const pets: string[] = [];
  const needs = new Set<string>();
  for (const id of d.actions) {
    const a = ACTIONS[id];
    if (!a || id === 'repair' || id === 'steal' || id === 'clean') continue;
    const label = `${a.icon} ${a.label}`;
    if (a.actors.includes('person')) people.push(label);
    else pets.push(label);
    for (const k of NEED_KEYS) if ((a.effects[k] ?? 0) > 0) needs.add(k);
  }
  return { people, pets, needs: [...needs] };
}

export class CatalogPanel extends Part {
  private cat: CatalogCategory | 'all' = 'all';
  private sort: Sort = 'cheap';
  private query = '';
  private affordable = false;
  tier: 1 | 2 | 3 = 2;

  bind() {
    const root = $('#catalog');
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'catalog' || el.closest('[data-close]')) return this.close();
      const b = el.closest<HTMLButtonElement>('button');
      if (!b) return;
      if (b.dataset.ccat) this.cat = b.dataset.ccat as CatalogCategory | 'all';
      else if (b.dataset.ctier) this.tier = Number(b.dataset.ctier) as 1 | 2 | 3;
      else if (b.dataset.buy) return this.buy(b.dataset.buy);
      else return;
      this.renderList();
    });
    root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.c === 'q') {
        this.query = el.value;
        this.renderList();
      }
    });
    root.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      if (el.dataset.c === 'sort') this.sort = el.value as Sort;
      else if (el.dataset.c === 'afford') this.affordable = (el as HTMLInputElement).checked;
      else return;
      this.renderList();
    });
  }

  open(cat?: CatalogCategory) {
    if (cat) this.cat = cat;
    this.tier = this.hud.build.buildTier;
    $('#catalog').hidden = false;
    this.render();
  }

  close() {
    $('#catalog').hidden = true;
  }

  /** Lo que se ve, con los filtros puestos. */
  items(): ObjectDef[] {
    const q = this.query.trim().toLowerCase();
    const funds = this.world.household.funds;
    const list = CATALOG.filter(
      (d) =>
        (this.cat === 'all' || d.category === this.cat) &&
        (!q || `${d.name} ${d.desc ?? ''} ${usesOf(d).people.join(' ')} ${usesOf(d).pets.join(' ')}`.toLowerCase().includes(q)) &&
        (!this.affordable || this.world.priced(priceOf(d, this.tier)) <= funds),
    );
    const by: Record<Sort, (a: ObjectDef, b: ObjectDef) => number> = {
      cheap: (a, b) => this.world.priced(priceOf(a, this.tier)) - this.world.priced(priceOf(b, this.tier)),
      dear: (a, b) => this.world.priced(priceOf(b, this.tier)) - this.world.priced(priceOf(a, this.tier)),
      name: (a, b) => a.name.localeCompare(b.name, 'es'),
    };
    return list.sort(by[this.sort]);
  }

  private render() {
    $('#catalog').innerHTML = `<div class="map-card catalog-card">
      <div class="sheet-head">
        <div><div class="sheet-title">🛋️ Catálogo de muebles</div><div class="sheet-sub" id="cat-funds"></div></div>
        <button class="icon-btn" data-close aria-label="Cerrar">✕</button>
      </div>
      <div class="cat-tools">
        <input data-c="q" type="search" placeholder="Buscar (cama, música, mascotas...)" aria-label="Buscar" value="${esc(this.query)}" />
        <select data-c="sort" aria-label="Ordenar">
          <option value="cheap"${this.sort === 'cheap' ? ' selected' : ''}>Más baratos</option>
          <option value="dear"${this.sort === 'dear' ? ' selected' : ''}>Más caros</option>
          <option value="name"${this.sort === 'name' ? ' selected' : ''}>Por nombre</option>
        </select>
      </div>
      <label class="cr-check small"><input type="checkbox" data-c="afford"${this.affordable ? ' checked' : ''} /> Solo lo que podemos pagar</label>
      <div class="chips-wrap" id="cat-cats"></div>
      <div class="tier-row" id="cat-tiers"></div>
      <div class="cat-grid" id="cat-grid"></div>
    </div>`;
    this.renderList();
  }

  renderList() {
    if ($('#catalog').hidden || !$('#cat-grid')) return;
    const w = this.world;
    const funds = w.household.funds;
    const home = w.canBuildHere();
    $('#cat-funds').textContent = `Tenéis § ${funds.toLocaleString('es-ES')} · ${CATALOG.length} muebles`;
    $('#cat-cats').innerHTML = [{ id: 'all', icon: '✨', label: 'Todo' }, ...CATEGORIES]
      .map((c) => `<button class="comp ${this.cat === c.id ? 'on' : ''}" data-ccat="${c.id}">${c.icon} ${esc(c.label)}</button>`)
      .join('');
    $('#cat-tiers').innerHTML = `<span class="muted small">Calidad:</span>${([1, 2, 3] as const).map((q) => `<button class="comp ${this.tier === q ? 'on' : ''}" data-ctier="${q}">${q === 3 ? '✨ ' : ''}${QUALITY[q].label}</button>`).join('')}`;
    const list = this.items();
    $('#cat-grid').innerHTML = list.length
      ? list
          .map((d) => {
            const cost = this.world.priced(priceOf(d, this.tier));
            const u = usesOf(d);
            const tags = [
              `📐 ${d.w}×${d.h}`,
              ...(d.decor ? [`✨ Ambiente +${d.decor}`] : []),
              ...(d.tiers ? [`⭐ ${QUALITY[this.tier].label.toLowerCase()}`] : ['Calidad única']),
              ...(d.breakable ? ['🔧 Se puede romper'] : []),
            ];
            const why = cost > funds ? 'No hay dinero' : !home ? 'Para colocarlo, id a casa' : '';
            return `<div class="cat-item" data-def="${d.id}">
              <div class="cat-thumb"><img alt="" data-thumb="${d.id}" /><span class="cat-icon">${d.icon || '🪑'}</span></div>
              <div class="cat-main">
                <div class="cat-name"><b>${esc(d.name)}</b><span class="cat-price">§${cost.toLocaleString('es-ES')}</span></div>
                ${d.desc ? `<div class="muted small">${esc(d.desc)}</div>` : ''}
                ${u.people.length ? `<div class="small">${u.people.map(esc).join(' · ')}</div>` : ''}
                ${u.pets.length ? `<div class="small">🐾 ${u.pets.map(esc).join(' · ')}</div>` : ''}
                ${u.needs.length ? `<div class="small cat-needs">Sube: ${u.needs.map((k) => `${NEED_INFO[k as keyof typeof NEED_INFO].icon} ${NEED_INFO[k as keyof typeof NEED_INFO].label}`).join(' · ')}</div>` : ''}
                <div class="muted small">${tags.map(esc).join(' · ')}</div>
                <button class="map-btn small-btn" data-buy="${d.id}" ${why ? 'disabled' : ''}>🛒 Comprar y colocar${why ? ` · ${esc(why)}` : ''}</button>
              </div>
            </div>`;
          })
          .join('')
      : '<p class="muted small">No hay nada con esos filtros.</p>';
    this.loadThumbs();
  }

  /** Los dibujos se hacen con la escena del juego (y se guardan para la próxima vez). */
  private loadThumbs() {
    const scene = this.hud.build.sceneRef?.();
    if (!scene) return;
    for (const img of $('#catalog').querySelectorAll<HTMLImageElement>('img[data-thumb]')) {
      const def = img.dataset.thumb!;
      void scene
        .objectThumb(def)
        .then((src) => {
          if (!img.isConnected) return;
          img.src = src;
          img.closest('.cat-thumb')?.classList.add('ready');
        })
        .catch(() => {});
    }
  }

  /** A la obra con el mueble elegido: solo falta tocar dónde ponerlo. */
  private buy(def: string) {
    const d = CATALOG.find((x) => x.id === def);
    if (!d) return;
    this.close();
    const b = this.hud.build;
    if (!this.world.ui.building) b.enterBuild();
    if (!this.world.ui.building) return;
    if (d.category) b.buildCat = d.category;
    b.buildTier = this.tier;
    b.selectForBuild({ kind: 'buy', def });
    this.hud.toast(`${d.name}: toca el suelo donde lo quieras`, '🛋️');
  }
}
