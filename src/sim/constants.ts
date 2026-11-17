// Constantes de la simulación (compartidas por World y los sistemas).

export const SAVE_VERSION = 15;
export const MINUTES_PER_DAY = 1440;
export const MAX_MEMBERS = 8;
/** Minutos de juego que se tarda en ir de una parcela a otra del barrio. */
export const TRAVEL_MINUTES = 15;
/** Lo que dura el trayecto en metro entre dos barrios. */
export const RIDE_MINUTES = 22;
/** Paso máximo de simulación, en minutos de juego. */
export const MAX_STEP = 0.5;
/** Lo que se come de la nevera (gasta raciones de la despensa). */
export const FRIDGE_FOOD = new Set(['eat', 'snack', 'cook']);
export const PANTRY_MAX = 40;
