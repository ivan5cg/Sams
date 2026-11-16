// Interfaz en HTML por encima del canvas: reloj, velocidad, retratos de la
// familia, necesidades del personaje activo, cola de acciones y menú contextual.

import { WEEKDAY_NAMES } from '../data/careers';
import { EVENTS } from '../data/seasons';
import type { HouseScene } from '../render/HouseScene';
import type { Target, World } from '../sim/world';
import { $, esc } from './dom';
import { BuildMode } from './build';
import { TalkPanel } from './talk';
import { Journal } from './log';
import { Tutorial } from './tutorial';
import { NeighbourhoodMap } from './map';
import { ActionSheet } from './sheet';
import { ProfilePanel } from './profile';
import { DilemmaPanel } from './dilemma';
import { FamilyPanel } from './panel';
import { GameMenu } from './menu';
import { Guide } from './guide';

export interface HudCallbacks {
  onSave: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onNewGame: () => void;
  onReload: () => void;
}

export class Hud {
  readonly build = new BuildMode(this);
  readonly talk = new TalkPanel(this);
  readonly journal = new Journal(this);
  readonly tutorial = new Tutorial(this);
  readonly map = new NeighbourhoodMap(this);
  readonly sheet = new ActionSheet(this);
  readonly profile = new ProfilePanel(this);
  readonly dilemma = new DilemmaPanel(this);
  readonly panel = new FamilyPanel(this);
  readonly menu = new GameMenu(this);
  readonly guide = new Guide(this);

  world: World;

  constructor(
    world: World,
    readonly cb: HudCallbacks,
  ) {
    this.world = world;
    this.bind();
    setInterval(() => this.render(), 200);
    this.render();
  }

  setWorld(world: World) {
    this.world = world;
    this.panel.needsFor = '';
    this.panel.lastQueueHtml = this.panel.lastPortraitsHtml = '';
    this.sheet.closeSheet();
    this.render();
  }

  private bind() {
    $('#speed').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.speed) this.world.state.speed = Number(b.dataset.speed);
      this.render();
    });
    this.build.bind();
    this.talk.bind();
    this.journal.bind();
    this.tutorial.bind();
    this.map.bind();
    this.sheet.bind();
    this.profile.bind();
    this.dilemma.bind();
    this.panel.bind();
    this.menu.bind();
    this.guide.bind();
  }

  /** Toque en la escena: en modo construcción lo gestiona la obra; si no, el menú de acciones. */
  handleTap(target: Target, tile?: { x: number; y: number }) {
    if (this.world.ui.building) return this.build.buildTap(target, tile);
    this.sheet.handleTap(target);
  }

  setScene(get: () => HouseScene) {
    this.build.setScene(get);
  }

  /** Al arrancar: la primera vez, el tutorial guiado. */
  startGuide() {
    this.guide.start();
  }

  toast(text: string, icon = 'ℹ️') {
    const w = this.world;
    this.journal.log.unshift({ when: `${WEEKDAY_NAMES[w.weekday]} ${w.day} · ${w.clock}`, icon, text });
    if (this.journal.log.length > 100) this.journal.log.pop();
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(icon)}</span><span>${esc(text)}</span>`;
    box.prepend(el);
    while (box.children.length > 2) box.lastElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 2800);
    setTimeout(() => el.remove(), 3300);
  }

  placeName(lotId: string): string {
    const lot = this.world.lotById(lotId);
    if (lot.householdId === this.world.household.id) return 'Casa';
    return lot.layout === 'park' ? 'Parque' : lot.name;
  }

  /** Repinta lo que cambia con el tiempo (cada 200 ms y tras cada orden). */
  render() {
    const w = this.world;

    this.menu.renderGone();
    $('#build-btn').classList.toggle('dim', !this.world.canBuildHere());
    if (!$('#build').hidden) {
      if (!this.world.canBuildHere()) this.build.exitBuild();
      else $('#build-funds').textContent = `§ ${this.world.household.funds.toLocaleString('es-ES')}`;
    }
    // Un solo icono: el del evento en marcha o, si no hay, el de la estación.
    const ev = w.activeEvents().filter((e) => !e.lotId || e.lotId === w.viewLotId)[0];
    $('#clock').textContent = `${(ev && EVENTS[ev.id]?.icon) || w.seasonDef.icon} ${WEEKDAY_NAMES[w.weekday]} ${w.day} · ${w.clock}`;
    $('#clock').title = `${w.seasonDef.label}${w.activeEvents().length ? ` · ${w.activeEvents().map((e) => EVENTS[e.id]?.label).join(', ')}` : ''}`;
    $('#funds').textContent = `§ ${w.household.funds.toLocaleString('es-ES')}`;
    $('#funds').classList.toggle('neg', w.household.funds < 0);
    $('#family').textContent = `📍 ${this.placeName(w.viewLotId)} · ${w.household.name}`;
    for (const b of $('#speed').querySelectorAll<HTMLButtonElement>('button')) {
      b.classList.toggle('on', Number(b.dataset.speed) === w.state.speed);
    }

    this.panel.render();
    this.guide.sync();

    this.talk.syncTalk();
    this.dilemma.syncDilemma();

  }
}
