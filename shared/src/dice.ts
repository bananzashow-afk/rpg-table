import {
  DICE_SIDES,
  MAX_DICE_PER_ROLL,
  MAX_GROUPS_PER_ROLL,
  type DiceSelection,
  type DiceSides,
  type DieResult,
  type Role,
  type RollGroupInput,
  type RollGroupResult,
  type RollRequestPayload,
  type RollVisibility,
} from './types.js';
import { formatModifier, isCharacterAttribute } from './character.js';

export function isDiceSides(value: unknown): value is DiceSides {
  return typeof value === 'number' && (DICE_SIDES as readonly number[]).includes(value);
}

export function countDiceInSelections(dice: DiceSelection[]): number {
  return dice.reduce((sum, d) => sum + Math.max(0, d.count | 0), 0);
}

export function countDiceInGroups(groups: RollGroupInput[]): number {
  return groups.reduce((sum, g) => sum + countDiceInSelections(g.dice), 0);
}

export function formatDiceExpression(dice: DiceSelection[]): string {
  const parts = dice
    .filter((d) => d.count > 0)
    .map((d) => `${d.count}D${d.sides}`);
  return parts.length > 0 ? parts.join(' + ') : '—';
}

export function allowedVisibilitiesForRole(role: Role): readonly RollVisibility[] {
  if (role === 'GM') {
    return ['PUBLIC', 'GM_ONLY'] as const;
  }
  return ['PUBLIC', 'PLAYER_AND_GM'] as const;
}

export function canUseVisibility(role: Role, visibility: RollVisibility): boolean {
  return allowedVisibilitiesForRole(role).includes(visibility);
}

/**
 * Who may receive the full roll payload (results included).
 * Visibility filtering MUST happen on the server.
 */
export function canViewerSeeRoll(args: {
  visibility: RollVisibility;
  rollerId: string;
  rollerRole: Role;
  viewerId: string;
  viewerRole: Role;
}): boolean {
  const { visibility, rollerId, viewerId, viewerRole } = args;

  switch (visibility) {
    case 'PUBLIC':
      return true;
    case 'GM_ONLY':
      return viewerRole === 'GM';
    case 'PLAYER_AND_GM':
      return viewerId === rollerId || viewerRole === 'GM';
    default:
      return false;
  }
}

export interface ValidationOk {
  ok: true;
  groups: RollGroupInput[];
  visibility: RollVisibility;
  totalDice: number;
}

export interface ValidationErr {
  ok: false;
  error: string;
}

export type ValidationResult = ValidationOk | ValidationErr;

export function validateRollRequest(
  payload: unknown,
  role: Role,
): ValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Некорректный запрос броска' };
  }

  const raw = payload as Partial<RollRequestPayload>;
  const visibility = raw.visibility;

  if (
    visibility !== 'PUBLIC' &&
    visibility !== 'PLAYER_AND_GM' &&
    visibility !== 'GM_ONLY'
  ) {
    return { ok: false, error: 'Неизвестный режим видимости' };
  }

  if (!canUseVisibility(role, visibility)) {
    return { ok: false, error: 'Этот режим видимости недоступен для вашей роли' };
  }

  if (!Array.isArray(raw.groups) || raw.groups.length === 0) {
    return { ok: false, error: 'Нужна хотя бы одна группа броска' };
  }

  if (raw.groups.length > MAX_GROUPS_PER_ROLL) {
    return { ok: false, error: `Максимум ${MAX_GROUPS_PER_ROLL} групп за бросок` };
  }

  let groups = raw.groups.map((g, index) => sanitizeGroup(g, index));

  if (typeof raw.groupId === 'string' && raw.groupId.length > 0) {
    const filtered = groups.filter((g) => g.id === raw.groupId);
    if (filtered.length === 0) {
      return { ok: false, error: 'Группа броска не найдена' };
    }
    groups = filtered;
  }

  for (const group of groups) {
    if (!group.id || typeof group.id !== 'string') {
      return { ok: false, error: 'У группы отсутствует id' };
    }
    if (!Array.isArray(group.dice) || group.dice.length === 0) {
      return { ok: false, error: 'В группе нет кубиков' };
    }
    for (const die of group.dice) {
      if (!isDiceSides(die.sides)) {
        return { ok: false, error: `Недопустимый тип кубика: D${String(die.sides)}` };
      }
      if (!Number.isInteger(die.count) || die.count < 0) {
        return { ok: false, error: 'Количество кубиков должно быть целым числом ≥ 0' };
      }
      if (die.count > MAX_DICE_PER_ROLL) {
        return { ok: false, error: `Максимум ${MAX_DICE_PER_ROLL} кубиков` };
      }
    }
    const groupCount = countDiceInSelections(group.dice);
    if (groupCount === 0) {
      return { ok: false, error: 'В группе нет выбранных кубиков' };
    }
  }

  const totalDice = countDiceInGroups(groups);
  if (totalDice === 0) {
    return { ok: false, error: 'Выберите хотя бы один кубик' };
  }
  if (totalDice > MAX_DICE_PER_ROLL) {
    return { ok: false, error: `Максимум ${MAX_DICE_PER_ROLL} кубиков в одном броске` };
  }

  return { ok: true, groups, visibility, totalDice };
}

