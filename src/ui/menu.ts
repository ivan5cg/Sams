// Menú ☰ (guardar, exportar, ajustes) y elegir familia cuando la tuya se acaba.

import { SPECIES, lifeStage } from '../data/species';
import { IS_WEBGL, setWebglWanted, webglWanted } from '../render/gfx';
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from '../audio/settings';
import { prefs, setPrefs, type Prefs } from '../prefs';
import { $, esc } from './dom';
import { Part } from './part';

export class GameMenu extends Part {
  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    // Gráficos: normal (Canvas) o avanzado (WebGL). Hace falta recargar.
    const gfxSeg = $('#gfx');
    const paintGfx = () => {
      for (const b of gfxSeg.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', (b.dataset.gfx === 'webgl') === webglWanted());
      const note = $('#gfx-note');
      if (note) note.textContent = webglWanted() && !IS_WEBGL ? 'Se aplicará al recargar.' : IS_WEBGL ? 'Ahora: avanzado (luces y efectos). Si algo se ve raro, vuelve a normal.' : 'Ahora: normal (el de siempre, el más compatible).';
    };
    paintGfx();
    gfxSeg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.gfx) return;
      const want = b.dataset.gfx === 'webgl';
      if (want === webglWanted()) return;
      setWebglWanted(want);
      paintGfx();
      if (confirm(want ? 'Gráficos avanzados: hay que recargar el juego (la partida se guarda). Si en tu móvil algo no se ve bien, vuelve aquí y elige «Normal». ¿Recargar ahora?' : 'Volver a gráficos normales: hay que recargar (la partida se guarda). ¿Recargar ahora?')) this.hud.cb.onReload();
    });
    $('#menu-btn').addEventListener('click', () => this.toggleMenu(true));
    // Sonido: sí/no y volumen de cada canal (son ajustes de este dispositivo).
    $('#sound-on').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.sound) this.setAudio({ muted: b.dataset.sound === 'off' });
    });
    // Accesibilidad: letra, contraste, movimiento y vibración.
    $('#access').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      const seg = b?.closest<HTMLElement>('[data-pref]');
      if (!b || !seg) return;
      setPrefs({ [seg.dataset.pref as keyof Prefs]: b.dataset.v === '1' });
      this.renderAccess();
    });
    for (const input of $('#sound').querySelectorAll<HTMLInputElement>('input[data-vol]')) {
      input.addEventListener('input', () => this.setAudio({ [input.dataset.vol!]: Number(input.value) / 100 }));
    }
    $('#gone').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.continue) return;
      this.world.continueWith(b.dataset.continue);
      this.world.state.speed = 1;
      $('#gone').hidden = true;
      this.hud.panel.needsFor = '';
      this.hud.render();
    });
    $('#menu').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'menu') return this.toggleMenu(false);
      const b = el.closest('button');
      switch (b?.dataset.menu) {
        case 'close': this.toggleMenu(false); break;
        case 'save': this.hud.cb.onSave(); this.toggleMenu(false); break;
        case 'log': this.toggleMenu(false); this.hud.journal.showLog(); break;
        case 'salseo': this.toggleMenu(false); this.hud.journal.showSalseo(); break;
        case 'feats': this.toggleMenu(false); this.hud.feats.open(); break;
        case 'tutorial': this.toggleMenu(false); this.hud.tutorial.showTutorial(true); break;
        case 'export': this.hud.cb.onExport(); break;
        case 'import': $<HTMLInputElement>('#import-file').click(); break;
        case undefined:
          if (b?.dataset.aging) {
            this.world.setAging(b.dataset.aging as 'off' | 'normal' | 'fast');
            this.renderAging();
          }
          break;
        case 'new':
          if (confirm('¿Empezar una partida nueva? Se perderá la actual si no la has exportado.')) {
            this.toggleMenu(false);
            this.hud.newFamily(false);
          }
          break;
      }
    });
    $<HTMLInputElement>('#import-file').addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const f = input.files?.[0];
      if (f) this.hud.cb.onImport(f);
      input.value = '';
      this.toggleMenu(false);
    });
  }

  private audioSettings(): AudioSettings {
    return this.hud.audio?.settings ?? loadAudioSettings();
  }

  private setAudio(patch: Partial<AudioSettings>) {
    if (this.hud.audio) this.hud.audio.update(patch);
    else saveAudioSettings({ ...loadAudioSettings(), ...patch });
    this.renderAudio();
  }

  renderAudio() {
    const s = this.audioSettings();
    for (const b of $('#sound-on').querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', (b.dataset.sound === 'off') === s.muted);
    for (const input of $('#sound').querySelectorAll<HTMLInputElement>('input[data-vol]')) {
      input.value = String(Math.round(s[input.dataset.vol as 'sfx' | 'ambient' | 'music'] * 100));
      input.disabled = s.muted;
    }
  }

  renderAccess() {
    const p = prefs();
    for (const seg of $('#access').querySelectorAll<HTMLElement>('[data-pref]')) {
      const on = p[seg.dataset.pref as keyof Prefs];
      for (const b of seg.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', (b.dataset.v === '1') === on);
    }
  }

  renderAging() {
    const mode = this.world.state.aging ?? 'normal';
    for (const b of $('#aging').querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', b.dataset.aging === mode);
  }

  /** La familia se ha quedado sin nadie: elegir con qué familia del barrio seguir. */
  renderGone() {
    const w = this.world;
    const el = $('#gone');
    if (!w.state.familyGone) {
      el.hidden = true;
      return;
    }
    if (!el.hidden) return;
    const cards = w.state.households
      .filter((h) => h.id !== w.household.id)
      .map((h) => {
        const ms = h.memberIds.map((id) => w.agent(id)!).filter(Boolean);
        const who = ms.map((m) => (m.kind === 'person' ? `${esc(m.name)} (${esc(lifeStage(m.species, m.ageDays).label.toLowerCase())})` : `${SPECIES[m.species].icon} ${esc(m.name)}`)).join(', ');
        return `<div class="place"><div class="place-title">${esc(h.name)}</div><div class="muted small">${who} · §${h.funds.toLocaleString('es-ES')}</div>
          <div class="place-actions"><button class="map-btn" data-continue="${h.id}">Seguir con esta familia</button></div></div>`;
      })
      .join('');
    el.innerHTML = `<div class="map-card"><div class="sheet-title">🕯️ La ${esc(w.household.name)} ya no está</div>
      <p class="sheet-note">La partida no termina: elige otra familia del barrio y continúa su historia.</p>
      <div class="places">${cards}</div></div>`;
    el.hidden = false;
  }

  toggleMenu(open: boolean) {
    if (open) {
      this.renderAging();
      this.renderAudio();
      this.renderAccess();
    }
    $('#menu').hidden = !open;
  }
}
