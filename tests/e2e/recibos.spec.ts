import { expect, test } from '@playwright/test';
import { openGame, watchErrors } from './helpers';

type W = {
  household: { funds: number; bills?: { debts: { id: string }[]; cut?: { luz?: number } } };
  state: { minutes: number; speed: number };
  tick(m: number): void;
  hasPower(l: string): boolean;
  evicted: boolean;
};

test('recibos: ver los próximos, pagar lo que se debe y que vuelva la luz', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await page.locator('#speed [data-speed="0"]').click();
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="bills"]').click();
  const panel = page.locator('#bills');
  await expect(panel).toContainText('Próximos recibos');
  await expect(panel).toContainText('Alquiler · §343');
  await expect(panel).toContainText('Todo pagado');
  await panel.locator('[data-close]').click();

  // Sin dinero, del 1 al 15 de abril: deudas y corte de luz.
  await page.evaluate(() => {
    const w = (window as unknown as { sams: { world: W } }).sams.world;
    w.household.funds = 0;
    // Sin sucesos al azar que den dinero (y luego, el azar de siempre: Phaser también lo usa).
    const orig = Math.random;
    Math.random = () => 0.99;
    try {
      for (let i = 0; i < 25; i++) {
        w.state.minutes = Math.floor(w.state.minutes / 1440 + 1) * 1440 - 1;
        w.tick(2);
      }
    } finally {
      Math.random = orig;
    }
  });
  expect(await page.evaluate(() => (window as unknown as { sams: { world: W } }).sams.world.hasPower('L0'))).toBe(false);
  await expect(page.locator('.toast').filter({ hasText: 'cortado la luz' }).first()).toBeVisible();
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="bills"]').click();
  await expect(panel).toContainText('Luz cortada');
  await expect(panel.locator('[data-pay]').first()).toBeDisabled();
  // Llega dinero: pagar todo.
  await page.evaluate(() => ((window as unknown as { sams: { world: W } }).sams.world.household.funds = 5000));
  await panel.locator('[data-close]').click();
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="bills"]').click();
  await panel.locator('[data-payall]').click();
  await expect(panel).toContainText('Todo pagado');
  await expect(panel).not.toContainText('Luz cortada');
  expect(await page.evaluate(() => (window as unknown as { sams: { world: W } }).sams.world.hasPower('L0'))).toBe(true);
  expect(errors).toEqual([]);
});
