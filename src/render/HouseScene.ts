import Phaser from 'phaser';
import { ACTIONS } from '../data/actions';
import { OBJECTS } from '../data/objects';
import { lifeStage } from '../data/species';
import type { Agent, PlacedObject } from '../sim/types';
import type { Target, World } from '../sim/world';
import { ACTION_LINES, ACTION_QUIPS, NEED_THOUGHTS, PET_SOUNDS } from '../data/dialogue';
import { chatPair, traitQuip } from '../sim/chatter';
import { fresh, vary } from '../sim/phrases';
import { NEED_KEYS } from '../sim/types';
import { drawSurroundings, skyAt } from './scenery';
import { IS_WEBGL, glyph, webglWanted } from './gfx';
import { P, SCREEN_GLOW, drawObjectArt, drawTile, drawWall, faceQuad, flat, prism, type LotStyle } from './art';
import { SceneFx, type FxKind } from './fx';
import { PET_ART, drawAccessory, drawBackHead, drawBaby, drawFace, drawLeg, drawPersonBody, drawProp, personLook, petColor, type Expression, type PersonLook } from './characters';
import { hasEmotion } from '../sim/emotions';
import { moodScore } from '../sim/world';
import { TILE_H, TILE_W, isoToScreen, screenToTile, shade, tileCenter } from './iso';

/** Minutos de juego por segundo real para cada velocidad. */
export const SPEEDS = [0, 1, 3, 8];

const DEFAULT_STYLE: LotStyle = { wall: 0xe9e1d4, floor: 0xc89f6e };
/** Tamaño según la etapa de la vida. */
const STAGE_SCALE: Record<string, number> = { baby: 0.5, child: 0.72, teen: 0.88 };
const NIGHT_MAX = 0.42;

/** Partículas que acompañan a cada acción (y cada cuántos ms sale una). */
const ACTION_FX: Record<string, { kind: FxKind; every: number }> = {
  cook: { kind: 'steam', every: 500 },
  fart: { kind: 'gas', every: 200 },
  sing: { kind: 'notes', every: 350 },
  rap: { kind: 'notes', every: 300 },
  play_accordion: { kind: 'notes', every: 600 },
  chotis: { kind: 'notes', every: 500 },
  tragaperras: { kind: 'stars', every: 500 },
  vomit: { kind: 'drops', every: 150 },
  play_mus: { kind: 'stars', every: 1600 },
  sleep: { kind: 'zzz', every: 900 },
  nap_sofa: { kind: 'zzz', every: 900 },
  nap_bed: { kind: 'zzz', every: 900 },
  pet_sleep: { kind: 'zzz', every: 900 },
  cage_sleep: { kind: 'zzz', every: 1100 },
  capy_sleep: { kind: 'zzz', every: 1000 },
  ferret_sleep: { kind: 'zzz', every: 1000 },
  sleep_post: { kind: 'zzz', every: 1000 },
  cat_nap: { kind: 'zzz', every: 1000 },
  baby_sleep: { kind: 'zzz', every: 1100 },
  dance: { kind: 'notes', every: 550 },
  listen_music: { kind: 'notes', every: 800 },
  play_guitar: { kind: 'notes', every: 600 },
  busk: { kind: 'notes', every: 600 },
  flirt: { kind: 'hearts', every: 700 },
  kiss: { kind: 'hearts', every: 300 },
  niqui: { kind: 'hearts', every: 350 },
  hug: { kind: 'hearts', every: 450 },
  ask_partner: { kind: 'hearts', every: 400 },
  propose: { kind: 'hearts', every: 300 },
  move_in: { kind: 'hearts', every: 500 },
  try_baby: { kind: 'hearts', every: 400 },
  pet_animal: { kind: 'hearts', every: 800 },
  beg_affection: { kind: 'hearts', every: 800 },
  cuddle_capy: { kind: 'hearts', every: 900 },
  rock_baby: { kind: 'hearts', every: 900 },
  shower: { kind: 'drops', every: 120 },
  bath: { kind: 'drops', every: 300 },
  bathe_pet: { kind: 'drops', every: 200 },
  swim: { kind: 'drops', every: 400 },
  clean: { kind: 'drops', every: 300 },
  clean_cage: { kind: 'drops', every: 350 },
  clean_litter: { kind: 'drops', every: 350 },
  repair: { kind: 'sparks', every: 250 },
  insult: { kind: 'angry', every: 600 },
  pass_out: { kind: 'stars', every: 400 },
  run: { kind: 'sweat', every: 350 },
  reformer: { kind: 'sweat', every: 700 },
  pilates: { kind: 'sweat', every: 900 },
  paint: { kind: 'paint', every: 450 },
};
const EATING = new Set(['eat', 'snack', 'cook', 'pet_eat', 'cage_eat', 'buy_hotdog']);
const WAGGING = new Set(['beg_affection', 'play_with_person']);

interface AgentView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  legs?: [Phaser.GameObjects.Graphics, Phaser.GameObjects.Graphics];
  bubble: Phaser.GameObjects.Image;
  bubbleKey?: string;
  bubbleBg: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  plumbob: Phaser.GameObjects.Graphics;
  ring: Phaser.GameObjects.Graphics;
  headY: number;
  /** Si cambia (crece, cambia de etapa), se vuelve a dibujar. */
  key: string;
  /** Personas: cara (expresión), cabeza de espaldas y lo que lleva en la mano. */
  look?: PersonLook;
  face?: Phaser.GameObjects.Graphics;
  backHead?: Phaser.GameObjects.Graphics;
  prop?: Phaser.GameObjects.Graphics;
  faceKey?: string;
  propKey?: string;
  lastY?: number;
  back?: boolean;
}

/** Lo que lleva en la mano mientras hace cada cosa. */
const PROPS: Record<string, string> = {
  cook: 'pan', browse: 'phone', whatsapp: 'phone', order_glovo: 'phone', order_groceries: 'phone', selfie: 'phone', find_job: 'phone',
  read: 'book', homework: 'book', cana: 'beer', vermut: 'beer', drink_beer: 'beer', chupito: 'beer', smoothie: 'cup', churros: 'cup',
  paint: 'brush', play_mus: 'cards', sing: 'mic', rap: 'mic',
};
/** Acciones en las que se está sentado. */
const SITTING = new Set(['sit', 'sit_bench', 'watch_tv', 'play_games', 'toilet', 'play_mus', 'watch_football']);

interface ObjectView {
  gfx: Phaser.GameObjects.Graphics;
  /** Lo que va por delante de quien lo usa (manta, barrotes, agua). */
  front: Phaser.GameObjects.Graphics;
  icon?: Phaser.GameObjects.Image;
  badge?: Phaser.GameObjects.Text;
  glow?: Phaser.GameObjects.Graphics;
  /** Brillo de pantalla que parpadea cuando se usa. */
  screen?: Phaser.GameObjects.Graphics;
  key: string;
}

export interface SceneHooks {
  world: World;
  onTap: (target: Target, tile: { x: number; y: number }) => void;
}

/**
 * Densidad de píxeles: el canvas se dibuja a la resolución real de la pantalla
 * (ver main.ts) y la cámara se amplía en la misma proporción.
 */
