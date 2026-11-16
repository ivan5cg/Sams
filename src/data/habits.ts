// Hábitos que acaban cambiando la forma de ser: acciones y cuántas veces.

export const HABITS: { trait: string; actions: string[]; min: number }[] = [
  { trait: 'deportista', actions: ['run', 'pilates', 'reformer'], min: 25 },
  { trait: 'bromista', actions: ['joke'], min: 25 },
  { trait: 'gloton', actions: ['eat', 'snack', 'cook', 'acai_bowl', 'buy_hotdog', 'buy_fruit'], min: 80 },
  { trait: 'friki', actions: ['play_games', 'play_chess', 'browse'], min: 30 },
  { trait: 'fiestero', actions: ['dance', 'parties', 'listen_music'], min: 30 },
  { trait: 'animalero', actions: ['pet_animal', 'play_pet', 'walk_dog', 'train_pet', 'brush_capy', 'bathe_pet'], min: 45 },
  { trait: 'tiquismiquis', actions: ['clean', 'clean_litter', 'clean_cage'], min: 25 },
  { trait: 'grunon', actions: ['insult', 'argue'], min: 12 },
  { trait: 'cotilla', actions: ['chat', 'talk', 'browse_aisles'], min: 70 },
  { trait: 'romantico', actions: ['flirt', 'kiss', 'hug'], min: 45 },
  { trait: 'perezoso', actions: ['nap_sofa', 'watch_tv'], min: 60 },
  { trait: 'optimista', actions: ['apologize', 'wishes_done'], min: 25 },
];

export const HABIT_TEXT: Record<string, string> = {
  deportista: 'Tanto correr y tanto pilates...',
  bromista: 'De tanto contar chistes...',
  gloton: 'Entre tapa y tapa...',
  friki: 'Tantas horas delante de la pantalla...',
  fiestero: 'De fiesta en fiesta...',
  animalero: 'Tanto cariño a los animales...',
  tiquismiquis: 'De tanto limpiar...',
  grunon: 'Tanta bronca acaba pasando factura...',
  cotilla: 'De tanto charlar con todo el mundo...',
  romantico: 'Tanto amor en el aire...',
  perezoso: 'Entre siesta y siesta...',
  optimista: 'Viéndole el lado bueno a todo...',
};
