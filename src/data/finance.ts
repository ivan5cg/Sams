// Economía del país y de la bolsa: partidos (todos pueden gobernar bien o mal, y cualquiera puede salir
// corrupto), activos en los que invertir y sucesos que mueven las cotizaciones y la economía.
// La economía va acelerada: cada semana de juego cuenta como dos meses económicos (la inflación del año se
// nota en unas semanas) y cada día, como una semana de bolsa.

/** Política económica: -1 recortes y bajadas de impuestos, 0 equilibrio, +1 mucho gasto público. */
export type Policy = -1 | 0 | 1;

export interface Party {
  id: string;
  name: string;
  short: string;
  icon: string;
  /** Hacia dónde tira con el gasto público. */
  policy: Policy;
  /** Lo que promete en campaña. */
  slogan: string;
}

export const PARTIES: Party[] = [
  { id: 'poc', name: 'Partido Obrero Castizo', short: 'POC', icon: '🌹', policy: 1, slogan: 'Más sanidad, más pensiones y más ayudas' },
  { id: 'uc', name: 'Unión Castiza', short: 'UC', icon: '🟠', policy: 0, slogan: 'Sentido común y cuentas claras' },
  { id: 'plm', name: 'Partido Liberal Madrileño', short: 'PLM', icon: '🔵', policy: -1, slogan: 'Menos impuestos y menos gasto' },
];
export const PARTY_BY_ID: Record<string, Party> = Object.fromEntries(PARTIES.map((p) => [p.id, p]));

export const POLICY_LABEL: Record<Policy, string> = { [-1]: 'Austeridad y bajada de impuestos', 0: 'Equilibrio', 1: 'Mucho gasto público' };

/** Lo que cambia según la política: impuestos, ayudas y pensiones. */
export const POLICY_EFFECTS: Record<Policy, { tax: number; aid: number; pension: number }> = {
  [-1]: { tax: 0.85, aid: 0.7, pension: 0.95 },
  0: { tax: 1, aid: 1, pension: 1 },
  1: { tax: 1.15, aid: 1.4, pension: 1.1 },
};

/** Probabilidad de que un Gobierno nuevo salga corrupto (sea del partido que sea). */
export const CORRUPT_CHANCE = 0.3;

/** Valores de partida y límites de la economía. */
export const MACRO = {
  inflation: 3,
  unemployment: 11,
  growth: 2,
  rate: 2,
  debt: 95,
  approval: 55,
  /** Meta de inflación del Banco Central. */
  target: 2,
};

// --- Bolsa ---

export interface Asset {
  id: string;
  name: string;
  icon: string;
  sector: string;
  /** Rentabilidad esperada al año y volatilidad (en tanto por uno). */
  ret: number;
  vol: number;
  /** Cuánto le afecta el crecimiento, los tipos de interés (+: le gustan altos) y la inflación. */
  growth: number;
  rate: number;
  inflation: number;
  /** Dividendo al año (sobre el precio). */
  div: number;
  /** Producto complejo: hace falta saber de inversión para comprarlo. */
  minSkill?: number;
  desc: string;
}

export const ASSETS: Asset[] = [
  { id: 'indice', name: 'Fondo Índice Castizo 35', icon: '📊', sector: 'Índice', ret: 0.07, vol: 0.17, growth: 1, rate: -0.5, inflation: 0, div: 0.03, desc: 'Las 35 empresas más grandes del país. Lo más diversificado' },
  { id: 'banco', name: 'Banco de Chamberí', icon: '🏦', sector: 'Banca', ret: 0.08, vol: 0.28, growth: 1.3, rate: 0.8, inflation: 0, div: 0.05, desc: 'Gana más cuando suben los tipos; sufre con las crisis' },
  { id: 'electrica', name: 'Eléctrica del Manzanares', icon: '⚡', sector: 'Energía', ret: 0.06, vol: 0.15, growth: 0.4, rate: -0.6, inflation: 0.6, div: 0.055, desc: 'Aburrida y con buen dividendo. Aguanta la inflación' },
  { id: 'ladrillo', name: 'Construcciones Ladrillazo', icon: '🏗️', sector: 'Inmobiliario', ret: 0.08, vol: 0.34, growth: 1.8, rate: -1.2, inflation: 0, div: 0.02, desc: 'Vuela cuando hay crédito barato... y se estrella cuando no' },
  { id: 'tecno', name: 'TecnoLavapiés', icon: '💻', sector: 'Tecnología', ret: 0.12, vol: 0.4, growth: 1.4, rate: -1, inflation: -0.3, div: 0, desc: 'Mucho crecimiento y mucho susto. Sin dividendo' },
  { id: 'churros', name: 'Churrerías Unidas', icon: '🥨', sector: 'Consumo', ret: 0.07, vol: 0.19, growth: 0.6, rate: -0.2, inflation: 0.2, div: 0.04, desc: 'La gente siempre desayuna. Sube con el turismo' },
  { id: 'bono', name: 'Bono del Estado', icon: '📜', sector: 'Deuda pública', ret: 0, vol: 0.04, growth: 0, rate: 0, inflation: 0, div: 0, desc: 'Paga el tipo de interés. Casi sin riesgo, salvo si el país se endeuda demasiado' },
  { id: 'oro', name: 'Oro', icon: '🪙', sector: 'Materias primas', ret: 0.03, vol: 0.15, growth: -0.4, rate: -0.5, inflation: 1, div: 0, desc: 'Refugio: sube con la inflación y con los sustos' },
  { id: 'cripto', name: 'Criptopeseta', icon: '💠', sector: 'Cripto', ret: 0.15, vol: 0.95, growth: 0.8, rate: -1.5, inflation: 0, div: 0, minSkill: 4, desc: 'Producto complejo: puede multiplicarse... o desaparecer' },
];
export const ASSET_BY_ID: Record<string, Asset> = Object.fromEntries(ASSETS.map((x) => [x.id, x]));

