import { SAVE_VERSION } from '../sim/world';
import type { WorldState } from '../sim/types';

export function serialize(state: WorldState): string {
  return JSON.stringify(state);
}

/**
 * Convierte una partida guardada de cualquier versión anterior a la actual.
 * Cada vez que cambie el formato: subir SAVE_VERSION y añadir un paso aquí.
 */
export function migrate(data: unknown): WorldState {
  const d = data as Partial<WorldState> | null;
  if (!d || typeof d !== 'object' || typeof d.version !== 'number' || !Array.isArray(d.agents) || !Array.isArray(d.households)) {
    throw new Error('El archivo no es una partida de Sams');
  }
  if (d.version > SAVE_VERSION) {
    throw new Error('Esta partida es de una versión más nueva del juego');
  }
  // (sin migraciones todavía: versión 1)
  return d as WorldState;
}
