// Agenda de la familia: lo que viene hoy y mañana, y las órdenes programadas (con ✕ para quitarlas).

import { longDate } from '../sim/date';
import { WEEKDAY_LONG } from '../data/careers';
import { agendaFor, agendaTime, type AgendaItem } from '../sim/agenda';
import { $, esc } from './dom';
import { Part } from './part';

export class AgendaPanel extends Part {
  bind() {
    $('#agenda-btn').addEventListener('click', () => this.open());
    $('#agenda').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'agenda' || el.closest('[data-close]')) return this.close();
      const b = el.closest<HTMLButtonElement>('button[data-unschedule]');
      if (b?.dataset.unschedule) {
        this.world.cancelOrder(b.dataset.unschedule);
        this.render();
      }
    });
  }

  open() {
    this.hud.sheet.closeSheet();
    $('#agenda').hidden = false;
    this.render();
  }

  close() {
    $('#agenda').hidden = true;
  }

  private day(offset: 0 | 1): string {
    const w = this.world;
    const items = agendaFor(w, offset);
    const day = w.day + offset;
    const date = w.dateOf(day);
    const title = `${offset === 0 ? 'Hoy' : 'Mañana'}, ${WEEKDAY_LONG[date.wd]} ${longDate(date)}`;
    const now = w.state.minutes % 1440;
    const row = (i: AgendaItem) => {
      const past = offset === 0 && i.minute >= 0 && i.minute < now && i.kind !== 'order';
      const cancel = i.orderId ? `<button class="icon-btn agenda-x" data-unschedule="${esc(i.orderId)}" aria-label="Quitar la orden">✕</button>` : '';
      return `<div class="agenda-row ${past ? 'past' : ''} k-${i.kind}"><span class="agenda-time">${agendaTime(i.minute)}</span><span class="agenda-icon">${esc(i.icon)}</span><span class="agenda-text">${esc(i.text)}</span>${cancel}</div>`;
    };
    return `<div class="prof-sec"><div class="prof-h">${esc(title)}</div>${items.length ? items.map(row).join('') : '<div class="muted small">Nada especial. Día tranquilo.</div>'}</div>`;
  }

  render() {
    if ($('#agenda').hidden) return;
    $('#agenda').innerHTML = `<div class="map-card">
      <div class="sheet-head"><div><div class="sheet-title">📅 Agenda de la familia</div><div class="sheet-sub">Trabajo, colegio, el barrio y tus órdenes programadas</div></div><button class="icon-btn" data-close>✕</button></div>
      ${this.day(0)}
      ${this.day(1)}
      <p class="muted small">Para programar una orden, toca algo, pulsa ⏰ en el menú de acciones y elige la hora.</p>
    </div>`;
  }
}
