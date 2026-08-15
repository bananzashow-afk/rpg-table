export const SHEET_TEMPLATE_VERSION = 1;
export const CHARACTER_FORMAT = 'rpg-table-character';
export const CHARACTER_FORMAT_VERSION = 1;

export type CharacterAttribute =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

export const CHARACTER_ATTRIBUTES: readonly CharacterAttribute[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

export const ATTRIBUTE_LABELS: Record<CharacterAttribute, string> = {
  strength: 'Сила',
  dexterity: 'Ловкость',
  constitution: 'Телосложение',
  intelligence: 'Интеллект',
  wisdom: 'Мудрость',
  charisma: 'Харизма',
};

export type SheetPage = 1 | 2 | 3;
export type TextAlign = 'left' | 'center' | 'right';

export interface SheetTextBlock {
  id: string;
  page: SheetPage;
  /** Normalized 0–1 relative to template image */
  x: number;
  y: number;
  width: number;
  text: string;
  fontSize: number;
  align: TextAlign;
}

export interface CharacterAttributes {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface SheetData {
  templateVersion: number;
  textBlocks: SheetTextBlock[];
}

export interface Character {
  id: string;
  roomId: string;
  ownerPlayerId: string;
  name: string;
  race: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  sheetData: SheetData;
  version: number;
  updatedAt: number;
}

export interface CharacterSummary {
  id: string;
  ownerPlayerId: string;
  ownerName: string;
  name: string;
  race: string;
}

export interface CharacterExportFile {
  format: typeof CHARACTER_FORMAT;
  version: typeof CHARACTER_FORMAT_VERSION;
  character: Omit<Character, 'id' | 'roomId' | 'ownerPlayerId' | 'version' | 'updatedAt'> & {
    sheetData: SheetData;
  };
}

export function emptyAttributes(): CharacterAttributes {
  return {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  };
}

export function emptySheetData(): SheetData {
  return { templateVersion: SHEET_TEMPLATE_VERSION, textBlocks: [] };
}

export function formatModifier(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

export function isCharacterAttribute(v: unknown): v is CharacterAttribute {
  return typeof v === 'string' && (CHARACTER_ATTRIBUTES as readonly string[]).includes(v);
}

export function clampAttribute(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-20, Math.min(20, Math.trunc(n)));
}

export function getAttributeValue(c: CharacterAttributes, attr: CharacterAttribute): number {
  return c[attr] ?? 0;
}

export function canAccessCharacter(
  viewer: { id: string; role: 'GM' | 'PLAYER' },
  character: { ownerPlayerId: string },
): boolean {
  return viewer.role === 'GM' || viewer.id === character.ownerPlayerId;
}

export function applyCharacterPatch(
  current: Character,
  patch: {
    characterId: string;
    version: number;
    updatedAt: number;
    name?: string;
    race?: string;
    attributes?: Partial<CharacterAttributes>;
    textBlock?: SheetTextBlock;
    deletedTextBlockId?: string;
    character?: Character;
  },
): Character {
  if (patch.character) return patch.character;
  if (current.id !== patch.characterId) return current;
  let next: Character = {
    ...current,
    version: patch.version,
    updatedAt: patch.updatedAt,
  };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.race !== undefined) next.race = patch.race;
  if (patch.attributes) {
    next = { ...next, ...patch.attributes };
  }
  let blocks = next.sheetData.textBlocks;
  if (patch.deletedTextBlockId) {
    blocks = blocks.filter((b) => b.id !== patch.deletedTextBlockId);
  }
  if (patch.textBlock) {
    blocks = [...blocks.filter((b) => b.id !== patch.textBlock!.id), patch.textBlock];
  }
  if (patch.deletedTextBlockId || patch.textBlock) {
    next = { ...next, sheetData: { ...next.sheetData, textBlocks: blocks } };
  }
  return next;
}
