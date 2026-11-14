export type ObjectShape = 'box' | 'flat' | 'none' | 'cage' | 'pond' | 'post' | 'hammock' | 'swings' | 'bench';

export interface ObjectDef {
  id: string;
  name: string;
  icon: string;
  w: number;
  h: number;
  /** Altura del bloque al dibujarlo, en píxeles. */
  height: number;
  color: number;
  /** Cómo se dibuja. */
  shape?: ObjectShape;
  /** Cuántos agentes a la vez. */
  capacity: number;
  /** El agente se coloca encima del objeto al usarlo (cama, sofá, váter...). */
  snap?: boolean;
  /** Se puede caminar por encima. */
  walkable?: boolean;
  /** Objeto pequeño que un hurón puede robar. */
  small?: boolean;
  actions: string[];
  /** Raciones que caben (comedero, heno). */
  maxStock?: number;
  /** Suciedad a partir de la cual ya no se puede usar (arenero, jaula). */
  maxDirt?: number;
}

const D: ObjectDef[] = [
  { id: 'bed', name: 'Cama de matrimonio', icon: '🛏️', w: 2, h: 1, height: 14, color: 0x6c8ebf, capacity: 3, snap: true, actions: ['sleep', 'nap_bed'] },
  { id: 'fridge', name: 'Nevera', icon: '🧊', w: 1, h: 1, height: 46, color: 0xdfe6ea, capacity: 1, actions: ['eat', 'snack'] },
  { id: 'toilet', name: 'Váter', icon: '🚽', w: 1, h: 1, height: 14, color: 0xf4f4f4, capacity: 1, snap: true, actions: ['toilet'] },
  { id: 'shower', name: 'Ducha', icon: '🚿', w: 1, h: 1, height: 6, color: 0x9fd3e6, capacity: 1, snap: true, actions: ['shower'] },
  { id: 'sofa', name: 'Sofá', icon: '🛋️', w: 1, h: 2, height: 16, color: 0xb5651d, capacity: 2, snap: true, actions: ['watch_tv', 'nap_sofa', 'sniff_sofa', 'scratch_sofa'] },
  { id: 'tv', name: 'Televisión', icon: '📺', w: 1, h: 1, height: 30, color: 0x333a44, capacity: 0, actions: [] },
  { id: 'bookshelf', name: 'Estantería', icon: '📚', w: 1, h: 1, height: 44, color: 0x8b5a2b, capacity: 1, actions: ['read'] },
  { id: 'computer', name: 'Ordenador', icon: '💻', w: 1, h: 1, height: 22, color: 0x7a5230, capacity: 1, actions: ['browse', 'adopt'] },
  { id: 'plant', name: 'Planta', icon: '🪴', w: 1, h: 1, height: 10, color: 0x6b8e4e, shape: 'none', capacity: 0, actions: [] },
  { id: 'slippers', name: 'Zapatillas', icon: '🩴', w: 1, h: 1, height: 0, color: 0x5577aa, shape: 'none', capacity: 1, walkable: true, small: true, actions: ['steal'] },
  { id: 'puddle', name: 'Charco', icon: '💧', w: 1, h: 1, height: 0, color: 0xe8d55a, shape: 'flat', capacity: 1, walkable: true, actions: ['clean'] },

  // Mascotas
  { id: 'bowl', name: 'Comedero', icon: '🥣', w: 1, h: 1, height: 4, color: 0xd9534f, capacity: 1, actions: ['pet_eat', 'fill_bowl'], maxStock: 3 },
  { id: 'dogbed', name: 'Cama de perro', icon: '🧺', w: 1, h: 1, height: 6, color: 0xc9a66b, capacity: 1, snap: true, actions: ['pet_sleep'] },
  { id: 'ball', name: 'Pelota', icon: '🎾', w: 1, h: 1, height: 0, color: 0x7fbf3f, shape: 'none', capacity: 1, walkable: true, snap: true, small: true, actions: ['play_ball', 'steal'] },
  { id: 'tree', name: 'Árbol', icon: '🌳', w: 1, h: 1, height: 8, color: 0x5b8c3a, shape: 'none', capacity: 1, actions: ['pee_outside'] },
  { id: 'litterbox', name: 'Arenero', icon: '', w: 1, h: 1, height: 9, color: 0xe3cf9c, capacity: 1, snap: true, actions: ['use_litter', 'clean_litter'], maxDirt: 4 },
  { id: 'scratcher', name: 'Rascador', icon: '', w: 1, h: 1, height: 44, color: 0xc8a27a, shape: 'post', capacity: 1, snap: true, actions: ['scratch_post', 'sleep_post'] },
  { id: 'cage', name: 'Jaula de cobaya', icon: '', w: 2, h: 1, height: 22, color: 0x4a90d9, shape: 'cage', capacity: 2, actions: ['cage_eat', 'cage_sleep', 'cage_run', 'cage_pee', 'refill_hay', 'clean_cage'], maxStock: 3, maxDirt: 5 },
  { id: 'hammock', name: 'Hamaca de hurón', icon: '', w: 1, h: 1, height: 26, color: 0x8e5bd6, shape: 'hammock', capacity: 1, snap: true, actions: ['ferret_sleep'] },
  { id: 'pond', name: 'Estanque', icon: '', w: 2, h: 2, height: 0, color: 0x4aa3df, shape: 'pond', capacity: 3, snap: true, actions: ['swim'] },
  // Parque
  { id: 'bench', name: 'Banco', icon: '', w: 1, h: 1, height: 12, color: 0x8b5a2b, shape: 'bench', capacity: 2, snap: true, actions: ['sit_bench'] },
  { id: 'swings', name: 'Columpios', icon: '', w: 2, h: 1, height: 40, color: 0xd9534f, shape: 'swings', capacity: 2, snap: true, actions: ['swing'] },
  { id: 'foodcart', name: 'Puesto de perritos', icon: '🌭', w: 1, h: 1, height: 30, color: 0xe74c3c, capacity: 1, actions: ['buy_hotdog'] },
  { id: 'flowers', name: 'Flores', icon: '🌷', w: 1, h: 1, height: 0, color: 0x6b8e4e, shape: 'none', capacity: 0, actions: [] },
  { id: 'strawbed', name: 'Lecho de paja', icon: '🌾', w: 1, h: 1, height: 0, color: 0xe5c76b, shape: 'flat', capacity: 1, snap: true, walkable: true, actions: ['capy_sleep'] },
];

export const OBJECTS: Record<string, ObjectDef> = Object.fromEntries(D.map((d) => [d.id, d]));
