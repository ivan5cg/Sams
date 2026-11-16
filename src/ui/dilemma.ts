// Dilemas del trabajo: se para el tiempo y se pregunta qué hacer.

import { CAREERS } from '../data/careers';
import { DILEMMA_BY_ID } from '../data/dilemmas';
import { $, esc } from './dom';
import { Part } from './part';

export class DilemmaPanel extends Part {
  speedBeforeDilemma = 1;

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    $('#dilemma').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.dl) return;
      this.world.resolveDilemma(Number(b.dataset.dl));
      $('#dilemma').hidden = true;
      this.world.state.speed = this.speedBeforeDilemma;
      this.hud.render();
    });
  }

  /** Si hay un dilema del trabajo, se para el tiempo y se pregunta. */
  syncDilemma() {
    const w = this.world;
    const dl = w.state.dilemma;
    const box = $('#dilemma');
    if (!dl) {
      if (!box.hidden) box.hidden = true;
      return;
    }
    if (!box.hidden || this.hud.talk.talking || w.ui.building) return;
    const d = DILEMMA_BY_ID[dl.id];
    const who = w.agent(dl.agentId);
    if (!d || !who) return w.resolveDilemma(0);
    const c = who.job ? CAREERS[who.job.career] : undefined;
    this.speedBeforeDilemma = w.state.speed || 1;
    w.state.speed = 0;
    box.innerHTML = `<div class="dilemma-card">
      <h3>${c?.icon ?? '💼'} ${esc(d.title)}</h3>
      <div class="muted small">${esc(who.name)} · ${esc(c?.levels[(who.job?.level ?? 1) - 1]?.title ?? 'en el trabajo')}</div>
      <p>${esc(d.text.replace('{name}', who.name))}</p>
      ${d.options.map((o, i) => `<button class="act" data-dl="${i}"><span class="act-icon">${o.icon}</span><span class="act-label">${esc(o.label)}${o.chance !== undefined ? '<small class="info">Puede salir bien... o no</small>' : ''}</span></button>`).join('')}
    </div>`;
    box.hidden = false;
  }
}
