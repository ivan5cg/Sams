import { expect, test } from '@playwright/test';
import { openGame, watchErrors } from './helpers';

test('culebrones: se ven en el salseo con sus pasos', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  const ok = await page.evaluate(() => !!(window as unknown as { sams: { world: { startArc(k: string): unknown } } }).sams.world.startArc('pelea'));
  expect(ok).toBe(true);
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="salseo"]').click();
  await expect(page.locator('#log')).toContainText('Guerra de vecinos');
  await expect(page.locator('#log .arc-step.now')).toContainText('Quejas por el ruido');
  await expect(page.locator('#log')).toContainText('Mediar');
  expect(errors).toEqual([]);
});
