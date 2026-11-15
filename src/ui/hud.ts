// Interfaz en HTML por encima del canvas: reloj, velocidad, retratos de la
// familia, necesidades del personaje activo, cola de acciones y menú contextual.

import { ACTIONS } from '../data/actions';
import { NEED_INFO, SPECIES, lifeStage, needLabel } from '../data/species';
import { CAREERS, JOB_CAREERS, WEEKDAY_LONG, WEEKDAY_NAMES, gradeLabel, scheduleText } from '../data/careers';
import { MAX_SKILL, SKILLS } from '../data/skills';
import { MEMORY_TEXT, getRel, isAdult, relLabel } from '../sim/social';
import { emotionsOf } from '../sim/emotions';
import { ASPIRATIONS, ASPIRATION_BY_ID } from '../sim/aspirations';
import { TRAITS } from '../data/traits';
import { PET_TRAIT_BY_ID, TRICKS } from '../data/pets';
import { DILEMMA_BY_ID } from '../data/dilemmas';
import { EVENTS } from '../data/seasons';
import { ROLE_LABEL } from '../data/street';
import { IS_WEBGL, setWebglWanted, webglWanted } from '../render/gfx';
import { NEED_KEYS, type Agent, type Rel, type SpeciesId } from '../sim/types';
import { CATALOG, CATEGORIES, OBJECTS, QUALITY, SELL_RATIO, priceOf, type CatalogCategory } from '../data/objects';
import type { HouseScene } from '../render/HouseScene';
import { MAX_MEMBERS, TRAVEL_MINUTES, moodScore, type Target, type World } from '../sim/world';
import { converse, knownText, topicsFor } from '../sim/conversation';
import { hasTrait, traitsOf } from '../sim/traits';

