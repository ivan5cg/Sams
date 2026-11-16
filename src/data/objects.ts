export type ObjectShape = 'box' | 'flat' | 'none' | 'cage' | 'pond' | 'post' | 'hammock' | 'swings' | 'bench';

export type CatalogCategory = 'descanso' | 'cocina' | 'ocio' | 'mascotas' | 'deco';

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
  /** Precio en la tienda (si no tiene, no se vende ni se compra). */
  price?: number;
  /** Sección del catálogo del modo construcción. */
  category?: CatalogCategory;
  /** Cuánto alegra el ambiente a quien está cerca. */
  decor?: number;
  /** Se puede estropear y hay que repararlo. */
  breakable?: boolean;
  /** Se vende en tres calidades (básica, normal, de lujo). */
  tiers?: boolean;
}

/** Calidades de los muebles: precio, cuánto mejor funcionan, lo que se rompen. */
export const QUALITY: Record<1 | 2 | 3, { label: string; short: string; price: number; mult: number; breaks: number }> = {
  1: { label: 'Básica', short: 'básico/a', price: 0.5, mult: 0.8, breaks: 2 },
  2: { label: 'Normal', short: '', price: 1, mult: 1, breaks: 1 },
  3: { label: 'De lujo', short: 'de lujo', price: 3, mult: 1.35, breaks: 0.3 },
};

/** Huella de un mueble colocado (girado, cambian el ancho y el fondo). */
export function sizeOf(o: { def: string; rot?: number }): { w: number; h: number } {
  const d = OBJECTS[o.def];
  return o.rot ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}

/** ¿Se puede girar? (solo tiene sentido si no es cuadrado). */
export const canRotate = (defId: string) => !!OBJECTS[defId] && OBJECTS[defId].w !== OBJECTS[defId].h;

export function priceOf(d: ObjectDef, q: 1 | 2 | 3 = 2): number {
  return Math.round((d.price ?? 0) * (d.tiers ? QUALITY[q].price : 1));
}

export const CATEGORIES: { id: CatalogCategory; label: string; icon: string }[] = [
  { id: 'descanso', label: 'Descanso', icon: '🛏️' },
  { id: 'cocina', label: 'Cocina y baño', icon: '🚿' },
  { id: 'ocio', label: 'Ocio', icon: '🎮' },
  { id: 'mascotas', label: 'Mascotas', icon: '🐾' },
  { id: 'deco', label: 'Jardín y deco', icon: '🪴' },
];