function sanitizeGroup(g: unknown, index: number): RollGroupInput {
  if (!g || typeof g !== 'object') {
    return { id: `group-${index}`, dice: [] };
  }
  const obj = g as Partial<RollGroupInput>;
  const diceRaw = Array.isArray(obj.dice) ? obj.dice : [];
  const dice: DiceSelection[] = diceRaw
    .filter((d): d is DiceSelection => !!d && typeof d === 'object')
    .map((d) => ({
      sides: d.sides as DiceSides,
      count: Number(d.count) || 0,
    }));
  const group: RollGroupInput = {
    id: typeof obj.id === 'string' && obj.id ? obj.id : `group-${index}`,
    dice,
  };
  if (typeof obj.characterId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(obj.characterId)) {
    group.characterId = obj.characterId;
  }
  if (isCharacterAttribute(obj.attribute)) {
    group.attribute = obj.attribute;
  }
  return group;
}

/** Cryptographically strong integer in [1, sides] — used only on server */
export function rollDie(sides: DiceSides, randomBytes: (size: number) => Uint8Array): number {
  // Rejection sampling to avoid modulo bias
  const max = 256;
  const limit = max - (max % sides);
  let value: number;
  do {
    value = randomBytes(1)[0]!;
  } while (value >= limit);
  return (value % sides) + 1;
}

export function resolveGroups(
  groups: RollGroupInput[],
  randomBytes: (size: number) => Uint8Array,
): RollGroupResult[] {
  return groups.map((group) => {
    const dice: DieResult[] = [];
    for (const sel of group.dice) {
      for (let i = 0; i < sel.count; i++) {
        dice.push({ sides: sel.sides, value: rollDie(sel.sides, randomBytes) });
      }
    }
    const diceTotal = dice.reduce((s, d) => s + d.value, 0);
    return {
      id: group.id,
      dice,
      diceTotal,
      total: diceTotal,
      expression: formatDiceExpression(group.dice),
    };
  });
}

export function formatRollSummary(groups: RollGroupResult[]): string {
  return groups
    .map((g) => {
      const values = g.dice.map((d) => d.value).join(' + ');
      const dicePart = `${g.expression} → ${values}`;
      if (g.modifier) {
        return `${dicePart} · ${g.modifier.label} ${formatModifier(g.modifier.value)} = ${g.total}`;
      }
      return `${dicePart} = ${g.total}`;
    })
    .join('; ');
}

export function createEmptyDiceSelection(): DiceSelection[] {
  return DICE_SIDES.map((sides) => ({ sides, count: 0 }));
}

export function setDieCount(
  dice: DiceSelection[],
  sides: DiceSides,
  count: number,
): DiceSelection[] {
  return dice.map((d) => (d.sides === sides ? { ...d, count: Math.max(0, count) } : d));
}

export function totalSelectedDice(dice: DiceSelection[]): number {
  return countDiceInSelections(dice);
}
