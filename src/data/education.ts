// Estudios: colegio (niños), instituto (adolescentes) y universidad (desde jóvenes). En clase se aprenden
// habilidades que solo se consiguen estudiando, y las carreras universitarias abren profesiones (o dejan
// empezar más arriba en algunas). Las cifras, aquí.

export interface DegreeDef {
  id: string;
  label: string;
  icon: string;
  /** Habilidad que solo se aprende estudiando esta carrera. */
  skill: string;
  /** Días de clase (con notas normales; con buenas notas, menos). */
  days: number;
  /** Matrícula (gratis con beca: buenas notas en el instituto). */
  cost: number;
  /** Profesión a la que lleva. */
  career: string;
  /** Si la profesión ya existía sin carrera: con la carrera se empieza en este nivel. */
  startLevel?: number;
}

export const DEGREES: Record<string, DegreeDef> = {
  economia: { id: 'economia', label: 'Economía y ADE', icon: '📈', skill: 'inversion', days: 8, cost: 500, career: 'bolsa' },
  medicina: { id: 'medicina', label: 'Medicina', icon: '🩺', skill: 'medicina', days: 10, cost: 600, career: 'medicina' },
  derecho: { id: 'derecho', label: 'Derecho', icon: '⚖️', skill: 'leyes', days: 8, cost: 400, career: 'abogacia' },
  informatica: { id: 'informatica', label: 'Ingeniería Informática', icon: '💻', skill: 'informatica', days: 8, cost: 400, career: 'informatica' },
  magisterio: { id: 'magisterio', label: 'Magisterio', icon: '🍎', skill: 'docencia', days: 6, cost: 300, career: 'docencia' },
  biologia: { id: 'biologia', label: 'Biología', icon: '🧬', skill: 'ciencias', days: 7, cost: 350, career: 'ciencia', startLevel: 2 },
  veterinaria: { id: 'veterinaria', label: 'Veterinaria', icon: '🐾', skill: 'ciencias', days: 8, cost: 450, career: 'veterinaria', startLevel: 3 },
};

/** Nota media del instituto (sobre 100) a partir de la cual hay beca (matrícula gratis). */
export const SCHOLARSHIP_GRADE = 70;

/** Lo que se aprende en clase al día: idiomas en el colegio y el instituto; la de la carrera en la universidad. */
export const LEARNING = { school: { child: 0.15, teen: 0.25 }, uniSkill: 0.6, uniLanguages: 0.1 };

/** Nombre del sitio donde estudia (según la edad o si va a la universidad). */
export function schoolName(stage: string, career: string): string {
  if (career === 'uni') return 'Universidad';
  return stage === 'teen' ? 'Instituto' : 'Colegio';
}