const D: ObjectDef[] = [
  { id: 'bed', name: 'Cama de matrimonio', icon: '🛏️', w: 2, h: 1, height: 14, color: 0x6c8ebf, capacity: 3, snap: true, actions: ['sleep', 'nap_bed'], price: 300, category: 'descanso', tiers: true },
  { id: 'sofa', name: 'Sofá', icon: '🛋️', w: 1, h: 2, height: 16, color: 0xb5651d, capacity: 2, snap: true, actions: ['watch_tv', 'nap_sofa', 'sniff_sofa', 'scratch_sofa'], price: 180, category: 'descanso', tiers: true },
  { id: 'armchair', name: 'Sillón', icon: '💺', w: 1, h: 1, height: 14, color: 0x7b4fa0, capacity: 1, snap: true, actions: ['sit', 'watch_tv', 'sniff_sofa'], price: 120, category: 'descanso', tiers: true },
  { id: 'crib', name: 'Cuna', icon: '', w: 1, h: 1, height: 20, color: 0xf2a7c3, shape: 'cage', capacity: 3, actions: ['baby_sleep'], price: 150, category: 'descanso' },

  { id: 'fridge', name: 'Nevera', icon: '🧊', w: 1, h: 1, height: 46, color: 0xdfe6ea, capacity: 1, actions: ['cook', 'eat', 'snack', 'eat_roscon', 'drink_beer', 'repair'], price: 250, category: 'cocina', breakable: true, tiers: true },
  { id: 'toilet', name: 'Váter', icon: '🚽', w: 1, h: 1, height: 14, color: 0xf4f4f4, capacity: 1, snap: true, actions: ['toilet', 'repair'], price: 120, category: 'cocina', breakable: true, tiers: true },
  { id: 'shower', name: 'Ducha', icon: '🚿', w: 1, h: 1, height: 6, color: 0x9fd3e6, capacity: 1, snap: true, actions: ['shower', 'repair'], price: 200, category: 'cocina', breakable: true, tiers: true },
  { id: 'bathtub', name: 'Bañera', icon: '🛁', w: 1, h: 1, height: 12, color: 0xf7fbff, capacity: 1, snap: true, actions: ['bath', 'repair'], price: 350, category: 'cocina', breakable: true, tiers: true },

  { id: 'tv', name: 'Televisión', icon: '📺', w: 1, h: 1, height: 30, color: 0x333a44, capacity: 0, actions: ['repair'], price: 220, category: 'ocio', breakable: true, tiers: true },
  { id: 'computer', name: 'Ordenador', icon: '💻', w: 1, h: 1, height: 22, color: 0x7a5230, capacity: 1, actions: ['browse', 'whatsapp', 'order_glovo', 'buy_clothes', 'take_course', 'book_trip', 'work_home', 'find_job', 'throw_party', 'day_off', 'order_groceries', 'adopt', 'repair'], price: 350, category: 'ocio', breakable: true },
  { id: 'bookshelf', name: 'Estantería', icon: '📚', w: 1, h: 1, height: 44, color: 0x8b5a2b, capacity: 1, actions: ['read'], price: 90, category: 'ocio', tiers: true },
  { id: 'stereo', name: 'Equipo de música', icon: '📻', w: 1, h: 1, height: 24, color: 0x2d2d3a, capacity: 3, actions: ['dance', 'listen_music', 'repair'], price: 150, category: 'ocio', breakable: true, tiers: true },
  { id: 'gamebox', name: 'Videoconsola', icon: '🎮', w: 1, h: 1, height: 18, color: 0x3a3f55, capacity: 2, actions: ['play_games', 'repair'], price: 280, category: 'ocio', breakable: true, tiers: true },

  { id: 'plant', name: 'Planta', icon: '🪴', w: 1, h: 1, height: 10, color: 0x6b8e4e, shape: 'none', capacity: 0, actions: [], price: 25, category: 'deco', decor: 1 },
  { id: 'lamp', name: 'Lámpara de pie', icon: '💡', w: 1, h: 1, height: 10, color: 0xf3d36b, shape: 'none', capacity: 0, actions: [], price: 40, category: 'deco', decor: 1 },
  { id: 'rug', name: 'Alfombra', icon: '', w: 1, h: 1, height: 0, color: 0xc0392b, shape: 'flat', capacity: 0, walkable: true, actions: [], price: 60, category: 'deco', decor: 1 },
  { id: 'slippers', name: 'Zapatillas', icon: '🩴', w: 1, h: 1, height: 0, color: 0x5577aa, shape: 'none', capacity: 1, walkable: true, small: true, actions: ['steal'], price: 10, category: 'deco' },
  { id: 'puddle', name: 'Charco', icon: '💧', w: 1, h: 1, height: 0, color: 0xe8d55a, shape: 'flat', capacity: 1, walkable: true, actions: ['clean'] },

  // Habilidades
  { id: 'guitar', name: 'Guitarra', icon: '🎸', w: 1, h: 1, height: 6, color: 0x8b5a2b, shape: 'none', capacity: 1, actions: ['play_guitar'], price: 120, category: 'ocio' },
  { id: 'easel', name: 'Caballete', icon: '🎨', w: 1, h: 1, height: 30, color: 0xb08968, shape: 'post', capacity: 1, actions: ['paint'], price: 150, category: 'ocio' },
  { id: 'treadmill', name: 'Cinta de correr', icon: '🏃', w: 1, h: 1, height: 16, color: 0x3c4150, capacity: 1, snap: true, actions: ['run', 'repair'], price: 400, category: 'ocio', breakable: true },
  { id: 'chess', name: 'Mesa de ajedrez', icon: '♟️', w: 1, h: 1, height: 16, color: 0xd2b48c, capacity: 2, actions: ['play_chess'], price: 90, category: 'ocio' },
  { id: 'mirror', name: 'Espejo', icon: '🪞', w: 1, h: 1, height: 40, color: 0xc9d6df, capacity: 1, actions: ['practice_speech'], price: 80, category: 'deco' },
  { id: 'toybox', name: 'Baúl de juguetes', icon: '🧸', w: 1, h: 1, height: 12, color: 0xe76f51, capacity: 2, actions: ['play_toys'], price: 60, category: 'ocio' },
  { id: 'pilates_mat', name: 'Esterilla de pilates', icon: '', w: 1, h: 1, height: 0, color: 0x9b5de5, shape: 'flat', capacity: 1, snap: true, walkable: true, actions: ['pilates'], price: 40, category: 'ocio' },
  { id: 'reformer', name: 'Reformer de pilates', icon: '', w: 2, h: 1, height: 10, color: 0xe9e4dc, capacity: 1, snap: true, actions: ['reformer'] },
  { id: 'desk', name: 'Recepción', icon: '🧘', w: 1, h: 1, height: 24, color: 0xa47551, capacity: 0, actions: [] },

  // Mascotas
  { id: 'bowl', name: 'Comedero', icon: '🥣', w: 1, h: 1, height: 4, color: 0xd9534f, capacity: 1, actions: ['pet_eat', 'fill_bowl'], maxStock: 3, price: 20, category: 'mascotas' },
  { id: 'dogbed', name: 'Cama de perro', icon: '🧺', w: 1, h: 1, height: 6, color: 0xc9a66b, capacity: 1, snap: true, actions: ['pet_sleep'], price: 45, category: 'mascotas' },
  { id: 'ball', name: 'Pelota', icon: '🎾', w: 1, h: 1, height: 0, color: 0x7fbf3f, shape: 'none', capacity: 1, walkable: true, snap: true, small: true, actions: ['play_ball', 'steal'], price: 5, category: 'mascotas' },
  { id: 'tree', name: 'Árbol', icon: '🌳', w: 1, h: 1, height: 8, color: 0x5b8c3a, shape: 'none', capacity: 1, actions: ['pee_outside'], price: 60, category: 'deco', decor: 1 },
  { id: 'litterbox', name: 'Arenero', icon: '', w: 1, h: 1, height: 9, color: 0xe3cf9c, capacity: 1, snap: true, actions: ['use_litter', 'clean_litter'], maxDirt: 4, price: 40, category: 'mascotas' },
  { id: 'scratcher', name: 'Rascador', icon: '', w: 1, h: 1, height: 44, color: 0xc8a27a, shape: 'post', capacity: 1, snap: true, actions: ['scratch_post', 'sleep_post'], price: 60, category: 'mascotas' },
  { id: 'cage', name: 'Jaula de cobaya', icon: '', w: 2, h: 1, height: 22, color: 0x4a90d9, shape: 'cage', capacity: 2, actions: ['cage_eat', 'cage_sleep', 'cage_run', 'cage_pee', 'refill_hay', 'clean_cage'], maxStock: 3, maxDirt: 5, price: 80, category: 'mascotas' },
  { id: 'hammock', name: 'Hamaca de hurón', icon: '', w: 1, h: 1, height: 26, color: 0x8e5bd6, shape: 'hammock', capacity: 1, snap: true, actions: ['ferret_sleep'], price: 50, category: 'mascotas' },
  { id: 'pond', name: 'Estanque', icon: '', w: 2, h: 2, height: 0, color: 0x4aa3df, shape: 'pond', capacity: 3, snap: true, actions: ['swim'], price: 300, category: 'mascotas', decor: 1 },
  { id: 'strawbed', name: 'Lecho de paja', icon: '🌾', w: 1, h: 1, height: 0, color: 0xe5c76b, shape: 'flat', capacity: 1, snap: true, walkable: true, actions: ['capy_sleep'], price: 20, category: 'mascotas' },

  // Ciclo de vida
  { id: 'grave', name: 'Lápida', icon: '🪦', w: 1, h: 1, height: 0, color: 0x888888, shape: 'none', capacity: 1, walkable: true, actions: ['remember'] },

  // Mercadona
  { id: 'super_fridge', name: 'Nevera de lácteos', icon: '', w: 2, h: 1, height: 46, color: 0xe8eef1, capacity: 1, actions: ['browse_aisles'] },
  { id: 'super_shelf', name: 'Estantería', icon: '', w: 3, h: 1, height: 34, color: 0xb9c2c9, capacity: 2, actions: ['browse_aisles'] },
  { id: 'fruit_stand', name: 'Frutería', icon: '', w: 1, h: 1, height: 18, color: 0x9c6b3f, capacity: 1, actions: ['buy_fruit'] },
  { id: 'checkout', name: 'Caja', icon: '', w: 2, h: 1, height: 20, color: 0xdedede, capacity: 1, actions: ['shop_small', 'shop_big', 'buy_lottery'] },
  { id: 'carts', name: 'Carros', icon: '', w: 1, h: 1, height: 16, color: 0x9aa0a6, capacity: 0, actions: [] },
  // Açaí
  { id: 'acai_counter', name: 'Barra de açaí', icon: '', w: 3, h: 1, height: 24, color: 0xf4f2ee, capacity: 2, actions: ['acai_bowl', 'smoothie'] },
  { id: 'cafe_table', name: 'Mesa', icon: '', w: 1, h: 1, height: 16, color: 0xd9c3a5, capacity: 2, snap: true, actions: ['sit'] },
  { id: 'neon_sign', name: 'Neón', icon: '', w: 1, h: 1, height: 44, color: 0x2d2540, capacity: 1, actions: ['selfie'] },

  // Metro
  { id: 'metro_seat', name: 'Asientos del metro', icon: '', w: 2, h: 1, height: 14, color: 0x3d6db5, capacity: 2, snap: true, actions: ['sit'] },
  { id: 'metro_pole', name: 'Barra', icon: '', w: 1, h: 1, height: 50, color: 0xd0d4d8, capacity: 0, actions: [] },
  { id: 'metro_sign', name: 'Plano del metro', icon: '', w: 1, h: 1, height: 40, color: 0xffffff, capacity: 1, actions: ['read_map'] },
  // Plaza de Alcorcón
  { id: 'fountain', name: 'Fuente', icon: '', w: 2, h: 2, height: 22, color: 0x9fb6c9, capacity: 3, actions: ['throw_coin'] },
  { id: 'churreria', name: 'Churrería', icon: '', w: 2, h: 1, height: 36, color: 0xf2e6c9, capacity: 2, actions: ['churros', 'rosquillas'] },
  // Bar
  { id: 'bar_counter', name: 'Barra del bar', icon: '', w: 3, h: 1, height: 24, color: 0x8b5a2b, capacity: 3, actions: ['cana', 'vermut', 'chupito', 'calamares', 'bravas', 'tortilla'] },
  { id: 'slot_machine', name: 'Tragaperras', icon: '', w: 1, h: 1, height: 40, color: 0x2b2d42, capacity: 1, actions: ['tragaperras'] },
  { id: 'bar_tv', name: 'Tele del bar', icon: '', w: 1, h: 1, height: 44, color: 0x333a44, capacity: 4, actions: ['watch_football'] },
  { id: 'mus_table', name: 'Mesa de mus', icon: '', w: 1, h: 1, height: 16, color: 0x6b8e4e, capacity: 4, actions: ['play_mus', 'sit'] },

  // Parque (algunas cosas también se pueden comprar)
  { id: 'bench', name: 'Banco', icon: '', w: 1, h: 1, height: 12, color: 0x8b5a2b, shape: 'bench', capacity: 2, snap: true, actions: ['sit_bench'], price: 70, category: 'deco' },
  { id: 'swings', name: 'Columpios', icon: '', w: 2, h: 1, height: 40, color: 0xd9534f, shape: 'swings', capacity: 2, snap: true, actions: ['swing'], price: 250, category: 'ocio' },
  { id: 'foodcart', name: 'Puesto de perritos', icon: '🌭', w: 1, h: 1, height: 30, color: 0xe74c3c, capacity: 1, actions: ['buy_hotdog'] },
  { id: 'flowers', name: 'Flores', icon: '🌷', w: 1, h: 1, height: 0, color: 0x6b8e4e, shape: 'none', capacity: 0, actions: [], price: 15, category: 'deco', decor: 1 },
];

export const OBJECTS: Record<string, ObjectDef> = Object.fromEntries(D.map((d) => [d.id, d]));

export const CATALOG = D.filter((d) => d.price !== undefined && d.category);

/** Lo que se recupera al vender. */
export const SELL_RATIO = 0.7;
