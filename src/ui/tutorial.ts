// Explicación rápida de cómo se juega.

import { $, esc } from './dom';
import { Part } from './part';

export class Tutorial extends Part {
  tutorialStep = 0;
  speedBeforeTutorial = 1;

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    $('#tutorial').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.next !== undefined) {
        this.tutorialStep++;
        this.renderTutorial();
      } else if (b.dataset.done !== undefined) {
        $('#tutorial').hidden = true;
        this.world.state.speed = this.speedBeforeTutorial || 1;
        this.hud.render();
        try {
          localStorage.setItem('sams:tutorial', '1');
        } catch {
          /* sin almacenamiento */
        }
      }
    });
  }

  /** Explicación rápida la primera vez (o desde el menú). */
  showTutorial(force = false) {
    if (!force) {
      try {
        if (localStorage.getItem('sams:tutorial')) return;
      } catch {
        /* sin almacenamiento: se muestra */
      }
    }
    this.tutorialStep = 0;
    this.speedBeforeTutorial = this.world.state.speed;
    this.world.state.speed = 0;
    $('#tutorial').hidden = false;
    this.renderTutorial();
  }

  renderTutorial() {
    const steps = [
      { icon: '🏡', title: '¡Bienvenidos a Sams!', text: 'Cuidas de la familia García: Lucía, Mateo, el perro Toby y la gata Misi. La partida no termina nunca.' },
      { icon: '👆', title: 'Dar órdenes', text: 'Toca algo de la casa (la nevera, la cama, a otra persona...) para ver qué puede hacer el personaje activo. Toca el suelo para que camine.' },
      { icon: '🟢', title: 'Uno cada vez', text: 'Controlas a un miembro de la familia cada vez (mascotas incluidas): toca su retrato abajo para cambiar. Los demás se cuidan solos.' },
      { icon: '🗺️', title: 'El barrio', text: 'Con 🗺️ vas al parque o de visita, e invitas a los vecinos. Con 👥 ves el trabajo y las relaciones. Con 🔨 compras y colocas muebles.' },
      { icon: '⏯️', title: 'El tiempo', text: 'Arriba pausas o aceleras. Busca trabajo en el ordenador, enamórate, ten hijos... y que la familia siga generación tras generación.' },
    ];
    const s = steps[Math.min(this.tutorialStep, steps.length - 1)];
    const last = this.tutorialStep >= steps.length - 1;
    $('#tutorial').innerHTML = `<div class="tuto-card">
      <div class="tuto-icon">${s.icon}</div>
      <div class="sheet-title">${esc(s.title)}</div>
      <p>${esc(s.text)}</p>
      <div class="tuto-dots">${steps.map((_, i) => `<span class="${i === this.tutorialStep ? 'on' : ''}"></span>`).join('')}</div>
      <div class="tuto-actions">
        ${last ? '' : '<button class="map-btn ghost" data-done>Saltar</button>'}
        <button class="map-btn" ${last ? 'data-done' : 'data-next'}>${last ? '¡A jugar!' : 'Siguiente'}</button>
      </div>
    </div>`;
  }
}
