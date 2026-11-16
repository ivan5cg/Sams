import { expect, test } from '@playwright/test';
import { openGame, watchErrors } from './helpers';

type W = { household: { name: string }; members: { name: string; kind: string; traits: string[]; look?: { hairStyle?: string } }[]; state: { speed: number } };
const world = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const w = (window as unknown as { sams: { world: W } }).sams.world;
  return { name: w.household.name, members: w.members.map((m) => ({ name: m.name, kind: m.kind, traits: m.traits, style: m.look?.hairStyle })), speed: w.state.speed };
});

test('crear tu familia la primera vez, y otra desde el menú', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openGame(page, { creator: true, tutorial: true });
  const cr = page.locator('#creator');
  await expect(cr).toBeVisible();
  // Con el creador abierto, el tiempo no corre.
  expect((await world(page)).speed).toBe(0);

  // Apellido, nombres y peinado.
  await cr.locator('[data-f="surname"]').fill('Pérez');
  await cr.locator('[data-f="name"][data-i="0"]').fill('Rosa');
  await cr.locator('[data-f="style"][data-i="0"]').selectOption('curly');
  await cr.locator('[data-f="trait0"][data-i="0"]').selectOption('friki');
  // Un niño más.
  await cr.locator('[data-cr="add"]').click();
  await cr.locator('[data-f="name"][data-i="2"]').fill('Leo');
  await cr.locator('[data-f="stage"][data-i="2"]').selectOption('child');
  // Sin nombre no se puede empezar.
  await cr.locator('[data-f="name"][data-i="1"]').fill('');
  await cr.locator('[data-cr="start"]').click();
  await expect(cr.locator('.cr-problems')).toContainText('sin nombre');
  await expect(cr).toBeVisible();
  await cr.locator('[data-f="name"][data-i="1"]').fill('Paco');
  // Una cobaya en vez de perro y gato.
  await cr.locator('[data-f="pet"]').selectOption('guineapig');
  await cr.locator('[data-f="petname"]').fill('Bolita');
  await cr.locator('[data-cr="start"]').click();
  await expect(cr).toBeHidden();

  // (La García de mientras también tiene 4 retratos: se espera al cambio de familia.)
  await expect.poll(async () => (await world(page)).name).toBe('Familia Pérez');
  await expect(page.locator('#portraits .portrait')).toHaveCount(4);
  const w = await world(page);
  expect(w.members.map((m) => m.name)).toEqual(['Rosa', 'Paco', 'Leo', 'Bolita']);
  expect(w.members[0].style).toBe('curly');
  expect(w.members[0].traits[0]).toBe('friki');
  // Después del creador viene el tutorial.
  await expect(page.locator('#guide')).toContainText('Toca la nevera');
  await page.locator('#guide [data-skip]').click();

  // Partida nueva desde el menú: se puede volver atrás sin perder nada...
  page.on('dialog', (d) => d.accept());
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="new"]').click();
  await expect(cr).toBeVisible();
  await cr.locator('[data-cr="cancel"]').click();
  expect((await world(page)).name).toBe('Familia Pérez');
  expect((await world(page)).speed).toBeGreaterThan(0);
  // ...o tirar los dados.
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="new"]').click();
  await cr.locator('[data-cr="random"]').click();
  await cr.locator('[data-cr="start"]').click();
  await expect(cr).toBeHidden();
  await expect.poll(async () => (await world(page)).name).not.toBe('Familia Pérez');

  // A 390 de ancho no se sale nada por los lados.
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="new"]').click();
  const overflow = await page.evaluate(() => {
    const c = document.querySelector('#creator')!;
    return c.scrollWidth - c.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('si se cierra la app sin elegir familia, al volver se elige otra vez', async ({ page }) => {
  await openGame(page, { creator: true });
  await expect(page.locator('#creator')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await expect(page.locator('#creator')).toBeVisible();
  // Elegida, ya no vuelve a salir.
  await page.locator('#creator [data-cr="garcia"]').click();
  await expect(page.locator('#creator')).toBeHidden();
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { sams?: object }).sams);
  await expect(page.locator('#portraits .portrait')).toHaveCount(4);
  await expect(page.locator('#creator')).toBeHidden();
});
