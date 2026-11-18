import { expect, test } from '@playwright/test';
import { objectOnScreen, openGame, watchErrors } from './helpers';

type W = {
  state: { minutes: number; speed: number };
  household: { funds: number };
  activeAgent: { id: string };
  travel(ids: string[], lotId: string): boolean;
  tick(min: number): void;
  viewLotId: string;
};
const world = 'window.sams.world';

test('El Rastro: vender un mueble de casa y mirar los de segunda mano', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  // La partida empieza un lunes: el domingo (día 7) a las 9:00 se va al Rastro.
  await page.evaluate(() => {
    const w = (window as unknown as { sams: { world: W } }).sams.world;
    w.state.speed = 0;
    w.state.minutes = 6 * 1440 + 9 * 60;
    w.household.funds = 2000;
    w.travel([w.activeAgent.id], 'MK');
    for (let i = 0; i < 60 && w.viewLotId !== 'MK'; i++) w.tick(1);
  });
  await expect.poll(() => page.evaluate(`${world}.viewLotId`)).toBe('MK');
  await page.waitForTimeout(300);

  // El puesto propio: vender lo vuestro.
  const own = await objectOnScreen(page, 'stall_own');
  await page.mouse.click(own.x, own.y);
  await expect(page.locator('#sheet')).toBeVisible();
  await page.locator('#sheet [data-action="sell_stall"]').click();
  await expect(page.locator('#sheet .sheet-title')).toHaveText(/¿Qué vendemos\?/);
  const first = page.locator('#sheet [data-stallsell]').first();
  await expect(first).toContainText('+§');
  await page.screenshot({ path: 'test-results/mercadillo-vender.png' });
  await first.click();
  await expect(page.locator('#sheet')).toBeHidden();
  const f0 = await page.evaluate(`${world}.household.funds`);
  await page.evaluate(() => (window as unknown as { sams: { world: W } }).sams.world.tick(40));
  await expect.poll(() => page.evaluate(`${world}.household.funds`)).toBeGreaterThan(f0 as number);

  // El puesto de trastos: muebles de segunda mano.
  const junk = await objectOnScreen(page, 'stall_junk');
  await page.mouse.click(junk.x, junk.y);
  await page.locator('#sheet [data-action="buy_secondhand"]').click();
  await expect(page.locator('#sheet .sheet-title')).toHaveText(/segunda mano/);
  await expect(page.locator('#sheet [data-secondhand]')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/mercadillo-segunda-mano.png' });
  expect(errors).toEqual([]);
});
