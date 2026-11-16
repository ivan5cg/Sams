// Tutorial guiado: pasos con objetivo que se cumplen haciendo, no leyendo.
// Cada paso dice qué hacer, resalta dónde (un halo en un botón o una flecha sobre un mueble)
// y se da por cumplido mirando el mundo. El tiempo solo se para en el primer paso.

import { CAREERS } from '../data/careers';
import { FRIDGE_FOOD } from '../sim/constants';
import type { Agent } from '../sim/types';
import { $, esc } from './dom';
import { Part } from './part';

const KEY = 'sams:tutorial2';

interface Step {
  icon: string;
  title: string;
  text: string;
  /** Selectores de lo que se resalta en la interfaz. */
  glow?: string[];
  /** Mueble de la escena sobre el que se pone la flecha. */
  arrow?: string;
}

export class Guide extends Part {
  /** Paso actual (-1 = no se está guiando). */
  step = -1;
  private speedBefore = 1;
  private objectsAtStart = 0;
  /** A quién se controlaba al llegar al paso de cambiar de personaje. */
  private activeAtStart = '';
  private glowing: Element[] = [];
  private lastHtml = '';

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    $('#guide').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.skip !== undefined) this.finish(true);
    });
  }

  /** Empieza (o continúa) la guía si el jugador aún no la ha hecho. */
  start() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
      // Quien ya vio el tutorial antiguo sabe jugar: no se le guía.
      if (saved === null && localStorage.getItem('sams:tutorial')) saved = 'done';
    } catch {
      /* sin almacenamiento: se guía desde el principio */
    }
    if (saved === 'done') return;
    this.goTo(Math.max(0, Number(saved) || 0));
  }

  private save(v: string) {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* sin almacenamiento */
    }
  }

  private get pet(): Agent | undefined {
    return this.world.members.find((m) => m.kind === 'pet' && !m.home) ?? this.world.members.find((m) => m.kind === 'pet');
  }

  private get playerObjects(): number {
    return this.world.objectsIn(this.world.household.lotId).length;
  }

  private parkId(): string | undefined {
    return this.world.state.lots.find((l) => l.kind === 'park')?.id;
  }

  /** Los pasos (los textos dependen de quién se controla y de qué está abierto). */
  private def(i: number): Step {
    const w = this.world;
    const a = w.activeAgent;
    const pet = this.pet;
    switch (i) {
      case 0:
        return { icon: '🧊', title: 'Toca la nevera', text: 'Las órdenes se dan tocando las cosas de la casa. Empieza por la nevera (la de la flecha).', arrow: 'fridge' };
      case 1:
        return { icon: '🍝', title: `Que ${a.name} coma algo`, text: `Elige «Comer» o «Picar algo». ${a.name} irá a la nevera por su cuenta.`, glow: ['#sheet [data-action="eat"]', '#sheet [data-action="snack"]'] };
      case 2:
        return { icon: pet ? '🐾' : '🔁', title: pet ? `Ahora, ${pet.name}` : 'Cambia de personaje', text: `Controlas a uno cada vez (mascotas incluidas): toca el retrato de ${pet?.name ?? 'otro de la familia'} abajo.`, glow: [pet ? `#portraits [data-id="${pet.id}"]` : '#portraits .portrait:not(.active)'] };
      case 3: {
        const person = a.kind === 'person';
        const going = w.members.find((m) => [m.current, ...m.queue].some((t) => t?.actionId === 'find_job'));
        if (going) return { icon: '💼', title: 'A buscar curro', text: `${going.name} va al ordenador a mirar ofertas. Un momento...` };
        return {
          icon: '💼',
          title: 'A buscar curro',
          text: person ? 'Toca el ordenador y elige «Buscar trabajo». Luego, el que más te guste.' : 'Las mascotas no trabajan (qué suerte). Vuelve a una persona tocando su retrato.',
          glow: person ? ['#sheet [data-action="find_job"]', '#sheet [data-career]'] : ['#portraits .portrait:not(.active)'],
          arrow: person ? 'computer' : undefined,
        };
      }
      case 4: {
        const building = w.ui.building;
        return {
          icon: '🔨',
          title: 'Decora la casa',
          text: building ? 'Elige un mueble (o una planta, que es barata) y toca el suelo donde lo quieras.' : 'Toca 🔨 para entrar en el modo construcción.',
          glow: building ? ['#build-items .item:not([disabled])', '#placebar [data-place]'] : ['#build-btn'],
        };
      }
      case 5: {
        const map = !$('#map').hidden;
        return {
          icon: '🗺️',
          title: 'Sal al barrio',
          text: w.ui.building ? 'Pulsa «✓ Listo» para salir de la obra.' : map ? 'Elige el parque.' : 'Abre el mapa del barrio 🗺️ y vete al parque.',
          glow: w.ui.building ? ['#build-exit'] : map ? [`#map [data-go="${this.parkId()}"]`] : ['#map-btn'],
        };
      }
    }
    return { icon: '', title: '', text: '' };
  }

  private readonly COUNT = 6;

  /** ¿Se ha cumplido el paso actual? */
  private done(i: number): boolean {
    const w = this.world;
    const a = w.activeAgent;
    switch (i) {
      case 0: {
        const t = this.hud.sheet.sheetTarget;
        return !$('#sheet').hidden && t?.kind === 'object' && w.object(t.id)?.def === 'fridge';
      }
      case 1:
        return [a.current, ...a.queue].some((t) => t && FRIDGE_FOOD.has(t.actionId));
      case 2:
        // Sin mascota, vale con cambiar a otro; y si se vive solo, no hay a quién cambiar.
        return this.pet ? a.kind === 'pet' : w.members.length < 2 || a.id !== this.activeAtStart;
      case 3:
        return w.members.some((m) => m.job && !CAREERS[m.job.career]?.school);
      case 4:
        return this.playerObjects > this.objectsAtStart;
      case 5: {
        const park = this.parkId();
        return w.members.some((m) => m.lotId === park || m.travel?.to === park);
      }
    }
    return true;
  }

  private goTo(i: number) {
    const w = this.world;
    if (this.step === 0 && i !== 0) w.state.speed = this.speedBefore || 1;
    this.step = i;
    if (i >= this.COUNT) return this.finish(false);
    this.save(String(i));
    if (i === 0) {
      // Solo el primer paso para el tiempo: para tocar la nevera con calma.
      this.speedBefore = w.state.speed || 1;
      w.state.speed = 0;
    }
    if (i === 2) this.activeAtStart = w.activeAgent.id;
    if (i === 4) this.objectsAtStart = this.playerObjects;
    document.body.classList.add('guiding');
    $('#guide').hidden = false;
    this.lastHtml = '';
    this.sync();
  }

  /** Termina la guía (saltada o completada). */
  finish(skipped: boolean) {
    if (this.step === 0) this.world.state.speed = this.speedBefore || 1;
    this.step = -1;
    this.save('done');
    this.world.ui.guide = null;
    this.setGlow([]);
    $('#guide').hidden = true;
    document.body.classList.remove('guiding');
    if (!skipped) this.hud.toast('¡Ya sabes lo básico! Lo demás, a tu aire. La ayuda está en ☰ → ❓', '🎓');
    this.hud.render();
  }

  /** Se llama en cada repintado: comprueba el paso y actualiza textos y resaltados. */
  sync() {
    if (this.step < 0) return;
    if (this.done(this.step)) {
      const next = this.step + 1;
      if (next < this.COUNT) this.hud.toast(`¡Bien! ${this.def(this.step).title} ✓`, '✅');
      return this.goTo(next);
    }
    const s = this.def(this.step);
    this.world.ui.guide = s.arrow ? { def: s.arrow } : null;
    this.setGlow(s.glow ?? []);
    const dots = Array.from({ length: this.COUNT }, (_, i) => `<span class="${i < this.step ? 'done' : i === this.step ? 'on' : ''}"></span>`).join('');
    const html = `<div class="guide-card" role="status" aria-live="polite">
      <span class="guide-icon">${s.icon}</span>
      <div class="guide-main">
        <div class="guide-title">${esc(s.title)} <span class="muted small">${this.step + 1}/${this.COUNT}</span></div>
        <div class="guide-text">${esc(s.text)}</div>
        <div class="tuto-dots guide-dots">${dots}</div>
      </div>
      <button class="icon-btn guide-skip" data-skip aria-label="Saltar el tutorial">Saltar</button>
    </div>`;
    if (html !== this.lastHtml) {
      $('#guide').innerHTML = html;
      this.lastHtml = html;
    }
  }

  private setGlow(selectors: string[]) {
    const els = selectors.flatMap((sel) => [...document.querySelectorAll(sel)]);
    for (const el of this.glowing) if (!els.includes(el)) el.classList.remove('guide-glow');
    for (const el of els) el.classList.add('guide-glow');
    this.glowing = els;
  }
}
