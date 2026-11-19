// Sonidos generados por código con Web Audio (no hay ficheros: nada que descargar ni licencias).
// Cada receta programa sus nodos a partir del instante `t` y se conecta a `out`.

import type { SoundId } from './cues';

export interface Voice {
  ctx: AudioContext;
  out: AudioNode;
  t: number;
  /** Volumen de esta reproducción (distancia, variación...). */
  gain: number;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Dos segundos de ruido blanco (se reutilizan). */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** Envolvente: sube en `a`, se mantiene `hold` y se apaga en `r` (segundos). */
export function envelope(g: GainNode, t: number, peak: number, a: number, hold: number, r: number) {
  const p = Math.max(peak, 0.0002);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(p, t + Math.max(a, 0.002));
  g.gain.setValueAtTime(p, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
}

interface ToneOpts {
  type?: OscillatorType;
  to?: number;
  a?: number;
  hold?: number;
  r?: number;
  filter?: { type: BiquadFilterType; f: number; q?: number };
  vibrato?: { rate: number; depth: number };
}

/** Un tono con envolvente (y glissando, filtro o vibrato opcionales). */
export function tone(v: Voice, f: number, peak: number, o: ToneOpts = {}) {
  const { ctx, t } = v;
  const a = o.a ?? 0.005, hold = o.hold ?? 0.05, r = o.r ?? 0.12;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + a + hold + r * 0.6);
  let lfo: OscillatorNode | undefined;
  let depth: GainNode | undefined;
  if (o.vibrato) {
    lfo = ctx.createOscillator();
    depth = ctx.createGain();
    lfo.frequency.value = o.vibrato.rate;
    depth.gain.value = o.vibrato.depth;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + a + hold + r + 0.05);
  }
  const g = ctx.createGain();
  envelope(g, t, peak * v.gain, a, hold, r);
  let node: AudioNode = osc;
  let fl: BiquadFilterNode | undefined;
  if (o.filter) {
    fl = ctx.createBiquadFilter();
    fl.type = o.filter.type;
    fl.frequency.value = o.filter.f;
    fl.Q.value = o.filter.q ?? 1;
    node = node.connect(fl);
  }
  node.connect(g).connect(v.out);
  osc.onended = () => {
    g.disconnect();
    fl?.disconnect();
    depth?.disconnect();
    osc.disconnect();
    lfo?.disconnect();
  };
  osc.start(t);
  osc.stop(t + a + hold + r + 0.05);
}

interface NoiseOpts {
  type?: BiquadFilterType;
  f?: number;
  to?: number;
  q?: number;
  a?: number;
  hold?: number;
  r?: number;
}

/** Ruido filtrado con envolvente (agua, golpes, crujidos, viento...). */
export function noise(v: Voice, peak: number, o: NoiseOpts = {}) {
  const { ctx, t } = v;
  const a = o.a ?? 0.005, hold = o.hold ?? 0.03, r = o.r ?? 0.1;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = o.type ?? 'bandpass';
  fl.frequency.setValueAtTime(o.f ?? 1000, t);
  if (o.to) fl.frequency.exponentialRampToValueAtTime(o.to, t + a + hold + r);
  fl.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  envelope(g, t, peak * v.gain, a, hold, r);
  src.connect(fl).connect(g).connect(v.out);
  src.onended = () => {
    g.disconnect();
    fl.disconnect();
    src.disconnect();
  };
  const off = Math.random() * 1.5;
  src.start(t, off);
  src.stop(t + a + hold + r + 0.05);
}

const pluckCache = new Map<string, AudioBuffer>();

/** Cuerda pulsada (Karplus-Strong): guitarra, arpa, pizzicato. */
export function pluck(v: Voice, f: number, peak: number, dur = 1.2) {
  const { ctx, t } = v;
  const key = `${ctx.sampleRate}:${Math.round(f)}:${dur}`;
  let buf = pluckCache.get(key);
  if (!buf) {
    const n = Math.floor(ctx.sampleRate * dur);
    buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const period = Math.max(2, Math.round(ctx.sampleRate / f));
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const j = i % period;
      const val = ring[j];
      ring[j] = 0.996 * 0.5 * (val + prev);
      prev = val;
      d[i] = val;
    }
    if (pluckCache.size >= 80) {
      const oldest = pluckCache.keys().next().value;
      if (oldest !== undefined) pluckCache.delete(oldest);
    }
    pluckCache.set(key, buf);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = peak * v.gain;
  src.connect(g).connect(v.out);
  src.onended = () => {
    g.disconnect();
    src.disconnect();
  };
  src.start(t);
}

