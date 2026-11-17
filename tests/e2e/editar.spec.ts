import { expect, test } from '@playwright/test';
import { openGame, watchErrors } from './helpers';

test('editar a una persona desde su perfil: nombre, ropa y peinado', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await page.locator('#profile-btn').click();
  await page.locator('#profile [data-edit]').click();
  const ed = page.locator('#editor');
  await expect(ed).toBeVisible();
  await ed.locator('[data-ed="name"]').fill('Lu');
  await ed.locator('[data-ed="clothes"]').nth(6).click();
  await ed.locator('[data-ed="style"]').selectOption('curly');
  await ed.locator('[data-ed="extra"]').selectOption('glasses');
  await ed.locator('[data-ed="save"]').click();
  await expect(ed).toBeHidden();
  await expect(page.locator('#profile .sheet-title')).toContainText('Lu');
  const a = await page.evaluate(() => {
    const w = (window as unknown as { sams: { world: { agent(id: string): { name: string; color: number; look?: { hairStyle?: string; extra?: string } } } } }).sams.world;
    return w.agent('a1');
  });
  expect(a.name).toBe('Lu');
  expect(a.color).toBe(0x2a9d8f);
  expect(a.look?.hairStyle).toBe('curly');
  expect(a.look?.extra).toBe('glasses');
  // A 390 de ancho no se sale nada.
  await page.locator('#profile [data-edit]').click();
  expect(await page.evaluate(() => { const c = document.querySelector('#editor')!; return c.scrollWidth - c.clientWidth; })).toBeLessThanOrEqual(0);
  await ed.locator('[data-ed="cancel"]').click();
  expect(errors).toEqual([]);
});
