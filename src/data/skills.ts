// Habilidades: suben practicando (0 a 10) y ayudan en el trabajo y en algunas actividades.

export interface SkillDef {
  id: string;
  label: string;
  icon: string;
  /** Solo se aprende estudiando (colegio, instituto o universidad). */
  studyOnly?: boolean;
}

export const SKILLS: SkillDef[] = [
  { id: 'cocina', label: 'Cocina', icon: '🍳' },
  { id: 'musica', label: 'Música', icon: '🎸' },
  { id: 'forma', label: 'Forma física', icon: '💪' },
  { id: 'logica', label: 'Lógica', icon: '♟️' },
  { id: 'carisma', label: 'Carisma', icon: '🗣️' },
  { id: 'arte', label: 'Arte', icon: '🎨' },
  // Solo estudiando:
  { id: 'idiomas', label: 'Idiomas', icon: '🌍', studyOnly: true },
  { id: 'medicina', label: 'Medicina', icon: '🩺', studyOnly: true },
  { id: 'leyes', label: 'Leyes', icon: '⚖️', studyOnly: true },
  { id: 'informatica', label: 'Informática', icon: '💻', studyOnly: true },
  { id: 'docencia', label: 'Docencia', icon: '🍎', studyOnly: true },
  { id: 'ciencias', label: 'Ciencias', icon: '🧬', studyOnly: true },
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
};
