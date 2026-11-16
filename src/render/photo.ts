// Fotos del juego: una captura del canvas (sin la interfaz), reducida y con su pie de foto,
// lista para guardarla en el álbum.

import type Phaser from 'phaser';

/** Ancho máximo de la foto guardada (en píxeles). */
const MAX_W = 720;

/** Hace la foto. `caption` se escribe en una franja abajo, como en las fotos de revelar. */
export function takePhoto(game: Phaser.Game, caption: string): Promise<{ blob: Blob; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    game.renderer.snapshot((snap) => {
      try {
        const img = snap as HTMLImageElement;
        const draw = () => {
          const scale = Math.min(1, MAX_W / img.width);
          const w = Math.round(img.width * scale);
          const photoH = Math.round(img.height * scale);
          const strip = Math.round(w * 0.09);
          const c = document.createElement('canvas');
          c.width = w;
          c.height = photoH + strip;
          const ctx = c.getContext('2d');
          if (!ctx) throw new Error('Sin canvas');
          ctx.fillStyle = '#fbf8f1';
          ctx.fillRect(0, 0, w, c.height);
          ctx.drawImage(img, 0, 0, w, photoH);
          ctx.fillStyle = '#3a3a3a';
          ctx.font = `600 ${Math.round(strip * 0.42)}px system-ui, sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.fillText(caption, Math.round(strip * 0.35), photoH + strip / 2, w - strip * 0.7);
          c.toBlob((blob) => (blob ? resolve({ blob, w, h: c.height }) : reject(new Error('No se pudo hacer la foto'))), 'image/jpeg', 0.78);
        };
        if (img.complete && img.width) draw();
        else img.onload = draw;
      } catch (e) {
        reject(e as Error);
      }
    }, 'image/png');
  });
}
