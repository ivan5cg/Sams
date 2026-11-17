// Qué suena en cada momento: acciones, avisos, ambiente por sitio y hora, y música.
// Funciones puras (sin Web Audio) para poder probarlas sin navegador.

import type { SpeciesId } from '../sim/types';
import type { World } from '../sim/world';

export type SoundId =
  | 'tap' | 'open' | 'close' | 'buy' | 'sell' | 'error' | 'coins' | 'fanfare' | 'bills' | 'lottery'
  | 'baby' | 'alarm' | 'fireworks' | 'fart' | 'bark' | 'meow' | 'squeak' | 'dook' | 'capybara'
  | 'step' | 'door' | 'fridge' | 'sizzle' | 'shower' | 'flush' | 'tv' | 'guitar' | 'yawn'
  | 'munch' | 'thud' | 'kiss' | 'splash' | 'cheer' | 'slot' | 'pop' | 'chime' | 'accordion' | 'wish';

/** Sonido al empezar una acción (en la parcela que se ve, más bajo cuanto más lejos). «pet» = el de la mascota. */
export const ACTION_SOUNDS: Partial<Record<string, SoundId | 'pet'>> = {
  eat: 'fridge', snack: 'munch', cook: 'sizzle', pet_eat: 'munch', cage_eat: 'munch', acai_bowl: 'munch', calamares: 'munch',
  bravas: 'munch', tortilla: 'munch', churros: 'munch', rosquillas: 'munch', buy_hotdog: 'munch', buy_fruit: 'munch',
  shower: 'shower', bath: 'shower', bathe_pet: 'splash', swim: 'splash', toilet: 'flush',
  watch_tv: 'tv', watch_football: 'tv', play_games: 'tv', play_guitar: 'guitar', busk: 'guitar', play_piano: 'guitar', piano_family: 'guitar', compose: 'guitar', concert: 'guitar', bake: 'sizzle',
  sleep: 'yawn', nap_bed: 'yawn', nap_sofa: 'yawn', baby_sleep: 'yawn', pass_out: 'thud', vomit: 'thud',
  fart: 'fart', kiss: 'kiss', hug: 'kiss', cry: 'baby', squeak: 'squeak', war_dance: 'dook', steal: 'dook',
  tragaperras: 'slot', cana: 'pop', vermut: 'pop', chupito: 'pop', drink_beer: 'pop', throw_coin: 'splash',
  joke: 'cheer', dance: 'cheer', selfie: 'pop', play_accordion: 'accordion',
  pet_animal: 'pet', play_pet: 'pet', play_ball: 'pet', beg_affection: 'pet', play_with_person: 'pet', walk_dog: 'pet',
};

/** Sonido de cada especie (para «pet»: la mascota que participa). */
export const PET_SOUND: Partial<Record<SpeciesId, SoundId>> = { dog: 'bark', cat: 'meow', guineapig: 'squeak', ferret: 'dook', capybara: 'capybara' };

/** Sonidos de los avisos, por su icono (los avisos son lo que le importa al jugador). */
export const TOAST_SOUNDS: Record<string, SoundId> = {
  '💰': 'coins', '🤑': 'lottery', '🎟️': 'lottery', '🎫': 'coins', '🎰': 'slot', '⭐': 'wish', '🏆': 'fanfare', '🎉': 'fanfare',
  '🎂': 'fanfare', '👶': 'baby', '💘': 'fanfare', '💍': 'fanfare', '🧾': 'bills', '⚠️': 'error', '🚫': 'error', '💸': 'error',
  '🏷️': 'sell', '🔔': 'door', '🎆': 'fireworks', '🍇': 'fireworks', '🎄': 'chime', '😭': 'baby', '🆘': 'alarm', '❗': 'alarm',
  '🏗️': 'fanfare', '🥳': 'cheer', '🎪': 'cheer', '🦌': 'error', '💔': 'error', '📦': 'error',
};

/** Capas de ambiente de la parcela que se ve (sitio + hora + tiempo). */
export function ambienceFor(w: World): string[] {
  const lot = w.lotById(w.viewLotId);
  const night = w.hour >= 22 || w.hour < 6;
  const layers: string[] = [];
  switch (lot?.layout) {
    case 'park':
      layers.push(night ? 'night' : 'park');
      break;
    case 'plaza':
      layers.push('plaza');
      if (night) layers.push('night');
      break;
    case 'bar':
      layers.push('bar');
      break;
    case 'metro':
      layers.push('metro');
      break;
    case 'super':
    case 'acai':
    case 'studio':
      layers.push('shop');
      break;
    default:
      layers.push('home');
      if (night) layers.push('night');
  }
  if (lot?.layout !== 'metro') {
    if (w.hasEvent('lluvia')) layers.push('rain');
    else if (w.hasEvent('nevada')) layers.push('wind');
  }
  return layers;
}

/** La música que toca ahora. */
export function musicFor(w: World): string {
  const view = w.viewLotId;
  if (w.state.party && w.state.party.lotId === view) return 'party';
  if (w.hasEvent('verbena', view) || (w.hasEvent('sanisidro') && w.lotById(view)?.kind !== 'home')) return 'chotis';
  if (w.hasEvent('navidad')) return 'navidad';
  if (w.hour >= 21 || w.hour < 7) return 'night';
  return 'day';
}

/** Volumen según la distancia (en casillas) entre el sonido y el centro de la cámara. */
export function distanceGain(d: number): number {
  return Math.max(0, Math.min(1, 1.15 - d / 10));
}
