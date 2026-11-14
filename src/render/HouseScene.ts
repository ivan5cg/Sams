import Phaser from 'phaser';
import { ACTIONS } from '../data/actions';
import { OBJECTS } from '../data/objects';
import { SPECIES, lifeStage } from '../data/species';
import type { Agent, PlacedObject, SpeciesId } from '../sim/types';
import type { Target, World } from '../sim/world';
import { TILE_H, TILE_W, isoToScreen, screenToTile, shade, tileCenter } from './iso';

/** Minutos de juego por segundo real para cada velocidad. */
export const SPEEDS = [0, 1, 3, 8];

const FLOOR_COLORS = { wood: 0xc89f6e, tile: 0xdde6eb, grass: 0x7cb95b, door: 0xa67c52, wall: 0xe9e1d4, path: 0xd8c9a3 };
/** Tamaño según la etapa de la vida. */
const STAGE_SCALE: Record<string, number> = { baby: 0.5, child: 0.72, teen: 0.88 };
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
  /** Lo que va delante del animal (barrotes de la jaula). */
  front?: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
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

/** Dibuja la mascota con los pies en (0,0) mirando a la derecha. Devuelve la altura de la cabeza. */
const PET_DRAWINGS: Partial<Record<SpeciesId, (g: Phaser.GameObjects.Graphics) => number>> = {
  capybara: (g) => {
    g.fillStyle(0x6b4423, 1);
    for (const x of [-14, -6, 6, 13]) g.fillRoundedRect(x, -7, 5, 7, 2);
    g.fillStyle(0xa0703c, 1);
    g.fillEllipse(-2, -15, 42, 22);
    g.fillRoundedRect(9, -30, 18, 16, 6);
    g.fillStyle(0x8a5e30, 1);
    g.fillRoundedRect(21, -25, 9, 10, 4);
    g.fillCircle(12, -30, 3);
    g.fillStyle(0x1b1209, 1);
    g.fillCircle(20, -24, 1.8);
    g.fillCircle(28, -21, 1.3);
    return -38;
  },
  guineapig: (g) => {
    g.fillStyle(0xfaf3e6, 1);
    g.fillEllipse(0, -7, 24, 14);
    g.fillStyle(0xe08a3c, 1);
    g.fillEllipse(-6, -9, 11, 10);
    g.fillStyle(0x5a3a22, 1);
    g.fillEllipse(6, -9, 9, 9);
    g.fillStyle(0xf0b8a8, 1);
    g.fillCircle(5, -14, 2.5);
    g.fillStyle(0x111111, 1);
    g.fillCircle(8, -9, 1.5);
    g.fillStyle(0xf7a7b4, 1);
    g.fillCircle(12, -6, 1.2);
    return -18;
  },
  ferret: (g) => {
    g.fillStyle(0x4a3424, 1);
    g.fillEllipse(-19, -7, 14, 5);
    for (const x of [-11, -4, 5, 11]) g.fillRoundedRect(x, -5, 3, 5, 1);
    g.fillStyle(0xe8d8b0, 1);
    g.fillEllipse(0, -8, 32, 10);
    g.fillEllipse(17, -11, 13, 10);
    g.fillStyle(0x6b4a33, 1);
    g.fillEllipse(18, -12, 10, 4);
    g.fillCircle(14, -16, 2.2);
    g.fillStyle(0x111111, 1);
    g.fillCircle(19, -12, 1.4);
    g.fillStyle(0xf2a0a8, 1);
    g.fillCircle(23, -10, 1.2);
    return -22;
  },
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export class HouseScene extends Phaser.Scene {
  private world!: World;
  private onTap!: (t: Target) => void;
  private agentViews = new Map<string, AgentView>();
  private objectViews = new Map<string, ObjectView>();
  private night!: Phaser.GameObjects.Rectangle;
  /** Parcela dibujada ahora mismo y sus gráficos fijos (suelo y paredes). */
  private shownLot = '';
  private lotGraphics: Phaser.GameObjects.Graphics[] = [];
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
    this.shownLot = '';
  }

  /** Cambia la parcela que se ve (al ir al parque, a otra casa o cambiar de personaje). */
  private showLot(lotId: string) {
    for (const v of this.agentViews.values()) v.root.destroy();
    for (const v of this.objectViews.values()) this.destroyObjectView(v);
    this.agentViews.clear();
    this.objectViews.clear();
    for (const g of this.lotGraphics) g.destroy();
    this.lotGraphics = [];
    this.shownLot = lotId;
    this.drawLot();
    this.fitCamera();
  }

  create() {
    this.cameras.main.setBackgroundColor('#3d5a40');
    this.night = this.add.rectangle(0, 0, 10, 10, 0x0b1640, 0).setOrigin(0).setScrollFactor(0).setDepth(1e6);
    this.fitCamera();
    this.scale.on('resize', () => this.fitCamera());
    this.setupInput();
  }

  private fitCamera() {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    // En casa se centra en el edificio; en el parque, en el centro.
    const park = this.world.lotById(this.shownLot || this.world.viewLotId)?.layout === 'park';
    const c = park ? isoToScreen(8, 7) : isoToScreen(5.5, 5.5);
    const cssW = width / DPR, cssH = height / DPR;
    cam.setZoom(Phaser.Math.Clamp(Math.min(cssW / 640, cssH / 520), 0.45, 1.6) * DPR);
    cam.centerOn(c.x, c.y + 10);
    this.night.setSize(width, height);
  }

  // ---------------------------------------------------------------------------
  // Parcela estática
  // ---------------------------------------------------------------------------

  private drawLot() {
    const lot = this.world.lotById(this.shownLot);
    const { tiles, w, h } = this.world.layoutOf(this.shownLot);
    const wallColor = lot.style?.wall ?? FLOOR_COLORS.wall;
    const woodColor = lot.style?.floor ?? FLOOR_COLORS.wood;
    const floor = this.add.graphics().setDepth(-1e5);
    this.lotGraphics.push(floor);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = tiles[y][x];
        if (t === 'wall') continue;
        let color = t === 'wood' ? woodColor : FLOOR_COLORS[t];
        if (t === 'wood') color = shade(color, (x + y) % 2 ? 1 : 0.94);
        if (t === 'path') color = shade(color, (x + y) % 2 ? 1 : 0.95);
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
        this.lotGraphics.push(g);
        this.box(g, x, y, 1, 1, back ? 52 : 12, wallColor);
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
    const depth = this.objectDepth(o);
    const gfx = this.add.graphics().setDepth(depth);
    let front: Phaser.GameObjects.Graphics | undefined;
    const c = isoToScreen(o.x + d.w / 2, o.y + d.h / 2);
    const shape = d.shape ?? 'box';

    switch (shape) {
      case 'box':
        this.box(gfx, o.x + 0.1, o.y + 0.1, d.w - 0.2, d.h - 0.2, d.height, d.color);
        break;
      case 'flat':
        gfx.fillStyle(d.color, 0.8);
        gfx.fillEllipse(c.x, c.y, 36, 16);
        break;
      case 'none':
        gfx.fillStyle(0x000000, 0.2);
        gfx.fillEllipse(c.x, c.y, 26, 12);
        break;
      case 'pond': {
        const pts = [isoToScreen(o.x + 0.15, o.y + 0.15), isoToScreen(o.x + d.w - 0.15, o.y + 0.15), isoToScreen(o.x + d.w - 0.15, o.y + d.h - 0.15), isoToScreen(o.x + 0.15, o.y + d.h - 0.15)];
        gfx.fillStyle(0x8a7a5a, 1);
        gfx.fillPoints(pts.map((p) => ({ x: p.x, y: p.y + 3 })), true);
        gfx.fillStyle(d.color, 1);
        gfx.fillPoints(pts, true);
        gfx.fillStyle(0xffffff, 0.25);
        gfx.fillEllipse(c.x - 10, c.y - 4, 26, 8);
        gfx.fillEllipse(c.x + 14, c.y + 6, 16, 5);
        gfx.setDepth(-1e4); // el agua va a ras de suelo
        break;
      }
      case 'post': {
        this.box(gfx, o.x + 0.15, o.y + 0.15, 0.7, 0.7, 6, 0xb0a090);
        this.box(gfx, o.x + 0.38, o.y + 0.38, 0.24, 0.24, d.height, d.color);
        // plataforma arriba
        const g2 = gfx;
        const A = isoToScreen(o.x + 0.2, o.y + 0.2), B = isoToScreen(o.x + 0.8, o.y + 0.2), C = isoToScreen(o.x + 0.8, o.y + 0.8), D = isoToScreen(o.x + 0.2, o.y + 0.8);
        const up = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - d.height });
        g2.fillStyle(0x9c6b3f, 1);
        g2.fillPoints([up(A), up(B), up(C), up(D)], true);
        break;
      }
      case 'hammock': {
        const p1 = isoToScreen(o.x + 0.15, o.y + 0.5), p2 = isoToScreen(o.x + 0.85, o.y + 0.5);
        gfx.lineStyle(3, 0x6b4a2b, 1);
        gfx.lineBetween(p1.x, p1.y, p1.x, p1.y - d.height);
        gfx.lineBetween(p2.x, p2.y, p2.x, p2.y - d.height);
        gfx.fillStyle(d.color, 1);
        gfx.beginPath();
        gfx.moveTo(p1.x, p1.y - d.height);
        gfx.lineTo(p2.x, p2.y - d.height);
        gfx.lineTo((p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - d.height + 14);
        gfx.closePath();
        gfx.fillPath();
        break;
      }
      case 'bench': {
        const p1 = isoToScreen(o.x + 0.2, o.y + 0.5), p2 = isoToScreen(o.x + 0.8, o.y + 0.5);
        gfx.lineStyle(3, 0x444444, 1);
        gfx.lineBetween(p1.x, p1.y, p1.x, p1.y - d.height);
        gfx.lineBetween(p2.x, p2.y, p2.x, p2.y - d.height);
        this.box(gfx, o.x + 0.1, o.y + 0.3, 0.8, 0.4, 0, d.color);
        const A = isoToScreen(o.x + 0.1, o.y + 0.3), B = isoToScreen(o.x + 0.9, o.y + 0.3);
        gfx.fillStyle(shade(d.color, 0.8), 1);
        gfx.fillPoints([{ x: A.x, y: A.y - d.height }, { x: B.x, y: B.y - d.height }, { x: B.x, y: B.y - d.height - 12 }, { x: A.x, y: A.y - d.height - 12 }], true);
        const up = (q: { x: number; y: number }) => ({ x: q.x, y: q.y - d.height });
        gfx.fillStyle(d.color, 1);
        gfx.fillPoints([isoToScreen(o.x + 0.1, o.y + 0.3), isoToScreen(o.x + 0.9, o.y + 0.3), isoToScreen(o.x + 0.9, o.y + 0.7), isoToScreen(o.x + 0.1, o.y + 0.7)].map(up), true);
        break;
      }
      case 'swings': {
        const a1 = isoToScreen(o.x + 0.1, o.y + 0.5), a2 = isoToScreen(o.x + d.w - 0.1, o.y + 0.5);
        gfx.lineStyle(4, d.color, 1);
        gfx.lineBetween(a1.x - 6, a1.y, a1.x, a1.y - d.height);
        gfx.lineBetween(a1.x + 6, a1.y + 3, a1.x, a1.y - d.height);
        gfx.lineBetween(a2.x - 6, a2.y, a2.x, a2.y - d.height);
        gfx.lineBetween(a2.x + 6, a2.y + 3, a2.x, a2.y - d.height);
        gfx.lineBetween(a1.x, a1.y - d.height, a2.x, a2.y - d.height);
        gfx.lineStyle(1.5, 0x555555, 1);
        for (const f of [0.33, 0.67]) {
          const top = { x: a1.x + (a2.x - a1.x) * f, y: a1.y + (a2.y - a1.y) * f - d.height };
          gfx.lineBetween(top.x - 4, top.y, top.x - 4, top.y + d.height - 12);
          gfx.lineBetween(top.x + 4, top.y, top.x + 4, top.y + d.height - 12);
          gfx.fillStyle(0x333333, 1);
          gfx.fillRect(top.x - 6, top.y + d.height - 13, 12, 3);
        }
        break;
      }
      case 'cage': {
        // Bandeja con serrín; los barrotes se dibujan delante del animal.
        this.box(gfx, o.x + 0.05, o.y + 0.05, d.w - 0.1, d.h - 0.1, 7, d.color);
        this.box(gfx, o.x + 0.12, o.y + 0.12, d.w - 0.24, d.h - 0.24, 0, 0xe9d8a6);
        // casita
        this.box(gfx, o.x + d.w - 0.6, o.y + 0.25, 0.45, 0.5, 9, 0xd98c4a);
        front = this.add.graphics().setDepth(depth + 3);
        const A = isoToScreen(o.x + 0.05, o.y + 0.05), B = isoToScreen(o.x + d.w - 0.05, o.y + 0.05), C = isoToScreen(o.x + d.w - 0.05, o.y + d.h - 0.05), D = isoToScreen(o.x + 0.05, o.y + d.h - 0.05);
        const H = d.height;
        front.lineStyle(1.2, 0xdde3ea, 0.75);
        const bars = (p: { x: number; y: number }, q: { x: number; y: number }, n: number) => {
          for (let i = 0; i <= n; i++) {
            const x = p.x + ((q.x - p.x) * i) / n, y = p.y + ((q.y - p.y) * i) / n;
            front!.lineBetween(x, y - 7, x, y - 7 - (H - 7));
          }
        };
        bars(D, C, 12);
        bars(C, B, 5);
        front.lineStyle(1.5, 0xdde3ea, 0.9);
        front.strokePoints([A, B, C, D].map((p) => ({ x: p.x, y: p.y - H })), true);
        break;
      }
    }

    const big = o.def === 'tree';
    const icon = this.add
      .text(c.x, c.y - d.height - (big ? 4 : 2), d.icon, { resolution: TEXT_RES, fontSize: big ? '52px' : d.small ? '18px' : '26px' })
      .setOrigin(0.5, big ? 0.95 : 0.8)
      .setDepth(depth + 0.5);
    let badge: Phaser.GameObjects.Text | undefined;
    if (d.maxStock || d.maxDirt) {
      badge = this.add
        .text(c.x, c.y - Math.max(d.height, 10) - 30, '', { resolution: TEXT_RES, fontSize: '13px', fontFamily: 'system-ui, sans-serif', color: '#fff', backgroundColor: '#c0392b', padding: { x: 4, y: 1 } })
        .setOrigin(0.5)
        .setDepth(1e5);
    }
    return { gfx, icon, badge, front, x: o.x, y: o.y };
  }

  private destroyObjectView(v: ObjectView) {
    v.gfx.destroy();
    v.icon.destroy();
    v.badge?.destroy();
    v.front?.destroy();
  }

  private syncObjects() {
    const seen = new Set<string>();
    for (const o of this.world.objectsIn(this.shownLot)) {
      seen.add(o.id);
      let v = this.objectViews.get(o.id);
      // Los objetos pueden cambiar de sitio (el hurón los esconde).
      if (v && (v.x !== o.x || v.y !== o.y)) {
        this.destroyObjectView(v);
        v = undefined;
      }
      if (!v) {
        v = this.createObjectView(o);
        this.objectViews.set(o.id, v);
      }
      if (v.badge) {
        const d = OBJECTS[o.def];
        const empty = d.maxStock !== undefined && !o.stock;
        const dirty = d.maxDirt !== undefined && (o.dirt ?? 0) >= Math.ceil(d.maxDirt / 2);
        v.badge.setVisible(empty || dirty).setText(dirty ? (empty ? 'Sucio y vacío' : '¡Sucio! 🪰') : '¡Vacío!');
        v.badge.setBackgroundColor(dirty ? '#7a5230' : '#c0392b');
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
    } else if (PET_DRAWINGS[a.species]) {
      // Especies sin emoji: dibujadas a mano, mirando a la derecha.
      const g = this.add.graphics();
      headY = PET_DRAWINGS[a.species]!(g);
      body.add(g);
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
    // Vive en una jaula: siempre dentro, en un sitio u otro según lo que haga.
    const home = this.world.object(a.home);
    if (home) {
      const d = OBJECTS[home.def];
      const act = t?.phase === 'acting' ? t.actionId : '';
      let fx = 0.3;
      if (act === 'cage_sleep') fx = 0.78;
      else if (act === 'cage_run') fx = 0.5 + Math.sin(this.time.now / 400) * 0.3;
      else if (act === 'cage_pee') fx = 0.55;
      const p = isoToScreen(home.x + 0.15 + fx * (d.w - 0.3), home.y + d.h / 2);
      return { x: p.x, y: p.y - 5, depth: this.objectDepth(home) + 2, lying: false };
    }
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
        const lift = d.shape === 'post' ? d.height : d.shape === 'hammock' ? d.height - 10 : d.shape === 'pond' ? -6 : d.shape === 'swings' ? 10 : d.height * 0.6;
        const depth = d.shape === 'pond' ? (cx + cy) * 10 : this.objectDepth(o) + 2;
        return { x: p.x, y: p.y - lift, depth, lying };
      }
    }
    const p = tileCenter(a.pos.x, a.pos.y);
    return { x: p.x, y: p.y, depth: (a.pos.x + a.pos.y) * 10 + 7, lying: t?.actionId === 'pass_out' };
  }

  private syncAgents(time: number) {
    const seen = new Set<string>();
    const activeId = this.world.state.activeAgentId;
    for (const a of this.world.agentsIn(this.shownLot)) {
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
      const dancing = a.current?.actionId === 'war_dance' && a.current.phase === 'acting';
      v.body.y = dancing ? -Math.abs(Math.sin(time / 70)) * 10 : walking ? -Math.abs(Math.sin(time / 90)) * 3 : 0;
      v.body.setRotation(dancing ? Math.sin(time / 60) * 0.5 : p.lying ? (a.kind === 'person' ? -1.25 : 0) : 0);
      v.body.x = p.lying && a.kind === 'person' ? 14 : 0;
      const size = STAGE_SCALE[lifeStage(a.species, a.ageDays).id] ?? 1;
      v.body.scaleY = size;
      if (v.sprite) {
        v.sprite.scaleX = a.facing > 0 ? -1 : 1;
        v.body.scaleX = size;
      } else v.body.scaleX = a.facing * size;

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
    if (this.world.viewLotId !== this.shownLot) this.showLot(this.world.viewLotId);
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
    for (const a of this.world.agentsIn(this.shownLot)) {
      if (a.hidden) continue;
      const p = this.agentScreenPos(a);
      const h = a.kind === 'person' ? 44 : 26;
      const d = Math.hypot(wx - p.x, (wy - (p.y - h / 2)) * 0.8);
      if (d < 26 && (!bestAgent || d < bestAgent.d)) bestAgent = { a, d };
    }
    if (bestAgent) return this.onTap({ kind: 'agent', id: bestAgent.a.id });

    // 2) Objetos (por su caja en pantalla, el de delante gana)
    let bestObj: { o: PlacedObject; depth: number } | null = null;
    for (const o of this.world.objectsIn(this.shownLot)) {
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
    const layout = this.world.layoutOf(this.shownLot);
    if (t.x >= 0 && t.y >= 0 && t.x < layout.w && t.y < layout.h) {
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
