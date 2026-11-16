import { expect, test } from '@playwright/test';
import { openGame, watchErrors } from './helpers';

test('accesibilidad: letra grande, contraste, menos movimiento y vibración; se recuerdan', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  const html = page.locator('html');
  await page.locator('#menu-btn').click();
  await page.locator('#access summary').click();
  await page.locator('#access [data-pref="bigText"] [data-v="1"]').click();
  await page.locator('#access [data-pref="contrast"] [data-v="1"]').click();
  await page.locator('#access [data-pref="reduceMotion"] [data-v="1"]').click();
  await page.locator('#access [data-pref="vibrate"] [data-v="0"]').click();
  await expect(html).toHaveClass(/big-text/);
  await expect(html).toHaveClass(/contrast/);
  await expect(html).toHaveClass(/reduce-motion/);
  await page.reload();
  await expect(html).toHaveClass(/big-text/);
  await expect(html).toHaveClass(/reduce-motion/);
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('sams:prefs') ?? '{}'));
  expect(p).toMatchObject({ bigText: true, contrast: true, reduceMotion: true, vibrate: false });
  expect(errors).toEqual([]);
});

test('el sistema pide menos movimiento: se respeta por defecto', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await openGame(page);
  await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  await ctx.close();
});

test('las necesidades se leen sin depender del color', async ({ page }) => {
  await openGame(page);
  await page.locator('#needs-toggle').click();
  await page.evaluate(() => {
    const w = (window as unknown as { sams: { world: { activeAgent: { needs: Record<string, number> } } } }).sams.world;
    w.activeAgent.needs.hunger = 12;
  });
  const row = page.locator('#needs .need[data-row="hunger"]');
  await expect(row).toHaveClass(/low/);
  await expect(row.locator('.nv')).toHaveText(/^1[0-2]$/);
  await expect(row.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', /^1[0-2]$/);
});
