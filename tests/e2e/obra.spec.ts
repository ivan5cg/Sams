import { expect, test } from '@playwright/test';
import { openGame, tileOnScreen, watchErrors } from './helpers';

type W = {
  household: { funds: number };
  lotById(id: string): { paint?: Record<string, { wall?: number; floor?: string }> };
  state: { objects: { def: string; rot?: number }[] };
  canPlace(def: string, x: number, y: number, ignore?: string, rot?: 1): { ok: boolean };
  layoutOf(l: string): { w: number; h: number };
};

test('obra: pintar una habitación, deshacerlo, y colocar una cama girada', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await page.locator('#speed [data-speed="0"]').click();
  await page.locator('#build-btn').click();
  await expect(page.locator('#build-undo')).toBeDisabled();

  // Pintura: un color de pared y tocar el salón.
  await page.locator('#build-tabs [data-cat="pintura"]').click();
  await page.locator('#build-items [data-wall]').nth(6).click();
  const p = await tileOnScreen(page, 7, 7);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => JSON.stringify((window as never as { sams: { world: W } }).sams.world.lotById('L0').paint ?? {}))).toContain('wall');
  await expect(page.locator('#build-undo')).toBeEnabled();
  await page.locator('#build-undo').click();
  await expect.poll(() => page.evaluate(() => JSON.stringify((window as never as { sams: { world: W } }).sams.world.lotById('L0').paint ?? {}))).not.toContain('wall');
  await page.locator('#placebar [data-cancel]').click();

  // Una cama girada.
  await page.locator('#build-tabs [data-cat="descanso"]').click();
  await page.locator('#build-items [data-item="bed"]').click();
  await page.locator('#placebar [data-rot]').click();
  const spot = await page.evaluate(() => {
    const w = (window as never as { sams: { world: W } }).sams.world;
    const lay = w.layoutOf('L0');
    for (let y = 1; y < lay.h - 1; y++) for (let x = 1; x < lay.w - 1; x++) if (w.canPlace('bed', x, y, undefined, 1).ok) return { x, y };
    return null;
  });
  expect(spot).not.toBeNull();
  const t = await tileOnScreen(page, spot!.x, spot!.y);
  await page.mouse.click(t.x, t.y);
  await page.locator('#placebar [data-place]').click();
  await expect.poll(() => page.evaluate(() => (window as never as { sams: { world: W } }).sams.world.state.objects.filter((o) => o.def === 'bed' && o.rot === 1).length)).toBe(1);
  await page.locator('#build-exit').click();
  expect(errors).toEqual([]);
});
