// Guardado local: IndexedDB como almacén principal y una copia síncrona en
// localStorage para el cierre de la página (IndexedDB puede no terminar a tiempo).
// Al cargar se usa la copia más reciente de las dos.

import type { WorldState } from '../sim/types';
import { migrate, serialize } from './serialize';

const DB = 'sams';
const STORE = 'saves';
const SLOT = 'main';
const LS_KEY = `${DB}:${SLOT}`;

interface Saved {
  savedAt: number;
  json: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function pack(state: WorldState): Saved {
  return { savedAt: Date.now(), json: serialize(state) };
}

/** Copia síncrona (para `pagehide`). */
export function saveGameSync(state: WorldState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(pack(state)));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

export async function saveGame(state: WorldState): Promise<void> {
  const data = pack(state);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, SLOT);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    saveGameSync(state);
  }
}

async function readIdb(): Promise<Saved | null> {
  try {
    const db = await openDb();
    const v = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(SLOT);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return (v as Saved) ?? null;
  } catch {
    return null;
  }
}

function readLs(): Saved | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export async function loadGame(): Promise<WorldState | null> {
  const candidates = [await readIdb(), readLs()]
    .filter((s): s is Saved => !!s && typeof s.json === 'string')
    .sort((a, b) => b.savedAt - a.savedAt);
  for (const c of candidates) {
    try {
      return migrate(JSON.parse(c.json));
    } catch {
      /* probar la siguiente copia */
    }
  }
  return null;
}

export async function deleteGame(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(SLOT);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* nada */
  }
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* nada */
  }
}
