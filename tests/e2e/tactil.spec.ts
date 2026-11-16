import { expect, test } from '@playwright/test';
import { openGame, watchErrors } from './helpers';

type Scene = { camFree: boolean; cameras: { main: { scrollX: number; scrollY: number } } };
const scene = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { sams: { game: { scene: { getScene(k: string): Scene } } } }).sams.game.scene.getScene('house');
    return { free: s.camFree, x: s.cameras.main.scrollX, y: s.cameras.main.scrollY };
  });

test('arrastrar desengancha la cámara y 🎯 la vuelve a enganchar', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await page.locator('#speed [data-speed="0"]').click();
  await expect(page.locator('#recenter')).toBeHidden();
  const before = await scene(page);
  // Arrastrar con el dedo por la escena.
  await page.mouse.move(200, 420);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(200 - i * 12, 420 + i * 8);
  await page.mouse.up();
  const after = await scene(page);
  expect(after.free).toBe(true);
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(50);
  await expect(page.locator('#recenter')).toBeVisible();
  // Sigue desenganchada aunque pase el tiempo...
  await page.waitForTimeout(1500);
  expect((await scene(page)).free).toBe(true);
  // ...hasta tocar 🎯.
  await page.locator('#recenter').click();
  await expect(page.locator('#recenter')).toBeHidden();
  expect((await scene(page)).free).toBe(false);
  expect(errors).toEqual([]);
});

test('pulsación larga sobre un personaje: se abre su perfil (y no el menú de acciones)', async ({ page }) => {
  await openGame(page);
  await page.locator('#speed [data-speed="0"]').click();
  // Dónde está Mateo en pantalla.
  const p = await page.evaluate(() => {
    const s = (window as unknown as { sams: { world: { agent(id: string): { pos: { x: number; y: number } } }; game: { canvas: HTMLCanvasElement; scene: { getScene(k: string): { cameras: { main: { worldView: { x: number; y: number }; zoom: number; panEffect: { reset(): void } } } } } } } }).sams;
    const a = s.world.agent('a2');
    const cam = s.game.scene.getScene('house').cameras.main;
    cam.panEffect.reset();
    const wx = (a.pos.x - a.pos.y) * 32;
    const wy = (a.pos.x + a.pos.y + 1) * 16 - 22;
    const r = s.game.canvas.getBoundingClientRect();
    const k = r.width / s.game.canvas.width;
    return { x: r.left + (wx - cam.worldView.x) * cam.zoom * k, y: r.top + (wy - cam.worldView.y) * cam.zoom * k };
  });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(page.locator('#profile')).toBeVisible();
  await expect(page.locator('#profile .sheet-title')).toContainText('Mateo');
  // No abre además el menú de acciones.
  await expect(page.locator('#sheet')).toBeHidden();
});

test('los botones principales tienen zona de toque de 44 px', async ({ page }) => {
  await openGame(page);
  const small = await page.evaluate(() =>
    ['#tray-btn', '#map-btn', '#menu-btn', '#profile-btn', '#build-btn', '#needs-toggle', '#who', '#speed button', '.wish']
      .flatMap((sel) => [...document.querySelectorAll<HTMLElement>(sel)])
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const after = getComputedStyle(el, '::after');
        const hw = after.content !== 'none' ? Math.max(r.width, parseFloat(after.width) || 0) : r.width;
        const hh = after.content !== 'none' ? Math.max(r.height, parseFloat(after.height) || 0) : r.height;
        return { id: el.id || el.className, w: Math.round(hw), h: Math.round(hh) };
      })
      .filter((x) => x.w < 44 || x.h < 44),
  );
  expect(small).toEqual([]);
});
