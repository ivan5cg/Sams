// Mediciones de rendimiento (solo se toman con ?debug en la URL).

export const DEBUG = (() => {
  try {
    return new URLSearchParams(location.search).has('debug');
  } catch {
    return false;
  }
})();

/** Media móvil y máximo del último segundo de una medida en milisegundos. */
class Stat {
  avg = 0;
  max = 0;
  private winMax = 0;
  private winStart = 0;
  add(ms: number, now: number) {
    this.avg = this.avg ? this.avg * 0.9 + ms * 0.1 : ms;
    this.winMax = Math.max(this.winMax, ms);
    if (now - this.winStart > 1000) {
      this.max = this.winMax;
      this.winMax = 0;
      this.winStart = now;
    }
  }
}

export const perf = {
  /** world.tick de cada frame. */
  tick: new Stat(),
  /** update de la escena sin contar el tick (sincronizar sprites, cámara, efectos). */
  scene: new Stat(),
  /** Frame entero: de antes del update a después de dibujar. */
  frame: new Stat(),
};
