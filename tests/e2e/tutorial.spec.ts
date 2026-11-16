import { expect, test } from '@playwright/test';
import { objectOnScreen, openGame, tileOnScreen, watchErrors } from './helpers';

type W = {
  state: { speed: number };
  household: { funds: number };
  canPlace(def: string, x: number, y: number): { ok: boolean };
  layoutOf(l: string): { w: number; h: number };
  viewLotId: string;
};
const speed = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { sams: { world: W } }).sams.world.state.speed);

test('tutorial guiado: los 6 pasos, haciendo', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await openGame(page, { tutorial: true });
  const guide = page.locator('#guide');

  // 1. Tocar la nevera (con el tiempo parado).
  await expect(guide).toContainText('Toca la nevera');
  expect(await speed(page)).toBe(0);
  const fridge = await objectOnScreen(page, 'fridge');
  await page.mouse.click(fridge.x, fridge.y);

  // 2. Comer algo (el tiempo vuelve a correr).
  await expect(guide).toContainText('coma algo');
  expect(await speed(page)).toBeGreaterThan(0);
  await page.locator('#sheet .guide-glow:not([disabled])').first().click();

  // 3. Cambiar a la mascota.
  await expect(guide).toContainText('Ahora,');
  await page.locator('#portraits .guide-glow').click();

  // 4. Buscar trabajo: primero, volver a una persona.
  await expect(guide).toContainText('Vuelve a una persona');
  await page.locator('#portraits .guide-glow').first().click();
  await page.locator('#speed [data-speed="0"]').click();
  const pc = await objectOnScreen(page, 'computer');
  await page.mouse.click(pc.x, pc.y);
  await page.locator('#sheet [data-action="find_job"]').click();
  await page.locator('#sheet [data-career]:not([disabled])').first().click();
  await expect(guide).toContainText('mirar ofertas');
  await page.locator('#speed [data-speed="3"]').click();

  // 5. Comprar un mueble.
  await expect(guide).toContainText('Decora la casa', { timeout: 60_000 });
  await page.locator('#speed [data-speed="0"]').click();
  await page.locator('#build-btn.guide-glow').click();
  const item = page.locator('#build-items .item:not([disabled])').first();
  const def = await item.getAttribute('data-item');
  await item.click();
  const spot = await page.evaluate((d) => {
    const w = (window as unknown as { sams: { world: W } }).sams.world;
    const lay = w.layoutOf(w.viewLotId);
    for (let y = 1; y < lay.h - 1; y++) for (let x = 1; x < lay.w - 1; x++) if (w.canPlace(d!, x, y).ok) return { x, y };
    return null;
  }, def);
  const p = await tileOnScreen(page, spot!.x, spot!.y);
  await page.mouse.click(p.x, p.y);
  await page.locator('#placebar [data-place]').click();

  // 6. Salir de la obra e ir al parque.
  await expect(guide).toContainText('Sal al barrio');
  await page.locator('#build-exit.guide-glow').click();
  await page.locator('#map-btn.guide-glow').click();
  await page.locator('#map .places .guide-glow').click();

  await expect(page.locator('#toasts')).toContainText('Ya sabes lo básico');
  await expect(guide).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('sams:tutorial2'))).toBe('done');
  expect(errors).toEqual([]);
});

test('el tutorial guiado se recuerda: al recargar sigue en el mismo paso', async ({ page }) => {
  await openGame(page, { tutorial: true });
  const fridge = await objectOnScreen(page, 'fridge');
  await page.mouse.click(fridge.x, fridge.y);
  await expect(page.locator('#guide')).toContainText('coma algo');
  await page.reload();
  await expect(page.locator('#guide')).toContainText('coma algo');
});
