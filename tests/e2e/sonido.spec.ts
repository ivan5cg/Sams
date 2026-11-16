import { expect, test, type Page } from '@playwright/test';
import { openGame, watchErrors } from './helpers';

type Audio = { ctx: AudioContext | null; settings: { muted: boolean; music: number }; measure(): Promise<Record<string, number>> };
const audioState = (page: Page) => page.evaluate(() => (window as unknown as { sams: { audio?: Audio } }).sams.audio?.ctx?.state ?? 'none');

test('sonido: se desbloquea al tocar, todo suena, y se para con la pantalla apagada o en silencio', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await page.waitForFunction(() => !!(window as unknown as { sams: { audio?: unknown } }).sams.audio);
  expect(await audioState(page)).toBe('none');

  // El primer toque crea el audio.
  await page.locator('#speed [data-speed="1"]').click();
  await expect.poll(() => audioState(page)).toBe('running');

  // Cada sonido produce sonido de verdad (renderizado sin altavoces).
  const peaks = await page.evaluate(() => (window as unknown as { sams: { audio: Audio } }).sams.audio.measure());
  expect(Object.keys(peaks).length).toBeGreaterThan(30);
  for (const [id, peak] of Object.entries(peaks)) {
    expect(Number.isFinite(peak), id).toBe(true);
    expect(peak, id).toBeGreaterThan(0.005);
    expect(peak, id).toBeLessThan(1.5);
  }

  // Pantalla apagada (app en segundo plano): se suspende; al volver, sigue.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => audioState(page)).toBe('suspended');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => audioState(page)).toBe('running');

  // Silencio desde el menú: se suspende y se recuerda al recargar.
  await page.locator('#menu-btn').click();
  await page.locator('#sound summary').click();
  await page.locator('#sound input[data-vol="music"]').fill('70');
  await page.locator('#sound [data-sound="off"]').click();
  await expect.poll(() => audioState(page)).toBe('suspended');
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { sams: { audio?: unknown } }).sams.audio);
  const s = await page.evaluate(() => (window as unknown as { sams: { audio: Audio } }).sams.audio.settings);
  expect(s.muted).toBe(true);
  expect(s.music).toBeCloseTo(0.7);
  await page.locator('#menu-btn').click();
  await page.locator('#sound summary').click();
  await expect(page.locator('#sound input[data-vol="music"]')).toBeDisabled();
  await page.locator('#sound [data-sound="on"]').click();
  await expect.poll(() => audioState(page)).toBe('running');
  expect(errors).toEqual([]);
});

test('sin Web Audio (navegador que lo bloquea), el juego funciona igual', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    // @ts-expect-error: se quita a propósito
    delete window.AudioContext;
    // @ts-expect-error: se quita a propósito
    delete window.webkitAudioContext;
  });
  await openGame(page);
  await page.locator('#speed [data-speed="3"]').click();
  await page.locator('#menu-btn').click();
  await page.locator('#sound summary').click();
  await page.locator('#sound [data-sound="off"]').click();
  await page.locator('#menu [data-menu="close"]').click();
  await page.waitForTimeout(1500);
  expect(await audioState(page)).toBe('none');
  expect(errors).toEqual([]);
});
