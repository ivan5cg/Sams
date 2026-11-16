// Preferencias de este dispositivo (no de la partida): vibración, letra, contraste y movimiento.

export interface Prefs {
  vibrate: boolean;
  bigText: boolean;
  contrast: boolean;
  /** Reducir movimiento: sin parpadeos, partículas ni temblores. Por defecto, lo que diga el sistema. */
  reduceMotion: boolean;
}

const KEY = 'sams:prefs';

function systemReducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

let current: Prefs | null = null;

export function prefs(): Prefs {
  if (current) return current;
  let raw: Partial<Prefs> = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    /* sin almacenamiento */
  }
  current = {
    vibrate: raw.vibrate !== false,
    bigText: raw.bigText === true,
    contrast: raw.contrast === true,
    reduceMotion: typeof raw.reduceMotion === 'boolean' ? raw.reduceMotion : systemReducedMotion(),
  };
  return current;
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...prefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* sin almacenamiento */
  }
  applyPrefs();
}

/** Aplica las preferencias a la página (clases en <html>). */
export function applyPrefs() {
  const p = prefs();
  const root = document.documentElement;
  root.classList.toggle('big-text', p.bigText);
  root.classList.toggle('contrast', p.contrast);
  root.classList.toggle('reduce-motion', p.reduceMotion);
}

/** Vibración corta (si el móvil la tiene y el jugador no la ha quitado). */
export function vibrate(ms: number) {
  if (!prefs().vibrate) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* sin vibración */
  }
}
