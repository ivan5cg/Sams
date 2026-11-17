// Economía y bolsa (☰ → 📈, o en el ordenador: «Invertir en bolsa»): cómo va el país (IPC, paro,
// crecimiento, tipos, deuda y Gobierno), los titulares, y el mercado con lo que tiene la familia invertido.
// Comprar y vender solo se puede desde el ordenador.

import { ASSETS, POLICY_LABEL, PARTY_BY_ID } from '../data/finance';
import { buyReason, canAnalyze, commission, dayChange, governmentText, portfolioValue } from '../sim/systems/economy';
import { $, esc } from './dom';
import { Part } from './part';

const fmt = (v: number, d = 1) => v.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
const money = (v: number) => `§${Math.round(v).toLocaleString('es-ES')}`;

/** Gráfica mínima (una línea) con los últimos valores. */
function spark(values: number[], color: string): string {
  if (values.length < 2) return '';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(28 - ((v - lo) / span) * 24).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

export class MarketPanel extends Part {
  /** Abierto desde el ordenador: se puede comprar y vender. */
  private trading = false;

  bind() {
    $('#market').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'market' || el.closest('[data-close]')) return this.close();
      const b = el.closest<HTMLButtonElement>('button');
      if (!b || !this.trading) return;
      const w = this.world;
      let why: string | undefined;
      if (b.dataset.buy) {
        const [id, amount] = b.dataset.buy.split(':');
        why = w.buyAsset(w.activeAgent.id, id, Number(amount));
        if (!why) this.hud.toast(`Comprado: ${ASSETS.find((x) => x.id === id)?.name} por §${amount}`, '🛒');
      } else if (b.dataset.sell) {
        const [id, f] = b.dataset.sell.split(':');
        why = w.sellAsset(w.activeAgent.id, id, Number(f));
      } else return;
      if (why) this.hud.toast(why, '💹');
      this.render();
      this.hud.render();
    });
  }

  open(trading = false) {
    this.trading = trading;
    this.hud.sheet.closeSheet();
    $('#market').hidden = false;
    this.render();
  }

  close() {
    $('#market').hidden = true;
  }

  render() {
    if ($('#market').hidden) return;
    const w = this.world;
    const e = w.economy;
    const a = w.activeAgent;
    const h = w.household;
    const party = PARTY_BY_ID[e.gov.party];
    const hist = e.history;
    const analyze = canAnalyze(w, a);
    const fee = commission(w, a);
    const inv = portfolioValue(w);
    const cost = Object.values(h.portfolio ?? {}).reduce((s, p) => s + p.cost, 0);
    const tile = (label: string, value: string, note: string, svg = '') => `<div class="eco-tile"><div class="muted small">${label}</div><b>${value}</b>${svg}<div class="muted small">${note}</div></div>`;
    const indicators = `<div class="eco-grid">
      ${tile('🧾 Inflación', `${fmt(e.inflation)} %`, `Precios: ${fmt((e.priceIndex - 1) * 100)} % desde el principio`, spark(hist.map((x) => x.ipc), '#f0a830'))}
      ${tile('👷 Paro', `${fmt(e.unemployment)} %`, e.unemployment > 12 ? 'Cuesta encontrar trabajo y hay EREs' : 'Se encuentra trabajo', spark(hist.map((x) => x.unemployment), '#e8553d'))}
      ${tile('🏭 Crecimiento', `${fmt(e.growth)} %`, e.growth < 0 ? 'En recesión' : e.growth > 3 ? 'La economía va como un tiro' : 'Tirando')}
      ${tile('🏛️ Tipos de interés', `${fmt(e.rate, 2)} %`, 'Los sube el Banco Central si hay inflación (y encarecen la hipoteca)')}
      ${tile('📜 Deuda pública', `${fmt(e.debt, 0)} % del PIB`, e.debt > 120 ? '¡Peligro! Los mercados desconfían' : 'Bajo control')}
      ${tile('💶 Sueldos', `+${fmt((e.wageIndex - 1) * 100)} %`, e.wageIndex < e.priceIndex - 0.005 ? 'Van por detrás de los precios' : 'Al día con los precios')}
    </div>`;
    const gov = `<div class="prof-sec"><div class="prof-h">🏛️ Gobierno</div>
      <div><b>${esc(governmentText(w))}</b> desde el día ${e.gov.since}</div>
      <div class="muted small">Política: ${esc(POLICY_LABEL[party.policy])} · Popularidad: ${Math.round(e.gov.approval)} %${e.gov.exposed ? ' · 💼 Salpicado por la corrupción' : ''}${e.gov.elections ? ` · 🗳️ Elecciones anticipadas el día ${e.gov.elections}` : ''}</div>
      <div class="muted small">Más gasto público: menos paro, pero más inflación y más deuda (y más impuestos y ayudas). Recortes: al revés. Cualquier Gobierno puede salir corrupto: se nota en la inflación, el crecimiento y, cuando se destapa, en la bolsa.</div></div>`;
    const news = e.news.length
      ? e.news.slice(0, 6).map((n) => `<div class="bill-row"><span>${n.icon}</span><div class="bill-main small">${esc(n.text)}</div><span class="muted small">día ${n.day}</span></div>`).join('')
      : '<div class="muted small">Nada que contar, de momento.</div>';
    const rows = ASSETS.map((x) => {
      const st = e.assets[x.id];
      const ch = dayChange(w, x.id);
      const pos = h.portfolio?.[x.id];
      const value = pos ? pos.units * st.price : 0;
      const pl = pos ? value - pos.cost : 0;
      const trend = analyze ? (st.trend > 0.05 ? '<span class="eco-up">↗ alcista</span>' : st.trend < -0.05 ? '<span class="eco-down">↘ bajista</span>' : '<span class="muted">→ lateral</span>') : '';
      const lock = buyReason(w, a, x.id, 100);
      const locked = !!lock && lock.startsWith('Producto');
      const buttons = this.trading
        ? `<div class="eco-btns">
            ${[100, 500].map((n) => `<button class="map-btn small-btn" data-buy="${x.id}:${n}" ${buyReason(w, a, x.id, n) ? 'disabled' : ''}>+§${n}</button>`).join('')}
            ${pos ? `<button class="map-btn ghost small-btn" data-sell="${x.id}:0.5">Vender ½</button><button class="map-btn ghost small-btn" data-sell="${x.id}:1">Vender todo</button>` : ''}
          </div>`
        : '';
      return `<div class="eco-asset">
        <div class="eco-asset-head"><span>${x.icon}</span><div class="bill-main"><b>${esc(x.name)}</b> <span class="muted small">${esc(x.sector)}</span>
          <div class="small">§${fmt(st.price, 2)} <span class="${ch >= 0 ? 'eco-up' : 'eco-down'}">${ch >= 0 ? '+' : ''}${fmt(ch * 100)} %</span> ${trend}</div></div>
          ${spark(st.hist.slice(-20), ch >= 0 ? '#4cd964' : '#ff6b5a')}</div>
        <div class="muted small">${esc(x.desc)}${x.div ? ` · Dividendo ${fmt(x.div * 100)} % al año` : ''}${locked ? ` · 🔒 Hace falta inversión ${x.minSkill}` : ''}</div>
        ${pos ? `<div class="small">Tenéis ${money(value)} <span class="${pl >= 0 ? 'eco-up' : 'eco-down'}">(${pl >= 0 ? '+' : '−'}${money(Math.abs(pl))})</span></div>` : ''}
        ${buttons}
      </div>`;
    }).join('');
    $('#market').innerHTML = `<div class="map-card">
      <div class="sheet-head"><div><div class="sheet-title">📈 Economía y bolsa</div><div class="sheet-sub">Tenéis ${money(h.funds)}${inv ? ` · invertido: ${money(inv)} (${inv >= cost ? '+' : '−'}${money(Math.abs(inv - cost))})` : ''}</div></div><button class="icon-btn" data-close aria-label="Cerrar">✕</button></div>
      ${indicators}
      ${gov}
      <div class="prof-sec"><div class="prof-h">📰 Titulares</div>${news}</div>
      <div class="prof-sec"><div class="prof-h">💹 Mercado</div>
        <div class="muted small">${this.trading ? `${esc(a.name)} opera con una comisión del ${fmt(fee * 100)} %. Hacienda se queda el 19 % de lo que se gane al vender. Los dividendos llegan cada lunes.` : 'Para comprar o vender, desde el ordenador de casa: «Invertir en bolsa».'}${analyze ? '' : ' Con inversión 2 se ve el análisis de cada valor.'}</div>
        ${rows}
      </div>
    </div>`;
  }
}
