// Cifras de la economía, para poder ajustarla sin tocar la lógica.
// Calibradas con 8 semanas simuladas (ver PLAN_MEJORAS.md, «Economía»).

export const ECONOMY = {
  /** Facturas semanales (los lunes). */
  bills: {
    /** Fijo según el tamaño de la casa (1, 2 o 3 tras las reformas). */
    base: [60, 85, 120],
    perPerson: 20,
    perPet: 10,
    /** Cada electrodoméstico (nevera, tele, consola...) gasta luz. */
    perAppliance: 3,
    /** Los muebles de lujo también se notan en el recibo (seguro, mantenimiento...). */
    perLuxury: 4,
  },
  /** Hipoteca semanal según el tamaño de la casa: las reformas la suben. */
  mortgage: [80, 160, 260],
  /** Cuota de autónomos semanal por cada negocio propio. */
  autonomos: 90,
  /** Pensión diaria de cada jubilado. */
  pension: 30,
  /** Lo que gastan los vecinos en la compra cada semana, por persona (los del jugador la hacen ellos). */
  neighbourFood: 25,
  /** Retención de Hacienda por jornada (por tramos del sueldo): [desde, tipo]. */
  tax: [
    [100, 0.15],
    [200, 0.3],
  ] as [number, number][],
  /** Gastos opcionales con sentido. */
  gift: 40,
  clothes: 60,
  course: 150,
  /** Un fin de semana fuera para toda la familia. */
  trip: 600,
  /** Fiestas: disfraz de Carnaval, premio del concurso y lo que cuesta el roscón a quien le sale el haba. */
  costume: 15,
  costumePrize: 100,
  roscon: 25,
  /** Volver a dar de alta la luz o el agua tras un corte. */
  reconnect: 30,
  /** Ayuda de los servicios sociales (una vez cada 30 días, con deudas o en la calle). */
  socialAid: 400,
  /** Mercadillo: lo que se saca revendiendo una antigüedad, y la rebaja de regatear. */
  resale: 40,
  haggleDiscount: 0.5,
};

/** Categorías del registro de movimientos (con su icono y su nombre). */
export const MONEY_CATEGORIES: Record<string, { icon: string; label: string }> = {
  sueldo: { icon: '💼', label: 'Sueldos' },
  negocio: { icon: '🍺', label: 'Negocio' },
  pension: { icon: '👴', label: 'Pensiones' },
  deseos: { icon: '⭐', label: 'Deseos' },
  metas: { icon: '🏆', label: 'Metas de vida' },
  ventas: { icon: '🏷️', label: 'Ventas' },
  propinas: { icon: '🪕', label: 'Propinas' },
  premios: { icon: '🎟️', label: 'Premios y suerte' },
  herencia: { icon: '📜', label: 'Herencias' },
  trabajo: { icon: '💼', label: 'Cosas del trabajo' },
  facturas: { icon: '🧾', label: 'Facturas' },
  hacienda: { icon: '🏛️', label: 'Hacienda' },
  hipoteca: { icon: '🏦', label: 'Hipoteca' },
  alquiler: { icon: '🏠', label: 'Alquiler' },
  ayudas: { icon: '🤝', label: 'Ayudas' },
  autonomos: { icon: '🧾', label: 'Autónomos' },
  compra: { icon: '🛒', label: 'Comida y compra' },
  ocio: { icon: '🍹', label: 'Ocio' },
  muebles: { icon: '🛋️', label: 'Muebles' },
  reformas: { icon: '🏗️', label: 'Reformas' },
  mascotas: { icon: '🐾', label: 'Mascotas' },
  regalos: { icon: '🎁', label: 'Regalos' },
  ropa: { icon: '👕', label: 'Ropa' },
  cursos: { icon: '🎓', label: 'Cursos' },
  libros: { icon: '📚', label: 'Libros' },
  encargos: { icon: '🛠️', label: 'Encargos y clases' },
  bolsa: { icon: '📈', label: 'Bolsa' },
  viajes: { icon: '🧳', label: 'Viajes' },
  calle: { icon: '🛍️', label: 'En la calle' },
};

/** En qué categoría cae lo que se paga al hacer una acción (si no está, «ocio»). */
export const SPEND_CATEGORY: Record<string, string> = {
  shop_small: 'compra',
  shop_big: 'compra',
  order_groceries: 'compra',
  order_glovo: 'compra',
  buy_fruit: 'compra',
  give_gift: 'regalos',
  buy_clothes: 'ropa',
  take_course: 'cursos',
  stocks: 'bolsa',
  upgrade: 'reformas',
};

/** Lo que se queda Hacienda de un sueldo de una jornada (por tramos). */
export function incomeTax(pay: number): number {
  let tax = 0;
  const brackets = ECONOMY.tax;
  for (let i = 0; i < brackets.length; i++) {
    const [from, rate] = brackets[i];
    const to = brackets[i + 1]?.[0] ?? Infinity;
    if (pay > from) tax += (Math.min(pay, to) - from) * rate;
  }
  return Math.round(tax);
}
