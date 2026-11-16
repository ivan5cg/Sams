import { expect, test } from '@playwright/test';
import { objectOnScreen, openGame, watchErrors } from './helpers';

test('humo: tutorial, nevera, mapa, parque y guardar, sin errores', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, { tutorial: true });

  // El tutorial guiado sale la primera vez y se puede saltar.
  await expect(page.locator('#guide')).toBeVisible();
  await page.locator('#guide [data-skip]').click();
  await expect(page.locator('#guide')).toBeHidden();

  // Pausa, para que nadie se mueva mientras tocamos.
  await page.locator('#speed [data-speed="0"]').click();

  // Tocar la nevera abre el menú de acciones, y elegir una acción la pone en la cola.
  const fridge = await objectOnScreen(page, 'fridge');
  await page.mouse.click(fridge.x, fridge.y);
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('#sheet .sheet-title')).toContainText('Nevera');
  await page.locator('#sheet button.act:not([disabled])').first().click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#queue .chip')).not.toHaveCount(0);

  // El mapa: ir al parque.
  await page.locator('#map-btn').click();
  await expect(page.locator('#map')).toBeVisible();
  await page.locator('#map .places [data-go="P"]').click();
  await expect(page.locator('#map')).toBeHidden();
  await page.locator('#speed [data-speed="3"]').click();
  await expect(page.locator('#family')).toContainText('Parque', { timeout: 30_000 });

  // El menú: guardar.
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="save"]').click();
  await expect(page.locator('#toasts')).toContainText('Partida guardada');

  expect(errors).toEqual([]);
});
