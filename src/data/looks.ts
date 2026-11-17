// Paletas del aspecto de las personas (las usan el dibujo, los vecinos y el creador de familia).

export const SKIN = [0xf6d2b0, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x6b4226];
export const HAIR = [0x2b1a10, 0x111111, 0x6b3e1f, 0xb5651d, 0xe6c35c, 0x9c3d2a];
export const PANTS = [0x34384a, 0x3d5a80, 0x5c4033, 0x2f4f4f, 0x4a4e69, 0x6c757d];
export const CLOTHES = [0xe0607e, 0x4f8fd9, 0x52b788, 0xf4a261, 0x9b5de5, 0xe76f51, 0x2a9d8f, 0xf2c14e, 0x6d6875, 0x48cae4];
export const HAIR_STYLES = ['short', 'long', 'bun', 'curly', 'ponytail'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const HAIR_STYLE_LABEL: Record<HairStyle, string> = { short: 'Corto', long: 'Largo', bun: 'Moño', curly: 'Rizado', ponytail: 'Coleta' };
/** Lo que se lleva en la cara. */
export const EXTRAS = ['none', 'glasses', 'beard', 'mustache'] as const;
export type Extra = (typeof EXTRAS)[number];
export const EXTRA_LABEL: Record<Extra, string> = { none: 'Nada', glasses: 'Gafas', beard: 'Barba', mustache: 'Bigote' };
