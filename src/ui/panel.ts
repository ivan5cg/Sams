// Panel de abajo: retratos, cola de acciones, deseos, emociones y necesidades del personaje activo.

import { ACTIONS } from '../data/actions';
import { NEED_INFO, SPECIES, lifeStage, needLabel } from '../data/species';
import { emotionsOf } from '../sim/emotions';
import { NEED_KEYS, type Agent } from '../sim/types';
import { $, esc, hexColor, mood, needColor } from './dom';
import { Part } from './part';

export class FamilyPanel extends Part {
  lastQueueHtml = '';
  lastPortraitsHtml = '';
  needsFor = '';
  lastWishHtml = '';
  lastEmoHtml = '';

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    $('#portraits').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.id) return;
      this.world.setActive(b.dataset.id);
      this.hud.sheet.closeSheet();
      this.hud.render();
    });
    $('#queue').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.task) this.world.cancel(this.world.activeAgent.id, b.dataset.task);
      this.hud.render();
    });
    // El panel de necesidades va plegado por defecto (para ver más escena); se recuerda la elección.
    try {
      if (localStorage.getItem('sams:needsOpen') !== '1') $('#panel').classList.add('collapsed');
    } catch {
      $('#panel').classList.add('collapsed');
    }
    $('#needs-toggle').addEventListener('click', () => {
      const collapsed = $('#panel').classList.toggle('collapsed');
      try {
        localStorage.setItem('sams:needsOpen', collapsed ? '0' : '1');
      } catch {
        /* sin almacenamiento: da igual */
      }
    });
    $('#wishes').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.wish) {
        this.world.pursueWish(this.world.activeAgent.id, b.dataset.wish);
        this.hud.render();
      }
    });
  }

  /** Pinta el panel (solo toca el DOM de lo que ha cambiado). */
  render() {
    const w = this.world;
    const a = w.activeAgent;

    // Retratos
    const portraits = w.members
      .map((m) => {
        const md = mood(m);
        const face = m.kind === 'person' ? esc(m.name[0]) : SPECIES[m.species].icon;
        const bg = m.kind === 'person' ? hexColor(m.color) : '#3a3f55';
        return `<button class="portrait ${m.id === a.id ? 'active' : ''} ${m.hidden || m.travel || m.lotId !== w.viewLotId ? 'away' : ''}" data-id="${m.id}" style="--ring:${md.color};--bg:${bg}" aria-label="${esc(m.name)}">
          <span class="face">${face}</span><span class="pmood">${md.icon}</span>
        </button>`;
      })
      .join('');
    if (portraits !== this.lastPortraitsHtml) {
      $('#portraits').innerHTML = portraits;
      this.lastPortraitsHtml = portraits;
    }

    // Cabecera del panel
    const md = mood(a);
    const stage = lifeStage(a.species, a.ageDays);
    $('#who').innerHTML = `<b>${esc(a.name)}</b> <span class="muted">${esc(stage.label)} · ${a.ageDays} ${a.ageDays === 1 ? 'día' : 'días'}</span> <span title="${md.label}">${md.icon}</span>`;

    // Cola de acciones
    const tasks = [a.current, ...a.queue].filter((t) => t && t.actionId !== 'idle');
    const until = a.travel ? `${String(Math.floor((a.travel.arrive % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(a.travel.arrive % 60)).padStart(2, '0')}` : '';
    const travelChip = !a.travel
      ? ''
      : a.travel.reason === 'work'
        ? `<div class="chip now"><span>💼</span><span class="chip-l">En el trabajo hasta las ${until}</span></div>`
        : a.travel.reason === 'school'
          ? `<div class="chip now"><span>🎒</span><span class="chip-l">En clase hasta las ${until}</span></div>`
          : `<div class="chip now"><span>🚶</span><span class="chip-l">De camino a: ${esc(this.hud.placeName(a.travel.to))}</span></div>`;
    let queueHtml = travelChip + tasks
      .map((t, i) => {
        const def = ACTIONS[t!.actionId];
        const target = t!.targetAgentId ? w.agent(t!.targetAgentId)?.name : '';
        const label = t!.passiveOf ? `${def.verb} con ${w.agent(t!.passiveOf)?.name ?? ''}` : `${i === 0 ? def.verb : def.label}${target ? ` · ${target}` : ''}`;
        const cancel = def.forced || t!.passiveOf ? '' : `<button class="x" data-task="${t!.id}" aria-label="Cancelar">✕</button>`;
        return `<div class="chip ${i === 0 ? 'now' : ''} ${t!.byPlayer ? '' : 'auto'}"><span>${def.icon}</span><span class="chip-l">${esc(label)}</span>${cancel}</div>`;
      })
      .join('');
    if (!queueHtml) {
      const own = w.optionsFor(a.id, { kind: 'agent', id: a.id }).length > 0;
      const homeDef = a.home ? w.object(a.home)?.def : undefined;
      const where = homeDef === 'crib' ? 'Toca su cuna' : homeDef ? 'Toca su jaula' : 'Toca algo';
      queueHtml = `<div class="hint">${a.kind === 'pet' ? '🐾' : '👆'} ${where}${own ? ` o a ${esc(a.name)}` : ''} para darle una orden</div>`;
    }
    if (queueHtml !== this.lastQueueHtml) {
      $('#queue').innerHTML = queueHtml;
      this.lastQueueHtml = queueHtml;
    }

    // Deseos del personaje activo (tócalos para ponerte a cumplirlos)
    const wishes = a.wishes ?? [];
    const wishHtml = wishes.length
      ? `<span class="wish-title">⭐ Deseos</span>${wishes.map((wi) => `<button class="wish" data-wish="${wi.id}"><span>${wi.icon}</span><span class="chip-l">${esc(wi.label)}</span><b>+§${wi.reward}</b></button>`).join('')}`
      : '';
    if (wishHtml !== this.lastWishHtml) {
      $('#wishes').innerHTML = wishHtml;
      this.lastWishHtml = wishHtml;
    }

    // Cómo se siente (emociones con causa)
    const emos = emotionsOf(a)
      .filter((e) => e.until > w.state.minutes)
      .sort((x, y) => Math.abs(y.def.value) - Math.abs(x.def.value));
    const emoHtml = emos
      .map((e) => `<span class="emo ${e.def.value < 0 ? 'bad' : ''}">${e.def.icon} ${esc(e.def.label)} <b>${e.def.value > 0 ? '+' : ''}${e.def.value}</b></span>`)
      .join('');
    if (emoHtml !== this.lastEmoHtml) {
      $('#emotions').innerHTML = emoHtml;
      this.lastEmoHtml = emoHtml;
    }

    // Necesidades
    if (this.needsFor !== a.id) {
      $('#needs').innerHTML = NEED_KEYS.map(
        (k) => `<div class="need"><span class="ni">${NEED_INFO[k].icon}</span><span class="nl">${esc(needLabel(a.species, k))}</span><div class="bar"><div class="fill" data-need="${k}"></div></div></div>`,
      ).join('');
      this.needsFor = a.id;
    }
    for (const el of $('#needs').querySelectorAll<HTMLElement>('.fill')) {
      const v = a.needs[el.dataset.need as keyof Agent['needs']];
      el.style.width = `${v}%`;
      el.style.background = needColor(v);
    }
  }
}
