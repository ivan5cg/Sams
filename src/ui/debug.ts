// Panel de rendimiento: se activa con ?debug en la URL.
// FPS, coste de la simulación y del dibujado por frame, agentes al detalle y memoria.

import type Phaser from 'phaser';
import { perf } from '../render/perf';
import { migrate, serialize } from '../save/serialize';
import { World } from '../sim/world';

export function startDebugOverlay(game: Phaser.Game, getWorld: () => World) {
  const box = document.createElement('div');
  box.id = 'debug';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText =
    'position:fixed;left:6px;top:calc(env(safe-area-inset-top) + 64px);z-index:60;background:rgba(0,0,0,.72);color:#9f9;font:11px/1.35 ui-monospace,monospace;padding:6px 8px;border-radius:8px;pointer-events:auto;white-space:pre';
  const out = document.createElement('div');
  const bench = document.createElement('button');
  bench.textContent = '⏱ simular 1 día';
  bench.style.cssText = 'margin-top:4px;font:inherit;color:#000;background:#9f9;border:0;border-radius:4px;padding:2px 6px';
  const result = document.createElement('div');
  box.append(out, bench, result);
  document.body.append(box);

  // El frame entero: desde antes del update hasta después de dibujar.
  let frameStart = 0;
  game.events.on('prestep', () => (frameStart = performance.now()));
  game.events.on('postrender', () => {
    const now = performance.now();
    if (frameStart) perf.frame.add(now - frameStart, now);
  });

  bench.addEventListener('click', () => {
    // Sobre una copia de la partida, para no tocar la de verdad.
    const copy = new World(migrate(JSON.parse(serialize(getWorld().state))));
    const t0 = performance.now();
    copy.tick(1440);
    const ms = performance.now() - t0;
    result.textContent = `1 día de juego: ${Math.round(ms)} ms (×8 = 180 s reales)`;
  });

  const fmt = (n: number) => n.toFixed(n < 10 ? 2 : 1);
  setInterval(() => {
    const w = getWorld();
    const detailed = w.state.agents.filter((a) => !a.travel && !a.abstract).length;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    out.textContent = [
      `FPS ${Math.round(game.loop.actualFps)}  ${game.renderer.type === 2 ? 'WebGL' : 'Canvas'}  ×${[0, 1, 3, 8][w.state.speed] ?? 1}`,
      `tick  ${fmt(perf.tick.avg)} ms (máx ${fmt(perf.tick.max)})`,
      `escena ${fmt(perf.scene.avg)} ms (máx ${fmt(perf.scene.max)})`,
      `frame ${fmt(perf.frame.avg)} ms (máx ${fmt(perf.frame.max)})`,
      `agentes ${detailed} al detalle / ${w.state.agents.length}`,
      `objetos ${w.state.objects.length}`,
      mem ? `memoria ${(mem.usedJSHeapSize / 1048576).toFixed(1)} MB` : 'memoria: n/d',
    ].join('\n');
  }, 500);
}
