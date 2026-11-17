// Estaciones: cada semana de juego es una estación (primavera, verano, otoño, invierno).

export interface SeasonDef {
  id: string;
  label: string;
  icon: string;
  /** Color del césped. */
  grass: number;
  /** Lo que se dice al empezar. */
  intro: string;
}

export const SEASONS: SeasonDef[] = [
  { id: 'primavera', label: 'Primavera', icon: '🌸', grass: 0x79b65a, intro: '¡Ha llegado la primavera! Y ya se sabe: la primavera, la sangre altera' },
  { id: 'verano', label: 'Verano', icon: '☀️', grass: 0x9bb552, intro: 'Empieza el verano: chanclas, sandía y siesta con ventilador' },
  { id: 'otono', label: 'Otoño', icon: '🍂', grass: 0xa59a52, intro: 'Llega el otoño: vuelta a la rutina y castañas asadas' },
  { id: 'invierno', label: 'Invierno', icon: '❄️', grass: 0x9fb3a0, intro: 'Llega el invierno: mantita, brasero y lotería de Navidad' },
];

export interface EventDef {
  id: string;
  label: string;
  icon: string;
}

export const EVENTS: Record<string, EventDef> = {
  calor: { id: 'calor', label: 'Ola de calor', icon: '🥵' },
  verbena: { id: 'verbena', label: 'Verbena en el parque', icon: '🎆' },
  ofertas: { id: 'ofertas', label: 'Días de la huerta en el Mercadona', icon: '🥬' },
  apagon: { id: 'apagon', label: 'Apagón', icon: '🕯️' },
  boda: { id: 'boda', label: 'Boda en el parque', icon: '💒' },
  navidad: { id: 'navidad', label: 'Navidad', icon: '🎄' },
  campana: { id: 'campana', label: 'Campaña electoral', icon: '🗳️' },
  lluvia: { id: 'lluvia', label: 'Llueve', icon: '🌧️' },
  nevada: { id: 'nevada', label: 'Nieva', icon: '🌨️' },
  sanisidro: { id: 'sanisidro', label: 'San Isidro', icon: '🎩' },
  reyes: { id: 'reyes', label: 'Día de Reyes', icon: '👑' },
  cabalgata: { id: 'cabalgata', label: 'Cabalgata de Reyes', icon: '🐪' },
  carnaval: { id: 'carnaval', label: 'Carnaval', icon: '🎭' },
  desfile: { id: 'desfile', label: 'Desfile de Carnaval', icon: '🎉' },
  halloween: { id: 'halloween', label: 'Halloween', icon: '🎃' },
};

/** Aparatos que no funcionan sin luz. */
export const ELECTRIC = new Set(['tv', 'computer', 'gamebox', 'stereo', 'treadmill', 'lamp', 'jukebox', 'karaoke', 'hot_tub', 'aquarium']);

/** Acciones que necesitan luz aunque el objeto no sea un aparato (ver la tele desde el sofá). */
export const POWERED_ACTIONS = new Set(['watch_tv', 'browse', 'play_games', 'dance', 'listen_music', 'run', 'find_job', 'throw_party', 'order_groceries']);
