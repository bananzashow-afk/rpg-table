import type { CharacterAttribute, SheetPage } from './character.js';

/** Template pixel size — all overlay coords are fractions of this. */
export const SHEET_BASE = { width: 724, height: 1024 } as const;

export const SHEET_PAGE_SRC: Record<SheetPage, string> = {
  1: '/assets/character-sheets/page-1.png',
  2: '/assets/character-sheets/page-2.png',
  3: '/assets/character-sheets/page-3.png',
};

export interface FieldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SHEET_META_LAYOUT_V1: {
  name: FieldRect;
  race: FieldRect;
} = {
  name: { x: 0.055, y: 0.058, w: 0.52, h: 0.034 },
  race: { x: 0.615, y: 0.058, w: 0.325, h: 0.034 },
};

/**
 * Fixed attribute hex cells on page 1 (normalized 0–1).
 * Measured against template 724×1024, green «Характеристики» column.
 */
export const SHEET_LAYOUT_V1: Record<CharacterAttribute, FieldRect> = {
  strength: { x: 0.207, y: 0.182, w: 0.08, h: 0.034 },
  dexterity: { x: 0.207, y: 0.284, w: 0.08, h: 0.034 },
  constitution: { x: 0.207, y: 0.388, w: 0.08, h: 0.034 },
  intelligence: { x: 0.207, y: 0.489, w: 0.08, h: 0.034 },
  wisdom: { x: 0.207, y: 0.594, w: 0.08, h: 0.034 },
  charisma: { x: 0.207, y: 0.7, w: 0.08, h: 0.034 },
};

export const SHEET_ZOOM_MIN = 0.5;
export const SHEET_ZOOM_MAX = 2.5;
export const DEFAULT_TEXT_FONT_SIZE = 16;
export const MIN_TEXT_FONT_SIZE = 10;
export const MAX_TEXT_FONT_SIZE = 36;
export const MAX_TEXT_BLOCKS = 200;
export const MAX_TEXT_LENGTH = 2000;