export interface HudCallbacks {
  onSave: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onNewGame: () => void;
  onReload: () => void;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function mood(a: Agent): { score: number; icon: string; label: string; color: string } {
  const score = moodScore(a);
  if (score > 70) return { score, icon: '😄', label: 'Muy feliz', color: '#3ddc4a' };
  if (score > 50) return { score, icon: '🙂', label: 'Bien', color: '#9bd84a' };
  if (score > 30) return { score, icon: '😐', label: 'Regular', color: '#f0c43c' };
  return { score, icon: '😫', label: 'Fatal', color: '#e8553d' };
}

function needColor(v: number) {
  if (v > 60) return '#4cd964';
  if (v > 30) return '#f4c430';
  return '#ff4d3d';
}

function hexColor(n: number) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export class Hud {
  private world: World;
  private lastQueueHtml = '';
  private lastPortraitsHtml = '';
  private needsFor = '';
  private sheetTarget: Target | null = null;

  constructor(world: World, private cb: HudCallbacks) {
    this.world = world;
    this.bind();
    setInterval(() => this.render(), 200);
    this.render();
  }

  setWorld(world: World) {
    this.world = world;
    this.needsFor = '';
    this.lastQueueHtml = this.lastPortraitsHtml = '';
    this.closeSheet();
    this.render();
  }

  /** Diario: todo lo que ha pasado (solo en esta sesión). */
  private log: { when: string; icon: string; text: string }[] = [];

  toast(text: string, icon = 'ℹ️') {
    const w = this.world;
    this.log.unshift({ when: `${WEEKDAY_NAMES[w.weekday]} ${w.day} · ${w.clock}`, icon, text });
    if (this.log.length > 100) this.log.pop();
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${icon}</span><span>${esc(text)}</span>`;
    box.prepend(el);
    while (box.children.length > 2) box.lastElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 2800);
    setTimeout(() => el.remove(), 3300);
  }

  // ---------------------------------------------------------------------------

  private bind() {
    $('#speed').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.speed) this.world.state.speed = Number(b.dataset.speed);
      this.render();
    });

    $('#portraits').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.id) return;
      this.world.setActive(b.dataset.id);
      this.closeSheet();
      this.render();
    });

    $('#queue').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.task) this.world.cancel(this.world.activeAgent.id, b.dataset.task);
      this.render();
    });

    // El panel de necesidades va plegado por defecto (para ver más escena); se recuerda la elección.
    try {
      if (localStorage.getItem('sams:needsOpen') !== '1') $('#panel').classList.add('collapsed');
    } catch {
      $('#panel').classList.add('collapsed');
    }
    // Gráficos: normal (Canvas) o avanzado (WebGL). Hace falta recargar.
    const gfxSeg = $('#gfx');
    const paintGfx = () => {
      for (const b of gfxSeg.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', (b.dataset.gfx === 'webgl') === webglWanted());
      const note = $('#gfx-note');
      if (note) note.textContent = webglWanted() && !IS_WEBGL ? 'Se aplicará al recargar.' : IS_WEBGL ? 'Ahora: avanzado (luces y efectos). Si algo se ve raro, vuelve a normal.' : 'Ahora: normal (el de siempre, el más compatible).';
    };
    paintGfx();
    gfxSeg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.gfx) return;
      const want = b.dataset.gfx === 'webgl';
      if (want === webglWanted()) return;
      setWebglWanted(want);
      paintGfx();
      if (confirm(want ? 'Gráficos avanzados: hay que recargar el juego (la partida se guarda). Si en tu móvil algo no se ve bien, vuelve aquí y elige «Normal». ¿Recargar ahora?' : 'Volver a gráficos normales: hay que recargar (la partida se guarda). ¿Recargar ahora?')) this.cb.onReload();
    });

    $('#needs-toggle').addEventListener('click', () => {
      const collapsed = $('#panel').classList.toggle('collapsed');
      try {
        localStorage.setItem('sams:needsOpen', collapsed ? '0' : '1');
      } catch {
        /* sin almacenamiento: da igual */
      }
    });

    $('#sheet').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'sheet') return this.closeSheet();
      const b = el.closest('button');
      if (!b || !this.sheetTarget) return;
      if (b.dataset.close !== undefined) return this.closeSheet();
      if (b.dataset.bmove) {
        const o = this.world.object(b.dataset.bmove);
        if (o) this.selectForBuild({ kind: 'move', id: o.id, def: o.def });
        return this.closeSheet();
      }
      if (b.dataset.bsell) {
        this.world.sellObject(b.dataset.bsell);
        this.renderBuild();
        return this.closeSheet();
      }
      if (b.dataset.career) {
        this.world.command(this.world.activeAgent.id, 'find_job', this.sheetTarget, b.dataset.career);
        this.closeSheet();
        this.render();
        return;
      }
      if (b.dataset.adopt) {
        this.world.command(this.world.activeAgent.id, 'adopt', this.sheetTarget, b.dataset.adopt);
        this.closeSheet();
        this.render();
        return;
      }
      const action = b.dataset.action;
      if (action === 'adopt') return this.showAdoption();
      if (action === 'find_job') return this.showJobs();
      if (action) {
        this.world.command(this.world.activeAgent.id, action, this.sheetTarget);
        this.closeSheet();
        this.render();
      }
    });

    $('#menu-btn').addEventListener('click', () => this.toggleMenu(true));
    $('#gone').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.continue) return;
      this.world.continueWith(b.dataset.continue);
      this.world.state.speed = 1;
      $('#gone').hidden = true;
      this.needsFor = '';
      this.render();
    });
    $('#profile-btn').addEventListener('click', () => this.openProfile());
    $('#wishes').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.wish) {
        this.world.pursueWish(this.world.activeAgent.id, b.dataset.wish);
        this.render();
      }
    });
    $('#talk').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.topic) this.talkTurn(b.dataset.topic);
      else if (b.dataset.endtalk !== undefined) this.endTalk();
    });
    $('#build-btn').addEventListener('click', () => this.enterBuild());
    $('#build-exit').addEventListener('click', () => this.exitBuild());
    $('#build-tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.cat) return;
      this.buildCat = b.dataset.cat as CatalogCategory;
      this.renderBuild();
    });
    $('#build-tiers').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.tier) return;
      this.buildTier = Number(b.dataset.tier) as 1 | 2 | 3;
      if (this.buildSel?.kind === 'buy') this.selectForBuild(this.buildSel);
      else this.renderBuild();
    });
    $('#build-items').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && b.dataset.expand !== undefined) {
        const ex = this.world.nextExpansion();
        if (ex && confirm(`¿Ampliar la casa por §${ex.price.toLocaleString('es-ES')}? (${ex.label})`)) {
          this.selectForBuild(null);
          this.world.expandHouse();
          this.renderBuild();
        }
        return;
      }
      if (!b?.dataset.item) return;
      const sel = this.buildSel;
      if (sel?.kind === 'buy' && sel.def === b.dataset.item) this.selectForBuild(null);
      else this.selectForBuild({ kind: 'buy', def: b.dataset.item });
    });
    $('#placebar').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.cancel !== undefined) return this.selectForBuild(null);
      if (b.dataset.place !== undefined) this.confirmPlace();
    });
    $('#log').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'log' || el.closest('[data-close]')) $('#log').hidden = true;
    });
    $('#tutorial').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.next !== undefined) {
        this.tutorialStep++;
        this.renderTutorial();
      } else if (b.dataset.done !== undefined) {
        $('#tutorial').hidden = true;
        this.world.state.speed = this.speedBeforeTutorial || 1;
        this.render();
        try {
          localStorage.setItem('sams:tutorial', '1');
        } catch {
          /* sin almacenamiento */
        }
      }
    });
    $('#who').addEventListener('click', () => this.openProfile());
    $('#profile').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'profile') return this.closeProfile();
      const b = el.closest('button');
      if (!b) return;
      if (b.dataset.close !== undefined) return this.closeProfile();
      if (b.dataset.quit !== undefined && confirm('¿Seguro que quieres dejar el trabajo?')) {
        this.world.quitJob(this.world.activeAgent);
        this.renderProfile();
      }
      const a = this.world.activeAgent;
      if (b.dataset.aspChange !== undefined) {
        this.aspPicking = !this.aspPicking;
        this.renderProfile();
      }
      if (b.dataset.asp) {
        this.world.setAspiration(a, b.dataset.asp);
        this.aspPicking = false;
        this.renderProfile();
      }
      if (b.dataset.tout) {
        this.traitOut = b.dataset.tout;
        this.renderProfile();
      }
      if (b.dataset.tin && this.traitOut) {
        this.world.pickTrait(a, this.traitOut, b.dataset.tin);
        this.traitOut = '';
        this.renderProfile();
      }
    });
    $('#dilemma').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.dl) return;
      this.world.resolveDilemma(Number(b.dataset.dl));
      $('#dilemma').hidden = true;
      this.world.state.speed = this.speedBeforeDilemma;
      this.render();
    });
    $('#map-btn').addEventListener('click', () => this.openMap());
    $('#map').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'map') return this.closeMap();
      const b = el.closest('button');
      if (!b) return;
      if (b.dataset.close !== undefined) return this.closeMap();
      if (b.dataset.comp) {
        if (this.companions.has(b.dataset.comp)) this.companions.delete(b.dataset.comp);
        else this.companions.add(b.dataset.comp);
        return this.renderMap();
      }
      if (b.dataset.go) {
        const a = this.world.activeAgent;
        const ids = [a.id, ...[...this.companions].filter((id) => this.canAccompany(id))];
        if (this.world.travel(ids, b.dataset.go)) this.closeMap();
        return;
      }
      if (b.dataset.invite) {
        if (this.world.invite(b.dataset.invite)) this.closeMap();
        return;
      }
    });
    $('#menu').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'menu') return this.toggleMenu(false);
      const b = el.closest('button');
      switch (b?.dataset.menu) {
        case 'close': this.toggleMenu(false); break;
        case 'save': this.cb.onSave(); this.toggleMenu(false); break;
        case 'log': this.toggleMenu(false); this.showLog(); break;
        case 'salseo': this.toggleMenu(false); this.showSalseo(); break;
        case 'tutorial': this.toggleMenu(false); this.showTutorial(true); break;
        case 'export': this.cb.onExport(); break;
        case 'import': $<HTMLInputElement>('#import-file').click(); break;
        case undefined:
          if (b?.dataset.aging) {
            this.world.setAging(b.dataset.aging as 'off' | 'normal' | 'fast');
            this.renderAging();
          }
          break;
        case 'new':
          if (confirm('¿Empezar una partida nueva? Se perderá la actual si no la has exportado.')) {
            this.cb.onNewGame();
            this.toggleMenu(false);
          }
          break;
      }
    });
    $<HTMLInputElement>('#import-file').addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const f = input.files?.[0];
      if (f) this.cb.onImport(f);
      input.value = '';
      this.toggleMenu(false);
    });
  }

  // ---------------------------------------------------------------------------
  // Modo construcción
  // ---------------------------------------------------------------------------

  private sceneRef?: () => HouseScene;
  private buildCat: CatalogCategory = 'descanso';
  private buildSel: { kind: 'buy'; def: string } | { kind: 'move'; id: string; def: string } | null = null;
  private speedBeforeBuild = 1;

  setScene(get: () => HouseScene) {
    this.sceneRef = get;
  }

  private enterBuild() {
    const w = this.world;
    if (!w.canBuildHere()) {
      this.toast('Solo se puede construir en vuestra casa (y estando en ella)', '🏡');
      return;
    }
    this.closeSheet();
    this.speedBeforeBuild = w.state.speed || 1;
    w.state.speed = 0;
    w.ui.building = true;
    document.body.classList.add('building');
    $('#build').hidden = false;
    this.renderBuild();
  }

  private exitBuild() {
    const w = this.world;
    this.selectForBuild(null);
    w.ui.building = false;
    w.state.speed = this.speedBeforeBuild;
    document.body.classList.remove('building');
    $('#build').hidden = true;
    this.closeSheet();
    this.render();
  }

  private selectForBuild(sel: Hud['buildSel']) {
    this.buildSel = sel;
    this.world.ui.ghost = null;
    const scene = this.sceneRef?.();
    if (scene) scene.selectingTile = !!sel;
    $('#placebar').hidden = !sel;
    if (sel) {
      const d = OBJECTS[sel.def];
      $('#placebar').innerHTML = `<span>${sel.kind === 'move' ? 'Mover' : 'Colocar'}: <b>${esc(d.name)}</b> · toca el suelo</span><button class="icon-btn" data-cancel>✕</button>`;
    }
    this.renderBuild();
  }

  private buildTap(target: Target, tile?: { x: number; y: number }) {
    const w = this.world;
    const sel = this.buildSel;
    if (sel && tile) {
      const can = sel.kind === 'move' ? w.canPlace(sel.def, tile.x, tile.y, sel.id) : w.canPlace(sel.def, tile.x, tile.y);
      w.ui.ghost = { def: sel.def, x: tile.x, y: tile.y, ok: can.ok };
      const d = OBJECTS[sel.def];
      const cost = priceOf(d, this.buildTier);
      const price = sel.kind === 'buy' ? ` (§${cost})` : '';
      const poor = sel.kind === 'buy' && w.household.funds < cost;
      const label = !can.ok ? `🚫 ${esc(can.reason ?? 'No cabe')}` : poor ? '💸 No hay dinero' : `✓ ${sel.kind === 'move' ? 'Mover aquí' : `Colocar aquí${price}`}`;
      $('#placebar').innerHTML = `<button class="map-btn" data-place ${can.ok && !poor ? '' : 'disabled'}>${label}</button><button class="icon-btn" data-cancel>✕</button>`;
      return;
    }
    if (target.kind !== 'object') return;
    const o = w.object(target.id);
    if (!o || o.lotId !== w.household.lotId) return;
    const d = OBJECTS[o.def];
    const why = w.cantTouch(o);
    const paid = priceOf(d, o.q ?? 2);
    const refund = d.price ? Math.floor(paid * SELL_RATIO) : 0;
    const ql = d.tiers ? ` · ${QUALITY[o.q ?? 2].label}` : '';
    $('#sheet').innerHTML = `<div class="sheet-card">
      <div class="sheet-head"><div><div class="sheet-title">${d.icon || '📦'} ${esc(d.name)}</div><div class="sheet-sub">${why ? esc(why) : d.price ? `Costó §${paid}${ql}` : 'No se puede vender'}</div></div>
      <button class="icon-btn" data-close>✕</button></div>
      <div class="sheet-actions">
        <button class="act" data-bmove="${o.id}" ${why ? 'disabled' : ''}><span class="act-icon">↔️</span><span class="act-label">Mover</span></button>
        <button class="act" data-bsell="${o.id}" ${why || !d.price ? 'disabled' : ''}><span class="act-icon">🏷️</span><span class="act-label">Vender<small class="info">+§${refund}</small></span></button>
      </div></div>`;
    this.sheetTarget = target;
    $('#sheet').hidden = false;
  }

  private confirmPlace() {
    const w = this.world;
    const sel = this.buildSel;
    const g = w.ui.ghost;
    if (!sel || !g) return;
    const ok = sel.kind === 'move' ? w.moveObject(sel.id, g.x, g.y) : w.buy(sel.def, g.x, g.y, OBJECTS[sel.def].tiers ? this.buildTier : 2);
    if (!ok) return;
    if (sel.kind === 'move') this.selectForBuild(null);
    else {
      // Se puede seguir colocando más del mismo.
      w.ui.ghost = null;
      $('#placebar').innerHTML = `<span>Colocado. Toca otro sitio para poner otro, o ✕ para terminar</span><button class="icon-btn" data-cancel>✕</button>`;
    }
    this.renderBuild();
  }

  private renderBuild() {
    if ($('#build').hidden) return;
    const w = this.world;
    $('#build-funds').textContent = `§ ${w.household.funds.toLocaleString('es-ES')}`;
    const ex = w.nextExpansion();
    $('#build-tabs').innerHTML =
      CATEGORIES.map((c) => `<button class="comp ${c.id === this.buildCat ? 'on' : ''}" data-cat="${c.id}">${c.icon} ${esc(c.label)}</button>`).join('') +
      `<button class="comp ${this.buildCat === ('reformas' as CatalogCategory) ? 'on' : ''}" data-cat="reformas">🏗️ Reformas</button>`;
    const sel = this.buildSel;
    if (this.buildCat === ('reformas' as CatalogCategory)) {
      $('#build-tiers').innerHTML = `<div class="muted small build-note">${ex ? `Amplía la casa: <b>${esc(ex.label)}</b>. Lo del jardín se corre solo.` : 'La casa ya está ampliada al máximo. ¡Menuda mansión!'}</div>`;
      $('#build-items').innerHTML = ex
        ? `<button class="item" data-expand ${w.household.funds < ex.price ? 'disabled' : ''}><span class="item-icon">🏗️</span><span class="item-name">Ampliar la casa</span><span class="item-price">§${ex.price.toLocaleString('es-ES')}</span></button>`
        : '';
      return;
    }
    const tiered = CATALOG.some((d) => d.category === this.buildCat && d.tiers);
    $('#build-tiers').innerHTML = tiered
      ? `<div class="tier-row"><span class="muted small">Calidad:</span>${([1, 2, 3] as const).map((q) => `<button class="comp ${this.buildTier === q ? 'on' : ''}" data-tier="${q}">${q === 3 ? '✨ ' : ''}${QUALITY[q].label}</button>`).join('')}</div>`
      : '';
    $('#build-items').innerHTML =
      CATALOG.filter((d) => d.category === this.buildCat)
        .map((d) => {
          const cost = priceOf(d, this.buildTier);
          const poor = w.household.funds < cost;
          const chosen = sel?.kind === 'buy' && sel.def === d.id;
          const face = d.icon || `<span class="swatch" style="background:#${d.color.toString(16).padStart(6, '0')}"></span>`;
          return `<button class="item ${chosen ? 'on' : ''}" data-item="${d.id}" ${poor ? 'disabled' : ''}><span class="item-icon">${face}</span><span class="item-name">${esc(d.name)}</span><span class="item-price">§${cost}</span></button>`;
        })
        .join('');
  }

  // ---------------------------------------------------------------------------
  // Conversación interactiva
  // ---------------------------------------------------------------------------

  private lastWishHtml = '';
  private lastEmoHtml = '';
  private aspPicking = false;
  private speedBeforeDilemma = 1;
  private buildTier: 1 | 2 | 3 = 2;
  private traitOut = '';
  private talking: { aId: string; tId: string; taskId: string; turn: number; log: { who: string; text: string; mood?: string }[]; speed: number } | null = null;

  /** Abre el panel cuando empieza un "Conversar…" del jugador, y lo cierra si se acaba. */
  private syncTalk() {
    const w = this.world;
    const a = w.activeAgent;
    const cur = a.current;
    const active = cur && cur.actionId === 'talk' && cur.byPlayer && cur.phase === 'acting' ? cur : null;
    if (active && !this.talking) {
      const t = w.agent(active.targetAgentId);
      if (!t) return;
      this.talking = { aId: a.id, tId: t.id, taskId: active.id, turn: 0, log: [{ who: t.name, text: this.greeting(t) }], speed: w.state.speed || 1 };
      w.say(t.id, this.talking.log[0].text);
      // Se pausa mientras se elige qué decir.
      w.state.speed = 0;
      this.renderTalk();
      $('#talk').hidden = false;
    } else if (this.talking && (!active || active.id !== this.talking.taskId)) {
      this.closeTalk();
    }
  }

  private greeting(t: Agent): string {
    const w = this.world;
    const rel = getRel(w.state, w.activeAgent.id, t.id);
    const h = w.hour;
    const hello = h < 13 ? '¡Buenos días' : h < 21 ? '¡Buenas tardes' : '¡Buenas noches';
    if (rel.status) return `${hello}, cariño!`;
    if (rel.f <= -15) return '¿Y ahora qué quieres?';
    if (hasTrait(t, 'cunado')) return '¿Qué pasa, máquina? Ven, que te cuento una cosa';
    if (hasTrait(t, 'grunon')) return 'Hmpf. ¿Qué?';
    if (rel.f >= 45) return '¡Hombre! ¿Qué pasa? ¡Cuánto tiempo!';
    if (rel.f < 5) return `${hello}... ¿nos conocemos?`;
    return `${hello}! ¿Qué tal?`;
  }

  private talkTurn(topicId: string) {
    const w = this.world;
    const tk = this.talking;
    if (!tk) return;
    const a = w.agent(tk.aId), t = w.agent(tk.tId);
    if (!a || !t) return this.endTalk();
    const res = converse(w, a, t, topicId);
    w.onTalkTurn(a, t, res, tk.turn === 0);
    tk.turn++;
    const mood = res.outcome === 'good' ? '😊' : res.outcome === 'bad' ? '😬' : '😐';
    tk.log.push({ who: a.name, text: res.say }, { who: t.name, text: res.reply, mood });
    if (res.learned) {
      const what = ({ mascotas: 'n las mascotas', deporte: ' el fútbol', musica: ' la música', arte: ' el arte', cocina: ' la cocina', ciencia: ' la ciencia', cotilleos: ' cotillear', viajes: ' viajar' } as Record<string, string>)[res.learned];
      this.toast(`Has descubierto que a ${t.name} le encanta${what}`, '💡');
    }
    if (res.goPark) {
      this.closeTalk(false);
      return;
    }
    this.renderTalk();
  }

  private renderTalk() {
    const w = this.world;
    const tk = this.talking;
    if (!tk) return;
    const a = w.agent(tk.aId)!, t = w.agent(tk.tId)!;
    const rel = getRel(w.state, a.id, t.id);
    const pct = Math.round((rel.f + 100) / 2);
    const known = knownText(a, t);
    const log = tk.log
      .slice(-6)
      .map((l) => `<div class="talk-line ${l.who === a.name ? 'me' : 'them'}"><b>${esc(l.who)}</b> ${esc(l.text)} ${l.mood ?? ''}</div>`)
      .join('');
    const topics = topicsFor(w, a, t, tk.turn)
      .map((tp) => `<button class="act" data-topic="${tp.id}"><span class="act-icon">${tp.icon}</span><span class="act-label">${esc(tp.label)}</span></button>`)
      .join('');
    $('#talk').innerHTML = `<div class="talk-card">
      <div class="sheet-head">
        <div><div class="sheet-title">🗨️ ${esc(a.name)} y ${esc(t.name)}</div>
        <div class="sheet-sub">${traitsOf(t).map((x) => x.icon).join('')} ${esc(relLabel(rel, a.kind, t.kind))}${known ? ` · ${esc(known)}` : ''}</div></div>
        <button class="icon-btn" data-endtalk>✕</button>
      </div>
      <div class="bar talk-bar"><div class="fill" style="width:${pct}%;background:${rel.f >= 15 ? '#4cd964' : rel.f <= -15 ? '#ff4d3d' : '#a3a9bf'}"></div></div>
      <div class="talk-log">${log}</div>
      <div class="sheet-who">¿De qué habláis?</div>
      <div class="sheet-actions">${topics}</div>
      <button class="map-btn ghost talk-end" data-endtalk>👋 Despedirse</button>
    </div>`;
    const box = $('#talk').querySelector('.talk-log');
    if (box) box.scrollTop = box.scrollHeight;
  }

  private endTalk() {
    const tk = this.talking;
    if (tk) {
      const a = this.world.agent(tk.aId), t = this.world.agent(tk.tId);
      if (a && t) this.world.say(a.id, tk.turn ? '¡Hasta luego!' : 'Bueno, ya hablamos');
      if (a && t) this.world.say(t.id, '¡Chao!');
    }
    this.closeTalk();
  }

  private closeTalk(cancelTask = true) {
    const tk = this.talking;
    this.talking = null;
    $('#talk').hidden = true;
    if (!tk) return;
    if (cancelTask) this.world.cancel(tk.aId, tk.taskId);
    if (this.world.state.speed === 0) this.world.state.speed = tk.speed;
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Diario y tutorial
  // ---------------------------------------------------------------------------

  private showLog() {
    const rows = this.log.length
      ? this.log.map((l) => `<div class="log-row"><span class="log-icon">${l.icon}</span><div><div class="muted small">${esc(l.when)}</div><div>${esc(l.text)}</div></div></div>`).join('')
      : '<p class="muted small">Todavía no ha pasado nada en esta sesión.</p>';
    $('#log').innerHTML = `<div class="map-card"><div class="sheet-head"><div class="sheet-title">📜 Diario</div><button class="icon-btn" data-close>✕</button></div><div class="places">${rows}</div></div>`;
    $('#log').hidden = false;
  }

  /** Lo que sabe la familia del salseo del barrio (y lo que ya sabe todo el mundo). */
  private showSalseo() {
    const w = this.world;
    const fam = w.members.map((m) => m.id);
    const list = (w.state.secrets ?? []).filter((s) => s.public || s.known.some((id) => fam.includes(id)));
    const rows = list.length
      ? list
          .map((s) => `<div class="log-row"><span class="log-icon">${'🌶️'.repeat(s.juicy)}</span><div><div class="muted small">Día ${s.day}${s.public ? ' · lo sabe todo el barrio' : ' · secreto'}</div><div>${esc(s.text.charAt(0).toUpperCase() + s.text.slice(1))}</div></div></div>`)
          .join('')
      : '<p class="muted small">No os habéis enterado de nada todavía. Preguntad a las vecinas del banco del parque (o de la plaza de Alcorcón), cotillead con los vecinos o mirad el grupo de WhatsApp del barrio en el ordenador.</p>';
    $('#log').innerHTML = `<div class="map-card"><div class="sheet-head"><div><div class="sheet-title">🌶️ Salseo del barrio</div><div class="sheet-sub">Lo que sabéis (y lo que sabe todo el mundo)</div></div><button class="icon-btn" data-close>✕</button></div><div class="places">${rows}</div></div>`;
    $('#log').hidden = false;
  }

  private tutorialStep = 0;
  private speedBeforeTutorial = 1;

  /** Explicación rápida la primera vez (o desde el menú). */
  showTutorial(force = false) {
    if (!force) {
      try {
        if (localStorage.getItem('sams:tutorial')) return;
      } catch {
        /* sin almacenamiento: se muestra */
      }
    }
    this.tutorialStep = 0;
    this.speedBeforeTutorial = this.world.state.speed;
    this.world.state.speed = 0;
    $('#tutorial').hidden = false;
    this.renderTutorial();
  }

  private renderTutorial() {
    const steps = [
      { icon: '🏡', title: '¡Bienvenidos a Sams!', text: 'Cuidas de la familia García: Lucía, Mateo, el perro Toby y la gata Misi. La partida no termina nunca.' },
      { icon: '👆', title: 'Dar órdenes', text: 'Toca algo de la casa (la nevera, la cama, a otra persona...) para ver qué puede hacer el personaje activo. Toca el suelo para que camine.' },
      { icon: '🟢', title: 'Uno cada vez', text: 'Controlas a un miembro de la familia cada vez (mascotas incluidas): toca su retrato abajo para cambiar. Los demás se cuidan solos.' },
      { icon: '🗺️', title: 'El barrio', text: 'Con 🗺️ vas al parque o de visita, e invitas a los vecinos. Con 👥 ves el trabajo y las relaciones. Con 🔨 compras y colocas muebles.' },
      { icon: '⏯️', title: 'El tiempo', text: 'Arriba pausas o aceleras. Busca trabajo en el ordenador, enamórate, ten hijos... y que la familia siga generación tras generación.' },
    ];
    const s = steps[Math.min(this.tutorialStep, steps.length - 1)];
    const last = this.tutorialStep >= steps.length - 1;
    $('#tutorial').innerHTML = `<div class="tuto-card">
      <div class="tuto-icon">${s.icon}</div>
      <div class="sheet-title">${esc(s.title)}</div>
      <p>${esc(s.text)}</p>
      <div class="tuto-dots">${steps.map((_, i) => `<span class="${i === this.tutorialStep ? 'on' : ''}"></span>`).join('')}</div>
      <div class="tuto-actions">
        ${last ? '' : '<button class="map-btn ghost" data-done>Saltar</button>'}
        <button class="map-btn" ${last ? 'data-done' : 'data-next'}>${last ? '¡A jugar!' : 'Siguiente'}</button>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Mapa del barrio
  // ---------------------------------------------------------------------------

  private companions = new Set<string>();

  /** Puede acompañar al personaje activo: está en el mismo sitio y es libre de moverse. */
  private canAccompany(id: string): boolean {
    const w = this.world;
    const a = w.activeAgent;
    const c = w.agent(id);
    return !!c && c.id !== a.id && c.lotId === a.lotId && !c.travel && !c.home && !c.hidden;
  }

  private openMap() {
    this.companions.clear();
    this.closeSheet();
    $('#map').hidden = false;
    this.renderMap();
  }

  private closeMap() {
    $('#map').hidden = true;
  }

  private placeName(lotId: string): string {
    const lot = this.world.lotById(lotId);
    if (lot.householdId === this.world.household.id) return 'Casa';
    return lot.layout === 'park' ? 'Parque' : lot.name;
  }

  private renderMap() {
    const w = this.world;
    const a = w.activeAgent;
    const chip = (x: Agent) => {
      const face = x.kind === 'person' ? esc(x.name) : `${SPECIES[x.species].icon} ${esc(x.name)}`;
      return `<span class="who-chip${w.isPlayerMember(x) ? ' mine' : ''}">${face}</span>`;
    };
    const travellers = w.members.filter((m) => this.canAccompany(m.id));
    const leaderOk = a.kind === 'person' && !a.travel;
    const compRow = leaderOk
      ? `<div class="map-comp"><span class="muted small">Con ${esc(a.name)} van:</span>${
          travellers.length
            ? travellers.map((m) => `<button class="comp ${this.companions.has(m.id) ? 'on' : ''}" data-comp="${m.id}">${m.kind === 'pet' ? SPECIES[m.species].icon : '🧑'} ${esc(m.name)}</button>`).join('')
            : '<span class="muted small">nadie más aquí</span>'
        }</div>`
      : `<div class="map-comp muted small">${a.travel ? `${esc(a.name)} va de camino.` : 'Las mascotas salen acompañadas: controla a una persona para viajar.'}</div>`;

    const dist = (id: string) => w.districtOf(id);
    const homeD = dist(w.household.lotId);
    const section = (d: string) => [
      ...w.state.lots.filter((l) => dist(l.id) === d && l.kind !== 'home').map((l) => l.id),
      ...w.state.lots.filter((l) => dist(l.id) === d && l.kind === 'home' && l.id !== w.household.lotId).map((l) => l.id),
    ];
    const other = homeD === 'alcorcon' ? 'madrid' : 'alcorcon';
    const header = (d: string) =>
      `<div class="map-district">${d === 'alcorcon' ? '🏙️ Alcorcón' : d === 'metro' ? '🚇 Metro' : '🏛️ Madrid'}${d !== homeD && d !== 'metro' ? ` <span class="muted small">· en metro, unos ${w.travelMinutes(a.lotId === w.household.lotId ? a.lotId : w.household.lotId, section(d)[0] ?? w.household.lotId)} min</span>` : ''}</div>`;
    const order: string[] = [w.household.lotId, ...section(homeD), `#${other}`, ...section(other), '#metro', ...section('metro')];
    const cards = [`<div class="map-district">${homeD === 'alcorcon' ? '🏙️ Alcorcón' : '🏛️ Madrid'}</div>`, ...order]
      .map((lotId) => {
        if (lotId.startsWith('<')) return lotId;
        if (lotId.startsWith('#')) return header(lotId.slice(1));
        const lot = w.lotById(lotId);
        const here = w.agentsIn(lotId);
        const coming = w.state.agents.filter((x) => x.travel?.to === lotId && w.isPlayerMember(x));
        const mine = lot.householdId === w.household.id;
        const hh = lot.householdId ? w.state.households.find((h) => h.id === lot.householdId) : undefined;
        const venueIcon = lot.layout === 'super' ? '🛒' : lot.layout === 'acai' ? '🫐' : lot.layout === 'bar' ? '🍺' : lot.layout === 'metro' ? '🚇' : '🧘';
        const closed = lot.kind === 'venue' ? w.closedReason(lotId) : undefined;
        const title = mine ? `🏡 Vuestra casa` : lot.layout === 'plaza' ? `⛲ ${esc(lot.name)}` : hh?.okupa ? `🏚️ ${esc(lot.name)} <span class="muted small">· okupas</span>` : lot.kind === 'park' ? '🌳 Parque del barrio' : lot.kind === 'venue' ? `${venueIcon} ${esc(lot.name)}${closed ? ' <span class="muted small">· cerrado</span>' : ''}` : `🏠 ${esc(hh?.name ?? lot.name)}`;
        // Quién vive ahí y no está
        const awayResidents = hh && !mine ? hh.memberIds.map((id) => w.agent(id)!).filter((x) => x.lotId !== lotId || x.travel) : [];
        const go = w.canTravel(a, lotId);
        const venueGo = lot.layout === 'super' ? 'Ir a hacer la compra' : lot.layout === 'acai' ? 'Ir a por un açaí' : lot.layout === 'bar' ? 'Ir de cañas' : lot.layout === 'metro' ? 'Bajar al metro' : 'Ir a clase';
        const baseGo = mine ? 'Volver a casa' : lot.layout === 'plaza' ? 'Ir a la plaza' : lot.kind === 'park' ? 'Ir al parque' : lot.kind === 'venue' ? venueGo : 'Ir de visita';
        const goLabel = w.needsMetro(a.lotId, lotId) ? `${baseGo} (en metro)` : baseGo;
        const btns: string[] = [];
        if (a.lotId === lotId && !a.travel) btns.push(`<span class="here">📍 ${esc(a.name)} está aquí</span>`);
        else if (leaderOk) btns.push(`<button class="map-btn" data-go="${lotId}" ${go.ok ? '' : 'disabled'}>${w.needsMetro(a.lotId, lotId) ? '🚇' : '🚶'} ${goLabel}</button>`);
        if (hh && !mine) {
          const inv = w.canInvite(hh.id);
          btns.push(`<button class="map-btn ghost" data-invite="${hh.id}" ${inv.ok ? '' : 'disabled'} title="${esc(inv.reason ?? '')}">📞 Invitar${inv.ok ? '' : ` · ${esc(inv.reason ?? '')}`}</button>`);
        }
        return `<div class="place ${a.lotId === lotId ? 'current' : ''}">
          <div class="place-title">${title}</div>
          <div class="place-who">${here.length ? here.map(chip).join('') : '<span class="muted small">No hay nadie</span>'}${coming.length ? `<span class="muted small">· de camino: ${coming.map((c) => esc(c.name)).join(', ')}</span>` : ''}</div>
          ${awayResidents.length ? `<div class="muted small">Fuera: ${awayResidents.map((x) => esc(x.name)).join(', ')}</div>` : ''}
          <div class="place-actions">${btns.join('')}</div>
        </div>`;
      })
      .join('');

    $('#map').innerHTML = `<div class="map-card">
      <div class="sheet-head">
        <div><div class="sheet-title">🗺️ El barrio</div><div class="sheet-sub">Andando, ${TRAVEL_MINUTES} minutos. Entre Madrid y Alcorcón se va en metro (Línea 10 + MetroSur)</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      ${this.miniMap()}
      ${compRow}
      <div class="places">${cards}</div>
    </div>`;
  }

  /** Mapa ilustrado: Madrid, la línea de metro y Alcorcón, con un botón por sitio. */
  private miniMap(): string {
    const w = this.world;
    const a = w.activeAgent;
    const pos: Record<string, [number, number]> = {
      L0: [7, 28], L1: [19, 28], L2: [31, 28], L3: [43, 28], L4: [55, 28],
      G: [7, 56], P: [19, 56], M: [31, 56], A1: [43, 56], A2: [55, 56],
      L5: [7, 84], L6: [19, 84], L7: [31, 84], L8: [43, 84], L9: [55, 84],
      MT: [66.5, 56], PL: [79, 28], BR: [93, 28], AL1: [79, 56], AL2: [93, 56], AL3: [86, 84],
    };
    const icon = (id: string) => {
      const lot = w.lotById(id);
      if (!lot) return '';
      if (lot.householdId === w.household.id) return '🏡';
      if (w.state.households.find((h) => h.id === lot.householdId)?.okupa) return '🏚️';
      return ({ park: '🌳', studio: '🧘', super: '🛒', acai: '🫐', metro: '🚇', plaza: '⛲', bar: '🍺' } as Record<string, string>)[lot.layout] ?? '🏠';
    };
    const pins = Object.entries(pos)
      .filter(([id]) => w.lotById(id))
      .map(([id, [x, y]]) => {
        const lot = w.lotById(id);
        const here = a.lotId === id && !a.travel;
        const fam = w.members.some((m) => m.lotId === id && !m.travel && !m.hidden);
        const can = a.kind === 'person' && !a.travel && w.canTravel(a, id).ok;
        const name = lot.householdId === w.household.id ? 'Vuestra casa' : lot.name || 'Casa';
        return `<button class="pin ${here ? 'here' : ''}" style="left:${x}%;top:${y}%" ${can ? `data-go="${id}"` : 'disabled'} title="${esc(name)}" aria-label="${esc(name)}">${icon(id)}${fam ? '<i></i>' : ''}</button>`;
      })
      .join('');
    return `<div class="mini-map">
      <div class="mm-zone mm-madrid"><span>Madrid</span></div>
      <div class="mm-zone mm-alcorcon"><span>Alcorcón</span></div>
      <div class="mm-line"></div>
      ${pins}
    </div>`;
  }

  private renderAging() {
    const mode = this.world.state.aging ?? 'normal';
    for (const b of $('#aging').querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', b.dataset.aging === mode);
  }

  /** La familia se ha quedado sin nadie: elegir con qué familia del barrio seguir. */
  private renderGone() {
    const w = this.world;
    const el = $('#gone');
    if (!w.state.familyGone) {
      el.hidden = true;
      return;
    }
    if (!el.hidden) return;
    const cards = w.state.households
      .filter((h) => h.id !== w.household.id)
      .map((h) => {
        const ms = h.memberIds.map((id) => w.agent(id)!).filter(Boolean);
        const who = ms.map((m) => (m.kind === 'person' ? `${esc(m.name)} (${esc(lifeStage(m.species, m.ageDays).label.toLowerCase())})` : `${SPECIES[m.species].icon} ${esc(m.name)}`)).join(', ');
        return `<div class="place"><div class="place-title">${esc(h.name)}</div><div class="muted small">${who} · §${h.funds.toLocaleString('es-ES')}</div>
          <div class="place-actions"><button class="map-btn" data-continue="${h.id}">Seguir con esta familia</button></div></div>`;
      })
      .join('');
    el.innerHTML = `<div class="map-card"><div class="sheet-title">🕯️ La ${esc(w.household.name)} ya no está</div>
      <p class="sheet-note">La partida no termina: elige otra familia del barrio y continúa su historia.</p>
      <div class="places">${cards}</div></div>`;
    el.hidden = false;
  }

  private toggleMenu(open: boolean) {
    if (open) this.renderAging();
    $('#menu').hidden = !open;
  }

  // ---------------------------------------------------------------------------
  // Menú contextual (al tocar algo en la casa)
  // ---------------------------------------------------------------------------

  handleTap(target: Target, tile?: { x: number; y: number }) {
    if (this.world.ui.building) return this.buildTap(target, tile);
    const w = this.world;
    const active = w.activeAgent;

    if (target.kind === 'tile') {
      this.closeSheet();
      if (w.gridOf(w.viewLotId)[target.y]?.[target.x]) w.command(active.id, 'move', target);
      return;
    }

    if (target.kind === 'agent' && target.id === active.id && !w.optionsFor(active.id, target).length) {
      this.closeSheet();
      return;
    }

    let title: string;
    let subtitle = '';
    if (target.kind === 'object') {
      const o = w.object(target.id)!;
      const d = OBJECTS[o.def];
      title = o.label ? `${d.icon} Aquí descansa ${o.label}` : `${d.icon} ${d.name}${d.tiers && o.q && o.q !== 2 ? ` (${QUALITY[o.q].short})` : ''}`;
      const parts: string[] = [];
      if (d.maxStock) parts.push(`Comida: ${o.stock ?? 0}/${d.maxStock}`);
      if (d.maxDirt) parts.push((o.dirt ?? 0) === 0 ? 'Limpio' : `Suciedad: ${o.dirt}/${d.maxDirt}`);
      if (o.def === 'fridge') {
        const owner = w.pantryOwner(o.lotId);
        if (owner) parts.push(`Raciones: ${owner.pantry ?? 0}${owner.delivery ? ' · pedido en camino' : ''}`);
      }
      const shut = w.closedReason(o.lotId);
      if (shut) parts.push(shut);
      const resident = w.residentOf(o.id);
      if (resident) parts.push(`Aquí vive ${resident.name}`);
      subtitle = parts.join(' · ');
    } else {
      const t = w.agent(target.id)!;
      title = `${SPECIES[t.species].icon} ${t.name}`;
      const rel = getRel(w.state, active.id, t.id);
      const relText = t.id === active.id ? '' : ` · ${relLabel(rel, active.kind, t.kind)}${rel.r > 0 && !rel.kin ? ` · 💕 ${Math.round(rel.r)}` : ''}`;
      const hh = w.householdOf(t);
      const from = hh && hh.id !== w.household.id ? ` · ${hh.name}` : '';
      const pt = t.kind === 'pet' ? PET_TRAIT_BY_ID[t.petTrait ?? ''] : undefined;
      const fav = t.kind === 'pet' ? w.favoriteOf(t) : undefined;
      const traitTxt = t.role
        ? ` · ${ROLE_LABEL[t.role as keyof typeof ROLE_LABEL] ?? ''}`
        : t.kind === 'person'
          ? ` · ${traitsOf(t).map((x) => `${x.icon} ${x.label}`).join(', ')}`
          : `${pt ? ` · ${pt.icon} ${pt.label}` : ''}${fav ? ` · ❤️ ${fav.name}` : ''}${t.tricks?.length ? ` · 🎪 ${t.tricks.length} ${t.tricks.length === 1 ? 'truco' : 'trucos'}` : ''}`;
      subtitle = `${SPECIES[t.species].label} · ${lifeStage(t.species, t.ageDays).label}${from}${relText}${traitTxt}`;
    }

    const opts = w.optionsFor(active.id, target);
    const items = opts
      .map(
        (o) =>
          `<button class="act" data-action="${o.def.id}" ${o.ok ? '' : 'disabled'}>
            <span class="act-icon">${o.def.icon}</span>
            <span class="act-label">${esc(o.def.label)}${o.reason ? `<small>${esc(o.reason)}</small>` : ''}</span>
          </button>`,
      )
      .join('');

    const isMember = target.kind === 'agent' && target.id !== active.id && w.household.memberIds.includes(target.id);
    const switchBtn = isMember ? `<button class="act switch" data-switch="${target.id}"><span class="act-icon">🔁</span><span class="act-label">Controlar a ${esc(w.agent(target.id)!.name)}</span></button>` : '';

    $('#sheet').innerHTML = `
      <div class="sheet-card">
        <div class="sheet-head">
          <div><div class="sheet-title">${esc(title)}</div><div class="sheet-sub">${esc(subtitle)}</div></div>
          <button class="icon-btn" data-close>✕</button>
        </div>
        <div class="sheet-who">${target.kind === 'agent' && target.id === active.id ? 'Por su cuenta puede…' : `${esc(active.name)} puede…`}</div>
        <div class="sheet-actions">
          ${items || `<div class="empty">${esc(active.name)} no puede hacer nada con esto.</div>`}
          ${switchBtn}
        </div>
      </div>`;
    const sw = $('#sheet').querySelector<HTMLButtonElement>('[data-switch]');
    sw?.addEventListener('click', (e) => {
      e.stopPropagation();
      w.setActive(sw.dataset.switch!);
      this.closeSheet();
      this.render();
    });
    this.sheetTarget = target;
    $('#sheet').hidden = false;
  }

  /** Buscar trabajo: elegir carrera. */
  private showJobs() {
    const a = this.world.activeAgent;
    const items = JOB_CAREERS.map((c) => {
      const current = a.job?.career === c.id;
      return `<button class="act" data-career="${c.id}" ${current ? 'disabled' : ''}>
        <span class="act-icon">${c.icon}</span>
        <span class="act-label">${esc(c.name)} · ${esc(c.levels[0].title)}<small class="info">${c.business ? `Montarlo: §${c.startup?.toLocaleString('es-ES')} · ganancias variables · cuota §90/semana` : `§${c.levels[0].pay}/jornada`} · ${esc(scheduleText(c))}${current ? ' · (ya trabaja aquí)' : ''}</small></span>
      </button>`;
    }).join('');
    $('#sheet').querySelector('.sheet-card')!.innerHTML = `
      <div class="sheet-head">
        <div><div class="sheet-title">📰 Ofertas de trabajo</div><div class="sheet-sub">${a.job && !CAREERS[a.job.career].school ? `Ahora: ${esc(CAREERS[a.job.career].levels[a.job.level - 1].title)} (si cambias, empiezas desde abajo)` : `${esc(a.name)} no tiene trabajo`}</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <p class="sheet-note">Se va solo a su hora y vuelve al salir. Si va de buen humor, rinde más y asciende antes.</p>
      <div class="sheet-actions one-col">${items}</div>`;
  }

  // ---------------------------------------------------------------------------
  // Perfil: trabajo y relaciones
  // ---------------------------------------------------------------------------

  private openProfile() {
    this.closeSheet();
    $('#profile').hidden = false;
    this.renderProfile();
  }

  private closeProfile() {
    $('#profile').hidden = true;
  }

  private renderProfile() {
    const w = this.world;
    const a = w.activeAgent;
    const stage = lifeStage(a.species, a.ageDays);
    let jobHtml = '';
    if (a.kind === 'person') {
      if (a.job) {
        const c = CAREERS[a.job.career];
        const lvl = c.levels[a.job.level - 1];
        const perfLabel = c.school ? `Notas: ${gradeLabel(a.job.perf)}` : `Rendimiento (al 100%, ascenso)`;
        jobHtml = `<div class="prof-sec">
          <div class="prof-h">${c.icon} ${c.school ? 'Colegio' : esc(lvl.title)}</div>
          <div class="muted small">${c.school ? '' : `${esc(c.name)} · nivel ${a.job.level}/${c.levels.length} · §${lvl.pay} por jornada · `}${esc(scheduleText(c))}</div>
          <div class="perf"><span class="small">${perfLabel}</span><div class="bar"><div class="fill" style="width:${Math.round(a.job.perf)}%;background:#4f8fd9"></div></div></div>
          ${c.school ? '' : '<button class="map-btn ghost small-btn" data-quit>Dejar el trabajo</button>'}
        </div>`;
      } else if (isAdult(a)) {
        jobHtml = `<div class="prof-sec"><div class="prof-h">💼 Sin trabajo</div><div class="muted small">Busca trabajo en el ordenador de casa.</div></div>`;
      }
    }
    const h = w.householdOf(a);
    if (h?.expecting && h.expecting.parents.includes(a.id)) {
      const due = h.expecting.due;
      const day = Math.floor(due / 1440) + 1;
      jobHtml += `<div class="prof-sec"><div class="prof-h">🍼 Bebé en camino</div><div class="muted small">Llegará el ${WEEKDAY_LONG[(day - 1) % 7]} (día ${day}).</div></div>`;
    }
    // Habilidades
    let skillsHtml = '';
    if (a.kind === 'person' && this.world.stageOf(a) !== 'baby') {
      const rows = SKILLS.map((sk) => {
        const v = a.skills?.[sk.id] ?? 0;
        const lvl = Math.floor(v);
        const pct = Math.round((v / MAX_SKILL) * 100);
        return `<div class="skill-row"><span>${sk.icon} ${esc(sk.label)}</span><div class="bar"><div class="fill" style="width:${pct}%;background:#f0a830"></div></div><b>${lvl}</b></div>`;
      }).join('');
      skillsHtml = `<div class="prof-sec"><div class="prof-h">⭐ Habilidades</div>${rows}<div class="muted small">Se practican cocinando, tocando la guitarra, pintando, haciendo deporte o pilates, jugando al ajedrez o charlando.</div></div>`;
    }
    // Relaciones con quien conoce
    const rows = Object.entries(w.state.rels)
      .map(([k, rel]) => {
        const [x, y] = k.split('|');
        const otherId = x === a.id ? y : y === a.id ? x : null;
        return otherId ? { o: w.agent(otherId), rel } : null;
      })
      .filter((r): r is { o: Agent; rel: Rel } => !!r && !!r.o && (Math.abs(r.rel.f) >= 1 || !!r.rel.status || !!r.rel.kin))
      .sort((p, q) => Number(!!q.rel.status) - Number(!!p.rel.status) || q.rel.f - p.rel.f);
    const relHtml = rows.length
      ? rows
          .map(({ o, rel }) => {
            const pct = Math.round((rel.f + 100) / 2);
            const color = rel.f >= 15 ? '#4cd964' : rel.f <= -15 ? '#ff4d3d' : '#a3a9bf';
            const hh = w.householdOf(o);
            const where = hh && hh.id !== w.household.id ? hh.name : 'Vuestra familia';
            return `<div class="rel-row">
              <span class="rel-face">${o.kind === 'person' ? '🧑' : SPECIES[o.species].icon}</span>
              <div class="rel-main">
                <div><b>${esc(o.name)}</b> <span class="muted small">${esc(where)}</span></div>
                <div class="small">${esc(relLabel(rel, a.kind, o.kind))}${rel.r > 0 && !rel.kin ? ` · 💕 ${Math.round(rel.r)}` : ''}</div>
                ${knownText(a, o) ? `<div class="small muted">💡 ${esc(knownText(a, o))}</div>` : ''}
                ${(rel.mem ?? [])
                  .slice(-2)
                  .reverse()
                  .map((m) => {
                    const mt = MEMORY_TEXT[m.k];
                    if (!mt) return '';
                    const by = m.by === a.id ? a.name : o.name;
                    const other = m.by === a.id ? o.name : a.name;
                    return `<div class="mem ${mt.bad ? 'bad' : ''}">${mt.icon} ${esc(mt.text.replace('{by}', by).replace('{other}', other))} · día ${m.d}</div>`;
                  })
                  .join('')}
                ${w.grudge(a, o) ? `<div class="mem bad">😒 ${esc(a.name)} aún no se lo ha perdonado</div>` : ''}
                ${rel.ex ? '<div class="mem">🏠 Ex, pero comparten piso</div>' : ''}
                <div class="bar"><div class="fill" style="width:${pct}%;background:${color}"></div></div>
              </div>
            </div>`;
          })
          .join('')
      : `<div class="muted small">${esc(a.name)} aún no conoce a nadie. ¡A socializar!</div>`;

    $('#profile').innerHTML = `<div class="map-card">
      <div class="sheet-head">
        <div><div class="sheet-title">${a.kind === 'person' ? '🧑' : SPECIES[a.species].icon} ${esc(a.name)}</div>
        <div class="sheet-sub">${esc(SPECIES[a.species].label)} · ${esc(stage.label)} · ${a.ageDays} ${a.ageDays === 1 ? 'día' : 'días'}</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      ${this.emotionsHtml(a)}
      ${this.aspirationHtml(a)}
      ${jobHtml}
      ${a.kind === 'person' ? `<div class="prof-sec"><div class="prof-h">🧬 Forma de ser</div>${traitsOf(a).map((x) => `<div class="trait-row"><span class="trait-icon">${x.icon}</span><div><b>${esc(x.label)}</b><div class="muted small">${esc(x.desc)}</div></div></div>`).join('')}${this.traitPickHtml(a)}<div class="muted small">Los hijos heredan un rasgo de sus padres. Y los hábitos cambian a la gente: quien corre mucho acaba siendo deportista.</div></div>` : ''}
      ${skillsHtml}
      ${this.petHtml(a)}
      <div class="prof-sec"><div class="prof-h">👥 Relaciones</div>${relHtml}</div>
    </div>`;
  }

  private petHtml(a: Agent): string {
    if (a.kind !== 'pet') return '';
    const pt = PET_TRAIT_BY_ID[a.petTrait ?? ''];
    const fav = this.world.favoriteOf(a);
    const list = TRICKS[a.species];
    const tricks = list
      ? `<div class="perf"><span class="small">Adiestramiento</span><div class="bar"><div class="fill" style="width:${Math.round(a.training ?? 0)}%;background:#f0a830"></div></div></div>
        ${list.map((t, i) => `<div class="asp-stage ${a.tricks?.includes(t) ? '' : 'muted'}"><span>${a.tricks?.includes(t) ? '🎪' : '🔒'}</span>${esc(t)}<span class="muted small">${a.tricks?.includes(t) ? '' : ` (${(i + 1) * 20}%)`}</span></div>`).join('')}
        <div class="muted small">Tócale y elige «Adiestrar». Aprende antes si es listo, si está contento y con su persona favorita.</div>`
      : '<div class="muted small">Vive a su ritmo en su jaula: no aprende trucos, pero agradece los mimos.</div>';
    return `<div class="prof-sec"><div class="prof-h">🐾 Carácter</div>
      ${pt ? `<div class="trait-row"><span class="trait-icon">${pt.icon}</span><div><b>${esc(pt.label)}</b><div class="muted small">${esc(pt.desc)}</div></div></div>` : ''}
      <div class="small">${fav ? `❤️ Su persona favorita: <b>${esc(fav.name)}</b> (la recibe al llegar a casa)` : '❤️ Aún no tiene persona favorita: dale cariño'}</div></div>
      <div class="prof-sec"><div class="prof-h">🎪 Trucos</div>${tricks}</div>`;
  }

  /** Si hay un dilema del trabajo, se para el tiempo y se pregunta. */
  private syncDilemma() {
    const w = this.world;
    const dl = w.state.dilemma;
    const box = $('#dilemma');
    if (!dl) {
      if (!box.hidden) box.hidden = true;
      return;
    }
    if (!box.hidden || this.talking || w.ui.building) return;
    const d = DILEMMA_BY_ID[dl.id];
    const who = w.agent(dl.agentId);
    if (!d || !who) return w.resolveDilemma(0);
    const c = who.job ? CAREERS[who.job.career] : undefined;
    this.speedBeforeDilemma = w.state.speed || 1;
    w.state.speed = 0;
    box.innerHTML = `<div class="dilemma-card">
      <h3>${c?.icon ?? '💼'} ${esc(d.title)}</h3>
      <div class="muted small">${esc(who.name)} · ${esc(c?.levels[(who.job?.level ?? 1) - 1]?.title ?? 'en el trabajo')}</div>
      <p>${esc(d.text.replace('{name}', who.name))}</p>
      ${d.options.map((o, i) => `<button class="act" data-dl="${i}"><span class="act-icon">${o.icon}</span><span class="act-label">${esc(o.label)}${o.chance !== undefined ? '<small class="info">Puede salir bien... o no</small>' : ''}</span></button>`).join('')}
    </div>`;
    box.hidden = false;
  }

  private aspirationHtml(a: Agent): string {
    const w = this.world;
    if (a.kind !== 'person' || !w.isPlayerMember(a) || !a.aspiration) return '';
    const def = ASPIRATION_BY_ID[a.aspiration.id];
    if (!def) return '';
    const done = a.aspiration.stage >= def.stages.length;
    const stages = def.stages
      .map((st, i) => `<div class="asp-stage ${i < a.aspiration!.stage ? 'done' : i === a.aspiration!.stage ? 'now' : ''}"><span>${i < a.aspiration!.stage ? '✅' : i === a.aspiration!.stage ? '👉' : '⬜'}</span>${esc(st.label)}</div>`)
      .join('');
    const picker = this.aspPicking
      ? `<div class="chips-wrap">${ASPIRATIONS.filter((x) => x.id !== def.id)
          .map((x) => `<button class="comp" data-asp="${x.id}">${x.icon} ${esc(x.label)}${(a.aspirationsDone ?? []).includes(x.id) ? ' ✓' : ''}</button>`)
          .join('')}</div><div class="muted small">Al cambiar de meta se empieza de cero (lo que ya tenga hecho cuenta).</div>`
      : '';
    return `<div class="prof-sec"><div class="prof-h">🎯 Meta de vida: ${def.icon} ${esc(def.label)}${done ? ' 🏆' : ''}</div>
      <div class="muted small">${esc(def.desc)}${done ? ' ¡Cumplida!' : ` Cada etapa da dinero; la meta entera, §1.500.`}</div>
      ${stages}
      <button class="map-btn ghost small-btn" data-asp-change>${done ? 'Elegir otra meta' : this.aspPicking ? 'Cancelar' : 'Cambiar de meta'}</button>
      ${picker}</div>`;
  }

  private traitPickHtml(a: Agent): string {
    if (!a.traitPick) return '';
    const mine = traitsOf(a).map((t) => t.id);
    if (!this.traitOut) {
      return `<div class="prof-h" style="margin-top:8px">✨ Ya es adulto/a: ¿qué rasgo cambia?</div><div class="chips-wrap">${traitsOf(a)
        .map((t) => `<button class="comp" data-tout="${t.id}">${t.icon} Cambiar ${esc(t.label.toLowerCase())}</button>`)
        .join('')}</div>`;
    }
    return `<div class="prof-h" style="margin-top:8px">✨ ¿Por cuál?</div><div class="chips-wrap">${TRAITS.filter((t) => !mine.includes(t.id))
      .map((t) => `<button class="comp" data-tin="${t.id}">${t.icon} ${esc(t.label)}</button>`)
      .join('')}</div>`;
  }

  private emotionsHtml(a: Agent): string {
    const w = this.world;
    const emos = emotionsOf(a).filter((e) => e.until > w.state.minutes);
    const md = mood(a);
    const rows = emos
      .sort((x, y) => y.def.value - x.def.value)
      .map((e) => {
        const h = Math.max(1, Math.round((e.until - w.state.minutes) / 60));
        return `<div class="emo-row"><span>${e.def.icon}</span><span>${esc(e.def.label)}${e.about ? ` <span class="muted small">(${esc(e.about)})</span>` : ''}<div class="muted small">${h >= 24 ? `${Math.round(h / 24)} ${Math.round(h / 24) === 1 ? 'día' : 'días'}` : `${h} h`} más</div></span><span class="v ${e.def.value < 0 ? 'bad' : 'good'}">${e.def.value > 0 ? '+' : ''}${e.def.value}</span></div>`;
      })
      .join('');
    return `<div class="prof-sec"><div class="prof-h">${md.icon} Ánimo: ${esc(md.label)}</div>${rows || '<div class="muted small">Nada especial: va tirando. El ánimo depende de sus necesidades y de lo que le pase.</div>'}</div>`;
  }

  /** Protectora: elegir qué mascota adoptar. */
  private showAdoption() {
    const w = this.world;
    const pets = (Object.keys(SPECIES) as SpeciesId[]).filter((id) => SPECIES[id].kind === 'pet');
    const items = pets
      .map((id) => {
        const sp = SPECIES[id];
        const check = w.canAdopt(id);
        const extra = sp.habitat ? 'Vive en su jaula' : sp.outdoor ? 'Le gusta el jardín y el agua' : sp.aloof ? 'Independiente' : '';
        return `<button class="act" data-adopt="${id}" ${check.ok ? '' : 'disabled'}>
          <span class="act-icon">${sp.icon}</span>
          <span class="act-label">${esc(sp.label)} · §${sp.price}<small class="${check.ok ? 'info' : ''}">${esc(check.reason ?? extra)}</small></span>
        </button>`;
      })
      .join('');
    $('#sheet').querySelector('.sheet-card')!.innerHTML = `
      <div class="sheet-head">
        <div><div class="sheet-title">🏠 Protectora de animales</div><div class="sheet-sub">Tenéis § ${w.household.funds.toLocaleString('es-ES')} · ${w.members.length}/${MAX_MEMBERS} en casa</div></div>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <div class="sheet-who">¿A quién adoptáis?</div>
      <div class="sheet-actions">${items}</div>`;
  }

  private closeSheet() {
    $('#sheet').hidden = true;
    this.sheetTarget = null;
  }

  // ---------------------------------------------------------------------------
  // Render periódico
  // ---------------------------------------------------------------------------

  render() {
    const w = this.world;
    const a = w.activeAgent;

    this.renderGone();
    $('#build-btn').classList.toggle('dim', !this.world.canBuildHere());
    if (!$('#build').hidden) {
      if (!this.world.canBuildHere()) this.exitBuild();
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

    // Retratos
    const portraits = w.members
      .map((m) => {
        const md = mood(m);
        const face = m.kind === 'person' ? esc(m.name[0]) : SPECIES[m.species].icon;
        const bg = m.kind === 'person' ? hexColor(m.color) : '#3a3f55';
        return `<button class="portrait ${m.id === a.id ? 'active' : ''} ${m.hidden || m.travel || m.lotId !== w.viewLotId ? 'away' : ''}" data-id="${m.id}" style="--ring:${md.color};--bg:${bg}" aria-label="${esc(m.name)}">
          <span class="face">${face}</span><span class="pmood">${md.icon}</span>
        </button>`;
      })
      .join('');
    if (portraits !== this.lastPortraitsHtml) {
      $('#portraits').innerHTML = portraits;
      this.lastPortraitsHtml = portraits;
    }

    // Cabecera del panel
    const md = mood(a);
    const stage = lifeStage(a.species, a.ageDays);
    $('#who').innerHTML = `<b>${esc(a.name)}</b> <span class="muted">${esc(stage.label)} · ${a.ageDays} ${a.ageDays === 1 ? 'día' : 'días'}</span> <span title="${md.label}">${md.icon}</span>`;

    // Cola de acciones
    const tasks = [a.current, ...a.queue].filter((t) => t && t.actionId !== 'idle');
    const until = a.travel ? `${String(Math.floor((a.travel.arrive % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(a.travel.arrive % 60)).padStart(2, '0')}` : '';
    const travelChip = !a.travel
      ? ''
      : a.travel.reason === 'work'
        ? `<div class="chip now"><span>💼</span><span class="chip-l">En el trabajo hasta las ${until}</span></div>`
        : a.travel.reason === 'school'
          ? `<div class="chip now"><span>🎒</span><span class="chip-l">En clase hasta las ${until}</span></div>`
          : `<div class="chip now"><span>🚶</span><span class="chip-l">De camino a: ${esc(this.placeName(a.travel.to))}</span></div>`;
    let queueHtml = travelChip + tasks
      .map((t, i) => {
        const def = ACTIONS[t!.actionId];
        const target = t!.targetAgentId ? w.agent(t!.targetAgentId)?.name : '';
        const label = t!.passiveOf ? `${def.verb} con ${w.agent(t!.passiveOf)?.name ?? ''}` : `${i === 0 ? def.verb : def.label}${target ? ` · ${target}` : ''}`;
        const cancel = def.forced || t!.passiveOf ? '' : `<button class="x" data-task="${t!.id}" aria-label="Cancelar">✕</button>`;
        return `<div class="chip ${i === 0 ? 'now' : ''} ${t!.byPlayer ? '' : 'auto'}"><span>${def.icon}</span><span class="chip-l">${esc(label)}</span>${cancel}</div>`;
      })
      .join('');
    if (!queueHtml) {
      const own = w.optionsFor(a.id, { kind: 'agent', id: a.id }).length > 0;
      const homeDef = a.home ? w.object(a.home)?.def : undefined;
      const where = homeDef === 'crib' ? 'Toca su cuna' : homeDef ? 'Toca su jaula' : 'Toca algo';
      queueHtml = `<div class="hint">${a.kind === 'pet' ? '🐾' : '👆'} ${where}${own ? ` o a ${esc(a.name)}` : ''} para darle una orden</div>`;
    }
    if (queueHtml !== this.lastQueueHtml) {
      $('#queue').innerHTML = queueHtml;
      this.lastQueueHtml = queueHtml;
    }

    // Deseos del personaje activo (tócalos para ponerte a cumplirlos)
    const wishes = a.wishes ?? [];
    const wishHtml = wishes.length
      ? `<span class="wish-title">⭐ Deseos</span>${wishes.map((wi) => `<button class="wish" data-wish="${wi.id}"><span>${wi.icon}</span><span class="chip-l">${esc(wi.label)}</span><b>+§${wi.reward}</b></button>`).join('')}`
      : '';
    if (wishHtml !== this.lastWishHtml) {
      $('#wishes').innerHTML = wishHtml;
      this.lastWishHtml = wishHtml;
    }

    // Cómo se siente (emociones con causa)
    const emos = emotionsOf(a)
      .filter((e) => e.until > w.state.minutes)
      .sort((x, y) => Math.abs(y.def.value) - Math.abs(x.def.value));
    const emoHtml = emos
      .map((e) => `<span class="emo ${e.def.value < 0 ? 'bad' : ''}">${e.def.icon} ${esc(e.def.label)} <b>${e.def.value > 0 ? '+' : ''}${e.def.value}</b></span>`)
      .join('');
    if (emoHtml !== this.lastEmoHtml) {
      $('#emotions').innerHTML = emoHtml;
      this.lastEmoHtml = emoHtml;
    }

    this.syncTalk();
    this.syncDilemma();

    // Necesidades
    if (this.needsFor !== a.id) {
      $('#needs').innerHTML = NEED_KEYS.map(
        (k) => `<div class="need"><span class="ni">${NEED_INFO[k].icon}</span><span class="nl">${esc(needLabel(a.species, k))}</span><div class="bar"><div class="fill" data-need="${k}"></div></div></div>`,
      ).join('');
      this.needsFor = a.id;
    }
    for (const el of $('#needs').querySelectorAll<HTMLElement>('.fill')) {
      const v = a.needs[el.dataset.need as keyof Agent['needs']];
      el.style.width = `${v}%`;
      el.style.background = needColor(v);
    }
  }
}
