// Efectos de la escena: bocadillos con frases y partículas (Zzz, notas, corazones, gotas...).

import Phaser from 'phaser';
import { glyph, webglWanted } from './gfx';

const TEXT_RES = webglWanted() ? Math.min(2, window.devicePixelRatio || 1) : Math.min(4, Math.min(window.devicePixelRatio || 1, 2.5) * 1.5);

interface Bubble {
  text: Phaser.GameObjects.Text;
  bg: Phaser.GameObjects.Graphics;
  until: number;
  kind: 'say' | 'think';
}

export type FxKind = 'zzz' | 'notes' | 'hearts' | 'drops' | 'sparks' | 'angry' | 'stars' | 'paint' | 'sweat' | 'gas' | 'steam' | 'confetti' | 'firework';

const NOTE_COLORS = ['#7b4fd0', '#e76f51', '#2a9d8f', '#3d8fcf'];
const PAINT_COLORS = [0xe76f51, 0x4f8fd9, 0xf2c14e, 0x52b788, 0x9b5de5];

export class SceneFx {
  private bubbles = new Map<string, Bubble>();
  private anchors = new Map<string, { x: number; y: number }>();
  private particles = 0;

  constructor(private scene: Phaser.Scene) {}

  isSpeaking(id: string, now: number): boolean {
    const b = this.bubbles.get(id);
    return !!b && b.until > now && b.kind === 'say';
  }

  hasBubble(id: string, now: number): boolean {
    const b = this.bubbles.get(id);
    return !!b && b.until > now;
  }

  /** Punto encima de la cabeza del personaje (se actualiza cada imagen). */
  anchor(id: string, x: number, y: number) {
    this.anchors.set(id, { x, y });
  }

  say(id: string, line: string, kind: 'say' | 'think', now: number) {
    const at = this.anchors.get(id);
    if (!at) return;
    this.clear(id);
    const text = this.scene.add
      .text(0, 0, line, {
        resolution: TEXT_RES,
        fontSize: '11px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontStyle: kind === 'think' ? 'italic' : 'normal',
        color: kind === 'think' ? '#4b5168' : '#1d2233',
        align: 'center',
        padding: { x: 7, y: 5 },
        wordWrap: { width: 118 },
      })
      .setOrigin(0.5, 1)
      .setDepth(1e5 + 6);
    const w = text.width, h = text.height;
    const bg = this.scene.add.graphics().setDepth(1e5 + 5);
    bg.fillStyle(0x000000, 0.15);
    bg.fillRoundedRect(-w / 2 + 1, -h + 2, w, h, 9);
    bg.fillStyle(kind === 'think' ? 0xeef1f6 : 0xffffff, 1);
    bg.fillRoundedRect(-w / 2, -h, w, h, 9);
    if (kind === 'say') {
      bg.fillTriangle(-6, -1, 6, -1, -2, 8);
    } else {
      bg.fillCircle(-4, 4, 3);
      bg.fillCircle(-8, 10, 2);
    }
    const dur = 2200 + line.length * 45;
    this.bubbles.set(id, { text, bg, until: now + dur, kind });
    this.place(id);
    text.setAlpha(0);
    bg.setAlpha(0);
    this.scene.tweens.add({ targets: [text, bg], alpha: 1, duration: 150 });
  }

  private place(id: string) {
    const b = this.bubbles.get(id);
    const at = this.anchors.get(id);
    if (!b || !at) return;
    const y = at.y - 10;
    b.text.setPosition(at.x, y);
    b.bg.setPosition(at.x, y);
  }

  private clear(id: string) {
    const b = this.bubbles.get(id);
    if (!b) return;
    b.text.destroy();
    b.bg.destroy();
    this.bubbles.delete(id);
  }

