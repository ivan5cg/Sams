// Modo gráfico: normal (Canvas 2D, el de siempre) o avanzado (WebGL, con efectos).
// Y los emojis/símbolos del juego como imágenes fijas cacheadas (no como textos que se redibujan).

import type Phaser from 'phaser';

const KEY = 'sams:webgl';

/** El jugador ha pedido gráficos avanzados (se aplica al arrancar). */
export function webglWanted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setWebglWanted(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* sin almacenamiento: se queda en normal */
  }
}

/** Si de verdad se está usando WebGL (lo fija main.ts al arrancar). */
export let IS_WEBGL = false;
export function markRenderer(webgl: boolean) {
  IS_WEBGL = webgl;
}

/**
 * Un emoji o símbolo como textura (se dibuja una vez en un canvas y se reutiliza).
 * Con `color` se dibuja el carácter de ese color con borde blanco (notas, zetas, corazones...).
 */
export function glyph(scene: Phaser.Scene, ch: string, color?: string): string {
  const key = `glyph:${ch}:${color ?? ''}`;
  if (scene.textures.exists(key)) return key;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.font = `bold ${Math.round(size * 0.72)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (color) {
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(ch, size / 2, size / 2 + 3);
      ctx.fillStyle = color;
    }
    ctx.fillText(ch, size / 2, size / 2 + 3);
  }
  scene.textures.addCanvas(key, c);
  return key;
}
