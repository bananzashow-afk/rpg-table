import type {
  Character,
  CharacterSummary,
  PlayerPublic,
  Role,
  RollHistoryEntry,
  RollResult,
  RollVisibility,
  RoomPublic,
} from '@rpg-table/shared';
import { canAccessCharacter, canViewerSeeRoll } from '@rpg-table/shared';

export interface PlayerRecord {
  id: string;
  name: string;
  role: Role;
  sessionToken: string;
  connected: boolean;
  socketId: string | null;
  joinedAt: number;
  lastSeenAt: number;
}

export interface RoomRecord {
  id: string;
  code: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  players: Map<string, PlayerRecord>;
  characters: Map<string, Character>;
  /** Full history stored server-side; filtered on delivery */
  history: RollResult[];
  /**
   * Reserved bag for future room systems (maps, initiative, music, …).
   * Not exposed to clients until those modules are implemented.
   */
  extensions: Record<string, unknown>;
}

export function toPlayerPublic(p: PlayerRecord): PlayerPublic {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    connected: p.connected,
    joinedAt: p.joinedAt,
  };
}

export function toRoomPublic(room: RoomRecord): RoomPublic {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    players: [...room.players.values()].map(toPlayerPublic),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

export function toCharacterSummary(room: RoomRecord, character: Character): CharacterSummary {
  const owner = room.players.get(character.ownerPlayerId);
  return {
    id: character.id,
    ownerPlayerId: character.ownerPlayerId,
    ownerName: owner?.name ?? '—',
    name: character.name || owner?.name || 'Без имени',
    race: character.race,
  };
}

export function charactersForViewer(room: RoomRecord, viewer: PlayerRecord): Character[] {
  return [...room.characters.values()].filter((c) => canAccessCharacter(viewer, c));
}

export function summariesForViewer(room: RoomRecord, viewer: PlayerRecord): CharacterSummary[] {
  if (viewer.role !== 'GM') {
    return [...room.characters.values()]
      .filter((c) => c.ownerPlayerId === viewer.id)
      .map((c) => toCharacterSummary(room, c));
  }
  return [...room.characters.values()].map((c) => toCharacterSummary(room, c));
}

export function filterHistoryForViewer(
  history: RollResult[],
  viewer: PlayerRecord,
): RollHistoryEntry[] {
  return history.filter((roll) =>
    canViewerSeeRoll({
      visibility: roll.visibility,
      rollerId: roll.playerId,
      rollerRole: roll.role,
      viewerId: viewer.id,
      viewerRole: viewer.role,
    }),
  );
}

export function recipientsForRoll(
  room: RoomRecord,
  roll: Pick<RollResult, 'visibility' | 'playerId' | 'role'>,
): PlayerRecord[] {
  return [...room.players.values()].filter((viewer) =>
    canViewerSeeRoll({
      visibility: roll.visibility as RollVisibility,
      rollerId: roll.playerId,
      rollerRole: roll.role,
      viewerId: viewer.id,
      viewerRole: viewer.role,
    }),
  );
}
