import { expect, test } from '@playwright/test';
import { openGame, tileOnScreen, watchErrors } from './helpers';

type W = {
  household: { funds: number };
  canPlace(def: string, x: number, y: number): { ok: boolean };
  layoutOf(l: string): { w: number; h: number };
  viewLotId: string;
};
const world = (page: import('@playwright/test').Page) => page.evaluateHandle(() => (window as unknown as { sams: { world: W } }).sams.world);

test('perfil, construir un mueble, diario y salseo, sin errores', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await page.locator('#speed [data-speed="0"]').click();

  // Perfil
  await page.locator('#profile-btn').click();
  await expect(page.locator('#profile')).toBeVisible();
  await expect(page.locator('#profile')).toContainText('Relaciones');
  await expect(page.locator('#profile')).toContainText('Mateo');
  await page.locator('#profile [data-close]').click();
  await expect(page.locator('#profile')).toBeHidden();

  // Construir: elegir el primer mueble que se pueda pagar y colocarlo en una casilla libre.
  await page.locator('#build-btn').click();
  await expect(page.locator('#build')).toBeVisible();
  const item = page.locator('#build-items .item:not([disabled])').first();
  const def = await item.getAttribute('data-item');
  await item.click();
  await expect(page.locator('#placebar')).toBeVisible();
  const before = await (await world(page)).evaluate((w) => w.household.funds);
  const spot = await (await world(page)).evaluate((w, d) => {
    const lay = w.layoutOf(w.viewLotId);
    for (let y = 1; y < lay.h - 1; y++) for (let x = 1; x < lay.w - 1; x++) if (w.canPlace(d!, x, y).ok) return { x, y };
    return null;
  }, def);
  expect(spot).not.toBeNull();
  const p = await tileOnScreen(page, spot!.x, spot!.y);
  await page.mouse.click(p.x, p.y);
  await page.locator('#placebar [data-place]').click();
  await expect.poll(async () => (await world(page)).evaluate((w) => w.household.funds)).toBeLessThan(before);
  await page.locator('#build-exit').click();
  await expect(page.locator('#build')).toBeHidden();

  // Diario y salseo desde el menú
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="log"]').click();
  await expect(page.locator('#log')).toContainText('Diario');
  await page.locator('#log [data-close]').click();
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="salseo"]').click();
  await expect(page.locator('#log')).toContainText('Salseo');
  await page.locator('#log [data-close]').click();

  expect(errors).toEqual([]);
});
