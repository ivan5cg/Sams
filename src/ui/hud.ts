// Interfaz en HTML por encima del canvas: reloj, velocidad, retratos de la
// familia, necesidades del personaje activo, cola de acciones y menú contextual.

import { WEEKDAY_NAMES } from '../data/careers';
import { EVENTS } from '../data/seasons';
import type { AudioEngine } from '../audio/engine';
import type { HouseScene } from '../render/HouseScene';
import type { Target, Toast, World } from '../sim/world';
import { $ } from './dom';
import { vibrate } from '../prefs';
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
import { Notices } from './notices';
import { AgendaPanel } from './agenda';
import { FeatsPanel } from './feats';
import { FamilyCreator } from './creator';
import { AlbumPanel } from './album';
import { PersonEditor } from './editor';
import { CatalogPanel } from './catalog';
import type { FamilySpec } from '../sim/family';

export interface HudCallbacks {
  onSave: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onNewGame: (family: FamilySpec) => Promise<void>;
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
  readonly notices = new Notices(this);
  readonly agenda = new AgendaPanel(this);
  readonly feats = new FeatsPanel(this);
  readonly creator = new FamilyCreator(this);
  readonly album = new AlbumPanel(this);
  readonly editor = new PersonEditor(this);
  readonly catalog = new CatalogPanel(this);

  world: World;
  /** El sonido (se carga después del arranque). */
  audio?: AudioEngine;

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
    $('#recenter').addEventListener('click', () => this.build.sceneRef?.().recenter());
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
    this.notices.bind();
    this.agenda.bind();
    this.feats.bind();
    this.creator.bind();
    this.album.bind();
    this.editor.bind();
    this.catalog.bind();
  }

  /** Toque en la escena: en modo construcción lo gestiona la obra; si no, el menú de acciones. */
  handleTap(target: Target, tile?: { x: number; y: number }) {
    if (this.world.ui.building) return this.build.buildTap(target, tile);
    this.sheet.handleTap(target);
  }

  setScene(get: () => HouseScene) {
    this.build.setScene(get);
  }

  /** Pulsación larga sobre un personaje: si es de la familia, pasa a controlarlo; y se abre su perfil. */
  longPress(agentId: string) {
    const a = this.world.agent(agentId);
    if (!a) return;
    vibrate(25);
    this.profile.openProfile(agentId);
  }

  /** Al arrancar: la primera vez, el creador de familia y luego el tutorial guiado. */
  startGuide(firstTime = false) {
    if (firstTime) this.newFamily(true);
    else this.guide.start();
  }

  /** Abre el creador de familia (con el tiempo parado) y empieza la partida con la elegida. */
  newFamily(firstTime: boolean) {
    const speed = this.world.state.speed;
    this.world.state.speed = 0;
    this.creator.open({ cancellable: !firstTime }, async (f) => {
      if (f) await this.cb.onNewGame(f);
      else this.world.state.speed = speed || 1;
      if (firstTime) this.guide.start();
    });
  }

  /** Aviso de la propia interfaz («Partida guardada»...). */
  toast(text: string, icon = 'ℹ️') {
    this.notices.notify({ text, icon });
  }

  /** Aviso de la simulación: según su nivel, urgente, normal o a la bandeja del barrio. */
  notify(t: Toast) {
    this.notices.notify(t);
  }


  placeName(lotId: string): string {
    const lot = this.world.lotById(lotId);
    if (lot.householdId === this.world.household.id) return 'Casa';
    return lot.id === 'P' ? 'Parque' : lot.name;
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
    const scene = this.build.sceneRef?.();
    $('#recenter').hidden = !scene?.camFree || w.ui.building;
    this.guide.sync();

    this.talk.syncTalk();
    this.dilemma.syncDilemma();

  }
}
