import Phaser from 'phaser';
import { ACTIONS } from '../data/actions';
import { OBJECTS } from '../data/objects';
import { SPECIES } from '../data/species';
import type { Agent, PlacedObject } from '../sim/types';
import type { Target, World } from '../sim/world';
import { TILE_H, TILE_W, isoToScreen, screenToTile, shade, tileCenter } from './iso';

/** Minutos de juego por segundo real para cada velocidad. */
export const SPEEDS = [0, 1, 3, 8];

const FLOOR_COLORS = { wood: 0xc89f6e, tile: 0xdde6eb, grass: 0x7cb95b, door: 0xa67c52, wall: 0xe9e1d4 };
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
const HAIR = [0x3b2314, 0x111111, 0xb5651d, 0xe6c35c];

interface AgentView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  plumbob: Phaser.GameObjects.Graphics;
  ring: Phaser.GameObjects.Graphics;
}

interface ObjectView {
  gfx: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Text;
  badge?: Phaser.GameObjects.Text;
}

export interface SceneHooks {
  world: World;
  onTap: (target: Target) => void;
}

/**
 * Densidad de píxeles: el canvas se dibuja a la resolución real de la pantalla
 * (ver main.ts) y la cámara se amplía en la misma proporción.
 */
export const DPR = Math.min(window.devicePixelRatio || 1, 2.5);
/** Los textos se rasterizan a más resolución para que no se vean borrosos con zoom. */
const TEXT_RES = Math.min(4, DPR * 1.5);
const ZOOM_MIN = 0.4 * DPR;
const ZOOM_MAX = 2.5 * DPR;

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export class HouseScene extends Phaser.Scene {
  private world!: World;
  private onTap!: (t: Target) => void;
  private agentViews = new Map<string, AgentView>();
  private objectViews = new Map<string, ObjectView>();
  private night!: Phaser.GameObjects.Rectangle;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private dragged = false;
  private pinchStart: { dist: number; zoom: number } | null = null;

  constructor() {
    super('house');
  }

  init(hooks: SceneHooks) {
    this.world = hooks.world;
    this.onTap = hooks.onTap;
  }

  /** Cambia el mundo (al cargar o empezar partida nueva). */
  setWorld(world: World) {
    this.world = world;
    for (const v of this.agentViews.values()) v.root.destroy();
    for (const v of this.objectViews.values()) this.destroyObjectView(v);
    this.agentViews.clear();
    this.objectViews.clear();
  }

  create() {
    this.cameras.main.setBackgroundColor('#3d5a40');
    this.drawLot();
    this.night = this.add.rectangle(0, 0, 10, 10, 0x0b1640, 0).setOrigin(0).setScrollFactor(0).setDepth(1e6);
    this.fitCamera();
    this.scale.on('resize', () => this.fitCamera());
    this.setupInput();
  }

  private fitCamera() {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    // Centrar en la casa (no en toda la parcela).
    const c = isoToScreen(5.5, 5.5);
    const cssW = width / DPR, cssH = height / DPR;
    cam.setZoom(Phaser.Math.Clamp(Math.min(cssW / 640, cssH / 520), 0.45, 1.6) * DPR);
    cam.centerOn(c.x, c.y + 10);
    this.night.setSize(width, height);
  }

  // ---------------------------------------------------------------------------
  // Parcela estática
  // ---------------------------------------------------------------------------

  private drawLot() {
    const { tiles, w, h } = this.world.lot;
    const floor = this.add.graphics().setDepth(-1e5);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = tiles[y][x];
        if (t === 'wall') continue;
        let color = FLOOR_COLORS[t];
        if (t === 'wood') color = shade(color, (x + y) % 2 ? 1 : 0.94);
        if (t === 'tile') color = shade(color, (x + y) % 2 ? 1 : 0.9);
        if (t === 'grass') color = shade(color, 0.95 + ((hash(`${x},${y}`) % 10) / 100));
        this.diamond(floor, x, y, color);
      }
    }
    // Paredes: altas al fondo, bajas delante (vista recortada).
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (tiles[y][x] !== 'wall') continue;
        const back = x === 0 || y === 0;
        const g = this.add.graphics().setDepth((x + y) * 10 + 9);
        this.box(g, x, y, 1, 1, back ? 52 : 12, FLOOR_COLORS.wall);
      }
    }
  }

  private diamond(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    const a = isoToScreen(x, y), b = isoToScreen(x + 1, y), c = isoToScreen(x + 1, y + 1), d = isoToScreen(x, y + 1);
    g.fillStyle(color, 1);
    g.fillPoints([a, b, c, d], true);
    g.lineStyle(1, 0x000000, 0.08);
    g.strokePoints([a, b, c, d], true);
  }

  /** Bloque isométrico de w×h casillas y `height` píxeles de alto. */
  private box(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, height: number, color: number) {
    const A = isoToScreen(x, y), B = isoToScreen(x + w, y), C = isoToScreen(x + w, y + h), D = isoToScreen(x, y + h);
    const up = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - height });
    if (height > 0) {
      g.fillStyle(shade(color, 0.78), 1);
      g.fillPoints([D, C, up(C), up(D)], true);
      g.fillStyle(shade(color, 0.62), 1);
      g.fillPoints([C, B, up(B), up(C)], true);
    }
    g.fillStyle(color, 1);
    g.fillPoints([up(A), up(B), up(C), up(D)], true);
    g.lineStyle(1, 0x000000, 0.18);
    g.strokePoints([up(A), up(B), up(C), up(D)], true);
  }

  // ---------------------------------------------------------------------------
  // Objetos
  // ---------------------------------------------------------------------------

  private objectDepth(o: PlacedObject) {
    const d = OBJECTS[o.def];
    return (o.x + d.w - 1 + o.y + d.h - 1) * 10 + (d.walkable ? 1 : 6);
  }

  private createObjectView(o: PlacedObject): ObjectView {
    const d = OBJECTS[o.def];
    const gfx = this.add.graphics().setDepth(this.objectDepth(o));
    if (o.def === 'puddle') {
      const c = tileCenter(o.x, o.y);
      gfx.fillStyle(d.color, 0.75);
      gfx.fillEllipse(c.x, c.y, 34, 14);
    } else if (o.def !== 'ball' && o.def !== 'tree' && o.def !== 'plant') {
      this.box(gfx, o.x + 0.1, o.y + 0.1, d.w - 0.2, d.h - 0.2, d.height, d.color);
    } else {
      const c = isoToScreen(o.x + d.w / 2, o.y + d.h / 2);
      gfx.fillStyle(0x000000, 0.2);
      gfx.fillEllipse(c.x, c.y, 26, 12);
    }
    const top = isoToScreen(o.x + d.w / 2, o.y + d.h / 2);
    const big = o.def === 'tree';
    const icon = this.add
      .text(top.x, top.y - d.height - (big ? 4 : 2), d.icon, { resolution: TEXT_RES, fontSize: big ? '52px' : o.def === 'ball' ? '18px' : '26px' })
      .setOrigin(0.5, big ? 0.95 : 0.8)
      .setDepth(this.objectDepth(o) + 0.5);
    let badge: Phaser.GameObjects.Text | undefined;
    if (d.maxStock) {
      badge = this.add
        .text(top.x, top.y - d.height - 34, '', { resolution: TEXT_RES, fontSize: '13px', fontFamily: 'system-ui, sans-serif', color: '#fff', backgroundColor: '#c0392b', padding: { x: 4, y: 1 } })
        .setOrigin(0.5)
        .setDepth(1e5);
    }
    return { gfx, icon, badge };
  }

  private destroyObjectView(v: ObjectView) {
    v.gfx.destroy();
    v.icon.destroy();
    v.badge?.destroy();
  }

  private syncObjects() {
    const seen = new Set<string>();
    for (const o of this.world.state.objects) {
      seen.add(o.id);
      let v = this.objectViews.get(o.id);
      if (!v) {
        v = this.createObjectView(o);
        this.objectViews.set(o.id, v);
      }
      if (v.badge) {
        const empty = !o.stock;
        v.badge.setVisible(empty).setText('¡Vacío!');
      }
    }
    for (const [id, v] of this.objectViews) {
      if (!seen.has(id)) {
        this.destroyObjectView(v);
        this.objectViews.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Agentes
  // ---------------------------------------------------------------------------

  private createAgentView(a: Agent): AgentView {
    const root = this.add.container(0, 0);
    const ring = this.add.graphics();
    ring.lineStyle(3, 0x7cff6b, 0.9);
    ring.strokeEllipse(0, 0, 34, 16);
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.25);
    shadow.fillEllipse(0, 0, 24, 11);
    const body = this.add.container(0, 0);
    let sprite: Phaser.GameObjects.Text | undefined;
    let headY: number;

    if (a.kind === 'person') {
      const h = hash(a.id);
      const g = this.add.graphics();
      g.fillStyle(0x34384a, 1);
      g.fillRoundedRect(-6, -15, 5, 15, 2);
      g.fillRoundedRect(1, -15, 5, 15, 2);
      g.fillStyle(a.color, 1);
      g.fillRoundedRect(-9, -33, 18, 21, 6);
      g.fillStyle(SKIN[h % SKIN.length], 1);
      g.fillCircle(0, -41, 8.5);
      g.fillStyle(HAIR[(h >> 3) % HAIR.length], 1);
      g.slice(0, -42, 9, Math.PI, 0, false);
      g.fillPath();
      body.add(g);
      headY = -52;
    } else {
      sprite = this.add.text(0, 2, SPECIES[a.species].icon, { resolution: TEXT_RES, fontSize: '30px' }).setOrigin(0.5, 1);
      body.add(sprite);
      headY = -32;
    }

    const label = this.add
      .text(0, 8, a.name, { resolution: TEXT_RES, fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: '#fff', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5, 0);
    const bubble = this.add.text(0, headY - 10, '', { resolution: TEXT_RES, fontSize: '18px' }).setOrigin(0.5, 1);
    const plumbob = this.add.graphics();
    plumbob.fillStyle(0x3ddc4a, 1);
    plumbob.fillPoints([{ x: 0, y: -9 }, { x: 6, y: 0 }, { x: 0, y: 9 }, { x: -6, y: 0 }], true);
    plumbob.fillStyle(0xb6ffb0, 0.9);
    plumbob.fillPoints([{ x: 0, y: -9 }, { x: 6, y: 0 }, { x: 0, y: 0 }], true);
    plumbob.y = headY - 14;

    root.add([ring, shadow, body, label, bubble, plumbob]);
    return { root, body, sprite, bubble, label, plumbob, ring };
  }

  private agentScreenPos(a: Agent): { x: number; y: number; depth: number; lying: boolean } {
    const t = a.current;
    if (t && t.phase === 'acting' && t.targetObjectId) {
      const o = this.world.object(t.targetObjectId);
      const d = o && OBJECTS[o.def];
      if (o && d?.snap) {
        const users = this.world.usersOf(o.id).filter((u) => u.current?.phase === 'acting');
        const slot = users.indexOf(a);
        const off = d.capacity > 1 ? (slot - (users.length - 1) / 2) * 0.55 : 0;
        const along = d.w >= d.h;
        const cx = o.x + d.w / 2 + (along ? off : 0);
        const cy = o.y + d.h / 2 + (along ? 0 : off);
        const p = isoToScreen(cx, cy);
        const lying = ['sleep', 'nap_sofa', 'nap_bed', 'pet_sleep'].includes(t.actionId);
        return { x: p.x, y: p.y - d.height * 0.6, depth: this.objectDepth(o) + 2, lying };
      }
    }
    const p = tileCenter(a.pos.x, a.pos.y);
    return { x: p.x, y: p.y, depth: (a.pos.x + a.pos.y) * 10 + 7, lying: t?.actionId === 'pass_out' };
  }

  private syncAgents(time: number) {
    const seen = new Set<string>();
    const activeId = this.world.state.activeAgentId;
    for (const a of this.world.state.agents) {
      seen.add(a.id);
      let v = this.agentViews.get(a.id);
      if (!v) {
        v = this.createAgentView(a);
        this.agentViews.set(a.id, v);
      }
      v.root.setVisible(!a.hidden);
      if (a.hidden) continue;
      const p = this.agentScreenPos(a);
      const walking = a.path.length > 0;
      v.root.setPosition(p.x, p.y).setDepth(p.depth);
      v.body.y = walking ? -Math.abs(Math.sin(time / 90)) * 3 : 0;
      v.body.setRotation(p.lying ? (a.kind === 'person' ? -1.25 : 0) : 0);
      v.body.x = p.lying && a.kind === 'person' ? 14 : 0;
      if (v.sprite) v.sprite.scaleX = a.facing > 0 ? -1 : 1;
      else v.body.scaleX = a.facing;

      const active = a.id === activeId;
      v.plumbob.setVisible(active);
      v.ring.setVisible(active);
      if (active) {
        v.plumbob.scaleX = Math.cos(time / 300);
        v.plumbob.y = (a.kind === 'person' ? -66 : -46) + Math.sin(time / 400) * 2;
      }
      const cur = a.current;
      const def = cur && ACTIONS[cur.actionId];
      let bubble = '';
      if (def && cur.phase === 'acting' && cur.actionId !== 'idle' && cur.actionId !== 'move') bubble = def.icon;
      else if (Math.min(a.needs.hunger, a.needs.bladder, a.needs.energy) < 15) bubble = '❗';
      v.bubble.setText(bubble);
      v.bubble.y = (a.kind === 'person' ? -54 : -34) + (active ? -26 : 0);
    }
    for (const [id, v] of this.agentViews) {
      if (!seen.has(id)) {
        v.root.destroy();
        this.agentViews.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Bucle
  // ---------------------------------------------------------------------------

  update(time: number, delta: number) {
    const dt = Math.min(delta, 100) / 1000;
    const speed = SPEEDS[this.world.state.speed] ?? 1;
    if (speed > 0) this.world.tick(dt * speed);
    this.syncObjects();
    this.syncAgents(time);
    this.updateNight();
  }

  private updateNight() {
    const h = (this.world.state.minutes % 1440) / 60;
    // 0 de día, hasta 0.38 a medianoche, transiciones al amanecer/anochecer.
    let a = 0;
    if (h < 6) a = 0.38;
    else if (h < 8) a = 0.38 * (1 - (h - 6) / 2);
    else if (h > 22) a = 0.38;
    else if (h > 19) a = 0.38 * ((h - 19) / 3);
    this.night.setFillStyle(0x0b1640, a);
  }

  // ---------------------------------------------------------------------------
  // Entrada táctil: tocar, arrastrar para mover la cámara, pellizcar para zoom
  // ---------------------------------------------------------------------------

  private setupInput() {
    this.input.addPointer(2);
    const cam = this.cameras.main;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointers.set(p.id, { x: p.x, y: p.y });
      if (this.pointers.size === 1) {
        this.dragStart = { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
        this.dragged = false;
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: cam.zoom };
        this.dragged = true;
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.pointers.has(p.id)) return;
      this.pointers.set(p.id, { x: p.x, y: p.y });
      if (this.pointers.size >= 2 && this.pinchStart) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        cam.setZoom(Phaser.Math.Clamp((this.pinchStart.zoom * dist) / this.pinchStart.dist, ZOOM_MIN, ZOOM_MAX));
        return;
      }
      if (this.dragStart) {
        const dx = p.x - this.dragStart.x, dy = p.y - this.dragStart.y;
        if (!this.dragged && Math.hypot(dx, dy) > 10 * DPR) this.dragged = true;
        if (this.dragged) {
          cam.scrollX = this.dragStart.scrollX - dx / cam.zoom;
          cam.scrollY = this.dragStart.scrollY - dy / cam.zoom;
        }
      }
    });

    const up = (p: Phaser.Input.Pointer) => {
      const wasTap = this.pointers.size === 1 && !this.dragged && this.dragStart;
      this.pointers.delete(p.id);
      if (this.pointers.size < 2) this.pinchStart = null;
      if (this.pointers.size === 0) this.dragStart = null;
      else if (this.pointers.size === 1) {
        // Al soltar un dedo del pellizco, seguir arrastrando con el otro sin saltos.
        const [rest] = [...this.pointers.values()];
        this.dragStart = { x: rest.x, y: rest.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
      }
      if (wasTap) this.handleTap(p.worldX, p.worldY);
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), ZOOM_MIN, ZOOM_MAX));
    });
  }

  private handleTap(wx: number, wy: number) {
    // 1) Agentes (lo más cercano al dedo)
    let bestAgent: { a: Agent; d: number } | null = null;
    for (const a of this.world.state.agents) {
      if (a.hidden) continue;
      const p = this.agentScreenPos(a);
      const h = a.kind === 'person' ? 44 : 26;
      const d = Math.hypot(wx - p.x, (wy - (p.y - h / 2)) * 0.8);
      if (d < 26 && (!bestAgent || d < bestAgent.d)) bestAgent = { a, d };
    }
    if (bestAgent) return this.onTap({ kind: 'agent', id: bestAgent.a.id });

    // 2) Objetos (por su caja en pantalla, el de delante gana)
    let bestObj: { o: PlacedObject; depth: number } | null = null;
    for (const o of this.world.state.objects) {
      const d = OBJECTS[o.def];
      const minX = isoToScreen(o.x, o.y + d.h).x, maxX = isoToScreen(o.x + d.w, o.y).x;
      const minY = isoToScreen(o.x, o.y).y - Math.max(d.height, 26) - 6, maxY = isoToScreen(o.x + d.w, o.y + d.h).y;
      if (wx >= minX && wx <= maxX && wy >= minY && wy <= maxY) {
        // Dentro del rectángulo: comprobar que está sobre la huella o encima de ella.
        const t = screenToTile(wx, wy + Math.max(d.height, 20));
        const t0 = screenToTile(wx, wy);
        const over = (q: { x: number; y: number }) => q.x >= o.x - 0 && q.x < o.x + d.w && q.y >= o.y && q.y < o.y + d.h;
        if (!over(t) && !over(t0)) continue;
        const depth = this.objectDepth(o);
        if (!bestObj || depth > bestObj.depth) bestObj = { o, depth };
      }
    }
    if (bestObj) return this.onTap({ kind: 'object', id: bestObj.o.id });

    // 3) Suelo
    const t = screenToTile(wx, wy);
    if (t.x >= 0 && t.y >= 0 && t.x < this.world.lot.w && t.y < this.world.lot.h) {
      this.showMarker(t.x, t.y);
      this.onTap({ kind: 'tile', x: t.x, y: t.y });
    }
  }

  private showMarker(x: number, y: number) {
    const c = tileCenter(x, y);
    const g = this.add.graphics().setDepth(-1e4);
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeEllipse(c.x, c.y, TILE_W * 0.6, TILE_H * 0.6);
    this.tweens.add({ targets: g, alpha: 0, duration: 600, onComplete: () => g.destroy() });
  }
}
