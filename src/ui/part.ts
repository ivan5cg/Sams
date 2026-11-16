// Base de los componentes de la interfaz: acceso al Hud (coordinador) y al mundo.

import type { Hud } from './hud';

export abstract class Part {
  constructor(protected hud: Hud) {}

  get world() {
    return this.hud.world;
  }
}
