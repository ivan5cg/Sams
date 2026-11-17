// Recibos y casa (☰ → 🧾, o desde las cuentas del perfil): lo que se debe (y pagarlo), lo que viene,
// los cortes de luz y agua, el desahucio (y volver a casa) y la ayuda de los servicios sociales.

import { ECONOMY } from '../data/economy';
import { BILL_INFO, aidReason, billAmount, debtsOf, rentBackCost, totalDebt, upcomingBills } from '../sim/systems/bills';
import { shortDate } from '../sim/date';
import { $, esc } from './dom';
import { Part } from './part';

export class BillsPanel extends Part {
  bind() {
    $('#bills').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'bills' || el.closest('[data-close]')) return this.close();
      const b = el.closest<HTMLButtonElement>('button');
      if (!b) return;
      let why: string | undefined;
      if (b.dataset.pay) why = this.world.payDebt(b.dataset.pay);
      else if (b.dataset.payall !== undefined) why = this.world.payAllDebts() ? undefined : 'No hay dinero para ninguno';
      else if (b.dataset.rentback !== undefined) why = this.world.rentBack();
      else if (b.dataset.aid !== undefined) why = this.world.askAid();
      else return;
      if (why) this.hud.toast(why, '🧾');
      this.render();
    });
  }

  open() {
    $('#bills').hidden = false;
    this.render();
  }

  close() {
    $('#bills').hidden = true;
  }

  render() {
    if ($('#bills').hidden) return;
    const w = this.world;
    const h = w.household;
    const s = h.bills;
    const debts = [...debtsOf(h)].sort((a, b) => a.due - b.due);
    const rent = billAmount(w, h, 'alquiler');
    const status: string[] = [];
    if (s?.evicted) {
      const cost = rentBackCost(w);
      status.push(`<div class="bill-alert"><div>🚨 <b>Desahuciados</b> desde hace ${w.day - s.evicted.since} días: vivís en la calle (el parque). Los peques y las mascotas, con la abuela.</div>
        <button class="map-btn small-btn" data-rentback ${h.funds < cost ? 'disabled' : ''}>🏠 Volver a alquilar la casa (§${cost.toLocaleString('es-ES')})</button>
        <div class="muted small">Lo que se debe del alquiler más un mes de fianza.</div></div>`);
    } else {
      status.push(`<div class="muted small">🏠 Casa de alquiler: §${rent.toLocaleString('es-ES')} al mes.</div>`);
    }
    if (s?.cut?.luz) status.push(`<div class="bill-alert"><div>🔌 <b>Luz cortada</b>: sin tele, ni ordenador, ni luz. Paga el recibo (+§${ECONOMY.reconnect} de reenganche).</div></div>`);
    if (s?.cut?.agua) status.push(`<div class="bill-alert"><div>🚱 <b>Agua cortada</b>: ni ducha, ni bañera, ni cisterna. Paga el recibo (+§${ECONOMY.reconnect} de reenganche).</div></div>`);
    const debtRows = debts
      .map((d) => {
        const late = w.day - d.due;
        const fee = (d.kind === 'luz' && s?.cut?.luz) || (d.kind === 'agua' && s?.cut?.agua) ? ECONOMY.reconnect : 0;
        return `<div class="bill-row"><span>${BILL_INFO[d.kind].icon}</span><div class="bill-main"><b>${esc(BILL_INFO[d.kind].label)}</b> · §${d.amount}${fee ? ` +§${fee}` : ''}<div class="muted small">Venció ${late === 0 ? 'hoy' : `hace ${late} ${late === 1 ? 'día' : 'días'}`}</div></div>
          <button class="map-btn small-btn" data-pay="${d.id}" ${h.funds < d.amount + fee ? 'disabled' : ''}>Pagar</button></div>`;
      })
      .join('');
    const next = upcomingBills(w, 31)
      .map((b) => `<div class="bill-row"><span>${BILL_INFO[b.kind].icon}</span><div class="bill-main">${esc(BILL_INFO[b.kind].label)} · §${b.amount}</div><span class="muted small">${shortDate(w.dateOf(b.day))}</span></div>`)
      .join('');
    const aid = aidReason(w);
    $('#bills').innerHTML = `<div class="map-card">
      <div class="sheet-head"><div><div class="sheet-title">🧾 Recibos y casa</div><div class="sheet-sub">Tenéis § ${h.funds.toLocaleString('es-ES')}${totalDebt(h) ? ` · debéis §${totalDebt(h).toLocaleString('es-ES')}` : ''}</div></div><button class="icon-btn" data-close aria-label="Cerrar">✕</button></div>
      ${status.join('')}
      <div class="prof-sec"><div class="prof-h">Sin pagar</div>${debtRows || '<div class="muted small">Todo pagado. ¡Así da gusto!</div>'}
        ${debts.length > 1 ? '<button class="map-btn ghost small-btn" data-payall>Pagar todo lo que se pueda</button>' : ''}</div>
      <div class="prof-sec"><div class="prof-h">Próximos recibos</div>${next || '<div class="muted small">Nada este mes.</div>'}
        <div class="muted small">Se pagan solos si hay dinero. Si no, quedan pendientes: a los 10 días cortan la luz o el agua; el alquiler trae carta del casero (10 días), burofax (20) y desahucio (30).</div></div>
      <div class="prof-sec"><div class="prof-h">¿Apuros?</div>
        <button class="map-btn ghost small-btn" data-aid ${aid ? 'disabled' : ''}>🤝 Pedir ayuda a los servicios sociales (§${ECONOMY.socialAid})</button>
        ${aid ? `<div class="muted small">${esc(aid)}</div>` : ''}
        <div class="muted small">La comida se paga al hacer la compra (Mercadona, mercadillo o a domicilio): sin comida en la nevera, en casa no se come.</div></div>
    </div>`;
  }
}
