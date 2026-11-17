// Lo que toca cada día del calendario de verdad: estaciones, fiestas, elecciones, lotería...
// Una sola fuente para la simulación (systems/calendar.ts, systems/holidays.ts) y la agenda.

import { carnivalOf, electionDayOf, type GameDate } from './date';

export interface DayFacts {
  /** Primer día de una estación (21/3, 21/6, 23/9, 21/12). */
  seasonStart: boolean;
  /** Martes que empieza la campaña electoral (dura hasta el viernes). */
  campaignStart: boolean;
  /** Días de campaña (martes a viernes antes de las elecciones). */
  campaign: boolean;
  /** San Isidro (15 de mayo). */
  sanIsidro: boolean;
  /** Elecciones (último domingo de mayo). */
  elections: boolean;
  /** Verbena por la noche: San Juan (23/6), los sábados de julio y agosto y La Paloma (15/8). */
  verbena: boolean;
  /** Primer martes de octubre: dos días de la huerta en el Mercadona. */
  ofertasStart: boolean;
  /** Pueden llegar olas de calor (julio y agosto). */
  heatSeason: boolean;
  /** Se vende lotería de Navidad (del 1/11 al 21/12). */
  lotterySale: boolean;
  /** Sorteo de la Lotería de Navidad (22/12). */
  lotteryDraw: boolean;
  /** Nochebuena (24/12). */
  christmasEve: boolean;
  /** Navidad (25/12). */
  christmas: boolean;
  /** Nochevieja (31/12): las campanadas. */
  newYearsEve: boolean;
  /** Víspera de Reyes (5/1): la cabalgata. */
  cabalgata: boolean;
  /** Reyes (6/1). */
  reyes: boolean;
  /** Sábado de Carnaval (50 días antes de Pascua). */
  carnaval: boolean;
  /** Halloween (31/10). */
  halloween: boolean;
}

export function factsOf(g: GameDate): DayFacts {
  const { y, m, d, wd } = g;
  const md = m * 100 + d;
  const vote = electionDayOf(y);
  const carn = carnivalOf(y);
  return {
    seasonStart: md === 321 || md === 621 || md === 923 || md === 1221,
    campaignStart: m === 5 && d === vote - 5,
    campaign: m === 5 && d >= vote - 5 && d <= vote - 2,
    sanIsidro: md === 515,
    elections: m === 5 && d === vote,
    verbena: md === 623 || md === 815 || ((m === 7 || m === 8) && wd === 5),
    ofertasStart: m === 10 && wd === 1 && d <= 7,
    heatSeason: m === 7 || m === 8,
    lotterySale: (m === 11 || (m === 12 && d <= 21)),
    lotteryDraw: md === 1222,
    christmasEve: md === 1224,
    christmas: md === 1225,
    newYearsEve: md === 1231,
    cabalgata: md === 105,
    reyes: md === 106,
    carnaval: m === carn.m && d === carn.d,
    halloween: md === 1031,
  };
}
