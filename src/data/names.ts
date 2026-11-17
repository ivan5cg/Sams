// De qué sexo es cada nombre (para los vecinos, los recién nacidos y las partidas de antes).
// La regla: acaba en «a» → mujer; con estas excepciones a un lado y a otro.

const FEMALE = new Set([
  'Carmen', 'Inés', 'Rocío', 'Pilar', 'Lore', 'Yoli', 'Maite', 'Isabel', 'Raquel', 'Noemí', 'Belén', 'Mercedes',
  'Lucía', 'Noa', 'Nieves', 'Consuelo', 'Rosario', 'Mar', 'Sol', 'Ruth', 'Ainhoa',
]);
const MALE = new Set(['Borja', 'Luca', 'Jonathan', 'Kalimotxo', 'Andrea']);

export type Sex = 'f' | 'm';

/** Sexo más probable de un nombre («Doña Puri» → mujer; «El del acordeón» → hombre). */
export function sexOfName(name: string): Sex {
  const n = name.trim();
  if (/^(Doña|Mari|La )/i.test(n)) return 'f';
  if (/^(Don|El |MC )/i.test(n)) return 'm';
  const first = n.split(/[\s(]/)[0];
  if (FEMALE.has(first)) return 'f';
  if (MALE.has(first)) return 'm';
  return /a$/i.test(first.normalize('NFD').replace(/[̀-ͯ]/g, '')) ? 'f' : 'm';
}

export const SEX_LABEL: Record<Sex, string> = { f: 'Mujer', m: 'Hombre' };
