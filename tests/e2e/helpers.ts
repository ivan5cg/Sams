import { expect, type Page } from '@playwright/test';

/** Errores de consola y de página que no deberían salir nunca. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Abre el juego en una partida nueva y espera a que la escena esté lista. */
export async function openGame(page: Page, opts: { tutorial?: boolean; creator?: boolean } = {}) {
  await page.addInitScript((tuto) => {
    // Partida limpia en cada prueba.
    if (!sessionStorage.getItem('sams:e2e')) {
      sessionStorage.setItem('sams:e2e', '1');
      localStorage.clear();
      indexedDB.deleteDatabase('sams');
      if (!tuto) localStorage.setItem('sams:tutorial', '1');
    }
  }, !!opts.tutorial);
  await page.goto('/');
  await page.waitForFunction(() => {
    const s = (window as unknown as { sams?: { game: { scene: { getScene(k: string): { sys: { isActive(): boolean } } | null } } } }).sams;
    return !!s?.game.scene.getScene('house')?.sys.isActive();
  });
  // La primera vez sale el creador de familia: se elige la García de siempre.
  // (Con un clic del propio script, que no cuenta como toque: así el sonido sigue sin desbloquear.)
  if (!opts.creator) {
    // Se espera a que la familia elegida sustituya a la de mientras (si no, se jugaría con la vieja).
    const fresh = await page.evaluate(() => {
      const g = window as unknown as { sams: { world: object }; __oldWorld?: object };
      const b = document.querySelector<HTMLButtonElement>('#creator:not([hidden]) [data-cr="garcia"]');
      if (!b) return true;
      g.__oldWorld = g.sams.world;
      b.click();
      return false;
    });
    if (!fresh) await page.waitForFunction(() => {
      const g = window as unknown as { sams: { world: object }; __oldWorld?: object };
      return g.sams.world !== g.__oldWorld;
    });
    await expect(page.locator('#creator')).toBeHidden();
    await expect(page.locator('#portraits .portrait')).toHaveCount(4);
  }
}

/** Coordenadas en pantalla (CSS) del centro de un objeto de la parcela que se ve. */
export async function objectOnScreen(page: Page, def: string): Promise<{ x: number; y: number }> {
  return page.evaluate((def) => {
    type Cam = { worldView: { x: number; y: number }; zoom: number; panEffect: { reset(): void } };
    const s = (window as unknown as { sams: { world: { viewLotId: string; objectsIn(l: string): { def: string; x: number; y: number }[] }; game: { scene: { getScene(k: string): { cameras: { main: Cam } } }; canvas: HTMLCanvasElement } } }).sams;
    const o = s.world.objectsIn(s.world.viewLotId).find((x) => x.def === def);
    if (!o) throw new Error(`No hay ${def}`);
    // Que nadie lo esté usando (los demás van por su cuenta y podrían haberlo cogido).
    for (const a of (s.world as unknown as { state: { agents: { current: { targetObjectId?: string } | null }[] } }).state.agents) {
      if (a.current?.targetObjectId === (o as unknown as { id: string }).id) a.current = null;
    }
    const cam = s.game.scene.getScene('house').cameras.main;
    cam.panEffect.reset();
    // Centro de la casilla en el mundo isométrico (64×32), un poco por encima del suelo.
    const wx = (o.x + 0.5 - (o.y + 0.5)) * 32;
    const wy = (o.x + 0.5 + (o.y + 0.5)) * 16 - 10;
    const r = s.game.canvas.getBoundingClientRect();
    const scale = r.width / s.game.canvas.width;
    return { x: r.left + (wx - cam.worldView.x) * cam.zoom * scale, y: r.top + (wy - cam.worldView.y) * cam.zoom * scale };
  }, def);
}

/** Coordenadas en pantalla (CSS) del centro de una casilla de la parcela que se ve. */
export async function tileOnScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([tx, ty]) => {
    type Cam = { worldView: { x: number; y: number }; zoom: number; panEffect: { reset(): void } };
    const s = (window as unknown as { sams: { game: { scene: { getScene(k: string): { cameras: { main: Cam } } }; canvas: HTMLCanvasElement } } }).sams;
    const cam = s.game.scene.getScene('house').cameras.main;
    cam.panEffect.reset();
    const wx = (tx + 0.5 - (ty + 0.5)) * 32;
    const wy = (tx + 0.5 + (ty + 0.5)) * 16;
    const r = s.game.canvas.getBoundingClientRect();
    const scale = r.width / s.game.canvas.width;
    return { x: r.left + (wx - cam.worldView.x) * cam.zoom * scale, y: r.top + (wy - cam.worldView.y) * cam.zoom * scale };
  }, [x, y]);
}

/** Importa una partida como si el jugador eligiera un fichero en ☰ → Importar. */
export async function importSave(page: Page, json: string) {
  await page.evaluate((text) => {
    const input = document.querySelector<HTMLInputElement>('#import-file')!;
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'partida.json', { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, json);
}
