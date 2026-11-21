// Preguntas al jugador con el tiempo parado: el nombre del bebé que acaba de nacer y las invitaciones a los
// eventos de la empresa (afterwork, comida, cena de Navidad).

import { CORP_EVENTS } from '../data/work';
import { inviteText } from '../sim/systems/work';
import { $, esc } from './dom';
import { Part } from './part';

export class PromptPanel extends Part {
  speedBefore = 1;
  shownKey = '';

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    const box = $('#prompt');
    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.name !== undefined) return this.submitName();
      if (b.dataset.invite) {
        this.world.answerInvite(b.dataset.invite as 'solo' | 'contigo' | 'no');
        this.close();
      }
    });
    box.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') this.submitName();
    });
  }

  private submitName() {
    const input = $('#prompt').querySelector<HTMLInputElement>('input');
    const why = this.world.nameBaby(input?.value ?? '');
    if (why) {
      // El nombre ya está cogido: se vuelve a preguntar (la pregunta sigue abierta).
      this.hud.toast(why, '👶');
      if (this.world.state.prompt) return;
    }
    this.close();
  }

  private close() {
    $('#prompt').hidden = true;
    this.shownKey = '';
    if (this.world.state.speed === 0) this.world.state.speed = this.speedBefore || 1;
    this.hud.render();
  }

  /** Si hay una pregunta pendiente, se para el tiempo y se pregunta. */
  sync() {
    const w = this.world;
    const p = w.state.prompt;
    const box = $('#prompt');
    if (!p) {
      if (!box.hidden) this.close();
      return;
    }
    const key = `${p.kind}:${p.agentId}:${p.until}`;
    if (this.shownKey === key || this.hud.talk.talking || w.ui.building || !$('#dilemma').hidden) return;
    const who = w.agent(p.agentId);
    if (!who) {
      w.state.prompt = undefined;
      return;
    }
    this.shownKey = key;
    this.speedBefore = w.state.speed || 1;
    w.state.speed = 0;
    if (p.kind === 'naming') {
      const parents = (who.parents ?? []).map((id) => w.agent(id)?.name).filter(Boolean);
      box.innerHTML = `<div class="dilemma-card">
        <h3>👶 ¡Ha nacido un bebé!</h3>
        <div class="muted small">${parents.length ? `Hijo/a de ${esc(parents.join(' y '))}` : esc(w.household.name)}</div>
        <p>¿Cómo se va a llamar?</p>
        <input class="name-input" type="text" maxlength="24" value="${esc(who.name)}" aria-label="Nombre del bebé" />
        <button class="act" data-name><span class="act-icon">✅</span><span class="act-label">Ponerle este nombre</span></button>
      </div>`;
      box.hidden = false;
      const input = box.querySelector<HTMLInputElement>('input');
      input?.focus();
      input?.select();
      return;
    }
    const ev = CORP_EVENTS[p.event];
    box.innerHTML = `<div class="dilemma-card">
      <h3>${ev.icon} ${esc(ev.label)}</h3>
      <div class="muted small">${esc(who.name)}</div>
      <p>${esc(inviteText(w, p))}</p>
      <button class="act" data-invite="contigo"><span class="act-icon">🕺</span><span class="act-label">Ir con ${esc(who.name)}<small class="info">Lo juegas tú: el jefe, los compañeros, la barra libre... cuidado con lo que haces</small></span></button>
      <button class="act" data-invite="solo"><span class="act-icon">🍻</span><span class="act-label">Que vaya por su cuenta<small class="info">Ya te contará qué ha pasado (puede salir bien... o no)</small></span></button>
      <button class="act" data-invite="no"><span class="act-icon">🏠</span><span class="act-label">No va<small class="info">A casa, que mañana se madruga</small></span></button>
    </div>`;
    box.hidden = false;
  }
}
