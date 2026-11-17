import { expect, test } from '@playwright/test';
import { objectOnScreen, openGame, watchErrors } from './helpers';

test('agenda: hoy y mañana, y programar una orden desde el menú de acciones', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await page.locator('#speed [data-speed="0"]').click();

  // La agenda enseña hoy y mañana.
  await page.locator('#agenda-btn').click();
  await expect(page.locator('#agenda')).toContainText('Hoy, lunes 22 de marzo');
  await expect(page.locator('#agenda')).toContainText('Mañana, martes 23 de marzo');
  await expect(page.locator('#agenda')).toContainText('Nada especial');
  await page.locator('#agenda [data-close]').click();

  // Programar: tocar la nevera, ⏰, «Comer» y la hora.
  const fridge = await objectOnScreen(page, 'fridge');
  await page.mouse.click(fridge.x, fridge.y);
  await page.locator('#sheet [data-sched]').click();
  await expect(page.locator('#sheet .sheet-who')).toContainText('Elige qué programar');
  await page.locator('#sheet [data-action="eat"]').click();
  await page.locator('#sheet .sched-row input').fill('21:30');
  await page.locator('#sheet [data-schedgo]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#toasts')).toContainText('a las 21:30');

  // Aparece en la agenda y se puede quitar.
  await page.locator('#agenda-btn').click();
  const row = page.locator('#agenda .agenda-row.k-order');
  await expect(row).toContainText('21:30');
  await expect(row).toContainText('comer');
  await row.locator('[data-unschedule]').click();
  await expect(page.locator('#agenda .agenda-row.k-order')).toHaveCount(0);
  expect(errors).toEqual([]);
});
