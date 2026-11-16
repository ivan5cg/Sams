import { expect, test } from '@playwright/test';
import { importSave, openGame, watchErrors } from './helpers';

const EVIL = '<img src=x onerror="window.__pwned=1">';

test('una partida importada con HTML en los nombres no inyecta nada', async ({ page }) => {
  const errors = watchErrors(page);
  let dialogs = 0;
  page.on('dialog', (d) => {
    dialogs++;
    void d.dismiss();
  });
  await openGame(page);
  // Partida manipulada: HTML en nombres de personas, mascotas, familias, casas, deseos y salseo.
  const json = await page.evaluate((evil) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (window as unknown as { sams: { world: { state: any } } }).sams.world;
    const s = JSON.parse(JSON.stringify(w.state));
    for (const a of s.agents) a.name = `${a.name}${evil}`;
    for (const h of s.households) h.name = `Familia ${evil}`;
    for (const l of s.lots) l.name = `Sitio ${evil}`;
    for (const a of s.agents) for (const wi of a.wishes ?? []) {
      wi.label = `Deseo ${evil}`;
      wi.icon = evil;
    }
    s.secrets = [{ id: 's1', kind: 'pedo', text: `salseo ${evil}`, about: [s.agents[0].id], known: [s.agents[0].id], juicy: 3, day: 1, public: true }];
    return JSON.stringify(s);
  }, EVIL);

  await importSave(page, json);
  await expect(page.locator('#toasts')).toContainText('Partida importada');
  await expect(page.locator('#who')).toContainText('<img');

  // Abrir todo lo que pinta nombres.
  await page.locator('#profile-btn').click();
  await expect(page.locator('#profile')).toContainText('<img');
  await page.locator('#profile [data-close]').click();
  await page.locator('#map-btn').click();
  await expect(page.locator('#map')).toContainText('<img');
  await page.locator('#map [data-close]').click();
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="salseo"]').click();
  await expect(page.locator('#log')).toContainText('<img');
  await page.locator('#log [data-close]').click();
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-menu="log"]').click();
  await page.locator('#log [data-close]').click();

  // Ni un solo <img> en la interfaz, ni un alert, ni código ejecutado.
  await page.waitForTimeout(300);
  expect(await page.locator('img').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(dialogs).toBe(0);
  expect(errors).toEqual([]);
});

test('una partida importada con un id manipulado se rechaza con un aviso', async ({ page }) => {
  await openGame(page);
  const json = await page.evaluate(() => {
    const s = JSON.parse(JSON.stringify((window as unknown as { sams: { world: { state: any } } }).sams.world.state));
    s.agents[0].id = 'a1"><img src=x>';
    return JSON.stringify(s);
  });
  await importSave(page, json);
  await expect(page.locator('#toasts')).toContainText('dañada');
  expect(await page.locator('img').count()).toBe(0);
});
