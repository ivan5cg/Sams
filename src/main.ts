import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { DPR, HouseScene } from './render/HouseScene';
import { deleteGame, loadGame, saveGame, saveGameSync } from './save/db';
import { migrate, serialize } from './save/serialize';
import { World } from './sim/world';
import { Hud } from './ui/hud';
import { markRenderer, setWebglWanted, webglWanted } from './render/gfx';
import { DEBUG } from './render/perf';
import { applyPrefs } from './prefs';

const AUTOSAVE_MS = 30_000;

applyPrefs();

async function boot() {
  const saved = await loadGame();
  let world = saved ? new World(saved) : World.createNew();
  // Al abrir la app, el tiempo corre (las partidas guardadas en pausa por versiones anteriores, también).
  if (world.state.speed === 0) world.state.speed = 1;

  const hud = new Hud(world, {
    onSave: async () => {
      await saveGame(world.state);
      hud.toast('Partida guardada', '💾');
    },
    onExport: () => {
      const blob = new Blob([serialize(world.state)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sams-dia-${world.day}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onImport: async (file) => {
      try {
        const state = migrate(JSON.parse(await file.text()));
        setWorld(new World(state));
        await saveGame(world.state);
        hud.toast('Partida importada', '📥');
      } catch (e) {
        hud.toast((e as Error).message || 'No se pudo importar', '⚠️');
      }
    },
    onReload: () => {
      // Se guarda antes de recargar (el cambio de gráficos se aplica al arrancar).
      saveGameSync(world.state);
      location.reload();
    },
    onNewGame: async (family) => {
      await deleteGame();
      setWorld(World.createNew(family));
      await saveGame(world.state);
      hud.toast(`¡Bienvenida a casa, ${world.household.name.replace(/^Familia/, 'familia')}!`, '🏡');
    },
  });

  const bindToasts = (w: World) => w.onToast((t) => hud.notify(t));
  bindToasts(world);

  const game = new Phaser.Game({
    // Normal: Canvas 2D (en algunos Android, WebGL dejaba textos y emojis invisibles).
    // Avanzado (opción del menú): WebGL con efectos; si el móvil no puede, Phaser vuelve solo a Canvas.
    type: webglWanted() ? Phaser.AUTO : Phaser.CANVAS,
    fps: { limit: 45 },
    parent: 'game',
    backgroundColor: '#3d5a40',
    // Canvas a resolución nativa (nítido en pantallas retina) y reducido por CSS.
    scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * DPR, height: window.innerHeight * DPR, zoom: 1 / DPR },
    render: { antialias: true, roundPixels: false },
    input: { activePointers: 3 },
  });
  const isWebgl = game.renderer?.type === Phaser.WEBGL;
  markRenderer(isWebgl);
  if (webglWanted() && !isWebgl) {
    setWebglWanted(false);
    setTimeout(() => hud.toast('Este móvil no admite los gráficos avanzados: seguimos en normal', '🖥️'), 1500);
  }
  if (isWebgl) {
    // Si el móvil "olvida" los gráficos (al volver a la app), se vuelven a dibujar.
    game.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => (game.scene.getScene('house') as HouseScene).rebuildAfterContextLoss());
  }
  game.scene.add('house', HouseScene, true, {
    world,
    onTap: (t: Parameters<Hud['handleTap']>[0], tile: { x: number; y: number }) => hud.handleTap(t, tile),
    onLongPress: (id: string) => hud.longPress(id),
  });
  hud.setScene(() => game.scene.getScene('house') as HouseScene);

  window.addEventListener('resize', () => game.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR));

  function setWorld(w: World) {
    world = w;
    bindToasts(w);
    (game.scene.getScene('house') as HouseScene).setWorld(w);
    hud.setWorld(w);
  }

  // Guardado automático y pausa al salir de la app. Con el creador de familia abierto no se guarda
  // (la primera vez, la familia de mientras no es la de nadie: si se cierra la app, se vuelve a elegir).
  const choosing = () => hud.creator.isOpen;
  setInterval(() => !choosing() && saveGame(world.state), AUTOSAVE_MS);
  let speedBeforeHide = world.state.speed;
  document.addEventListener('visibilitychange', () => {
    if (choosing()) return;
    if (document.hidden) {
      // Se guarda con la velocidad a la que se jugaba (si no, al volver a abrir la app arrancaría en pausa).
      speedBeforeHide = world.state.speed;
      saveGameSync(world.state);
      saveGame(world.state);
      world.state.speed = 0;
    } else if (world.state.speed === 0) {
      world.state.speed = speedBeforeHide;
    }
  });
  window.addEventListener('pagehide', () => !choosing() && saveGameSync(world.state));

  // El sonido se carga después de arrancar (no retrasa la primera imagen).
  void import('./audio').then((m) => {
    hud.audio = m.startAudio(() => world, () => game.scene.getScene('house') as HouseScene | undefined);
    Object.assign((window as unknown as { sams: object }).sams, { audio: hud.audio });
  });

  // Panel de rendimiento (?debug): se carga aparte, solo si se pide.
  if (DEBUG) void import('./ui/debug').then((m) => m.startDebugOverlay(game, () => world));

  // Acceso para depurar desde la consola del navegador.
  Object.assign(window, { sams: { get world() { return world; }, game } });

  // Fuera la pantalla de carga.
  const loading = document.getElementById('loading');
  loading?.classList.add('out');
  setTimeout(() => loading?.remove(), 500);

  // La primera vez, antes de nada, se elige la familia (y luego viene el tutorial).
  hud.startGuide(!saved);
}

registerSW({ immediate: true });
boot().catch((e) => {
  // Si algo falla al arrancar, que no se quede la pantalla de carga para siempre.
  console.error(e);
  const small = document.querySelector('#loading small');
  if (small) small.textContent = 'No se ha podido abrir el juego. Prueba a recargar la página.';
});
