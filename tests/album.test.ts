import { describe, expect, it } from 'vitest';
import { ALBUM_MAX, addPhoto, albumUsage, deletePhoto, groupPhotos, listPhotos, type Photo } from '../src/save/album';
import { World } from '../src/sim/world';
import type { SimEvent } from '../src/sim/world';

const photo = (i: number, family = 'Familia García', gen = 1, size = 1000): Photo => ({
  id: `f${i}`,
  at: i,
  family,
  gen,
  day: i,
  caption: `foto ${i}`,
  blob: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }),
  w: 10,
  h: 10,
});

describe('álbum de fotos', () => {
  // Aquí no hay IndexedDB: el álbum vive en memoria (igual que en un navegador que lo bloquee).
  it('se guardan, se agrupan por familia y generación, y se borran', async () => {
    for (const p of [photo(1), photo(2), photo(3, 'Familia García', 2), photo(4, 'Familia Pérez')]) expect(await addPhoto(p)).toBeUndefined();
    const all = await listPhotos();
    expect(all.map((p) => p.id)).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(groupPhotos(all).map((g) => [g.title, g.photos.length])).toEqual([
      ['Familia García · 1ª generación', 2],
      ['Familia García · 2ª generación', 1],
      ['Familia Pérez · 1ª generación', 1],
    ]);
    await deletePhoto('f2');
    expect((await albumUsage()).count).toBe(3);
  });

  it('tiene límite: con el álbum lleno, no se pierde ninguna foto, se avisa', async () => {
    for (const p of await listPhotos()) await deletePhoto(p.id);
    for (let i = 0; i < ALBUM_MAX; i++) expect(await addPhoto(photo(100 + i))).toBeUndefined();
    expect(await addPhoto(photo(999))).toMatch(/lleno/);
    expect((await albumUsage()).count).toBe(ALBUM_MAX);
    for (const p of await listPhotos()) await deletePhoto(p.id);
    // Y por tamaño: una foto enorme no cabe.
    expect(await addPhoto(photo(1, 'X', 1, 13 * 1024 * 1024))).toMatch(/sitio/);
  });

  it('los nacimientos y las bodas de la familia avisan para la foto', () => {
    const w = World.createNew();
    const moments: string[] = [];
    w.onEvent((e: SimEvent) => e.type === 'moment' && moments.push(e.text));
    w.household.expecting = { parents: ['a1', 'a2'], due: w.state.minutes + 30 };
    w.tick(60);
    expect(moments.some((t) => t.startsWith('¡Ha nacido'))).toBe(true);
  });
});