export const DPR = Math.min(window.devicePixelRatio || 1, 2.5);
/** Los textos se rasterizan a más resolución para que no se vean borrosos con zoom. */
// En WebGL los textos van a menos resolución (texturas más pequeñas, más compatibles).
const TEXT_RES = webglWanted() ? Math.min(2, DPR) : Math.min(4, DPR * 1.5);
const ZOOM_MIN = 0.4 * DPR;
const ZOOM_MAX = 2.5 * DPR;

/** Ventanas y espejos de las paredes del fondo, según el plano. */
function wallDeco(layout: string, x: number, y: number): { face: 'L' | 'R'; kind: 'window' | 'mirror' | 'stripe' | 'tunnel'; color?: number } | undefined {
  if (layout === 'super') {
    if (y === 0) return { face: 'L', kind: 'stripe', color: 0x2e8b57 };
    if (x === 0) return y % 3 === 1 ? { face: 'R', kind: 'window' } : { face: 'R', kind: 'stripe', color: 0x2e8b57 };
  }
  if (layout === 'metro') {
    if (y === 0) return { face: 'L', kind: 'tunnel', color: x % 2 ? 0xe63946 : 0x0074c8 };
    if (x === 0) return { face: 'R', kind: 'stripe', color: 0x0074c8 };
  }
  if (layout === 'bar') {
    if (y === 0) return x % 4 === 2 ? { face: 'L', kind: 'window' } : { face: 'L', kind: 'stripe', color: 0x8b2e3c };
    if (x === 0) return { face: 'R', kind: 'stripe', color: 0x8b2e3c };
  }
  if (layout === 'acai') {
    if (y === 0) return x % 3 === 0 ? { face: 'L', kind: 'window' } : { face: 'L', kind: 'stripe', color: 0x7b4fd0 };
    if (x === 0) return { face: 'R', kind: 'stripe', color: 0x7b4fd0 };
  }
  if (layout === 'house') {
    if (y === 0 && (x === 2 || x === 7)) return { face: 'L', kind: 'window' };
    if (x === 0 && y === 7) return { face: 'R', kind: 'window' };
  }
  if (layout === 'studio') {
    if (y === 0 && x >= 2 && x <= 9 && x !== 10) return { face: 'L', kind: 'mirror' };
    if (x === 0 && (y === 3 || y === 6)) return { face: 'R', kind: 'window' };
  }
  return undefined;
}

type AdvancedScene = { grade?: { saturate: (v: number, multiply?: boolean) => unknown; reset: () => unknown } };

export class HouseScene extends Phaser.Scene {
  private world!: World;
  private onTap!: (t: Target, tile: { x: number; y: number }) => void;
  private ghostGfx?: Phaser.GameObjects.Graphics;
  private ghostKey = '';
  private agentViews = new Map<string, AgentView>();
  private objectViews = new Map<string, ObjectView>();
  private night!: Phaser.GameObjects.Rectangle;
  /** Luces que se encienden de noche (ventanas, lámparas). */
  private glows: Phaser.GameObjects.Graphics[] = [];
  private nightLevel = 0;
  private skyHex = '';
  private fx!: SceneFx;
  /** Conversaciones automáticas en curso (por quien la empezó). */
  private convo = new Map<string, { pair: string[]; step: number; next: number }>();
  /** Próximo momento en que cada personaje puede soltar un efecto, un pensamiento o un comentario. */
  private nextFx = new Map<string, number>();
  private nextTalk = new Map<string, number>();
  /** Frases que llegan de la simulación, con la hora a la que mostrarlas. */
  private pendingSpeech: { agentId: string; text: string; kind: 'say' | 'think'; at: number }[] = [];
  /** Parcela dibujada ahora mismo y sus gráficos fijos (suelo y paredes). */
  private shownLot = '';
  private lotGraphics: (Phaser.GameObjects.Graphics | Phaser.GameObjects.RenderTexture)[] = [];
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

  /** Efectos que solo existen en modo avanzado (WebGL): resplandor de luces, viñeta y color. */
  private grade?: { saturate: (v: number, multiply?: boolean) => unknown; reset: () => unknown };
  private setupWebglFx() {
    if (!IS_WEBGL) return;
    try {
      const fx = this.cameras.main.postFX;
      // Sin bloom: el de Phaser oscurece toda la imagen. Viñeta suave y algo más de color.
      fx.addVignette(0.5, 0.5, 0.98, 0.12);
      this.grade = fx.addColorMatrix() as unknown as AdvancedScene['grade'];
      this.grade?.saturate(0.15);
    } catch {
      /* sin efectos: se ve igual que en normal */
    }
  }

  /** Si el móvil pierde los gráficos (al volver a la app), se vuelve a dibujar todo. */
  rebuildAfterContextLoss() {
    const lot = this.shownLot;
    this.shownLot = '';
    if (lot) this.showLot(lot);
  }

  /** Convierte gráficos fijos en una sola imagen. Si algo falla, se quedan como gráficos. */
  private bake(gs: Phaser.GameObjects.Graphics[], b: { minX: number; maxX: number; minY: number; maxY: number }, depth: number) {
    try {
      const res = Phaser.Math.Clamp(this.cameras.main.zoom, 1, IS_WEBGL ? 2.5 : 1.5);
      const W = Math.ceil((b.maxX - b.minX) * res), H = Math.ceil((b.maxY - b.minY) * res);
      if (W > 4096 || H > 4096) return;
      const rt = this.add.renderTexture(b.minX, b.minY, W, H).setOrigin(0, 0).setScale(1 / res).setDepth(depth);
      for (const g of gs) {
        g.setScale(res);
        rt.draw(g, -b.minX * res, -b.minY * res);
      }
      for (const g of gs) {
        g.destroy();
        this.lotGraphics = this.lotGraphics.filter((x) => x !== g);
      }
      this.lotGraphics.push(rt);
    } catch {
      for (const g of gs) g.setScale(1);
    }
  }

  /** Lo que obliga a redibujar la parcela: la estación y el tamaño de la casa. */
  private shownKey = '';
  private lotKey() {
    return `${this.world.season}:${this.world.lotById(this.shownLot)?.size ?? 1}`;
  }
  /** Adornos de los eventos (guirnaldas de la verbena). */
  private eventDeco: Phaser.GameObjects.Graphics[] = [];
  private eventKey = '';

