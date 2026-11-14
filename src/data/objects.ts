export interface ObjectDef {
  id: string;
  name: string;
  icon: string;
  w: number;
  h: number;
  /** Altura del bloque al dibujarlo, en píxeles. */
  height: number;
  color: number;
  /** Cuántos agentes a la vez. */
  capacity: number;
  /** El agente se coloca encima del objeto al usarlo (cama, sofá, váter...). */
  snap?: boolean;
  /** Se puede caminar por encima. */
  walkable?: boolean;
  actions: string[];
  maxStock?: number;
}

const D: ObjectDef[] = [
  { id: 'bed', name: 'Cama de matrimonio', icon: '🛏️', w: 2, h: 1, height: 14, color: 0x6c8ebf, capacity: 2, snap: true, actions: ['sleep', 'nap_bed'] },
  { id: 'fridge', name: 'Nevera', icon: '🧊', w: 1, h: 1, height: 46, color: 0xdfe6ea, capacity: 1, actions: ['eat', 'snack'] },
  { id: 'toilet', name: 'Váter', icon: '🚽', w: 1, h: 1, height: 14, color: 0xf4f4f4, capacity: 1, snap: true, actions: ['toilet'] },
  { id: 'shower', name: 'Ducha', icon: '🚿', w: 1, h: 1, height: 6, color: 0x9fd3e6, capacity: 1, snap: true, actions: ['shower'] },
  { id: 'sofa', name: 'Sofá', icon: '🛋️', w: 1, h: 2, height: 16, color: 0xb5651d, capacity: 2, snap: true, actions: ['watch_tv', 'nap_sofa', 'sniff_sofa'] },
  { id: 'tv', name: 'Televisión', icon: '📺', w: 1, h: 1, height: 30, color: 0x333a44, capacity: 0, actions: [] },
  { id: 'bookshelf', name: 'Estantería', icon: '📚', w: 1, h: 1, height: 44, color: 0x8b5a2b, capacity: 1, actions: ['read'] },
  { id: 'bowl', name: 'Comedero', icon: '🥣', w: 1, h: 1, height: 4, color: 0xd9534f, capacity: 1, actions: ['pet_eat', 'fill_bowl'], maxStock: 3 },
  { id: 'dogbed', name: 'Cama de perro', icon: '🧺', w: 1, h: 1, height: 6, color: 0xc9a66b, capacity: 1, snap: true, actions: ['pet_sleep'] },
  { id: 'ball', name: 'Pelota', icon: '🎾', w: 1, h: 1, height: 0, color: 0x7fbf3f, capacity: 1, walkable: true, snap: true, actions: ['play_ball'] },
  { id: 'tree', name: 'Árbol', icon: '🌳', w: 1, h: 1, height: 8, color: 0x5b8c3a, capacity: 1, actions: ['pee_outside'] },
  { id: 'plant', name: 'Planta', icon: '🪴', w: 1, h: 1, height: 10, color: 0x6b8e4e, capacity: 0, actions: [] },
  { id: 'puddle', name: 'Charco', icon: '💧', w: 1, h: 1, height: 0, color: 0xe8d55a, capacity: 1, walkable: true, actions: ['clean'] },
];

export const OBJECTS: Record<string, ObjectDef> = Object.fromEntries(D.map((d) => [d.id, d]));
