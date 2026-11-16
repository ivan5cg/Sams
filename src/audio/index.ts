// Director del sonido: escucha la simulación (avisos y eventos), la escena (dónde mira la
// cámara) y la interfaz (botones y paneles), y decide qué suena. Se carga después del arranque.

import { CAREERS, workDays } from '../data/careers';
import type { Agent } from '../sim/types';
import type { SimEvent, Toast, World } from '../sim/world';
import { ACTION_SOUNDS, PET_SOUND, TOAST_SOUNDS, ambienceFor, distanceGain, musicFor, type SoundId } from './cues';
import { AudioEngine } from './engine';

export { AudioEngine };

interface Listener {
  listenerTile(): { lotId: string; x: number; y: number };
}

const OVERLAYS = ['#sheet', '#map', '#profile', '#menu', '#log', '#agenda', '#feats', '#build', '#talk', '#dilemma'];

export function startAudio(getWorld: () => World, getScene: () => Listener | undefined): AudioEngine {
  const engine = new AudioEngine();
  const bound = new WeakSet<World>();

  /** Volumen de algo que pasa en (lotId, x, y) según dónde mira la cámara (0 si es en otra parcela). */
  const gainAt = (lotId: string, x: number, y: number): number => {
    const l = getScene()?.listenerTile();
    if (!l || l.lotId !== lotId) return 0;
    return distanceGain(Math.hypot(x - l.x, y - l.y));
  };
  const agentGain = (a: Agent | undefined) => (a && !a.travel && !a.hidden ? gainAt(a.lotId, a.pos.x, a.pos.y) : 0);

  const onToast = (t: Toast) => {
    const id = t.icon ? TOAST_SOUNDS[t.icon] : undefined;
    if (id) engine.play(id, 0.9, 0.25);
    if (t.icon === '🚇' && t.text.startsWith('Próxima estación')) engine.announce(t.text.split('.')[0]);
  };

  const onEvent = (e: SimEvent) => {
    const w = getWorld();
    if (e.type === 'door') {
      if (e.lotId === w.viewLotId) engine.play('door', 0.6, 0.3);
      return;
    }
    if (e.type === 'sound') {
      if (!e.lotId || e.lotId === w.viewLotId) engine.play(e.id as SoundId, 1);
      return;
    }
    if (e.type !== 'act') return;
    const a = w.agent(e.agentId);
    const gain = agentGain(a);
    if (!a || !gain) return;
    let id = ACTION_SOUNDS[e.actionId];
    let pet: Agent | undefined;
    if (id === 'pet') {
      pet = a.kind === 'pet' ? a : w.agent(a.current?.targetAgentId);
      id = pet?.kind === 'pet' ? PET_SOUND[pet.species] : undefined;
    } else if (!id && a.kind === 'pet' && Math.random() < 0.25) {
      // Las mascotas, de vez en cuando, dicen lo suyo.
      id = PET_SOUND[a.species];
    }
    if (id) engine.play(id, gain);
  };

  const bindWorld = (w: World) => {
    if (bound.has(w)) return;
    bound.add(w);
    w.onToast(onToast);
    w.onEvent(onEvent);
  };
  bindWorld(getWorld());

  // Ambiente y música según el sitio, la hora y lo que pasa (una vez por segundo basta).
  const syncScene = () => {
    const w = getWorld();
    bindWorld(w);
    engine.setAmbience(ambienceFor(w));
    engine.setMusic(musicFor(w));
  };
  syncScene();
  setInterval(syncScene, 1000);

  // Pasos del personaje activo mientras anda.
  setInterval(() => {
    const w = getWorld();
    const a = w.activeAgent;
    if (!a || !w.state.speed || !a.path.length || a.current?.phase !== 'walking') return;
    engine.play('step', agentGain(a) * 0.8, 0.2);
  }, 330);

  // Interfaz: un toque suave en los botones y un sonido al abrir y cerrar paneles.
  document.addEventListener(
    'click',
    (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && !b.disabled) engine.play('tap', 0.6, 0.05);
    },
    { capture: true },
  );
  const watched = OVERLAYS.map((s) => document.querySelector(s)).filter((x): x is Element => !!x);
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      const el = m.target as HTMLElement;
      engine.play(el.hidden ? 'close' : 'open', 0.7, 0.12);
    }
  });
  for (const el of watched) mo.observe(el, { attributes: true, attributeFilter: ['hidden'] });

  // Si el personaje activo tiene que ir al trabajo, suena el despertador una vez.
  let alarmDay = -1;
  setInterval(() => {
    const w = getWorld();
    const a = w.activeAgent;
    const c = a?.job ? CAREERS[a.job.career] : undefined;
    if (!c || alarmDay === w.day || !workDays(a.job!).includes(w.weekday)) return;
    const m = w.state.minutes % 1440;
    if (m >= c.start * 60 - 60 && m < c.start * 60 - 50) {
      alarmDay = w.day;
      engine.play('alarm', 0.8);
    }
  }, 1000);

  return engine;
}