  private syncEventDeco() {
    const verbena = this.world.hasEvent('verbena', this.shownLot) && this.world.lotById(this.shownLot)?.kind === 'park';
    const key = `${verbena}:${this.shownLot}`;
    if (key === this.eventKey) return;
    this.eventKey = key;
    for (const g of this.eventDeco) g.destroy();
    this.eventDeco = [];
    if (!verbena) return;
    // Guirnaldas de bombillas sobre los caminos del parque
    const lines = this.add.graphics().setDepth(5e4);
    const bulbs = this.add.graphics().setDepth(1e6 + 2).setBlendMode(Phaser.BlendModes.ADD);
    const cols = [0xff5d5d, 0xffd23f, 0x5df2ff, 0x8ac926, 0xff5dc8];
    const strings: [number, number, number, number][] = [[0.5, 6.5, 15.5, 6.5], [7.5, 0.5, 7.5, 13.5], [0.5, 8.5, 15.5, 8.5], [9.5, 0.5, 9.5, 13.5]];
    for (const [x0, y0, x1, y1] of strings) {
      const n = 14;
      let prev: { x: number; y: number } | undefined;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const sag = Math.sin(t * Math.PI * 4) * 4;
        const p = P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 46 - Math.abs(sag));
        if (prev) {
          lines.lineStyle(1.2, 0x333333, 0.8);
          lines.lineBetween(prev.x, prev.y, p.x, p.y);
        }
        prev = p;
        const c = cols[i % cols.length];
        lines.fillStyle(c, 1);
        lines.fillCircle(p.x, p.y + 2, 2.2);
        bulbs.fillStyle(c, 0.35);
        bulbs.fillCircle(p.x, p.y + 2, 7);
      }
    }
    bulbs.setAlpha(Math.max(0.3, this.nightLevel));
    this.glows.push(bulbs);
    this.eventDeco.push(lines, bulbs);
  }

  /** Cambia la parcela que se ve (al ir al parque, a otra casa o cambiar de personaje). */
  private showLot(lotId: string) {
    for (const v of this.agentViews.values()) v.root.destroy();
    for (const v of this.objectViews.values()) this.destroyObjectView(v);
    this.agentViews.clear();
    this.objectViews.clear();
    for (const g of this.lotGraphics) g.destroy();
    this.lotGraphics = [];
    this.glows = [];
    for (const g of this.eventDeco) g.destroy();
    this.eventDeco = [];
    this.eventKey = '';
    this.fx?.clearAll();
    this.convo.clear();
    this.pendingSpeech = [];
    this.shownLot = lotId;
    this.fitCamera();
    this.drawLot();
    this.cameras.main.fadeIn(280, 20, 24, 36);
  }

  create() {
    this.cameras.main.setBackgroundColor('#2f4a35');
    this.fx = new SceneFx(this);
    this.night = this.add.rectangle(0, 0, 10, 10, 0x0b1640, 0).setOrigin(0).setScrollFactor(0).setDepth(1e6);
    this.fitCamera();
    this.scale.on('resize', () => this.fitCamera());
    this.setupWebglFx();
    this.setupInput();
  }

  private fitCamera() {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    // En casa se centra en el edificio; en el parque, en el centro.
    const layout = this.world.lotById(this.shownLot || this.world.viewLotId)?.layout;
    const lay = this.world.layoutOf(this.shownLot || this.world.viewLotId);
    // Las tiendas y el estudio: centrados y que quepan casi enteros a lo ancho.
    const big = layout === 'house' && lay.w > 14;
    const venue = (layout !== 'park' && layout !== 'house') || big;
    const c = layout === 'park' ? isoToScreen(8, 7) : layout === 'house' ? isoToScreen(lay.w / 2 - 1.5, lay.h / 2 - 0.5) : isoToScreen(lay.w / 2, lay.h / 2);
    const cssW = width / DPR, cssH = height / DPR;
    const fitW = venue ? Math.max(640, ((lay.w + lay.h) * TILE_W) / 2 * 0.9) : 640;
    const zoom = Phaser.Math.Clamp(Math.min(cssW / fitW, cssH / 520), 0.45, 1.6);
    cam.setZoom(zoom * DPR);
    // El panel de abajo tapa parte de la pantalla: en las tiendas se sube un poco el dibujo.
    cam.centerOn(c.x, c.y + (venue ? Math.min(110, (cssH * 0.14) / zoom) : 10));
    this.night.setSize(width, height);
  }

  // ---------------------------------------------------------------------------
  // Parcela estática: alrededores, suelo y paredes
  // ---------------------------------------------------------------------------

  private drawLot() {
    const lot = this.world.lotById(this.shownLot);
    const layout = this.world.layoutOf(this.shownLot);
    const { tiles, w, h } = layout;
    const season = this.world.seasonDef;
    const style: LotStyle = { wall: lot.style?.wall ?? DEFAULT_STYLE.wall, floor: lot.style?.floor ?? DEFAULT_STYLE.floor, grass: season.grass, snow: season.id === 'invierno' };
    this.shownKey = this.lotKey();

    // Suelo de alrededor y, delante de las casas y el estudio, acera y calle (barato: no se hornea).
    const ground = this.add.graphics().setDepth(-3e5);
    this.lotGraphics.push(ground);
    // Detrás de los edificios se ve el cielo (el suelo empieza justo detrás de ellos).
    flat(ground, { x: -7.5, y: -7.5, w: w + 40, h: h + 40 }, 0, lot.layout === 'metro' ? 0x2b2f38 : shade(season.grass, 0.78));
    if (lot.layout !== 'park' && lot.layout !== 'metro') {
      flat(ground, { x: -7.5, y: h, w: w + 40, h: 0.55 }, 0, 0xcfc9bc);
      flat(ground, { x: -7.5, y: h + 0.55, w: w + 40, h: 1.9 }, 0, 0x4d525b);
      for (let x = -7.5; x < w + 32; x += 1.4) flat(ground, { x, y: h + 1.45, w: 0.7, h: 0.1 }, 0, 0xf2e6a6);
      flat(ground, { x: -7.5, y: h + 2.45, w: w + 40, h: 0.55 }, 0, 0xcfc9bc);
    }
    // Decorado: edificios, árboles, farolas y coches (se hornea con el suelo de la parcela).
    const around = this.add.graphics().setDepth(-2e5);
    const lampGlow = this.add.graphics().setDepth(1e6 + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.nightLevel);
    this.lotGraphics.push(around, lampGlow);
    this.glows.push(lampGlow);
    drawSurroundings(around, lampGlow, lot, layout, season.id);
    // Sombra suave alrededor de la parcela
    around.fillStyle(0x000000, 0.08);
    around.fillPoints([P(-0.3, -0.3), P(w + 0.3, -0.3), P(w + 0.3, h + 0.3), P(-0.3, h + 0.3)], true);

    const floor = this.add.graphics().setDepth(-1e5);
    this.lotGraphics.push(floor);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (tiles[y][x] !== 'wall') drawTile(floor, tiles[y][x], x, y, style);
    // Sombra suave junto a las paredes (da sensación de volumen)
    for (let y = 1; y < h; y++) {
      for (let x = 1; x < w; x++) {
        const t = tiles[y][x];
        if (t === 'wall' || t === 'grass' || t === 'path') continue;
        if (tiles[y - 1][x] === 'wall') {
          flat(floor, { x, y, w: 1, h: 0.3 }, 0, 0x000000, 0.1);
          flat(floor, { x, y, w: 1, h: 0.12 }, 0, 0x000000, 0.08);
        }
        if (tiles[y][x - 1] === 'wall') {
          flat(floor, { x, y, w: 0.3, h: 1 }, 0, 0x000000, 0.1);
          flat(floor, { x, y, w: 0.12, h: 1 }, 0, 0x000000, 0.08);
        }
      }
    }
    // Todo lo fijo de abajo, a una imagen (así el móvil no lo repinta en cada fotograma).
    const a0 = P(-9, h + 5), a1 = P(w + 9, -9), top = P(-9, -9), bot = P(w + 9, h + 5);
    this.bake([around, floor], { minX: a0.x, maxX: a1.x, minY: top.y - 240, maxY: bot.y + 20 }, -1e5);

    // Paredes: altas al fondo, bajas delante (vista recortada para ver el interior).
    const windowsGlow = this.add.graphics().setDepth(1e6 + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.lotGraphics.push(windowsGlow);
    this.glows.push(windowsGlow);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (tiles[y][x] !== 'wall') continue;
        const back = x === 0 || y === 0;
        const g = this.add.graphics().setDepth((x + y) * 10 + 9);
        this.lotGraphics.push(g);
        const deco = back ? wallDeco(lot.layout, x, y) : undefined;
        drawWall(g, x, y, back ? 56 : 12, style.wall, deco);
        if (deco?.kind === 'window') faceQuad(windowsGlow, { x, y, w: 1, h: 1 }, deco.face, 0.24, 0.76, 21, 41, 0xffc56b, 0.9);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Objetos
  // ---------------------------------------------------------------------------

  private objectDepth(o: PlacedObject) {
    const d = OBJECTS[o.def];
    return (o.x + d.w - 1 + o.y + d.h - 1) * 10 + (d.walkable ? 1 : 6);
  }

  /** Lo que cambia el dibujo de un objeto: sitio, si tiene comida, si está sucio o roto. */
  private objKey(o: PlacedObject) {
    return `${o.x},${o.y},${(o.stock ?? 0) > 0},${(o.dirt ?? 0) >= 2},${!!o.broken},${o.q ?? 2}`;
  }

  private createObjectView(o: PlacedObject): ObjectView {
    const d = OBJECTS[o.def];
    const depth = this.objectDepth(o);
    const gfx = this.add.graphics().setDepth(o.def === 'pond' ? -1e4 : depth);
    const front = this.add.graphics().setDepth(depth + 3);
    let icon: Phaser.GameObjects.Image | undefined;
    if (!drawObjectArt(gfx, front, o)) {
      // Por si algún objeto no tiene dibujo propio: una caja con su icono.
      prism(gfx, { x: o.x + 0.1, y: o.y + 0.1, w: d.w - 0.2, h: d.h - 0.2 }, 0, d.height, d.color);
      const c = isoToScreen(o.x + d.w / 2, o.y + d.h / 2);
      if (d.icon) icon = this.add.image(c.x, c.y - d.height, glyph(this, d.icon)).setDisplaySize(24, 24).setOrigin(0.5, 0.8).setDepth(depth + 0.5);
    }
    if (o.q === 3) {
      // Lo de lujo lleva un ribete dorado y brilla un poco.
      const r = { x: o.x + 0.04, y: o.y + 0.04, w: d.w - 0.08, h: d.h - 0.08 };
      faceQuad(front, r, 'L', 0, 1, 0, 2.5, 0xe6b422);
      faceQuad(front, r, 'R', 0, 1, 0, 2.5, 0xc9971a);
      const t = P(o.x + d.w * 0.8, o.y + d.h * 0.2, Math.max(d.height, 8) + 6);
      front.fillStyle(0xffe27a, 1);
      front.fillPoints([{ x: t.x, y: t.y - 5 }, { x: t.x + 1.4, y: t.y - 1.4 }, { x: t.x + 5, y: t.y }, { x: t.x + 1.4, y: t.y + 1.4 }, { x: t.x, y: t.y + 5 }, { x: t.x - 1.4, y: t.y + 1.4 }, { x: t.x - 5, y: t.y }, { x: t.x - 1.4, y: t.y - 1.4 }], true);
    } else if (o.q === 1) {
      // Lo básico: un parche de cinta americana.
      const p = P(o.x + d.w * 0.35, o.y + d.h * 0.85, Math.min(d.height, 12) * 0.5);
      front.fillStyle(0xb8b8b8, 0.9);
      front.fillRect(p.x - 4, p.y - 2, 8, 4);
    }
    const c = isoToScreen(o.x + d.w / 2, o.y + d.h / 2);
    let badge: Phaser.GameObjects.Text | undefined;
    if (d.maxStock || d.maxDirt || d.breakable) {
      badge = this.add
        .text(c.x, c.y - Math.max(d.height, 10) - 30, '', { resolution: TEXT_RES, fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: '#fff', backgroundColor: '#c0392b', padding: { x: 5, y: 2 } })
        .setOrigin(0.5)
        .setDepth(1e5);
    }
    let glow: Phaser.GameObjects.Graphics | undefined;
    if (o.def === 'lamp' || o.def === 'neon_sign') {
      glow = this.add.graphics().setDepth(1e6 + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.nightLevel);
      const top = P(o.x + 0.5, o.y + 0.5, o.def === 'lamp' ? 38 : 30);
      const tone = o.def === 'lamp' ? 0xffc56b : 0xff5dc8;
      for (const [r, a] of [[46, 0.06], [30, 0.1], [16, 0.18]] as const) {
        glow.fillStyle(tone, a);
        glow.fillCircle(top.x, top.y, r);
      }
      const base = P(o.x + 0.5, o.y + 0.5);
      glow.fillStyle(0xffc56b, 0.1);
      glow.fillEllipse(base.x, base.y, 80, 36);
      this.glows.push(glow);
    }
    let screen: Phaser.GameObjects.Graphics | undefined;
    if (SCREEN_GLOW[o.def] && !o.broken) {
      screen = this.add.graphics().setDepth(depth + 0.5).setAlpha(0);
      SCREEN_GLOW[o.def](screen, o.x, o.y);
    }
    return { gfx, front, icon, badge, glow, screen, key: this.objKey(o) };
  }

  private destroyObjectView(v: ObjectView) {
    v.gfx.destroy();
    v.front.destroy();
    v.screen?.destroy();
    v.icon?.destroy();
    v.badge?.destroy();
    if (v.glow) {
      this.glows = this.glows.filter((g) => g !== v.glow);
      v.glow.destroy();
    }
  }

  private syncObjects() {
    const seen = new Set<string>();
    for (const o of this.world.objectsIn(this.shownLot)) {
      seen.add(o.id);
      let v = this.objectViews.get(o.id);
      // Se vuelve a dibujar si cambia (el hurón lo esconde, se vacía, se ensucia...).
      if (v && v.key !== this.objKey(o)) {
        this.destroyObjectView(v);
        v = undefined;
      }
      if (!v) {
        v = this.createObjectView(o);
        this.objectViews.set(o.id, v);
      }
      if (v.screen) {
        const watching =
          o.def === 'tv'
            ? this.world.agentsIn(this.shownLot).some((a) => a.current?.actionId === 'watch_tv' && a.current.phase === 'acting')
            : this.world.usersOf(o.id).some((a) => a.current?.phase === 'acting');
        v.screen.setAlpha(watching ? 0.25 + 0.35 * Math.abs(Math.sin(this.time.now / 140 + o.x)) : 0);
      }
      if (v.badge) {
        const d = OBJECTS[o.def];
        const empty = d.maxStock !== undefined && !o.stock;
        const dirty = d.maxDirt !== undefined && (o.dirt ?? 0) >= Math.ceil(d.maxDirt / 2);
        const broken = !!o.broken;
        v.badge.setVisible(empty || dirty || broken).setText(broken ? '🔧 Roto' : dirty ? (empty ? 'Sucio y vacío' : '¡Sucio!') : '¡Vacío!');
        v.badge.setBackgroundColor(broken ? '#5b6475' : dirty ? '#7a5230' : '#c0392b');
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

  private agentKey(a: Agent) {
    return `${lifeStage(a.species, a.ageDays).id}:${a.color}:${a.role ?? ''}:${this.chulapo(a)}`;
  }

  /** En San Isidro, en el parque y la plaza, la gente va de chulapo. */
  private chulapo(a: Agent): boolean {
    if (a.kind !== 'person' || a.role) return false;
    const lot = this.world.lotById(a.lotId);
    return this.world.hasEvent('sanisidro') && (lot?.layout === 'park' || lot?.layout === 'plaza');
  }

  private createAgentView(a: Agent): AgentView {
    const stage = lifeStage(a.species, a.ageDays).id;
    const root = this.add.container(0, 0);
    const ring = this.add.graphics();
    ring.lineStyle(2.5, 0x7cff6b, 0.95);
    ring.strokeEllipse(0, 0, 36, 17);
    ring.lineStyle(1, 0xffffff, 0.5);
    ring.strokeEllipse(0, 0, 30, 13);
    const shadow = this.add.graphics();
    const body = this.add.container(0, 0);
    let headY = -32;
    let legs: AgentView['legs'];
    let shadowW = 24;
    let extra: Partial<AgentView> = {};

    if (a.kind === 'person') {
      const look = personLook(a, stage === 'elder');
      if (stage === 'baby') {
        const g = this.add.graphics();
        headY = drawBaby(g, look);
        body.add(g);
      } else {
        const back = this.add.graphics();
        drawLeg(back, { ...look, pants: shade(look.pants, 0.82) }, -5);
        const fore = this.add.graphics();
        drawLeg(fore, look, 0.5);
        const torso = this.add.graphics();
        headY = drawPersonBody(torso, look);
        const face = this.add.graphics();
        drawFace(face, look, 'normal');
        const backHead = this.add.graphics().setVisible(false);
        drawBackHead(backHead, look);
        const acc = this.add.graphics();
        const accKind = a.role ?? (this.chulapo(a) ? 'chulapo' : '');
        if (accKind) drawAccessory(acc, accKind);
        const prop = this.add.graphics();
        body.add([back, fore, torso, face, backHead, acc, prop]);
        extra = { look, face, backHead, prop, faceKey: 'normal', propKey: '' };
        legs = [back, fore];
      }
    } else {
      const g = this.add.graphics();
      const art = PET_ART[a.species];
      headY = art ? art(g, petColor(a)) : -20;
      body.add(g);
      shadowW = a.species === 'capybara' ? 40 : a.species === 'guineapig' ? 18 : 28;
    }
    shadow.fillStyle(0x000000, 0.22);
    shadow.fillEllipse(0, 0, shadowW, shadowW * 0.45);

    const label = this.add
      .text(0, 7, a.name, { resolution: TEXT_RES, fontSize: '10px', fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', color: '#ffffff', stroke: '#1d2233', strokeThickness: 3 })
      .setOrigin(0.5, 0);
    const bubbleBg = this.add.graphics();
    bubbleBg.fillStyle(0x000000, 0.18);
    bubbleBg.fillCircle(1, 1.5, 11);
    bubbleBg.fillStyle(0xffffff, 1);
    bubbleBg.fillCircle(0, 0, 11);
    bubbleBg.fillTriangle(-8, 5, -3, 9, -14, 12);
    const bubble = this.add.image(0, 0, glyph(this, '❗')).setDisplaySize(15, 15).setOrigin(0.5, 0.5);
    const plumbob = this.add.graphics();
    plumbob.fillStyle(0x2fbf3c, 1);
    plumbob.fillPoints([{ x: 0, y: -10 }, { x: 6.5, y: 0 }, { x: 0, y: 10 }, { x: -6.5, y: 0 }], true);
    plumbob.fillStyle(0x7cff6b, 1);
    plumbob.fillPoints([{ x: 0, y: -10 }, { x: 6.5, y: 0 }, { x: 0, y: 0 }], true);
    plumbob.fillStyle(0xd8ffd2, 0.9);
    plumbob.fillPoints([{ x: 0, y: -10 }, { x: 2.5, y: -4 }, { x: 0, y: -3 }], true);

    root.add([ring, shadow, body, label, bubbleBg, bubble, plumbob]);
    return { root, body, legs, bubble, bubbleBg, label, plumbob, ring, headY, key: this.agentKey(a), ...extra };
  }

  private agentScreenPos(a: Agent): { x: number; y: number; depth: number; lying: boolean } {
    const t = a.current;
    // Vive en una jaula o cuna: siempre dentro, en un sitio u otro según lo que haga.
    const home = this.world.object(a.home);
    if (home) {
      const d = OBJECTS[home.def];
      const act = t?.phase === 'acting' ? t.actionId : '';
      let fx = 0.3;
      if (act === 'cage_sleep') fx = 0.78;
      else if (act === 'cage_run') fx = 0.5 + Math.sin(this.time.now / 400) * 0.3;
      else if (act === 'cage_pee') fx = 0.55;
      if (home.def === 'crib') fx = 0.5;
      const p = isoToScreen(home.x + 0.15 + fx * (d.w - 0.3), home.y + d.h / 2);
      return { x: p.x, y: p.y - (home.def === 'crib' ? 9 : 6), depth: this.objectDepth(home) + 2, lying: false };
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
        const lying = ['sleep', 'nap_sofa', 'nap_bed', 'pet_sleep', 'niqui', 'pilates', 'reformer', 'bath'].includes(t.actionId);
        const lift = d.shape === 'post' ? d.height : d.shape === 'hammock' ? d.height - 10 : d.shape === 'pond' ? -6 : d.shape === 'swings' ? 10 : o.def === 'bed' ? 15 : d.height * 0.6;
        const depth = d.shape === 'pond' ? (cx + cy) * 10 : this.objectDepth(o) + 2;
        return { x: p.x, y: p.y - lift, depth, lying };
      }
    }
    const p = tileCenter(a.pos.x, a.pos.y);
    return { x: p.x, y: p.y, depth: (a.pos.x + a.pos.y) * 10 + 7, lying: t?.actionId === 'pass_out' };
  }

  private syncAgents(time: number) {
    const seen = new Set<string>();
    const visible = new Set<string>();
    const activeId = this.world.state.activeAgentId;
    for (const a of this.world.agentsIn(this.shownLot)) {
      seen.add(a.id);
      let v = this.agentViews.get(a.id);
      if (v && v.key !== this.agentKey(a)) {
        v.root.destroy();
        v = undefined;
      }
      if (!v) {
        v = this.createAgentView(a);
        this.agentViews.set(a.id, v);
      }
      v.root.setVisible(!a.hidden);
      if (a.hidden) continue;
      visible.add(a.id);
      const p = this.agentScreenPos(a);
      const walking = a.path.length > 0;
      v.root.setPosition(p.x, p.y).setDepth(p.depth);
      const acting = a.current?.phase === 'acting' ? a.current.actionId : '';
      const speaking = this.fx.isSpeaking(a.id, time);
      this.animateBody(v, a, acting, walking, p.lying, speaking, time);
      this.personDetails(v, a, acting, walking, p.y, p.lying, speaking, time);
      const size = STAGE_SCALE[lifeStage(a.species, a.ageDays).id] ?? 1;
      v.body.scaleY = size * (acting === 'pilates' || acting === 'reformer' ? 1 + Math.sin(time / 500) * 0.06 : 1);
      v.body.scaleX = a.facing * size;

      const active = a.id === activeId;
      const head = v.headY * size;
      v.plumbob.setVisible(active);
      v.ring.setVisible(active);
      if (active) {
        v.plumbob.scaleX = Math.cos(time / 300);
        v.plumbob.y = head - 14 + Math.sin(time / 400) * 2;
      }
      const cur = a.current;
      const def = cur && ACTIONS[cur.actionId];
      let bubble = '';
      if (def && cur.phase === 'acting' && cur.actionId !== 'idle' && cur.actionId !== 'move') bubble = def.icon;
      else if (Math.min(a.needs.hunger, a.needs.bladder, a.needs.energy) < 15) bubble = '❗';
      // Mientras habla, el icono deja sitio al bocadillo de diálogo.
      if (this.fx.hasBubble(a.id, time)) bubble = '';
      if (bubble && v.bubbleKey !== bubble) {
        v.bubbleKey = bubble;
        v.bubble.setTexture(glyph(this, bubble)).setDisplaySize(15, 15);
      }
      const bx = 17, by = head - 4;
      v.bubble.setPosition(bx, by).setVisible(!!bubble);
      v.bubbleBg.setPosition(bx, by).setVisible(!!bubble);
      // Solo el nombre del personaje activo: así no se amontonan (los demás se ven al tocarlos).
      v.label.setVisible(active);

      // Bocadillos y partículas encima de la cabeza
      const topY = p.lying ? p.y - 24 : p.y + head - (active ? 26 : 8);
      this.fx.anchor(a.id, p.x, topY);
      const fxDef = acting ? ACTION_FX[acting] : undefined;
      if (fxDef && time >= (this.nextFx.get(a.id) ?? 0)) {
        this.nextFx.set(a.id, time + fxDef.every * (0.8 + Math.random() * 0.4));
        this.fx.emit(fxDef.kind, p.x, p.lying ? p.y - 18 : p.y + head);
      }
      this.chatter(a, acting, time);
    }
    for (const [id, v] of this.agentViews) {
      if (!seen.has(id)) {
        v.root.destroy();
        this.agentViews.delete(id);
      }
    }
    this.drainSpeech(time);
    this.fx.update(time, visible);
  }

  /** Movimientos de cada acción: masticar, bailar, columpiarse, mover la cola... */
  private animateBody(v: AgentView, a: Agent, acting: string, walking: boolean, lying: boolean, speaking: boolean, t: number) {
    let y = 0, rot = lying ? (a.kind === 'person' ? -1.3 : 0) : 0, x = lying && a.kind === 'person' ? 14 : 0;
    const running = acting === 'run';
    if (acting === 'war_dance') {
      y = -Math.abs(Math.sin(t / 70)) * 10;
      rot = Math.sin(t / 60) * 0.5;
    } else if (acting === 'dance') {
      y = -Math.abs(Math.sin(t / 70)) * 5;
      rot = Math.sin(t / 60) * 0.25;
    } else if (acting === 'niqui') {
      // La cama se mueve un poco (y corazones). Nada más.
      y = Math.sin(t / 55) * 2;
    } else if (running) {
      y = -Math.abs(Math.sin(t / 55)) * 3;
    } else if (walking && (a.alcohol ?? 0) >= 50) {
      y = -Math.abs(Math.sin(t / 90)) * 1.5;
      rot = Math.sin(t / 260) * 0.2;
      x += Math.sin(t / 330) * 3;
    } else if (walking) {
      y = -Math.abs(Math.sin(t / 90)) * 1.5;
    } else if (EATING.has(acting)) {
      y = -Math.abs(Math.sin(t / 160)) * 1.6;
    } else if (acting === 'play_ball') {
      y = -Math.abs(Math.sin(t / 190)) * 9;
    } else if (acting === 'swing') {
      x += Math.sin(t / 420) * 7;
      rot = Math.sin(t / 420) * 0.18;
    } else if (acting === 'swim') {
      y = Math.sin(t / 300) * 1.5;
    } else if (acting === 'cry') {
      x += Math.sin(t / 35) * 0.9;
    } else if (acting === 'hug' || acting === 'kiss') {
      rot = 0.16 * a.facing;
    } else if (acting === 'read' || acting === 'play_chess' || acting === 'homework' || acting === 'paint') {
      rot = Math.sin(t / 700) * 0.04;
    } else if (a.kind === 'pet' && (WAGGING.has(acting) || a.current?.passiveOf)) {
      rot = Math.sin(t / 70) * 0.07;
    } else if (speaking) {
      y = -Math.abs(Math.sin(t / 110)) * 1.2;
    }
    v.body.y = y;
    v.body.x = x;
    v.body.setRotation(rot);
    // Paso: las piernas se alternan al andar (y más rápido al correr).
    if (v.legs) {
      const moving = walking || running;
      const s = moving ? Math.sin(t / (running ? 45 : 75)) : 0;
      v.legs[0].x = -s * 2;
      v.legs[1].x = s * 2;
      v.legs[0].y = moving ? -Math.max(0, -s) * 2 : 0;
      v.legs[1].y = moving ? -Math.max(0, s) * 2 : 0;
    }
  }

  /** Cara según cómo se siente, de espaldas al ir hacia el fondo, sentado y lo que lleva en la mano. */
  private personDetails(v: AgentView, a: Agent, acting: string, walking: boolean, y: number, lying: boolean, speaking: boolean, t: number) {
    if (!v.face || !v.look || !v.backHead || !v.prop) return;
    // De espaldas: al caminar hacia arriba de la pantalla.
    if (walking && v.lastY !== undefined) {
      if (y < v.lastY - 0.02) v.back = true;
      else if (y > v.lastY + 0.02) v.back = false;
    } else if (!walking) v.back = false;
    v.lastY = y;
    v.face.setVisible(!v.back);
    v.backHead.setVisible(!!v.back);
    // Expresión
    let e: Expression = 'normal';
    const sleeping = lying && acting !== 'pilates' && acting !== 'reformer' && acting !== 'bath' && acting !== 'niqui';
    if (sleeping) e = 'dormido';
    else if ((a.alcohol ?? 0) >= 50) e = 'borracho';
    else if (hasEmotion(a, 'enamorado') || hasEmotion(a, 'boda') || acting === 'kiss' || acting === 'flirt') e = 'enamorado';
    else if (['enfadado', 'insultado', 'celos', 'traicionado'].some((x) => hasEmotion(a, x)) || acting === 'argue' || acting === 'insult') e = 'enfadado';
    else if (['luto', 'corazon_roto', 'calabazas', 'despedido'].some((x) => hasEmotion(a, x))) e = 'triste';
    else if (hasEmotion(a, 'premio') || hasEmotion(a, 'loteria')) e = 'sorpresa';
    else {
      const m = moodScore(a);
      e = m > 62 || speaking || acting === 'joke' || acting === 'dance' ? 'feliz' : m < 30 ? 'triste' : 'normal';
    }
    // Parpadeo cada pocos segundos
    if (e !== 'dormido' && (t + (a.id.length * 997)) % 3800 < 130) e = 'parpadeo';
    if (e !== v.faceKey) {
      v.faceKey = e;
      v.face.clear();
      drawFace(v.face, v.look, e);
    }
    // Objeto en la mano
    const prop = PROPS[acting] ?? '';
    if (prop !== v.propKey) {
      v.propKey = prop;
      v.prop.clear();
      if (prop) drawProp(v.prop, prop);
    }
    // Sentado: piernas recogidas
    const sitting = SITTING.has(acting) && !lying;
    if (v.legs) for (const l of v.legs) l.scaleY = sitting ? 0.45 : 1;
    if (sitting) v.body.y += 5;
  }

  /** Diálogos automáticos, pensamientos y comentarios. */
  private chatter(a: Agent, acting: string, time: number) {
    const cur = a.current;
    // Conversación por turnos en las interacciones (la que lleva quien la empezó).
    const lines = acting && !cur?.passiveOf && acting !== 'talk' ? ACTION_LINES[acting] : undefined;
    const partner = cur?.targetAgentId ? this.world.agent(cur.targetAgentId) : undefined;
    if (lines && partner && cur?.phase === 'acting') {
      let c = this.convo.get(a.id);
      // Diálogo de 2 a 4 frases, alternando quién habla; sin repetir lo que se ha oído hace poco.
      const newPair = (): string[] => (acting === 'chat' ? chatPair(this.world, a, partner) : [...fresh(lines, (p) => p[0])]);
      if (!c || time >= c.next + 6000) c = { pair: newPair(), step: 0, next: time };
      if (time >= c.next) {
        const speaker = c.step % 2 === 0 ? a : partner;
        let line = c.pair[c.step];
        if (line === '*') line = fresh(PET_SOUNDS[speaker.species] ?? ['...']);
        if (line) this.fx.say(speaker.id, line, 'say', time);
        const len = Math.max(1, (line ?? '').length);
        if (c.step + 1 < c.pair.length) c = { ...c, step: c.step + 1, next: time + 1300 + len * 22 };
        else c = { pair: newPair(), step: 0, next: time + 2800 + len * 20 };
      }
      this.convo.set(a.id, c);
      return;
    }
    this.convo.delete(a.id);
    if (cur?.passiveOf || this.fx.hasBubble(a.id, time)) return;
    const next = this.nextTalk.get(a.id) ?? time + 2000 + Math.random() * 6000;
    if (time < next) {
      if (!this.nextTalk.has(a.id)) this.nextTalk.set(a.id, next);
      return;
    }
    this.nextTalk.set(a.id, time + 7000 + Math.random() * 9000);
    // Pensamientos si algo urge (solo la familia)
    if (this.world.isPlayerMember(a) && a.kind === 'person') {
      const low = NEED_KEYS.filter((k) => a.needs[k] < 18).sort((x, y) => a.needs[x] - a.needs[y])[0];
      if (low) return this.fx.say(a.id, fresh(NEED_THOUGHTS[low]), 'think', time);
    }
    // Comentarios mientras hacen algo
    const quips = ACTION_QUIPS[acting];
    if (quips && Math.random() < 0.55) return this.fx.say(a.id, vary(fresh(quips)), 'say', time);
    // Y lo que les sale por su forma de ser (el cuñado, el tragón, el gruñón...)
    if (a.kind === 'person' && !acting.includes('sleep') && Math.random() < 0.35) {
      const q = traitQuip(a);
      if (q) return this.fx.say(a.id, q, 'say', time);
    }
    // Las mascotas hacen sus ruidos de vez en cuando
    if (a.kind === 'pet' && !acting.includes('sleep') && Math.random() < 0.3) this.fx.say(a.id, fresh(PET_SOUNDS[a.species] ?? ['...']), 'say', time);
  }

  /** Frases que manda la simulación (conversaciones del jugador, deseos...). */
  private drainSpeech(time: number) {
    const q = this.world.ui.speech;
    if (q.length) {
      let at = Math.max(time, ...this.pendingSpeech.map((s) => s.at + 1500));
      for (const s of q) {
        this.pendingSpeech.push({ ...s, at });
        at += 1500;
      }
      q.length = 0;
    }
    if (!this.pendingSpeech.length) return;
    const due = this.pendingSpeech.filter((s) => s.at <= time);
    this.pendingSpeech = this.pendingSpeech.filter((s) => s.at > time);
    for (const s of due) this.fx.say(s.agentId, s.text, s.kind, time);
  }

  // ---------------------------------------------------------------------------
  // Bucle
  // ---------------------------------------------------------------------------

  update(time: number, delta: number) {
    const dt = Math.min(delta, 100) / 1000;
    const speed = SPEEDS[this.world.state.speed] ?? 1;
    if (speed > 0) this.world.tick(dt * speed);
    if (this.world.viewLotId !== this.shownLot || this.lotKey() !== this.shownKey) this.showLot(this.world.viewLotId);
    this.syncEventDeco();
    this.syncObjects();
    this.syncAgents(time);
    this.syncGhost();
    this.updateNight();
    this.updateWeather(delta);
    this.festiveFx(time);
    this.followActive(time);
  }

  // --- Clima, fiestas y cámara ----------------------------------------------

  private weatherGfx?: Phaser.GameObjects.Graphics;
  private weatherParts: { x: number; y: number; v: number; s: number }[] = [];
  private weatherKind = '';

  /** Lluvia, nieve u hojas cayendo (en pantalla, por encima de todo). */
  private updateWeather(delta: number) {
    const w = this.world;
    const kind = w.lotById(this.shownLot)?.layout === 'metro' ? '' : w.hasEvent('lluvia') ? 'rain' : w.hasEvent('nevada') ? 'snow' : w.seasonDef.id === 'otono' ? 'leaves' : '';
    const { width, height } = this.scale;
    if (kind !== this.weatherKind) {
      this.weatherKind = kind;
      this.weatherGfx?.destroy();
      this.weatherGfx = kind ? this.add.graphics().setScrollFactor(0).setDepth(1e6 + 3) : undefined;
      const n = Math.round((kind === 'rain' ? 110 : kind === 'snow' ? 80 : 14) * (IS_WEBGL ? 1.6 : 1));
      this.weatherParts = Array.from({ length: kind ? n : 0 }, () => ({ x: Math.random() * width, y: Math.random() * height, v: 0.6 + Math.random() * 0.6, s: Math.random() * 6.28 }));
    }
    const g = this.weatherGfx;
    if (!g) return;
    g.clear();
    const dt = Math.min(delta, 60) / 16;
    for (const p of this.weatherParts) {
      if (kind === 'rain') {
        p.y += 14 * DPR * p.v * dt;
        p.x -= 3 * DPR * dt;
        g.lineStyle(1 * DPR, 0xc7dcf0, 0.55);
        g.lineBetween(p.x, p.y, p.x + 3 * DPR, p.y - 12 * DPR);
      } else if (kind === 'snow') {
        p.y += 1.4 * DPR * p.v * dt;
        p.s += 0.03 * dt;
        p.x += Math.sin(p.s) * 0.6 * DPR;
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(p.x, p.y, 2 * DPR * p.v);
      } else {
        p.y += 1.1 * DPR * p.v * dt;
        p.s += 0.04 * dt;
        p.x += Math.sin(p.s) * 1.2 * DPR;
        g.fillStyle(p.v > 0.9 ? 0xd9822b : 0xc9a227, 0.9);
        g.fillEllipse(p.x, p.y, 7 * DPR, 3.5 * DPR * Math.abs(Math.cos(p.s)) + DPR);
      }
      if (p.y > height + 10) {
        p.y = -10;
        p.x = Math.random() * (width + 60);
      }
      if (p.x < -20) p.x = width + 10;
    }
  }

  private nextFestive = 0;

  /** Confeti en las fiestas; fuegos artificiales en la verbena y en las uvas. */
  private festiveFx(time: number) {
    if (time < this.nextFestive) return;
    this.nextFestive = time + 420;
    const w = this.world;
    const people = w.agentsIn(this.shownLot).filter((a) => a.kind === 'person' && !a.hidden && !a.travel);
    if (w.state.party?.lotId === this.shownLot && people.length) {
      const a = people[Math.floor(Math.random() * people.length)];
      const p = this.agentScreenPos(a);
      this.fx.emit('confetti', p.x, p.y - 40);
    }
    const night = w.hour >= 21 || w.hour < 1;
    const fireworks = (w.hasEvent('verbena', this.shownLot) && night) || (w.seasonDef.id === 'invierno' && w.weekday === 6 && w.hour === 23 && (this.state_minute() % 60) >= 50);
    if (fireworks && Math.random() < 0.7) {
      const v = this.cameras.main.worldView;
      this.fx.emit('firework', v.x + v.width * (0.2 + Math.random() * 0.6), v.y + v.height * (0.12 + Math.random() * 0.2));
    }
  }

  private state_minute() {
    return this.world.state.minutes % 1440;
  }

  private lastUserCam = 0;

  /** La cámara sigue con suavidad al personaje activo si se sale de la vista. */
  private followActive(time: number) {
    if (this.dragStart || this.pointers.size || time - this.lastUserCam < 4000 || this.world.ui.building) return;
    const a = this.world.activeAgent;
    if (!a || a.lotId !== this.shownLot || a.hidden || a.travel) return;
    const cam = this.cameras.main;
    const p = this.agentScreenPos(a);
    const v = cam.worldView;
    const mx = v.width * 0.18, myTop = v.height * 0.18, myBot = v.height * 0.38;
    if (p.x < v.x + mx || p.x > v.right - mx || p.y < v.y + myTop || p.y > v.bottom - myBot) {
      if (!cam.panEffect.isRunning) cam.pan(p.x, p.y + v.height * 0.08, 700, 'Sine.easeInOut');
    }
  }

  private updateNight() {
    const h = (this.world.state.minutes % 1440) / 60;
    // 0 de día, al máximo de madrugada, con transiciones al amanecer y al anochecer.
    let a = 0;
    if (h < 6) a = NIGHT_MAX;
    else if (h < 8) a = NIGHT_MAX * (1 - (h - 6) / 2);
    else if (h > 22) a = NIGHT_MAX;
    else if (h > 19) a = NIGHT_MAX * ((h - 19) / 3);
    const blackout = this.world.hasEvent('apagon', this.shownLot);
    if (blackout) a = Math.min(0.75, a * 1.35 + 0.1 + Math.sin(this.time.now / 90) * 0.015);
    // Color del cielo y tinte de la luz: amanecer rosa, día limpio, atardecer naranja, noche azul.
    const sky = skyAt(h);
    const tinted = !blackout && sky.alpha > 0 && h >= 6 && h < 21;
    this.night.setFillStyle(tinted ? sky.tint : 0x0b1640, tinted ? Math.max(sky.alpha, a * 0.6) : a);
    const skyHex = `#${sky.sky.toString(16).padStart(6, '0')}`;
    if (skyHex !== this.skyHex) {
      this.skyHex = skyHex;
      this.cameras.main.setBackgroundColor(skyHex);
    }
    const level = blackout ? 0 : a / NIGHT_MAX;
    if (Math.abs(level - this.nightLevel) > 0.01) {
      this.nightLevel = level;
      // En avanzados las luces brillan más (la mezcla aditiva en WebGL queda limpia).
      for (const g of this.glows) g.setAlpha(Math.min(1, level * (IS_WEBGL ? 1.35 : 1)));
    }
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
      if (!wasTap) this.lastUserCam = this.time.now;
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
    const tile = screenToTile(wx, wy);
    const tap = (t: Target) => this.onTap(t, tile);
    // En modo construcción con un mueble elegido, lo que importa es la casilla.
    if (this.world.ui.building && this.selectingTile) return tap({ kind: 'tile', x: tile.x, y: tile.y });
    // 1) Agentes (lo más cercano al dedo)
    let bestAgent: { a: Agent; d: number } | null = null;
    for (const a of this.world.agentsIn(this.shownLot)) {
      if (a.hidden) continue;
      const p = this.agentScreenPos(a);
      const h = a.kind === 'person' ? 44 : 26;
      const d = Math.hypot(wx - p.x, (wy - (p.y - h / 2)) * 0.8);
      if (d < 26 && (!bestAgent || d < bestAgent.d)) bestAgent = { a, d };
    }
    if (bestAgent && !this.world.ui.building) return tap({ kind: 'agent', id: bestAgent.a.id });

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
        const over = (q: { x: number; y: number }) => q.x >= o.x && q.x < o.x + d.w && q.y >= o.y && q.y < o.y + d.h;
        if (!over(t) && !over(t0)) continue;
        const depth = this.objectDepth(o);
        if (!bestObj || depth > bestObj.depth) bestObj = { o, depth };
      }
    }
    if (bestObj) return tap({ kind: 'object', id: bestObj.o.id });

    // 3) Suelo
    const t = screenToTile(wx, wy);
    const layout = this.world.layoutOf(this.shownLot);
    if (t.x >= 0 && t.y >= 0 && t.x < layout.w && t.y < layout.h) {
      if (!this.world.ui.building) this.showMarker(t.x, t.y);
      tap({ kind: 'tile', x: t.x, y: t.y });
    }
  }

  /** Lo pone la interfaz: hay un mueble elegido y el siguiente toque es para colocarlo. */
  selectingTile = false;

  /** Vista previa del mueble que se va a colocar (verde si cabe, rojo si no). */
  private syncGhost() {
    const g = this.world.ui.building ? this.world.ui.ghost : null;
    const key = g ? `${g.def}:${g.x}:${g.y}:${g.ok}:${this.shownLot}` : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ghostGfx?.destroy();
    this.ghostGfx = undefined;
    if (!g) return;
    const d = OBJECTS[g.def];
    const color = g.ok ? 0x3ddc4a : 0xff4d3d;
    const gfx = this.add.graphics().setDepth(1e5 - 1);
    for (let y = g.y; y < g.y + d.h; y++) for (let x = g.x; x < g.x + d.w; x++) {
      const a = isoToScreen(x, y), b = isoToScreen(x + 1, y), c = isoToScreen(x + 1, y + 1), e = isoToScreen(x, y + 1);
      gfx.fillStyle(color, 0.4);
      gfx.fillPoints([a, b, c, e], true);
      gfx.lineStyle(2, color, 0.95);
      gfx.strokePoints([a, b, c, e], true);
    }
    const art = this.add.graphics().setDepth(1e5).setAlpha(0.75);
    if (!drawObjectArt(art, art, { def: g.def, x: g.x, y: g.y })) prism(art, { x: g.x + 0.1, y: g.y + 0.1, w: d.w - 0.2, h: d.h - 0.2 }, 0, d.height, d.color);
    // Al destruir la huella se destruye también el dibujo.
    this.ghostGfx = gfx;
    gfx.once('destroy', () => art.destroy());
  }

  private showMarker(x: number, y: number) {
    const c = tileCenter(x, y);
    const g = this.add.graphics().setDepth(-1e4);
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeEllipse(c.x, c.y, TILE_W * 0.6, TILE_H * 0.6);
    this.tweens.add({ targets: g, alpha: 0, duration: 600, onComplete: () => g.destroy() });
  }
}
