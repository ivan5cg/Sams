// Logros y retos (☰ → 🏆): lo conseguido, lo que falta (con su progreso) y los retos opcionales.

import { ACHIEVEMENTS, CHALLENGES, type FeatDef } from '../data/feats';
import { CHALLENGE_REWARD } from '../sim/systems/feats';
import { $, esc } from './dom';
import { Part } from './part';

export class FeatsPanel extends Part {
  bind() {
    $('#feats').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'feats' || el.closest('[data-close]')) return this.close();
      const b = el.closest<HTMLButtonElement>('button');
      if (b?.dataset.start) {
        this.world.startChallenge(b.dataset.start);
        this.render();
      } else if (b?.dataset.drop && confirm('¿Abandonar el reto?')) {
        this.world.dropChallenge(b.dataset.drop);
        this.render();
      }
    });
  }

  open() {
    $('#feats').hidden = false;
    this.render();
  }

  close() {
    $('#feats').hidden = true;
  }

  render() {
    const w = this.world;
    const f = w.state.feats ?? { got: {}, counts: {}, challenges: {} };
    const bar = (p?: [number, number]) => (p ? `<div class="bar feat-bar" role="progressbar" aria-valuenow="${p[0]}" aria-valuemax="${p[1]}"><div class="fill" style="width:${Math.round((p[0] / p[1]) * 100)}%;background:#f0a830"></div></div><div class="muted small">${p[0].toLocaleString('es-ES')} / ${p[1].toLocaleString('es-ES')}</div>` : '');
    const row = (d: FeatDef, got: number | undefined, extra = '', p?: [number, number]) =>
      `<div class="feat-row ${got !== undefined ? 'got' : ''}"><span class="feat-icon">${got !== undefined ? d.icon : '🔒'}</span><div class="feat-main"><b>${esc(d.label)}</b><div class="muted small">${esc(d.desc)}${got !== undefined ? ` · día ${got}` : ''}</div>${got === undefined ? bar(p) : ''}${extra}</div></div>`;
    const ach = ACHIEVEMENTS.map((d) => row(d, f.got[d.id], '', d.progress?.({ w, counts: f.counts, since: 0 }))).join('');
    const total = ACHIEVEMENTS.filter((d) => f.got[d.id] !== undefined).length;
    const ch = CHALLENGES.map((d) => {
      const c = f.challenges[d.id];
      let extra: string;
      let p: [number, number] | undefined;
      if (!c) extra = `<button class="map-btn small-btn" data-start="${d.id}">Aceptar el reto (premio §${CHALLENGE_REWARD})</button>`;
      else if (c.done) extra = `<div class="small">✅ Cumplido el día ${c.done}</div>`;
      else if (c.failed) extra = `<div class="small">💔 Perdido: ${esc(c.failed)}</div><button class="map-btn ghost small-btn" data-start="${d.id}">Volver a intentarlo</button>`;
      else {
        p = d.progress?.({ w, counts: c.counts, since: c.since });
        extra = `<div class="small">⏳ En marcha</div><button class="map-btn ghost small-btn" data-drop="${d.id}">Abandonar</button>`;
      }
      return row(d, c?.done, extra + (p ? bar(p) : ''));
    }).join('');
    $('#feats').innerHTML = `<div class="map-card">
      <div class="sheet-head"><div><div class="sheet-title">🏆 Logros y retos</div><div class="sheet-sub">${total} de ${ACHIEVEMENTS.length} logros</div></div><button class="icon-btn" data-close>✕</button></div>
      <div class="prof-sec"><div class="prof-h">Logros</div>${ach}</div>
      <div class="prof-sec"><div class="prof-h">Retos (opcionales)</div>${ch}</div>
    </div>`;
  }
}
