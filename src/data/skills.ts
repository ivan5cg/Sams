// Habilidades: del 0 al 10. Solo suben haciendo cosas de lo suyo (cocinar, tocar, programar...) o
// leyendo libros de habilidad (que enseñan lo básico y lo avanzado; lo de maestro, solo practicando).
// Cada nivel cuesta más que el anterior y algunos desbloquean cosas nuevas (`data/skillTree.ts`).

export interface SkillDef {
  id: string;
  label: string;
  icon: string;
  /** Solo se aprende estudiando (colegio, instituto o universidad). */
  studyOnly?: boolean;
  /** Cómo se practica (para el perfil). */
  how?: string;
}

export const SKILLS: SkillDef[] = [
  { id: 'cocina', label: 'Cocina', icon: '🍳', how: 'cocinando (nevera) o en la barbacoa' },
  { id: 'reposteria', label: 'Repostería', icon: '🧁', how: 'horneando dulces (nevera)' },
  { id: 'manitas', label: 'Manitas', icon: '🔧', how: 'arreglando cosas rotas o en el banco de bricolaje' },
  { id: 'musica', label: 'Guitarra', icon: '🎸', how: 'tocando la guitarra' },
  { id: 'piano', label: 'Piano', icon: '🎹', how: 'tocando el piano' },
  { id: 'canto', label: 'Canto', icon: '🎤', how: 'cantando en el karaoke' },
  { id: 'ajedrez', label: 'Ajedrez', icon: '♟️', how: 'jugando al ajedrez o resolviendo problemas' },
  { id: 'inversion', label: 'Inversión', icon: '💹', how: 'analizando el mercado en el ordenador, en la banca o en la bolsa' },
  { id: 'programacion', label: 'Programación', icon: '👩‍💻', how: 'programando en el ordenador' },
  { id: 'arte', label: 'Pintura', icon: '🎨', how: 'pintando en el caballete' },
  { id: 'forma', label: 'Forma física', icon: '💪', how: 'corriendo, en el gimnasio, pilates o pádel' },
  { id: 'logica', label: 'Lógica', icon: '🧠', how: 'estudiando, haciendo los deberes o jugando al mus' },
  { id: 'carisma', label: 'Carisma', icon: '🗣️', how: 'ensayando ante el espejo, charlando o regateando' },
  // Solo estudiando:
  { id: 'idiomas', label: 'Idiomas', icon: '🌍', studyOnly: true, how: 'en el colegio, el instituto y la universidad' },
  { id: 'medicina', label: 'Medicina', icon: '🩺', studyOnly: true, how: 'en la carrera de Medicina' },
  { id: 'leyes', label: 'Leyes', icon: '⚖️', studyOnly: true, how: 'en la carrera de Derecho' },
  { id: 'informatica', label: 'Informática', icon: '💻', studyOnly: true, how: 'en la carrera de Informática' },
  { id: 'docencia', label: 'Docencia', icon: '🍎', studyOnly: true, how: 'en la carrera de Magisterio' },
  { id: 'ciencias', label: 'Ciencias', icon: '🧬', studyOnly: true, how: 'en Biología o Veterinaria' },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export const MAX_SKILL = 10;

/** Qué habilidad ayuda a ascender en cada carrera. */
export const CAREER_SKILL: Record<string, string> = {
  cocina: 'cocina',
  musica: 'musica',
  oficina: 'carisma',
  ciencia: 'logica',
  veterinaria: 'logica',
  deporte: 'forma',
  negocio: 'carisma',
  school: 'logica',
  medicina: 'medicina',
  abogacia: 'leyes',
  informatica: 'informatica',
  docencia: 'docencia',
  banca: 'inversion',
  bolsa: 'inversion',
};
