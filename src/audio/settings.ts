// Ajustes de sonido: son de este dispositivo, no de la partida (van a localStorage).

export interface AudioSettings {
  muted: boolean;
  sfx: number;
  ambient: number;
  music: number;
}

export const DEFAULT_AUDIO: AudioSettings = { muted: false, sfx: 0.8, ambient: 0.5, music: 0.35 };
const KEY = 'sams:audio';

const unit = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : def);

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AudioSettings> | null;
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_AUDIO };
    return {
      muted: raw.muted === true,
      sfx: unit(raw.sfx, DEFAULT_AUDIO.sfx),
      ambient: unit(raw.ambient, DEFAULT_AUDIO.ambient),
      music: unit(raw.music, DEFAULT_AUDIO.music),
    };
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

export function saveAudioSettings(s: AudioSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sin almacenamiento: se usan los de siempre */
  }
}
