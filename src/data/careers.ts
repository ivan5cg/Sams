// Carreras profesionales y colegio.

export interface CareerLevel {
  title: string;
  /** Sueldo por jornada. */
  pay: number;
}

export interface Career {
  id: string;
  name: string;
  icon: string;
  /** Hora de entrada y de salida. */
  start: number;
  end: number;
  /** Días que se trabaja: 0 = lunes … 6 = domingo. */
  days: number[];
  levels: CareerLevel[];
  /** El colegio: no se cobra y no se elige en el ordenador. */
  school?: boolean;
  /** Negocio propio: cuesta montarlo, se gana según el día y hay cuota de autónomos. */
  business?: boolean;
  /** Se puede teletrabajar (informes en el ordenador de casa). */
  remote?: boolean;
  /** Hace falta esta carrera universitaria (ver data/education.ts). */
  degree?: string;
  startup?: number;
}

const WEEKDAYS = [0, 1, 2, 3, 4];

export const CAREERS: Record<string, Career> = {
  cocina: {
    id: 'cocina',
    name: 'Cocina',
    icon: '👩‍🍳',
    start: 10,
    end: 18,
    days: [1, 2, 3, 4, 5],
    levels: [
      { title: 'Friegaplatos', pay: 60 },
      { title: 'Ayudante de cocina', pay: 90 },
      { title: 'Cocinero/a', pay: 130 },
      { title: 'Jefe/a de cocina', pay: 190 },
      { title: 'Chef con estrella', pay: 280 },
    ],
  },
  oficina: {
    id: 'oficina',
    remote: true,
    name: 'Oficina',
    icon: '💼',
    start: 9,
    end: 17,
    days: WEEKDAYS,
    levels: [
      { title: 'Becario/a', pay: 50 },
      { title: 'Administrativo/a', pay: 85 },
      { title: 'Contable', pay: 125 },
      { title: 'Director/a financiero/a', pay: 185 },
      { title: 'Presidente/a de la empresa', pay: 270 },
    ],
  },
  veterinaria: {
    id: 'veterinaria',
    name: 'Veterinaria',
    icon: '🩺',
    start: 8,
    end: 16,
    days: WEEKDAYS,
    levels: [
      { title: 'Cuidador/a de animales', pay: 55 },
      { title: 'Auxiliar veterinario/a', pay: 85 },
      { title: 'Veterinario/a', pay: 135 },
      { title: 'Cirujano/a veterinario/a', pay: 200 },
      { title: 'Eminencia animal', pay: 290 },
    ],
  },
  musica: {
    id: 'musica',
    name: 'Música',
    icon: '🎸',
    start: 16,
    end: 22,
    days: [2, 3, 4, 5, 6],
    levels: [
      { title: 'Músico/a callejero/a', pay: 40 },
      { title: 'Músico/a de bar', pay: 75 },
      { title: 'Músico/a de estudio', pay: 120 },
      { title: 'Estrella del pop', pay: 210 },
      { title: 'Leyenda del rock', pay: 330 },
    ],
  },
  ciencia: {
    id: 'ciencia',
    remote: true,
    name: 'Ciencia',
    icon: '🔬',
    start: 9,
    end: 17,
    days: WEEKDAYS,
    levels: [
      { title: 'Ayudante de laboratorio', pay: 55 },
      { title: 'Técnico/a de laboratorio', pay: 95 },
      { title: 'Investigador/a', pay: 140 },
      { title: 'Jefe/a de investigación', pay: 210 },
      { title: 'Premio Nobel', pay: 300 },
    ],
  },
  deporte: {
    id: 'deporte',
    name: 'Deporte',
    icon: '🧘',
    start: 7,
    end: 14,
    days: [0, 1, 2, 3, 4, 5],
    levels: [
      { title: 'Monitor/a de sala', pay: 55 },
      { title: 'Instructor/a de pilates', pay: 90 },
      { title: 'Entrenador/a personal', pay: 135 },
      { title: 'Preparador/a físico/a', pay: 200 },
      { title: 'Leyenda del fitness', pay: 300 },
    ],
  },
  negocio: {
    id: 'negocio',
    name: 'Negocio propio',
    icon: '🏪',
    start: 9,
    end: 17,
    days: [0, 1, 2, 3, 4, 5],
    business: true,
    startup: 2500,
    levels: [
      { title: 'Bar de tapas recién abierto', pay: 100 },
      { title: 'Bar con clientela fija', pay: 160 },
      { title: 'El bar de moda del barrio', pay: 240 },
      { title: 'Cadena de bares', pay: 350 },
      { title: 'Franquicia por toda España', pay: 520 },
    ],
  },
  // Profesiones que piden carrera.
  medicina: {
    id: 'medicina',
    name: 'Medicina',
    icon: '👩‍⚕️',
    degree: 'medicina',
    start: 8,
    end: 15,
    days: WEEKDAYS,
    levels: [
      { title: 'Médico/a residente (MIR)', pay: 110 },
      { title: 'Médico/a de familia', pay: 160 },
      { title: 'Especialista', pay: 220 },
      { title: 'Jefe/a de servicio', pay: 290 },
      { title: 'Director/a del hospital', pay: 370 },
    ],
  },
  abogacia: {
    id: 'abogacia',
    name: 'Abogacía',
    icon: '⚖️',
    degree: 'derecho',
    start: 9,
    end: 18,
    days: WEEKDAYS,
    levels: [
      { title: 'Pasante', pay: 80 },
      { title: 'Abogado/a júnior', pay: 130 },
      { title: 'Abogado/a asociado/a', pay: 190 },
      { title: 'Socio/a del bufete', pay: 280 },
      { title: 'Magistrado/a del Supremo', pay: 360 },
    ],
  },
  informatica: {
    id: 'informatica',
    name: 'Informática',
    icon: '👨‍💻',
    degree: 'informatica',
    remote: true,
    start: 9,
    end: 17,
    days: WEEKDAYS,
    levels: [
      { title: 'Programador/a júnior', pay: 95 },
      { title: 'Programador/a', pay: 140 },
      { title: 'Programador/a sénior', pay: 195 },
      { title: 'Jefe/a de proyecto', pay: 260 },
      { title: 'Director/a de tecnología', pay: 340 },
    ],
  },
  docencia: {
    id: 'docencia',
    name: 'Enseñanza',
    icon: '👩‍🏫',
    degree: 'magisterio',
    start: 8,
    end: 15,
    days: WEEKDAYS,
    levels: [
      { title: 'Profesor/a interino/a', pay: 85 },
      { title: 'Maestro/a', pay: 120 },
      { title: 'Jefe/a de estudios', pay: 160 },
      { title: 'Director/a del colegio', pay: 210 },
      { title: 'Inspector/a de educación', pay: 270 },
    ],
  },
  school: {
    id: 'school',
    name: 'Colegio',
    icon: '🎒',
    start: 8,
    end: 14,
    days: WEEKDAYS,
    school: true,
    levels: [{ title: 'Estudiante', pay: 0 }],
  },
  uni: {
    id: 'uni',
    name: 'Universidad',
    icon: '🎓',
    start: 9,
    end: 14,
    days: WEEKDAYS,
    school: true,
    levels: [{ title: 'Universitario/a', pay: 0 }],
  },
};

