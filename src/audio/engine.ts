// Motor de audio propio sobre Web Audio (sin Phaser Sound, para no atarlo a la escena).
// Tres canales (efectos, ambiente y música) con su volumen, silencio general, desbloqueo
// con el primer toque y pausa con la pantalla apagada. Si el navegador no deja sonar,
// todo esto no hace nada y el juego sigue igual.

import type { SoundId } from './cues';
import { AMBIENCE_LAYERS, type Layer } from './ambience';
import { MUSIC_TRACKS, type Track } from './music';
import { SOUNDS, measureSounds, type Voice } from './synth';
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from './settings';

type Channel = 'sfx' | 'ambient' | 'music';

export class AudioEngine {
  settings: AudioSettings = loadAudioSettings();
  ctx: AudioContext | null = null;
  private master?: GainNode;
  private channels = {} as Record<Channel, GainNode>;
  private layers = new Map<string, Layer>();
  private music: { key: string; track: Track } | null = null;
  private wantedLayers: string[] = [];
  private wantedMusic = '';
  /** Último instante en que sonó cada sonido (para no repetirlos encima unos de otros). */
  private lastPlayed = new Map<SoundId, number>();

  constructor() {
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => this.syncRunning());
  }

  /** Los navegadores solo dejan crear o reanudar el audio tras un toque del jugador. */
  unlock() {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        for (const ch of ['sfx', 'ambient', 'music'] as Channel[]) {
          const g = this.ctx.createGain();
          g.connect(this.master);
          this.channels[ch] = g;
        }
        this.applyVolumes();
        this.setAmbience(this.wantedLayers);
        this.setMusic(this.wantedMusic);
      }
      this.syncRunning();
    } catch {
      this.ctx = null;
    }
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Suena solo con la app a la vista y sin silenciar: con la pantalla apagada no se gasta batería. */
  private syncRunning() {
    const ctx = this.ctx;
    if (!ctx) return;
    const on = !document.hidden && !this.settings.muted;
    try {
      if (on && ctx.state !== 'running') void ctx.resume();
      else if (!on && ctx.state === 'running') void ctx.suspend();
    } catch {
      /* da igual */
    }
  }

  private applyVolumes() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.05);
    this.channels.sfx.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    this.channels.ambient.gain.setTargetAtTime(this.settings.ambient, t, 0.05);
    this.channels.music.gain.setTargetAtTime(this.settings.music, t, 0.05);
  }

  update(patch: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...patch };
    saveAudioSettings(this.settings);
    this.applyVolumes();
    this.syncRunning();
  }

  /** Un efecto. `gain` ya incluye la distancia. Los repetidos muy seguidos se ignoran. */
  play(id: SoundId, gain = 1, minGap = 0.06) {
    const ctx = this.ctx;
    if (!ctx || !this.running || gain <= 0.01 || this.settings.muted || !this.settings.sfx) return;
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(id) ?? -1) < minGap) return;
    this.lastPlayed.set(id, now);
    try {
      SOUNDS[id]?.({ ctx, out: this.channels.sfx, t: now + 0.01, gain } satisfies Voice);
    } catch {
      /* un sonido que falla no rompe el juego */
    }
  }

  /** Cambia las capas de ambiente (con fundido). */
  setAmbience(keys: string[]) {
    this.wantedLayers = keys;
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [k, layer] of this.layers) {
      if (!keys.includes(k)) {
        layer.stop();
        this.layers.delete(k);
      }
    }
    for (const k of keys) {
      if (this.layers.has(k) || !AMBIENCE_LAYERS[k]) continue;
      try {
        this.layers.set(k, AMBIENCE_LAYERS[k](ctx, this.channels.ambient));
      } catch {
        /* sin ambiente */
      }
    }
  }

  /** Cambia la música (con fundido entre temas). */
  setMusic(key: string) {
    this.wantedMusic = key;
    const ctx = this.ctx;
    if (!ctx || this.music?.key === key) return;
    this.music?.track.stop();
    this.music = null;
    if (!key || !MUSIC_TRACKS[key]) return;
    try {
      this.music = { key, track: MUSIC_TRACKS[key](ctx, this.channels.music) };
    } catch {
      /* sin música */
    }
  }

  /** Pico de cada sonido renderizado sin altavoces (pruebas y ?debug). */
  measure() {
    return measureSounds();
  }

  /** Voz del metro (síntesis de voz del sistema, si la hay), al volumen del ambiente. */
  announce(text: string) {
    if (!this.running || this.settings.muted || !this.settings.ambient) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      u.rate = 0.95;
      u.volume = Math.min(1, this.settings.ambient * 1.4);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      /* sin voz */
    }
  }
}
