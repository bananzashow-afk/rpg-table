import {
  ATTRIBUTE_LABELS,
  canAccessCharacter,
  getAttributeValue,
  type Character,
  type RollModifierResult,
  type RollRequestPayload,
  type RollResult,
  resolveGroups,
  validateRollRequest,
} from '@rpg-table/shared';
import type { PlayerRecord, RoomRecord } from '../rooms/types.js';
import { generateId, secureRandomBytes } from '../util/ids.js';
import { RoomError } from '../rooms/RoomStore.js';

export function executeRoll(args: {
  room: RoomRecord;
  player: PlayerRecord;
  payload: unknown;
}): RollResult {
  const { room, player, payload } = args;

  const validation = validateRollRequest(payload as RollRequestPayload, player.role);
  if (!validation.ok) {
    throw new RoomError('INVALID_ROLL', validation.error);
  }

  const groups = resolveGroups(validation.groups, secureRandomBytes).map((result, index) => {
    const input = validation.groups[index]!;
    if (!input.attribute) return result;
    const character = resolveCharacterForRoll(room, player, input.characterId);
    const value = getAttributeValue(character, input.attribute);
    const modifier: RollModifierResult = {
      characterId: character.id,
      attribute: input.attribute,
      label: ATTRIBUTE_LABELS[input.attribute],
      value,
    };
    return {
      ...result,
      modifier,
      total: result.diceTotal + value,
    };
  });

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  return {
    id: generateId(),
    roomId: room.id,
    playerId: player.id,
    playerName: player.name,
    role: player.role,
    visibility: validation.visibility,
    groups,
    grandTotal,
    timestamp: Date.now(),
  };
}

function resolveCharacterForRoll(
  room: RoomRecord,
  player: PlayerRecord,
  characterId: string | undefined,
): Character {
  let character: Character | undefined;
  if (characterId) {
    character = room.characters.get(characterId);
  } else if (player.role === 'PLAYER') {
    character = [...room.characters.values()].find((c) => c.ownerPlayerId === player.id);
  }

  if (!character) {
    throw new RoomError('CHARACTER_NOT_FOUND', 'Персонаж для модификатора не найден');
  }
  if (!canAccessCharacter(player, character)) {
    throw new RoomError('FORBIDDEN', 'Нельзя использовать чужие характеристики');
  }
  return character;
}