export const JOB_CAREERS = Object.values(CAREERS).filter((c) => !c.school);

export const WEEKDAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const WEEKDAY_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function scheduleText(c: Career): string {
  const d = c.days;
  const days = d.length === 5 && d[0] === 0 ? 'de lunes a viernes' : `de ${WEEKDAY_LONG[d[0]]} a ${WEEKDAY_LONG[d[d.length - 1]]}`;
  return `${days}, de ${c.start}:00 a ${c.end}:00`;
}

/** Notas del colegio según el rendimiento. */
export function gradeLabel(perf: number): string {
  if (perf >= 80) return 'Sobresaliente';
  if (perf >= 60) return 'Notable';
  if (perf >= 40) return 'Bien';
  if (perf >= 20) return 'Suficiente';
  return 'Suspenso';
}

/** Días que se trabaja en ese empleo (el bar puede abrir también el domingo). */
export function workDays(job: { career: string; bar?: { sunday?: boolean } }): number[] {
  const c = CAREERS[job.career];
  if (!c) return [];
  return job.bar?.sunday && !c.days.includes(6) ? [...c.days, 6] : c.days;
}

/** Cómo va el bar según la carta: multiplicador de caja, cuánto varía y la probabilidad de un día malo. */
export const BAR_MENUS = {
  barata: { label: 'Carta barata', desc: 'Menos caja, pero siempre hay gente', mult: 0.85, spread: 0.35, bad: 0.05 },
  normal: { label: 'Carta normal', desc: 'Lo de siempre', mult: 1, spread: 0.7, bad: 0.12 },
  cara: { label: 'Carta cara', desc: 'Más caja... los días que viene alguien', mult: 1.35, spread: 1, bad: 0.2 },
} as const;

/** Sueldo del camarero contratado (por jornada) y lo que se nota. */
export const BAR_STAFF = { wage: 45, boost: 1.25 };
