import { expect, test } from '@playwright/test';
import { openGame, watchErrors } from './helpers';

const toast = (page: import('@playwright/test').Page, text: string, icon: string, agentId?: string) =>
  page.evaluate(([t, i, a]) => (window as unknown as { sams: { world: { toast(t: string, i: string, a?: string): void } } }).sams.world.toast(t, i, a || undefined), [text, icon, agentId ?? ''] as const);

test('avisos: lo del barrio va a la bandeja, lo urgente se queda y lleva a quien toca', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await page.locator('#speed [data-speed="0"]').click();

  // Barrio: no sale como aviso, sube el contador de la bandeja.
  await toast(page, 'La Familia Ruiz se muda al barrio', '🚚');
  await toast(page, 'Empieza el día 2', '🌅');
  await toast(page, 'Empieza el día 3', '🌅');
  await expect(page.locator('#toasts')).not.toContainText('Familia Ruiz');
  await expect(page.locator('#tray-btn .badge')).toHaveText('3');
  await page.locator('#tray-btn').click();
  await expect(page.locator('#log')).toContainText('Avisos del barrio');
  await expect(page.locator('#log')).toContainText('La Familia Ruiz se muda al barrio');
  await expect(page.locator('#log')).toContainText('y 1 más');
  await expect(page.locator('#tray-btn .badge')).toBeHidden();
  await page.locator('#log [data-close]').click();

  // Familia: los repetidos se agrupan.
  await toast(page, 'Mateo ha subido a cocina nivel 2', '🍳');
  await toast(page, 'Mateo ha subido a cocina nivel 2', '🍳');
  await expect(page.locator('#toasts .toast.normal', { hasText: 'cocina' })).toHaveCount(1);
  await expect(page.locator('#toasts .toast.normal', { hasText: 'cocina' })).toContainText('×2');

  // Urgente: se queda hasta tocarlo y al tocarlo pasa a controlar a Mateo.
  await toast(page, 'Mateo se muere de hambre', '❗', 'a2');
  const urgent = page.locator('#toasts .toast.urgent');
  await expect(urgent).toHaveCount(1);
  await page.waitForTimeout(3600);
  await expect(urgent).toHaveCount(1);
  await urgent.click();
  await expect(urgent).toHaveCount(0);
  await expect(page.locator('#who')).toContainText('Mateo');

  // Todo queda en el Diario.
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="log"]').click();
  await expect(page.locator('#log')).toContainText('La Familia Ruiz');
  await expect(page.locator('#log')).toContainText('se muere de hambre');
  expect(errors).toEqual([]);
});
