import { expect, test } from '@playwright/test';
import { openGame, watchErrors } from './helpers';

test('álbum: hacer una foto, verla, que se quede al recargar, exportar y borrar', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    // Álbum vacío en cada prueba (la base del álbum va aparte de la partida).
    if (!sessionStorage.getItem('sams:e2e-album')) {
      sessionStorage.setItem('sams:e2e-album', '1');
      indexedDB.deleteDatabase('sams-album');
    }
  });
  await openGame(page);
  page.on('dialog', (d) => d.accept());

  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="photo"]').click();
  await expect(page.locator('.toast').filter({ hasText: 'Foto guardada' })).toBeVisible();

  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="album"]').click();
  const album = page.locator('#album');
  await expect(album).toContainText('1 de 60 fotos');
  await expect(album).toContainText('Familia García · 1ª generación');
  // La miniatura es una imagen de verdad.
  const size = await album.locator('.album-thumb img').first().evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });
  expect(size[0]).toBeGreaterThan(100);
  expect(size[1]).toBeGreaterThan(size[0]);

  // Otra desde el propio álbum.
  await album.locator('[data-al="snap"]').click();
  await expect(album).toContainText('2 de 60 fotos');

  // Al recargar, siguen ahí.
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { sams?: object }).sams);
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="album"]').click();
  await expect(album).toContainText('2 de 60 fotos');

  // Exportar: una página HTML con las fotos dentro.
  const [download] = await Promise.all([page.waitForEvent('download'), album.locator('[data-al="export"]').click()]);
  expect(download.suggestedFilename()).toBe('album-sams.html');
  const chunks: Uint8Array[] = await (await download.createReadStream()).toArray();
  const dec = new TextDecoder();
  const html = chunks.map((c) => dec.decode(c, { stream: true })).join('') + dec.decode();
  expect(html.match(/<img src="data:image\/jpeg;base64,/g)?.length).toBe(2);

  // Verla en grande y borrarla.
  await album.locator('.album-thumb').first().click();
  await expect(album.locator('.album-big')).toBeVisible();
  await album.locator('[data-al="delete"]').click();
  await expect(album).toContainText('1 de 60 fotos');
  await album.locator('[data-close]').click();
  await expect(album).toBeHidden();
  expect(errors).toEqual([]);
});
