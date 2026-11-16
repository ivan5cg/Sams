import { expect, test } from '@playwright/test';
import { openGame, watchErrors } from './helpers';

test('la PWA funciona sin conexión (con Phaser y el contenido en sus propios ficheros)', async ({ page, context }) => {
  await openGame(page);
  // La pantalla de carga se va al arrancar.
  await expect(page.locator('#loading')).toHaveCount(0);
  // Esperar a que el service worker controle la página y tenga todo en caché.
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active || !navigator.serviceWorker.controller) return false;
    const keys = await caches.keys();
    for (const k of keys) {
      const urls = (await (await caches.open(k)).keys()).map((r) => r.url);
      if (urls.some((u) => /phaser-.*\.js/.test(u)) && urls.some((u) => /contenido-.*\.js/.test(u))) return true;
    }
    return false;
  }, null, { timeout: 30_000 });

  await context.setOffline(true);
  const errors = watchErrors(page);
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { sams?: unknown }).sams);
  await expect(page.locator('#portraits .portrait')).toHaveCount(4);
  expect(errors).toEqual([]);
});