/** Comisión de compraventa (menos con nivel 4 de inversión). */
export const COMMISSION = { base: 0.02, pro: 0.005, proLevel: 4 };
/** Nivel de inversión para ver el análisis (la tendencia de cada valor). */
export const ANALYSIS_LEVEL = 2;

// --- Sucesos ---

export interface MarketEvent {
  id: string;
  title: string;
  icon: string;
  /** Salto inmediato de cada activo (en tanto por uno) y tendencia durante unos días. */
  jump: Record<string, number>;
  drift?: Record<string, number>;
  days?: number;
  /** Efecto sobre la economía (puntos). */
  macro?: { inflation?: number; unemployment?: number; growth?: number; debt?: number; approval?: number };
  /** Solo si el Gobierno es corrupto (y aún no se ha sabido), o si la deuda es muy alta. */
  needs?: 'corrupt' | 'debt';
  weight?: number;
}

export const MARKET_EVENTS: MarketEvent[] = [
  { id: 'crisis_bancaria', title: 'Crisis bancaria: un banco extranjero quiebra y cunde el pánico', icon: '🏦', jump: { banco: -0.15, indice: -0.06, ladrillo: -0.08, oro: 0.05 }, drift: { banco: -0.4, indice: -0.15 }, days: 5, macro: { unemployment: 1.5, growth: -1 } },
  { id: 'burbuja', title: 'Pincha la burbuja inmobiliaria: pisos sin vender y grúas paradas', icon: '🏚️', jump: { ladrillo: -0.22, banco: -0.08, indice: -0.05 }, drift: { ladrillo: -0.5 }, days: 6, macro: { unemployment: 2, growth: -1.5 } },
  { id: 'boom_tecno', title: 'Boom tecnológico: todo el mundo quiere apps', icon: '🚀', jump: { tecno: 0.15, indice: 0.03 }, drift: { tecno: 0.6 }, days: 4, macro: { growth: 0.5, unemployment: -0.3 } },
  { id: 'ola_calor', title: 'Ola de calor: récord de consumo eléctrico (y nadie quiere churros)', icon: '🥵', jump: { electrica: 0.06, churros: -0.04 }, days: 3 },
  { id: 'turismo', title: 'Récord de turistas: bares y hoteles a reventar', icon: '🧳', jump: { churros: 0.07, indice: 0.02 }, drift: { churros: 0.3 }, days: 4, macro: { unemployment: -0.6, growth: 0.5 } },
  { id: 'guerra_comercial', title: 'Guerra comercial entre potencias: aranceles por todas partes', icon: '⚔️', jump: { indice: -0.05, tecno: -0.08, oro: 0.05 }, drift: { indice: -0.2 }, days: 5, macro: { inflation: 1, growth: -0.7 } },
  { id: 'petroleo', title: 'El petróleo se dispara: gasolina y luz, por las nubes', icon: '🛢️', jump: { electrica: 0.05, indice: -0.03, churros: -0.03, oro: 0.03 }, days: 4, macro: { inflation: 2, growth: -0.5 } },
  { id: 'cripto_fiebre', title: 'Fiebre de la Criptopeseta: el cuñado ya habla de ella en las comidas', icon: '💠', jump: { cripto: 0.4 }, drift: { cripto: 1.5 }, days: 3 },
  { id: 'cripto_crash', title: 'Hackean un exchange: la Criptopeseta se hunde', icon: '💥', jump: { cripto: -0.45 }, drift: { cripto: -1 }, days: 3 },
  { id: 'empleo', title: 'Récord de afiliados a la Seguridad Social', icon: '👷', jump: { indice: 0.02, churros: 0.02 }, macro: { unemployment: -1, growth: 0.3, approval: 5 } },
  { id: 'fusion', title: 'Fusión bancaria: el Banco de Chamberí compra a su rival', icon: '🤝', jump: { banco: 0.09 } },
  { id: 'huelga', title: 'Huelga general: el país se para un día', icon: '✊', jump: { indice: -0.02, churros: -0.03 }, macro: { growth: -0.3, approval: -5 } },
  { id: 'escandalo', title: 'Escándalo de corrupción en el Gobierno: sobres, comisiones y un ministro imputado', icon: '💼', jump: { indice: -0.04, banco: -0.05, bono: -0.02 }, macro: { approval: -25, growth: -0.5 }, needs: 'corrupt', weight: 3 },
  { id: 'prima_riesgo', title: 'Se dispara la prima de riesgo: los mercados no se fían de la deuda del país', icon: '📉', jump: { bono: -0.08, indice: -0.06, banco: -0.1 }, drift: { indice: -0.3 }, days: 5, macro: { unemployment: 1.5, growth: -1, approval: -10 }, needs: 'debt', weight: 3 },
];
export const EVENT_BY_ID: Record<string, MarketEvent> = Object.fromEntries(MARKET_EVENTS.map((e) => [e.id, e]));

/** Probabilidad diaria de un suceso. */
export const EVENT_CHANCE = 0.08;
