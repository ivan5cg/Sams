import { describe, expect, it } from 'vitest';
import { ACTION_SOUNDS, PET_SOUND, TOAST_SOUNDS, ambienceFor, distanceGain, musicFor } from '../src/audio/cues';
import { SOUNDS } from '../src/audio/synth';
import { AMBIENCE_LAYERS } from '../src/audio/ambience';
import { MUSIC_TRACKS } from '../src/audio/music';
import { DEFAULT_AUDIO, loadAudioSettings } from '../src/audio/settings';
import { ACTIONS } from '../src/data/actions';
import { World } from '../src/sim/world';

describe('sonido: qué suena y cuándo', () => {
  it('cada acción, mascota y aviso apunta a un sonido que existe', () => {
    for (const [action, id] of Object.entries(ACTION_SOUNDS)) {
      expect(ACTIONS[action], action).toBeTruthy();
      expect(id === 'pet' || id! in SOUNDS, `${action} → ${id}`).toBe(true);
    }
    for (const id of [...Object.values(PET_SOUND), ...Object.values(TOAST_SOUNDS)]) expect(SOUNDS[id!], id).toBeTruthy();
  });

  it('el ambiente depende del sitio, la hora y el tiempo', () => {
    const w = World.createNew();
    expect(ambienceFor(w)).toEqual(['home']);
    w.state.minutes = 23 * 60;
    expect(ambienceFor(w)).toEqual(['home', 'night']);
    w.state.minutes = 12 * 60;
    w.state.events = [{ id: 'lluvia', until: w.state.minutes + 600 }];
    expect(ambienceFor(w)).toEqual(['home', 'rain']);
    w.state.events = [];
    w.activeAgent.lotId = 'P';
    expect(ambienceFor(w)).toEqual(['park']);
    w.activeAgent.lotId = 'BR';
    expect(ambienceFor(w)).toEqual(['bar']);
    w.activeAgent.lotId = 'MT';
    w.state.events = [{ id: 'lluvia', until: w.state.minutes + 600 }];
    expect(ambienceFor(w)).toEqual(['metro']);
    for (const k of ['home', 'night', 'park', 'plaza', 'bar', 'metro', 'shop', 'rain', 'wind']) expect(AMBIENCE_LAYERS[k], k).toBeTruthy();
  });

  it('la música: día, noche, fiesta, Navidad y chotis', () => {
    const w = World.createNew();
    expect(musicFor(w)).toBe('day');
    w.state.minutes = 22 * 60;
    expect(musicFor(w)).toBe('night');
    w.state.events = [{ id: 'navidad', until: w.state.minutes + 600 }];
    expect(musicFor(w)).toBe('navidad');
    w.state.events = [{ id: 'verbena', until: w.state.minutes + 600, lotId: 'P' }];
    w.activeAgent.lotId = 'P';
    expect(musicFor(w)).toBe('chotis');
    w.activeAgent.lotId = 'L0';
    w.state.party = { lotId: 'L0', host: 'a1', until: w.state.minutes + 100 };
    expect(musicFor(w)).toBe('party');
    for (const k of ['day', 'night', 'party', 'navidad', 'chotis']) expect(MUSIC_TRACKS[k], k).toBeTruthy();
  });

  it('más lejos de la cámara, más bajo', () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(5)).toBeGreaterThan(distanceGain(9));
    expect(distanceGain(15)).toBe(0);
  });

  it('sin almacenamiento, los ajustes por defecto', () => {
    expect(loadAudioSettings()).toEqual(DEFAULT_AUDIO);
  });
});
