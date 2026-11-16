// Álbum de fotos: las capturas se guardan en su propia base de IndexedDB (aparte de la partida,
// para no engordar el guardado ni depender de su versión). Con límite de fotos y de tamaño.
// Si el navegador no deja usar IndexedDB, el álbum vive en memoria mientras dure la sesión.

export interface Photo {
  id: string;
  /** Cuándo se hizo (fecha real). */
  at: number;
  /** «Familia García». */
  family: string;
  /** Generación de la familia cuando se hizo. */
  gen: number;
  /** Día del juego. */
  day: number;
  caption: string;
  blob: Blob;
  w: number;
  h: number;
}

export const ALBUM_MAX = 60;
export const ALBUM_MAX_BYTES = 12 * 1024 * 1024;

const DB = 'sams-album';
const STORE = 'photos';
let memory: Photo[] | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Todas las fotos, de la más antigua a la más nueva. */
export async function listPhotos(): Promise<Photo[]> {
  if (memory) return [...memory];
  try {
    const all = await run('readonly', (s) => s.getAll() as IDBRequest<Photo[]>);
    return all.sort((a, b) => a.at - b.at);
  } catch {
    memory = [];
    return [];
  }
}

export async function albumUsage(): Promise<{ count: number; bytes: number }> {
  const all = await listPhotos();
  return { count: all.length, bytes: all.reduce((n, p) => n + p.blob.size, 0) };
}

/** Por qué no cabe una foto más (o nada si cabe). */
export async function albumFullReason(extraBytes = 0): Promise<string | undefined> {
  const u = await albumUsage();
  if (u.count >= ALBUM_MAX) return `El álbum está lleno (${ALBUM_MAX} fotos): borra alguna`;
  if (u.bytes + extraBytes > ALBUM_MAX_BYTES) return 'El álbum ya no tiene sitio: borra alguna foto';
  return undefined;
}

/** Guarda una foto. Devuelve el motivo si no cabe. */
export async function addPhoto(p: Photo): Promise<string | undefined> {
  const full = await albumFullReason(p.blob.size);
  if (full) return full;
  if (memory) {
    memory.push(p);
    return undefined;
  }
  try {
    await run('readwrite', (s) => s.put(p));
  } catch {
    memory = [...(await listPhotos()), p];
  }
  return undefined;
}

export async function deletePhoto(id: string): Promise<void> {
  if (memory) {
    memory = memory.filter((p) => p.id !== id);
    return;
  }
  try {
    await run('readwrite', (s) => s.delete(id));
  } catch {
    /* nada que borrar */
  }
}

/** Agrupa las fotos por familia y generación («Familia García · 2ª generación»), en orden. */
export function groupPhotos(photos: Photo[]): { title: string; photos: Photo[] }[] {
  const groups = new Map<string, Photo[]>();
  for (const p of photos) {
    const key = `${p.family} · ${p.gen}ª generación`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].map(([title, ps]) => ({ title, photos: ps }));
}

/** Un blob en «data:» (para meterlo en el álbum exportado). */
export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** El álbum entero como una página HTML que se abre sola (sin internet ni el juego). */
export async function albumHtml(photos: Photo[]): Promise<string> {
  const parts: string[] = [];
  for (const g of groupPhotos(photos)) {
    parts.push(`<h2>${escHtml(g.title)}</h2><div class="grid">`);
    for (const p of g.photos) {
      parts.push(`<figure><img src="${await blobToDataUrl(p.blob)}" alt="${escHtml(p.caption)}" /><figcaption>${escHtml(p.caption)} · día ${p.day}</figcaption></figure>`);
    }
    parts.push('</div>');
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Álbum de Sams</title>
<style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;background:#1d2233;color:#f3f4f8}h1{margin:0 0 8px}h2{margin:24px 0 8px;font-size:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}figure{margin:0;background:#23273a;border-radius:12px;overflow:hidden}
img{width:100%;display:block}figcaption{padding:8px 10px;font-size:14px;color:#c9ccd8}</style></head>
<body><h1>📸 Álbum de Sams</h1>${parts.join('')}</body></html>`;
}
