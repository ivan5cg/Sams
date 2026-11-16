import { expect, test } from '@playwright/test';
import { openGame, watchErrors } from './helpers';

test('logros y retos: se ven en ☰ → 🏆 y se puede aceptar un reto', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="feats"]').click();
  await expect(page.locator('#feats')).toContainText('0 de 15 logros');
  await expect(page.locator('#feats')).toContainText('Musa de MC Kalimotxo');
  await page.locator('#feats [data-start="del_arte"]').click();
  await expect(page.locator('#feats')).toContainText('En marcha');
  await expect(page.locator('#toasts')).toContainText('Reto aceptado');
  expect(errors).toEqual([]);
});