/** Campana: varios parciales sinusoidales que se apagan. */
export function bell(v: Voice, f: number, peak: number, r = 0.9) {
  for (const [ratio, amp] of [[1, 1], [2.01, 0.45], [3.02, 0.25], [4.2, 0.12]] as const) tone(v, f * ratio, peak * amp, { a: 0.003, hold: 0, r: r / ratio });
}

const at = (v: Voice, dt: number, gain = 1): Voice => ({ ...v, t: v.t + dt, gain: v.gain * gain });
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Las recetas de cada sonido. */
export const SOUNDS: Record<SoundId, (v: Voice) => void> = {
  tap: (v) => tone(v, 880, 0.12, { a: 0.002, hold: 0.01, r: 0.04 }),
  open: (v) => {
    tone(v, 660, 0.1, { hold: 0.02, r: 0.06 });
    tone(at(v, 0.05), 990, 0.1, { hold: 0.02, r: 0.08 });
  },
  close: (v) => {
    tone(v, 880, 0.08, { hold: 0.02, r: 0.05 });
    tone(at(v, 0.05), 587, 0.08, { hold: 0.02, r: 0.07 });
  },
  buy: (v) => {
    noise(v, 0.25, { type: 'highpass', f: 3000, r: 0.05 });
    bell(at(v, 0.04), 1318, 0.18, 0.6);
    bell(at(v, 0.1), 1760, 0.2, 0.8);
  },
  sell: (v) => {
    for (const [i, f] of [1568, 1318, 1046].entries()) tone(at(v, i * 0.07), f, 0.14, { type: 'triangle', hold: 0.02, r: 0.12 });
  },
  error: (v) => {
    tone(v, 196, 0.12, { type: 'square', to: 146, hold: 0.08, r: 0.08, filter: { type: 'lowpass', f: 900 } });
  },
  coins: (v) => {
    for (const [i, f] of [1568, 2093, 2637].entries()) tone(at(v, i * 0.06), f, 0.16, { type: 'triangle', hold: 0.01, r: 0.18 });
  },
  wish: (v) => {
    for (const [i, n] of [72, 76, 79, 84].entries()) bell(at(v, i * 0.07), midi(n), 0.12, 0.7);
  },
  fanfare: (v) => {
    const notes = [60, 64, 67, 72];
    for (const [i, n] of notes.entries()) tone(at(v, i * 0.11), midi(n), 0.13, { type: 'sawtooth', hold: i === 3 ? 0.35 : 0.06, r: 0.2, filter: { type: 'lowpass', f: 2200 } });
    tone(at(v, 0.33), midi(48), 0.12, { type: 'triangle', hold: 0.35, r: 0.3 });
  },
  bills: (v) => {
    noise(v, 0.12, { type: 'bandpass', f: 2500, q: 0.6, hold: 0.08, r: 0.1 });
    tone(at(v, 0.12), 392, 0.13, { type: 'triangle', to: 370, hold: 0.15, r: 0.1 });
    tone(at(v, 0.42), 349, 0.13, { type: 'triangle', to: 311, hold: 0.25, r: 0.3, vibrato: { rate: 6, depth: 6 } });
  },
  lottery: (v) => {
    for (const [i, n] of [79, 84, 88, 91, 96].entries()) bell(at(v, i * 0.09), midi(n), 0.12, 1.1);
    noise(at(v, 0.45), 0.08, { type: 'highpass', f: 6000, hold: 0.4, r: 0.4 });
  },
  baby: (v) => {
    for (let i = 0; i < 2; i++) tone(at(v, i * 0.55), rnd(480, 540), 0.12, { type: 'sawtooth', to: 380, a: 0.05, hold: 0.3, r: 0.12, filter: { type: 'bandpass', f: 1200, q: 2 }, vibrato: { rate: 9, depth: 25 } });
  },
  alarm: (v) => {
    for (let i = 0; i < 3; i++) tone(at(v, i * 0.16), 1046, 0.08, { type: 'square', hold: 0.06, r: 0.02, filter: { type: 'lowpass', f: 3000 } });
  },
  fireworks: (v) => {
    tone(v, 300, 0.05, { to: 1400, a: 0.02, hold: 0.25, r: 0.05 });
    noise(at(v, 0.35), 0.35, { type: 'lowpass', f: 1800, to: 300, hold: 0.02, r: 0.6 });
    for (let i = 0; i < 8; i++) noise(at(v, 0.5 + Math.random() * 0.5, 0.4), 0.2, { type: 'highpass', f: 4000, r: 0.03 });
  },
  fart: (v) => {
    // Imprescindible. Grave, con temblor y un poco distinto cada vez.
    const dur = rnd(0.3, 0.75);
    const f = rnd(70, 105);
    tone(v, f, 0.3, { type: 'sawtooth', to: f * rnd(0.55, 0.8), a: 0.02, hold: dur, r: 0.08, filter: { type: 'lowpass', f: rnd(380, 600), q: 4 }, vibrato: { rate: rnd(18, 30), depth: f * 0.25 } });
    noise(v, 0.08, { type: 'lowpass', f: 400, a: 0.02, hold: dur, r: 0.1 });
  },
  bark: (v) => {
    for (let i = 0; i < 2; i++) {
      const w = at(v, i * 0.22);
      tone(w, rnd(420, 480), 0.18, { type: 'square', to: 260, a: 0.004, hold: 0.04, r: 0.06, filter: { type: 'bandpass', f: 900, q: 1.5 } });
      noise(w, 0.12, { type: 'bandpass', f: 1300, q: 1, hold: 0.04, r: 0.05 });
    }
  },
  meow: (v) => {
    tone(v, 520, 0.12, { type: 'sawtooth', to: 820, a: 0.06, hold: 0.12, r: 0.2, filter: { type: 'bandpass', f: 1400, q: 3 } });
    tone(at(v, 0.22), 800, 0.08, { type: 'sawtooth', to: 560, hold: 0.05, r: 0.18, filter: { type: 'bandpass', f: 1200, q: 3 } });
  },
  squeak: (v) => {
    for (let i = 0; i < 3; i++) tone(at(v, i * 0.14), rnd(1800, 2200), 0.07, { to: 2600, a: 0.01, hold: 0.05, r: 0.03 });
  },
  dook: (v) => {
    for (let i = 0; i < 3; i++) tone(at(v, i * 0.11), 330, 0.12, { type: 'triangle', to: 260, a: 0.004, hold: 0.03, r: 0.04 });
  },
  capybara: (v) => {
    noise(v, 0.06, { type: 'lowpass', f: 500, a: 0.05, hold: 0.15, r: 0.2 });
    tone(at(v, 0.1), 300, 0.06, { to: 380, a: 0.04, hold: 0.1, r: 0.15 });
  },
  step: (v) => noise(v, 0.05, { type: 'lowpass', f: rnd(500, 800), a: 0.002, hold: 0.01, r: 0.04 }),
  door: (v) => {
    noise(v, 0.08, { type: 'bandpass', f: 1800, q: 2, hold: 0.02, r: 0.05 });
    tone(at(v, 0.05), 90, 0.25, { to: 60, a: 0.003, hold: 0.02, r: 0.12 });
  },
  fridge: (v) => {
    noise(v, 0.08, { type: 'lowpass', f: 1200, a: 0.01, hold: 0.02, r: 0.08 });
    tone(at(v, 0.08), 110, 0.05, { type: 'sawtooth', hold: 0.5, r: 0.2, filter: { type: 'lowpass', f: 300 } });
  },
  sizzle: (v) => {
    noise(v, 0.14, { type: 'highpass', f: 3500, a: 0.1, hold: 1.2, r: 0.5 });
    for (let i = 0; i < 10; i++) noise(at(v, Math.random() * 1.5, 0.6), 0.12, { type: 'highpass', f: 5000, r: 0.02 });
  },
  shower: (v) => noise(v, 0.12, { type: 'bandpass', f: 2600, q: 0.5, a: 0.2, hold: 1.4, r: 0.6 }),
  splash: (v) => {
    noise(v, 0.2, { type: 'lowpass', f: 2500, to: 500, a: 0.01, hold: 0.05, r: 0.35 });
    tone(at(v, 0.05), 600, 0.05, { to: 1200, hold: 0.02, r: 0.08 });
  },
  flush: (v) => noise(v, 0.18, { type: 'bandpass', f: 600, to: 2400, q: 1.5, a: 0.1, hold: 0.7, r: 0.6 }),
  tv: (v) => {
    for (let i = 0; i < 6; i++) tone(at(v, i * 0.13), rnd(180, 320), 0.05, { type: 'sawtooth', hold: 0.07, r: 0.04, filter: { type: 'bandpass', f: 1000, q: 4 } });
  },
  guitar: (v) => {
    const chord = [52, 59, 64, 67, 71, 76].map(midi);
    for (const [i, f] of chord.entries()) pluck(at(v, i * 0.025), f, 0.12, 1.6);
  },
  accordion: (v) => {
    for (const [i, n] of [65, 69, 72, 69].entries()) tone(at(v, i * 0.2), midi(n), 0.06, { type: 'sawtooth', hold: 0.14, r: 0.05, filter: { type: 'lowpass', f: 1600 }, vibrato: { rate: 5, depth: 3 } });
  },
  yawn: (v) => tone(v, 300, 0.07, { type: 'sawtooth', to: 160, a: 0.2, hold: 0.4, r: 0.4, filter: { type: 'lowpass', f: 700, q: 2 } }),
  munch: (v) => {
    for (let i = 0; i < 4; i++) noise(at(v, i * 0.13 + Math.random() * 0.04), 0.1, { type: 'bandpass', f: rnd(1500, 3000), q: 2, r: 0.04 });
  },
  thud: (v) => {
    tone(v, 120, 0.3, { to: 45, a: 0.003, hold: 0.03, r: 0.25 });
    noise(v, 0.1, { type: 'lowpass', f: 400, r: 0.15 });
  },
  kiss: (v) => noise(v, 0.12, { type: 'bandpass', f: 2800, q: 3, a: 0.003, hold: 0.01, r: 0.05 }),
  cheer: (v) => {
    for (let i = 0; i < 5; i++) tone(at(v, Math.random() * 0.3), rnd(300, 600), 0.03, { type: 'sawtooth', to: rnd(500, 900), a: 0.05, hold: 0.2, r: 0.2, filter: { type: 'bandpass', f: 1500, q: 1 } });
    noise(v, 0.06, { type: 'bandpass', f: 1500, a: 0.1, hold: 0.3, r: 0.3 });
  },
  slot: (v) => {
    for (let i = 0; i < 6; i++) tone(at(v, i * 0.06), [1046, 1318, 1568][i % 3], 0.07, { type: 'square', hold: 0.02, r: 0.03, filter: { type: 'lowpass', f: 4000 } });
  },
  pop: (v) => {
    tone(v, 400, 0.15, { to: 900, a: 0.002, hold: 0.01, r: 0.05 });
    noise(at(v, 0.05), 0.05, { type: 'highpass', f: 5000, hold: 0.2, r: 0.3 });
  },
  chime: (v) => {
    bell(v, midi(76), 0.12, 1.2);
    bell(at(v, 0.4), midi(72), 0.12, 1.4);
  },
};

/** Renderiza cada sonido sin altavoces y devuelve su pico (para comprobar que todos suenan). */
export async function measureSounds(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(SOUNDS) as SoundId[]) {
    const ctx = new OfflineAudioContext(1, 44100 * 2.5, 44100);
    SOUNDS[id]({ ctx: ctx as unknown as AudioContext, out: ctx.destination, t: 0.01, gain: 1 });
    const buf = await ctx.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    out[id] = peak;
  }
  return out;
}
