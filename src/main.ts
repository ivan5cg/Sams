import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { DPR, HouseScene } from './render/HouseScene';
import { deleteGame, loadGame, saveGame, saveGameSync } from './save/db';
import { migrate, serialize } from './save/serialize';
import { World } from './sim/world';
import { Hud } from './ui/hud';

const AUTOSAVE_MS = 30_000;

async function boot() {
  const saved = await loadGame();
  let world = saved ? new World(saved) : World.createNew();

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
    onNewGame: async () => {
      await deleteGame();
      setWorld(World.createNew());
      await saveGame(world.state);
      hud.toast('¡Bienvenidos a casa!', '🏡');
    },
  });

  const bindToasts = (w: World) => w.onToast((t) => hud.toast(t.text, t.icon));
  bindToasts(world);

  const game = new Phaser.Game({
    // Canvas 2D en vez de WebGL: en algunos móviles Android, WebGL dejaba los textos
    // y emojis invisibles. El juego es ligero y en canvas 2D se ve igual en todas partes.
    type: Phaser.CANVAS,
    fps: { limit: 45 },
    parent: 'game',
    backgroundColor: '#3d5a40',
    // Canvas a resolución nativa (nítido en pantallas retina) y reducido por CSS.
    scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * DPR, height: window.innerHeight * DPR, zoom: 1 / DPR },
    render: { antialias: true, roundPixels: false },
    input: { activePointers: 3 },
  });
  game.scene.add('house', HouseScene, true, {
    world,
    onTap: (t: Parameters<Hud['handleTap']>[0], tile: { x: number; y: number }) => hud.handleTap(t, tile),
  });
  hud.setScene(() => game.scene.getScene('house') as HouseScene);

  window.addEventListener('resize', () => game.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR));

  function setWorld(w: World) {
    world = w;
    bindToasts(w);
    (game.scene.getScene('house') as HouseScene).setWorld(w);
    hud.setWorld(w);
  }

  // Guardado automático y pausa al salir de la app.
  setInterval(() => saveGame(world.state), AUTOSAVE_MS);
  let speedBeforeHide = world.state.speed;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      speedBeforeHide = world.state.speed;
      world.state.speed = 0;
      saveGameSync(world.state);
      saveGame(world.state);
    } else if (world.state.speed === 0) {
      world.state.speed = speedBeforeHide;
    }
  });
  window.addEventListener('pagehide', () => saveGameSync(world.state));

  // Acceso para depurar desde la consola del navegador.
  Object.assign(window, { sams: { get world() { return world; }, game } });

  hud.showTutorial();
  if (!saved) hud.toast('¡Bienvenidos a casa! Toca algo para dar órdenes', '🏡');
}

registerSW({ immediate: true });
boot();
