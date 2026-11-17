// Avisos con prioridad: los urgentes se quedan hasta tocarlos (y llevan a quien toca),
// los de la familia salen un momento (agrupando repetidos) y los del barrio van a la
// bandeja 🔔 con su contador. Todos quedan en el Diario.

import { shortDate } from '../sim/date';
import { WEEKDAY_NAMES } from '../data/careers';
import type { Toast } from '../sim/world';
import { $, esc } from './dom';
import { noticeLevel } from './notice-level';
import { Part } from './part';
import { vibrate } from '../prefs';

interface TrayItem {
  when: string;
  icon: string;
  text: string;
}

const MAX_URGENT = 3;
const MAX_NORMAL = 2;

export class Notices extends Part {
  tray: TrayItem[] = [];
  unread = 0;

  bind() {
    $('#toasts').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.toast.urgent');
      if (!el) return;
      // Tocar un aviso urgente lleva a quien lo necesita.
      const id = el.dataset.agent;
      const a = id ? this.world.agent(id) : undefined;
      if (a && this.world.isPlayerMember(a)) this.world.setActive(a.id);
      el.remove();
      this.hud.render();
    });
    $('#tray-btn').addEventListener('click', () => this.showTray());
  }

  private when(): string {
    const w = this.world;
    return `${WEEKDAY_NAMES[w.weekday]} ${shortDate(w.date)} · ${w.clock}`;
  }

  /** Un aviso de la simulación (o de la interfaz, que siempre es de nivel «familia»). */
  notify(t: Toast) {
    const icon = t.icon ?? 'ℹ️';
    const level = noticeLevel(t, this.world);
    const when = this.when();
    const log = this.hud.journal.log;
    log.unshift({ when, icon, text: t.text });
    if (log.length > 100) log.pop();
    if (level === 'barrio') {
      this.tray.unshift({ when, icon, text: t.text });
      if (this.tray.length > 60) this.tray.pop();
      this.unread++;
      this.renderBadge();
      return;
    }
    const box = $('#toasts');
    if (level === 'urgent') {
      // Sin repetir el mismo aviso urgente.
      for (const el of box.querySelectorAll<HTMLElement>('.toast.urgent')) if (el.dataset.text === t.text) return;
      const el = document.createElement('button');
      el.className = 'toast urgent';
      el.dataset.text = t.text;
      if (t.agentId) el.dataset.agent = t.agentId;
      el.setAttribute('aria-label', `${t.text}. Tocar para ir`);
      el.innerHTML = `<span>${esc(icon)}</span><span>${esc(t.text)}</span><span class="toast-go">${t.agentId ? 'Ir ›' : '✕'}</span>`;
      box.prepend(el);
      const urgent = box.querySelectorAll('.toast.urgent');
      for (let i = MAX_URGENT; i < urgent.length; i++) urgent[i].remove();
      vibrate(120);
      return;
    }
    // Familia: si ya está en pantalla, se cuenta (×2, ×3...) en vez de repetirlo.
    for (const el of box.querySelectorAll<HTMLElement>('.toast.normal')) {
      if (el.dataset.text !== t.text) continue;
      const n = Number(el.dataset.n ?? '1') + 1;
      el.dataset.n = String(n);
      const badge = el.querySelector('.toast-n');
      if (badge) badge.textContent = `×${n}`;
      return;
    }
    const el = document.createElement('div');
    el.className = 'toast normal';
    el.dataset.text = t.text;
    el.innerHTML = `<span>${esc(icon)}</span><span>${esc(t.text)}</span><b class="toast-n"></b>`;
    box.append(el);
    const normal = box.querySelectorAll('.toast.normal');
    for (let i = 0; i < normal.length - MAX_NORMAL; i++) normal[i].remove();
    setTimeout(() => el.classList.add('out'), 2800);
    setTimeout(() => el.remove(), 3300);
  }

  renderBadge() {
    const badge = $('#tray-btn').querySelector<HTMLElement>('.badge');
    if (!badge) return;
    badge.hidden = this.unread === 0;
    badge.textContent = this.unread > 99 ? '99+' : String(this.unread);
    $('#tray-btn').setAttribute('aria-label', this.unread ? `Avisos del barrio: ${this.unread} sin leer` : 'Avisos del barrio');
  }

  /** La bandeja: lo del barrio, con los repetidos agrupados («3 noticias del barrio»). */
  showTray() {
    const groups: { icon: string; items: TrayItem[] }[] = [];
    for (const it of this.tray) {
      const g = groups.find((x) => x.icon === it.icon);
      if (g) g.items.push(it);
      else groups.push({ icon: it.icon, items: [it] });
    }
    const rows = groups.length
      ? groups
          .map((g) => {
            const [first, ...rest] = g.items;
            const more = rest.length
              ? `<details class="tray-more"><summary class="muted small">y ${rest.length} más</summary>${rest.map((r) => `<div class="tray-old"><span class="muted small">${esc(r.when)}</span> ${esc(r.text)}</div>`).join('')}</details>`
              : '';
            return `<div class="log-row"><span class="log-icon">${esc(g.icon)}${g.items.length > 1 ? `<b class="tray-count">${g.items.length}</b>` : ''}</span><div><div class="muted small">${esc(first.when)}</div><div>${esc(first.text)}</div>${more}</div></div>`;
          })
          .join('')
      : '<p class="muted small">Nada nuevo en el barrio. Aquí se van guardando las noticias, las visitas y lo que pasa en la calle.</p>';
    $('#log').innerHTML = `<div class="map-card"><div class="sheet-head"><div><div class="sheet-title">🔔 Avisos del barrio</div><div class="sheet-sub">Lo que pasa fuera de casa, sin interrumpir</div></div><button class="icon-btn" data-close>✕</button></div><div class="places">${rows}</div></div>`;
    $('#log').hidden = false;
    this.unread = 0;
    this.renderBadge();
  }
}