  /** Mueve los bocadillos con sus personajes y quita los que caducan o cuyo personaje ya no se ve. */
  update(now: number, visible: Set<string>) {
    for (const [id, b] of this.bubbles) if (b.until <= now || !visible.has(id)) this.clear(id);
    // Que los bocadillos no se pisen: de abajo arriba, cada uno se sube si choca con otro.
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    const ids = [...this.bubbles.keys()].filter((id) => this.anchors.has(id));
    ids.sort((a, b) => this.anchors.get(b)!.y - this.anchors.get(a)!.y);
    for (const id of ids) {
      const bb = this.bubbles.get(id)!;
      const at = this.anchors.get(id)!;
      const w = bb.text.width, h = bb.text.height;
      let y = at.y - 10;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find((p) => at.x - w / 2 < p.r && at.x + w / 2 > p.l && y - h < p.b && y > p.t);
        if (!hit) break;
        y = hit.t - 4;
      }
      placed.push({ l: at.x - w / 2, r: at.x + w / 2, t: y - h, b: y });
      bb.text.setPosition(at.x, y);
      bb.bg.setPosition(at.x, y);
    }
  }

  clearAll() {
    for (const id of [...this.bubbles.keys()]) this.clear(id);
    this.anchors.clear();
  }

  // ---------------------------------------------------------------------------
  // Partículas
  // ---------------------------------------------------------------------------

  emit(kind: FxKind, x: number, y: number) {
    if (this.particles > 90) return;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    switch (kind) {
      case 'zzz': {
        const big = Math.random() < 0.5;
        this.floatText(big ? 'Z' : 'z', x + 6, y, '#9fb7dd', big ? 13 : 10, rnd(6, 14), -24, 1600);
        break;
      }
      case 'notes':
        this.floatText(Math.random() < 0.5 ? '♪' : '♫', x + rnd(-10, 10), y, NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)], 13, rnd(-10, 10), -26, 1300);
        break;
      case 'hearts':
        this.floatText('♥', x + rnd(-8, 8), y, Math.random() < 0.5 ? '#ff5d8f' : '#e63946', rnd(10, 14), rnd(-6, 6), -24, 1300);
        break;
      case 'angry':
        this.floatText('💢', x + rnd(-6, 6), y, '#e63946', 12, rnd(-4, 4), -14, 900);
        break;
      case 'stars':
        this.floatText('✦', x + rnd(-10, 10), y + rnd(-4, 4), '#f2c14e', 11, rnd(-8, 8), -10, 900);
        break;
      case 'sparks':
        this.floatText('✦', x + rnd(-8, 8), y + 20, '#ffd166', 9, rnd(-10, 10), -12, 600);
        break;
      case 'drops':
        this.drop(x + rnd(-12, 12), y + rnd(-6, 10), 0x7cc6f0, 1.8, 14);
        break;
      case 'sweat':
        this.drop(x + rnd(-4, 8), y + 2, 0xbfe6ff, 1.4, 10);
        break;
      case 'steam':
        this.floatText('~', x + rnd(-6, 10), y + rnd(10, 18), '#d6dde6', rnd(12, 16), rnd(-4, 4), -22, 1300);
        break;
      case 'confetti': {
        const cols = ['#e63946', '#f2c14e', '#52b788', '#4f8fd9', '#ff5dc8'];
        for (let i = 0; i < 4; i++) this.floatText('▪', x + rnd(-30, 30), y - rnd(10, 40), cols[i % cols.length], rnd(8, 12), rnd(-12, 12), 38, 1600);
        break;
      }
      case 'firework': {
        const cols = ['#ff5d5d', '#ffd23f', '#5df2ff', '#8ac926', '#ff5dc8'];
        const c = cols[Math.floor(Math.random() * cols.length)];
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          this.floatText('•', x, y, c, 10, Math.cos(ang) * 34, Math.sin(ang) * 34, 1100);
        }
        break;
      }
      case 'gas':
        this.floatText('☁', x + rnd(-14, 4), y + rnd(20, 34), '#9acd32', rnd(12, 18), rnd(-14, -4), -10, 1400);
        break;
      case 'paint':
        this.drop(x + rnd(4, 16), y + rnd(10, 20), PAINT_COLORS[Math.floor(Math.random() * PAINT_COLORS.length)], 2, -8);
        break;
    }
  }

  private floatText(ch: string, x: number, y: number, color: string, size: number, dx: number, dy: number, dur: number) {
    // Imagen cacheada del símbolo (no un texto nuevo cada vez): más rápido y sin problemas en WebGL.
    const t = this.scene.add.image(x, y, glyph(this.scene, ch, color)).setOrigin(0.5).setDepth(1e5 + 2);
    const base = (size * 1.25) / 64;
    this.particles++;
    this.scene.tweens.add({
      targets: t,
      x: x + dx,
      y: y + dy,
      alpha: { from: 1, to: 0 },
      scale: { from: base * 0.7, to: base * 1.25 },
      duration: dur,
      ease: 'Sine.easeOut',
      onComplete: () => {
        t.destroy();
        this.particles--;
      },
    });
  }

  private drop(x: number, y: number, color: number, r: number, fall: number) {
    const g = this.scene.add.graphics().setDepth(1e5 + 2);
    g.fillStyle(color, 0.95);
    g.fillCircle(0, 0, r);
    g.setPosition(x, y);
    this.particles++;
    this.scene.tweens.add({
      targets: g,
      y: y + fall,
      alpha: { from: 1, to: 0 },
      duration: 500,
      onComplete: () => {
        g.destroy();
        this.particles--;
      },
    });
  }
}
