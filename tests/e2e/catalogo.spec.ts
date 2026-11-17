import { expect, test } from '@playwright/test';
import { openGame, tileOnScreen, watchErrors } from './helpers';

test('catálogo: buscar, ver para qué sirve, comprar y colocar', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await page.evaluate(() => ((window as unknown as { sams: { world: { household: { funds: number } } } }).sams.world.household.funds = 5000));
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="catalog"]').click();
  const cat = page.locator('#catalog');
  await expect(cat).toBeVisible();
  // Los dibujos se cargan.
  await expect(cat.locator('.cat-thumb.ready').first()).toBeVisible();
  // Buscar: «peces» encuentra el acuario, con lo que sube.
  await cat.locator('[data-c="q"]').fill('peces');
  await expect(cat.locator('.cat-item')).toHaveCount(1);
  await expect(cat.locator('.cat-item')).toContainText('Acuario');
  await expect(cat.locator('.cat-item')).toContainText('Diversión');
  // Comprar y colocar.
  await cat.locator('[data-buy="aquarium"]').click();
  await expect(cat).toBeHidden();
  await expect(page.locator('#placebar')).toContainText('Acuario');
  const before = await page.evaluate(() => (window as unknown as { sams: { world: { objectsIn(l: string): { def: string }[] } } }).sams.world.objectsIn('L0').filter((o) => o.def === 'aquarium').length);
  const spot = await page.evaluate(() => {
    const w = (window as unknown as { sams: { world: { canPlace(d: string, x: number, y: number): { ok: boolean }; layoutOf(l: string): { w: number; h: number } } } }).sams.world;
    const lay = w.layoutOf('L0');
    for (let y = 1; y < lay.h; y++) for (let x = 1; x < lay.w; x++) if (w.canPlace('aquarium', x, y).ok) return { x, y };
    return null;
  });
  expect(spot).toBeTruthy();
  const p = await tileOnScreen(page, spot!.x, spot!.y);
  await page.mouse.click(p.x, p.y);
  await page.locator('#placebar [data-place]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sams: { world: { objectsIn(l: string): { def: string }[] } } }).sams.world.objectsIn('L0').filter((o) => o.def === 'aquarium').length)).toBe(before + 1);
  // «Solo lo que podemos pagar» quita lo caro.
  await page.locator('#build-catalog').click();
  await page.evaluate(() => ((window as unknown as { sams: { world: { household: { funds: number } } } }).sams.world.household.funds = 100));
  await cat.locator('[data-c="q"]').fill('');
  await cat.locator('[data-c="afford"]').check();
  await expect(cat.locator('[data-buy="hot_tub"]')).toHaveCount(0);
  await expect(cat.locator('[data-buy="plant"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
