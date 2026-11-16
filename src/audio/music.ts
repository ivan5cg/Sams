// Música procedural: cada tema es una progresión de acordes y unas reglas para tocar
// sobre ella (nunca suena exactamente igual). Tranquila de día y de noche, y temas
// especiales para fiestas, Navidad y la verbena o San Isidro (chotis). Fundido entre temas.

import { bell, noise, pluck, tone, type Voice } from './synth';

export interface Track {
  stop(): void;
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const FADE = 2.5;

interface Song {
  bpm: number;
  /** Acordes (notas MIDI), uno por compás de 8 corcheas. */
  chords: number[][];
  /** Escala para las melodías. */
  scale: number[];
  /** Lo que suena en la corchea `step` (0-7) del compás, sobre el acorde `chord`. */
  play: (v: Voice, step: number, chord: number[], scale: number[], eighth: number) => void;
}

function sequencer(song: Song) {
  return (ctx: AudioContext, out: AudioNode): Track => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + FADE);
    g.connect(out);
    const eighth = 60 / song.bpm / 2;
    let step = 0;
    let next = ctx.currentTime + 0.1;
    const timer = setInterval(() => {
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (next < now) next = now + 0.05;
      while (next < now + 0.3) {
        const bar = Math.floor(step / 8) % song.chords.length;
        try {
          song.play({ ctx, out: g, t: next, gain: 1 }, step % 8, song.chords[bar], song.scale, eighth);
        } catch {
          /* nada */
        }
        step++;
        next += eighth;
      }
    }, 100);
    return {
      stop() {
        clearInterval(timer);
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + FADE);
        setTimeout(() => g.disconnect(), FADE * 1000 + 200);
      },
    };
  };
}

const pad = (v: Voice, chord: number[], dur: number, peak: number, type: OscillatorType = 'triangle') => {
  for (const n of chord) tone(v, midi(n), peak, { type, a: dur * 0.25, hold: dur * 0.45, r: dur * 0.4, filter: { type: 'lowpass', f: 1400 } });
};

const C = [48, 52, 55], G = [43, 47, 50], Am = [45, 48, 52], F = [41, 45, 48], C7 = [48, 52, 55, 58];
const MAJOR_PENTA = [72, 74, 76, 79, 81, 84];
const MINOR_PENTA = [69, 72, 74, 76, 79, 81];
const C_MAJOR = [72, 74, 76, 77, 79, 81, 83, 84];
const F_MAJOR = [65, 67, 69, 70, 72, 74, 76, 77];

export const MUSIC_TRACKS: Record<string, (ctx: AudioContext, out: AudioNode) => Track> = {
  // De día: guitarra tranquila sobre I–V–vi–IV.
  day: sequencer({
    bpm: 84,
    chords: [C, G, Am, F],
    scale: MAJOR_PENTA,
    play(v, step, chord, scale, e) {
      if (step === 0) pad(v, chord, e * 8, 0.035);
      if (step === 0 || step === 4) tone(v, midi(chord[0] - 12), 0.08, { a: 0.01, hold: e * 2, r: e });
      if (step % 2 === 0) pluck(v, midi(chord[(step / 2) % chord.length] + 12), 0.05, 1.2);
      if (Math.random() < 0.3) pluck(v, midi(pick(scale)), 0.06, 1.4);
    },
  }),
  // De noche: más lenta, en menor y casi sin melodía.
  night: sequencer({
    bpm: 62,
    chords: [Am, F, C, G],
    scale: MINOR_PENTA,
    play(v, step, chord, scale, e) {
      if (step === 0) pad(v, chord, e * 8, 0.04, 'sine');
      if (step === 0) tone(v, midi(chord[0] - 12), 0.06, { a: 0.2, hold: e * 4, r: e * 3 });
      if (Math.random() < 0.14) bell(v, midi(pick(scale)), 0.025, 1.6);
    },
  }),
  // Fiesta en casa: bombo, platillos, bajo y acordes.
  party: sequencer({
    bpm: 118,
    chords: [Am, F, C, G],
    scale: MINOR_PENTA,
    play(v, step, chord, scale, e) {
      if (step % 2 === 0) tone(v, 110, 0.18, { to: 45, a: 0.002, hold: 0.02, r: 0.15 });
      if (step % 2 === 1) noise(v, 0.05, { type: 'highpass', f: 7000, a: 0.001, hold: 0.01, r: 0.04 });
      if (step === 2 || step === 6) noise(v, 0.07, { type: 'bandpass', f: 1800, q: 0.8, hold: 0.02, r: 0.1 });
      tone(v, midi(chord[0] - 12 + (step % 2 ? 12 : 0)), 0.07, { type: 'square', hold: e * 0.5, r: e * 0.3, filter: { type: 'lowpass', f: 700 } });
      if (step === 3 || step === 7) for (const n of chord) tone(v, midi(n + 12), 0.025, { type: 'sawtooth', hold: e * 0.4, r: e * 0.4, filter: { type: 'lowpass', f: 2200 } });
      if (Math.random() < 0.25) tone(v, midi(pick(scale)), 0.035, { type: 'square', hold: e * 0.6, r: e * 0.4, filter: { type: 'lowpass', f: 2500 } });
    },
  }),
  // Navidad: campanas, cascabeles y una melodía alegre.
  navidad: sequencer({
    bpm: 104,
    chords: [C, F, G, C],
    scale: C_MAJOR,
    play(v, step, chord, scale, e) {
      if (step === 0) pad(v, chord, e * 8, 0.03);
      noise(v, step % 2 ? 0.02 : 0.035, { type: 'highpass', f: 8000, a: 0.002, hold: 0.02, r: 0.06 });
      if (step % 2 === 0 || Math.random() < 0.3) bell(v, midi(step === 0 ? chord[0] + 24 : pick(scale)), 0.045, 0.8);
      if (step === 0 || step === 4) tone(v, midi(chord[0] - 12), 0.07, { hold: e * 2, r: e });
    },
  }),
  // Verbena y San Isidro: chotis de organillo (chuntá, chuntá).
  chotis: sequencer({
    bpm: 96,
    chords: [[41, 45, 48], C7, C7, [41, 45, 48], [46, 50, 53], [41, 45, 48], C7, [41, 45, 48]],
    scale: F_MAJOR,
    play(v, step, chord, scale, e) {
      if (step % 4 === 0) tone(v, midi(chord[0] - 12), 0.09, { type: 'triangle', hold: e * 0.6, r: e * 0.4 });
      if (step % 4 === 2) for (const n of chord) tone(v, midi(n + 12), 0.025, { type: 'square', hold: e * 0.4, r: e * 0.3, filter: { type: 'lowpass', f: 1800 } });
      if (step % 2 === 0 || Math.random() < 0.35) {
        const n = pick(scale.filter((x) => chord.some((c) => (x - c) % 12 === 0)).concat(pick(scale)));
        tone(v, midi(n), 0.04, { type: 'sawtooth', hold: e * 0.7, r: e * 0.3, filter: { type: 'lowpass', f: 2400 }, vibrato: { rate: 6, depth: 4 } });
      }
    },
  }),
};
