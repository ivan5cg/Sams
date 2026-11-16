// Ambiente por sitio y hora: una base continua (ruido filtrado) y sonidos sueltos al azar.
// Cada capa entra y sale con un fundido.

import { bell, noise, noiseBuffer, tone, type Voice } from './synth';

export interface Layer {
  stop(): void;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const FADE = 1.5;

interface LayerDef {
  /** Base continua: ruido con un filtro (y, si se quiere, un vaivén lento de volumen). */
  bed?: { type: BiquadFilterType; f: number; q?: number; gain: number; wobble?: number };
  /** Sonidos sueltos: cada cuánto (segundos, al azar) y qué suena. */
  events?: { every: [number, number]; play: (v: Voice) => void }[];
}

function makeLayer(def: LayerDef) {
  return (ctx: AudioContext, out: AudioNode): Layer => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + FADE);
    g.connect(out);
    const stoppers: (() => void)[] = [];
    if (def.bed) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      const fl = ctx.createBiquadFilter();
      fl.type = def.bed.type;
      fl.frequency.value = def.bed.f;
      fl.Q.value = def.bed.q ?? 0.7;
      const bg = ctx.createGain();
      bg.gain.value = def.bed.gain;
      src.connect(fl).connect(bg).connect(g);
      if (def.bed.wobble) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = 0.15 + Math.random() * 0.1;
        depth.gain.value = def.bed.gain * def.bed.wobble;
        lfo.connect(depth).connect(bg.gain);
        lfo.start();
        stoppers.push(() => lfo.stop());
      }
      src.start();
      stoppers.push(() => src.stop());
    }
    // Sonidos sueltos: se programan con un poco de antelación.
    const next = (def.events ?? []).map((e) => ctx.currentTime + rnd(e.every[0], e.every[1]) * 0.5);
    const timer = setInterval(() => {
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      (def.events ?? []).forEach((e, i) => {
        if (next[i] < now) next[i] = now + 0.05;
        while (next[i] < now + 0.4) {
          try {
            e.play({ ctx, out: g, t: next[i], gain: 1 });
          } catch {
            /* nada */
          }
          next[i] += rnd(e.every[0], e.every[1]);
        }
      });
    }, 200);
    return {
      stop() {
        clearInterval(timer);
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + FADE);
        setTimeout(() => {
          for (const s of stoppers) {
            try {
              s();
            } catch {
              /* ya parado */
            }
          }
          g.disconnect();
        }, FADE * 1000 + 100);
      },
    };
  };
}

const bird = (v: Voice) => {
  const f = rnd(2400, 3800);
  const n = Math.floor(rnd(1, 4));
  for (let i = 0; i < n; i++) tone({ ...v, t: v.t + i * 0.09 }, f, 0.035, { to: f * rnd(1.1, 1.4), a: 0.005, hold: 0.03, r: 0.03 });
};
const cricket = (v: Voice) => {
  for (let i = 0; i < 3; i++) tone({ ...v, t: v.t + i * 0.06 }, 4400, 0.02, { type: 'square', a: 0.003, hold: 0.025, r: 0.01, filter: { type: 'bandpass', f: 4400, q: 8 } });
};
const tick = (v: Voice) => noise(v, 0.035, { type: 'highpass', f: 3000, a: 0.001, hold: 0.002, r: 0.015 });
const clink = (v: Voice) => bell(v, rnd(2500, 3500), 0.03, 0.25);
const drip = (v: Voice) => tone(v, rnd(800, 1400), 0.025, { to: 1800, a: 0.002, hold: 0.005, r: 0.05 });
const beep = (v: Voice) => tone(v, 1975, 0.03, { type: 'square', hold: 0.06, r: 0.01, filter: { type: 'lowpass', f: 3000 } });

export const AMBIENCE_LAYERS: Record<string, (ctx: AudioContext, out: AudioNode) => Layer> = {
  // Casa: el tic-tac del reloj y el zumbido de la nevera.
  home: makeLayer({ bed: { type: 'lowpass', f: 140, gain: 0.05 }, events: [{ every: [1, 1], play: tick }] }),
  // Parque de día: pájaros y algo de brisa.
  park: makeLayer({ bed: { type: 'bandpass', f: 600, gain: 0.04, wobble: 0.6 }, events: [{ every: [0.4, 2.2], play: bird }] }),
  // Noche: grillos.
  night: makeLayer({ bed: { type: 'lowpass', f: 300, gain: 0.03 }, events: [{ every: [0.5, 1.3], play: cricket }] }),
  // Plaza de Alcorcón: la fuente y algún pájaro.
  plaza: makeLayer({ bed: { type: 'bandpass', f: 1100, q: 0.6, gain: 0.12, wobble: 0.15 }, events: [{ every: [1.5, 5], play: bird }] }),
  // Bar Casa Paco: murmullo, vasos y la tragaperras.
  bar: makeLayer({
    bed: { type: 'bandpass', f: 450, q: 0.8, gain: 0.16, wobble: 0.35 },
    events: [
      { every: [0.8, 3.5], play: clink },
      { every: [15, 40], play: (v) => [1046, 1318, 1568, 2093].forEach((f, i) => tone({ ...v, t: v.t + i * 0.07 }, f, 0.03, { type: 'square', hold: 0.03, r: 0.02, filter: { type: 'lowpass', f: 4000 } })) },
    ],
  }),
  // Metro: traqueteo y el «din-don» de las estaciones.
  metro: makeLayer({
    bed: { type: 'lowpass', f: 180, gain: 0.25, wobble: 0.3 },
    events: [
      { every: [0.45, 0.6], play: (v) => noise(v, 0.05, { type: 'lowpass', f: 300, a: 0.003, hold: 0.01, r: 0.08 }) },
      { every: [25, 45], play: (v) => { bell(v, 659, 0.06, 1); bell({ ...v, t: v.t + 0.45 }, 523, 0.06, 1.2); } },
    ],
  }),
  // Tiendas y el estudio: murmullo suave y la caja.
  shop: makeLayer({ bed: { type: 'bandpass', f: 700, gain: 0.06, wobble: 0.3 }, events: [{ every: [2, 6], play: beep }] }),
  // Lluvia: ruido ancho y gotas.
  rain: makeLayer({ bed: { type: 'lowpass', f: 2800, gain: 0.14 }, events: [{ every: [0.08, 0.4], play: drip }] }),
  // Nieve: viento.
  wind: makeLayer({ bed: { type: 'bandpass', f: 500, q: 1.5, gain: 0.1, wobble: 0.8 } }),
};
