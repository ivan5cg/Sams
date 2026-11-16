// Conversación interactiva: elegir de qué hablar en cada turno.

import { converse, knownText, topicsFor } from '../sim/conversation';
import { getRel, relLabel } from '../sim/social';
import { hasTrait, traitsOf } from '../sim/traits';
import type { Agent } from '../sim/types';
import { $, esc } from './dom';
import { Part } from './part';

export class TalkPanel extends Part {
  talking: { aId: string; tId: string; taskId: string; turn: number; log: { who: string; text: string; mood?: string }[]; speed: number } | null = null;

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    $('#talk').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.topic) this.talkTurn(b.dataset.topic);
      else if (b.dataset.endtalk !== undefined) this.endTalk();
    });
  }

  /** Abre el panel cuando empieza un "Conversar…" del jugador, y lo cierra si se acaba. */
  syncTalk() {
    const w = this.world;
    const a = w.activeAgent;
    const cur = a.current;
    const active = cur && cur.actionId === 'talk' && cur.byPlayer && cur.phase === 'acting' ? cur : null;
    if (active && !this.talking) {
      const t = w.agent(active.targetAgentId);
      if (!t) return;
      this.talking = { aId: a.id, tId: t.id, taskId: active.id, turn: 0, log: [{ who: t.name, text: this.greeting(t) }], speed: w.state.speed || 1 };
      w.say(t.id, this.talking.log[0].text);
      // Se pausa mientras se elige qué decir.
      w.state.speed = 0;
      this.renderTalk();
      $('#talk').hidden = false;
    } else if (this.talking && (!active || active.id !== this.talking.taskId)) {
      this.closeTalk();
    }
  }

  greeting(t: Agent): string {
    const w = this.world;
    const rel = getRel(w.state, w.activeAgent.id, t.id);
    const h = w.hour;
    const hello = h < 13 ? '¡Buenos días' : h < 21 ? '¡Buenas tardes' : '¡Buenas noches';
    if (rel.status) return `${hello}, cariño!`;
    if (rel.f <= -15) return '¿Y ahora qué quieres?';
    if (hasTrait(t, 'cunado')) return '¿Qué pasa, máquina? Ven, que te cuento una cosa';
    if (hasTrait(t, 'grunon')) return 'Hmpf. ¿Qué?';
    if (rel.f >= 45) return '¡Hombre! ¿Qué pasa? ¡Cuánto tiempo!';
    if (rel.f < 5) return `${hello}... ¿nos conocemos?`;
    return `${hello}! ¿Qué tal?`;
  }

  talkTurn(topicId: string) {
    const w = this.world;
    const tk = this.talking;
    if (!tk) return;
    const a = w.agent(tk.aId), t = w.agent(tk.tId);
    if (!a || !t) return this.endTalk();
    const res = converse(w, a, t, topicId);
    w.onTalkTurn(a, t, res, tk.turn === 0);
    tk.turn++;
    const mood = res.outcome === 'good' ? '😊' : res.outcome === 'bad' ? '😬' : '😐';
    tk.log.push({ who: a.name, text: res.say }, { who: t.name, text: res.reply, mood });
    if (res.learned) {
      const what = ({ mascotas: 'n las mascotas', deporte: ' el fútbol', musica: ' la música', arte: ' el arte', cocina: ' la cocina', ciencia: ' la ciencia', cotilleos: ' cotillear', viajes: ' viajar' } as Record<string, string>)[res.learned];
      this.hud.toast(`Has descubierto que a ${t.name} le encanta${what}`, '💡');
    }
    if (res.goPark) {
      this.closeTalk(false);
      return;
    }
    this.renderTalk();
  }

  renderTalk() {
    const w = this.world;
    const tk = this.talking;
    if (!tk) return;
    const a = w.agent(tk.aId)!, t = w.agent(tk.tId)!;
    const rel = getRel(w.state, a.id, t.id);
    const pct = Math.round((rel.f + 100) / 2);
    const known = knownText(a, t);
    const log = tk.log
      .slice(-6)
      .map((l) => `<div class="talk-line ${l.who === a.name ? 'me' : 'them'}"><b>${esc(l.who)}</b> ${esc(l.text)} ${l.mood ?? ''}</div>`)
      .join('');
    const topics = topicsFor(w, a, t, tk.turn)
      .map((tp) => `<button class="act" data-topic="${tp.id}"><span class="act-icon">${tp.icon}</span><span class="act-label">${esc(tp.label)}</span></button>`)
      .join('');
    $('#talk').innerHTML = `<div class="talk-card">
      <div class="sheet-head">
        <div><div class="sheet-title">🗨️ ${esc(a.name)} y ${esc(t.name)}</div>
        <div class="sheet-sub">${traitsOf(t).map((x) => x.icon).join('')} ${esc(relLabel(rel, a.kind, t.kind))}${known ? ` · ${esc(known)}` : ''}</div></div>
        <button class="icon-btn" data-endtalk>✕</button>
      </div>
      <div class="bar talk-bar"><div class="fill" style="width:${pct}%;background:${rel.f >= 15 ? '#4cd964' : rel.f <= -15 ? '#ff4d3d' : '#a3a9bf'}"></div></div>
      <div class="talk-log">${log}</div>
      <div class="sheet-who">¿De qué habláis?</div>
      <div class="sheet-actions">${topics}</div>
      <button class="map-btn ghost talk-end" data-endtalk>👋 Despedirse</button>
    </div>`;
    const box = $('#talk').querySelector('.talk-log');
    if (box) box.scrollTop = box.scrollHeight;
  }

  endTalk() {
    const tk = this.talking;
    if (tk) {
      const a = this.world.agent(tk.aId), t = this.world.agent(tk.tId);
      if (a && t) this.world.say(a.id, tk.turn ? '¡Hasta luego!' : 'Bueno, ya hablamos');
      if (a && t) this.world.say(t.id, '¡Chao!');
    }
    this.closeTalk();
  }

  closeTalk(cancelTask = true) {
    const tk = this.talking;
    this.talking = null;
    $('#talk').hidden = true;
    if (!tk) return;
    if (cancelTask) this.world.cancel(tk.aId, tk.taskId);
    if (this.world.state.speed === 0) this.world.state.speed = tk.speed;
    this.hud.render();
  }
}
