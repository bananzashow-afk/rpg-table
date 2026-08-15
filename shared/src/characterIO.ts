import {
  CHARACTER_ATTRIBUTES,
  CHARACTER_FORMAT,
  CHARACTER_FORMAT_VERSION,
  SHEET_TEMPLATE_VERSION,
  clampAttribute,
  emptySheetData,
  type Character,
  type CharacterAttribute,
  type CharacterExportFile,
  type SheetData,
  type SheetPage,
  type SheetTextBlock,
  type TextAlign,
} from './character.js';
import {
  DEFAULT_TEXT_FONT_SIZE,
  MAX_TEXT_BLOCKS,
  MAX_TEXT_FONT_SIZE,
  MAX_TEXT_LENGTH,
  MIN_TEXT_FONT_SIZE,
} from './sheetLayout.js';

export function buildCharacterExport(character: Character): CharacterExportFile {
  return {
    format: CHARACTER_FORMAT,
    version: CHARACTER_FORMAT_VERSION,
    character: {
      name: character.name,
      race: character.race,
      strength: character.strength,
      dexterity: character.dexterity,
      constitution: character.constitution,
      intelligence: character.intelligence,
      wisdom: character.wisdom,
      charisma: character.charisma,
      sheetData: character.sheetData,
    },
  };
}

export function parseCharacterExport(
  raw: unknown,
): { ok: true; data: CharacterExportFile } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Файл повреждён' };
  }
  const obj = raw as Partial<CharacterExportFile>;
  if (obj.format !== CHARACTER_FORMAT) {
    return { ok: false, error: 'Неизвестный формат файла персонажа' };
  }
  if (obj.version !== CHARACTER_FORMAT_VERSION) {
    return { ok: false, error: `Неподдерживаемая версия файла (${String(obj.version)})` };
  }
  if (!obj.character || typeof obj.character !== 'object') {
    return { ok: false, error: 'В файле нет данных персонажа' };
  }
  const c = obj.character;
  const sheetData = sanitizeSheetData(c.sheetData);
  return {
    ok: true,
    data: {
      format: CHARACTER_FORMAT,
      version: CHARACTER_FORMAT_VERSION,
      character: {
        name: sanitizeLabel(c.name, 48) || 'Без имени',
        race: sanitizeLabel(c.race, 48),
        strength: clampAttribute(c.strength),
        dexterity: clampAttribute(c.dexterity),
        constitution: clampAttribute(c.constitution),
        intelligence: clampAttribute(c.intelligence),
        wisdom: clampAttribute(c.wisdom),
        charisma: clampAttribute(c.charisma),
        sheetData,
      },
    },
  };
}

export function sanitizeSheetData(raw: unknown): SheetData {
  if (!raw || typeof raw !== 'object') return emptySheetData();
  const obj = raw as Partial<SheetData>;
  const templateVersion =
    typeof obj.templateVersion === 'number' && Number.isFinite(obj.templateVersion)
      ? Math.max(1, Math.trunc(obj.templateVersion))
      : SHEET_TEMPLATE_VERSION;
  const blocksRaw = Array.isArray(obj.textBlocks) ? obj.textBlocks : [];
  const textBlocks: SheetTextBlock[] = [];
  for (const item of blocksRaw) {
    const block = sanitizeTextBlock(item);
    if (block) textBlocks.push(block);
    if (textBlocks.length >= MAX_TEXT_BLOCKS) break;
  }
  return { templateVersion, textBlocks };
}

export function sanitizeTextBlock(raw: unknown): SheetTextBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<SheetTextBlock>;
  const page = toSheetPage(obj.page);
  if (!page) return null;
  const text = typeof obj.text === 'string' ? obj.text.slice(0, MAX_TEXT_LENGTH) : '';
  const id = typeof obj.id === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(obj.id) ? obj.id : null;
  if (!id) return null;
  const align: TextAlign =
    obj.align === 'center' || obj.align === 'right' || obj.align === 'left' ? obj.align : 'left';
  const fontSize = clampInt(obj.fontSize, MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE, DEFAULT_TEXT_FONT_SIZE);
  return {
    id,
    page,
    x: clamp01(obj.x),
    y: clamp01(obj.y),
    width: clampNum(obj.width, 0.04, 1, 0.28),
    text,
    fontSize,
    align,
  };
}

export function toSheetPage(v: unknown): SheetPage | null {
  if (v === 1 || v === 2 || v === 3) return v;
  if (v === '1' || v === '2' || v === '3') return Number(v) as SheetPage;
  return null;
}

export function sanitizeLabel(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function clamp01(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNum(v, min, max, fallback));
}

export function pickAttributes(c: {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}): Record<CharacterAttribute, number> {
  const out = {} as Record<CharacterAttribute, number>;
  for (const key of CHARACTER_ATTRIBUTES) {
    out[key] = c[key];
  }
  return out;
}
