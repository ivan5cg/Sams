// Diario de la sesión y salseo del barrio.

import { $, esc } from './dom';
import { Part } from './part';
import { ARC_INFO } from '../sim/systems/arcs';

export class Journal extends Part {
  /** Diario: todo lo que ha pasado (solo en esta sesión). */
  log: { when: string; icon: string; text: string }[] = [];

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    $('#log').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'log' || el.closest('[data-close]')) $('#log').hidden = true;
    });
  }

  showLog() {
    const rows = this.log.length
      ? this.log.map((l) => `<div class="log-row"><span class="log-icon">${esc(l.icon)}</span><div><div class="muted small">${esc(l.when)}</div><div>${esc(l.text)}</div></div></div>`).join('')
      : '<p class="muted small">Todavía no ha pasado nada en esta sesión.</p>';
    $('#log').innerHTML = `<div class="map-card"><div class="sheet-head"><div class="sheet-title">📜 Diario</div><button class="icon-btn" data-close>✕</button></div><div class="places">${rows}</div></div>`;
    $('#log').hidden = false;
  }

  /** Lo que sabe la familia del salseo del barrio (y lo que ya sabe todo el mundo). */
  /** Culebrones: los que están en marcha (y los últimos acabados) que la familia conoce. */
  private arcsHtml(fam: string[]): string {
    const w = this.world;
    const known = (w.state.arcs ?? []).filter((arc) => {
      // Un lío que aún es un rumor solo se conoce si os lo han contado.
      if (arc.kind === 'lio' && arc.step === 0 && !arc.end) return (w.state.secrets ?? []).some((s) => s.kind === 'lio' && s.about[0] === arc.who[0] && s.known.some((id) => fam.includes(id)));
      return true;
    });
    if (!known.length) return '';
    const rows = known
      .slice(-5)
      .reverse()
      .map((arc) => {
        const info = ARC_INFO[arc.kind];
        const names = arc.who.map((id) => w.agent(id)?.name ?? '¿?');
        const who = arc.kind === 'lio' ? `${names[0]} y ${names[1]} (${names[2]} no sabe nada)` : `${names[0]} y ${names[1]}`;
        const steps = info.steps.map((s, i) => `<span class="arc-step ${i < arc.step || arc.end ? 'done' : i === arc.step ? 'now' : ''}">${esc(s)}</span>`).join('');
        const tip = arc.end ? `Acabó: ${esc(arc.end.how)}` : arc.kind === 'pelea' || (arc.kind === 'lio' && arc.step >= 1) ? 'Puedes tocar a uno de ellos y elegir «Mediar»' : arc.kind === 'lio' ? `Puedes contárselo a ${esc(names[2])}` : 'Si sigue así, habrá boda';
        return `<div class="log-row"><span class="log-icon">${info.icon}</span><div><b>${esc(info.title)}</b><div class="small">${esc(who)}</div><div class="arc-steps">${steps}</div><div class="muted small">${tip}</div></div></div>`;
      })
      .join('');
    return `<div class="prof-h">📖 Culebrones</div><div class="places">${rows}</div>`;
  }

  showSalseo() {
    const w = this.world;
    const fam = w.members.map((m) => m.id);
    const list = (w.state.secrets ?? []).filter((s) => s.public || s.known.some((id) => fam.includes(id)));
    const rows = list.length
      ? list
          .map((s) => `<div class="log-row"><span class="log-icon">${'🌶️'.repeat(s.juicy)}</span><div><div class="muted small">Día ${s.day}${s.public ? ' · lo sabe todo el barrio' : ' · secreto'}</div><div>${esc(s.text.charAt(0).toUpperCase() + s.text.slice(1))}</div></div></div>`)
          .join('')
      : '<p class="muted small">No os habéis enterado de nada todavía. Preguntad a las vecinas del banco del parque (o de la plaza de Alcorcón), cotillead con los vecinos o mirad el grupo de WhatsApp del barrio en el ordenador.</p>';
    $('#log').innerHTML = `<div class="map-card"><div class="sheet-head"><div><div class="sheet-title">🌶️ Salseo del barrio</div><div class="sheet-sub">Lo que sabéis (y lo que sabe todo el mundo)</div></div><button class="icon-btn" data-close>✕</button></div>${this.arcsHtml(fam)}<div class="prof-h">Secretos y rumores</div><div class="places">${rows}</div></div>`;
    $('#log').hidden = false;
  }
}
