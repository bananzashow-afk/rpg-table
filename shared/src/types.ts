/** Supported polyhedral dice faces */
export type DiceSides = 4 | 6 | 8 | 10 | 12 | 20;

export const DICE_SIDES: readonly DiceSides[] = [4, 6, 8, 10, 12, 20] as const;

export const MAX_DICE_PER_ROLL = 20;
export const MAX_GROUPS_PER_ROLL = 12;
export const MAX_PLAYER_NAME_LENGTH = 32;
export const MAX_ROOM_NAME_LENGTH = 48;
export const ROOM_CODE_PREFIX = 'DND';

/** Room participant role */
export type Role = 'GM' | 'PLAYER';

/**
 * Roll visibility — server filters recipients.
 * Never trust client-side hiding alone.
 */
export type RollVisibility = 'PUBLIC' | 'PLAYER_AND_GM' | 'GM_ONLY';

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export type RollMode = 'combined' | 'separate';

export interface DiceSelection {
  sides: DiceSides;
  count: number;
}

export interface RollGroupInput {
  id: string;
  dice: DiceSelection[];
  /** Server resolves the numeric bonus from the character sheet */
  characterId?: string;
  attribute?: import('./character.js').CharacterAttribute;
}

/** Client → server: intent only, never results */
export interface RollRequestPayload {
  visibility: RollVisibility;
  groups: RollGroupInput[];
  /** When set, only this group is rolled (separate mode) */
  groupId?: string;
}

export interface DieResult {
  sides: DiceSides;
  value: number;
}

export interface RollModifierResult {
  characterId: string;
  attribute: import('./character.js').CharacterAttribute;
  label: string;
  value: number;
}

export interface RollGroupResult {
  id: string;
  dice: DieResult[];
  /** Sum of dice only */
  diceTotal: number;
  modifier?: RollModifierResult;
  total: number;
  /** Human-readable, e.g. "1D20 + 3D4" */
  expression: string;
}

export interface RollResult {
  id: string;
  roomId: string;
  playerId: string;
  playerName: string;
  role: Role;
  visibility: RollVisibility;
  groups: RollGroupResult[];
  /** Sum of all group totals in this roll */
  grandTotal: number;
  timestamp: number;
}

export interface PlayerPublic {
  id: string;
  name: string;
  role: Role;
  connected: boolean;
  joinedAt: number;
}

export interface RoomPublic {
  id: string;
  code: string;
  name: string;
  players: PlayerPublic[];
  createdAt: number;
  updatedAt?: number;
}

export interface SavedRoomSummary {
  sessionToken: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  playerName: string;
  role: Role;
  playerCount: number;
  lastPlayedAt: number;
}

export interface SessionInfo {
  sessionToken: string;
  playerId: string;
  roomId: string;
  roomCode: string;
  role: Role;
  playerName: string;
}

/** History entry as seen by a specific recipient (already filtered) */
export type RollHistoryEntry = RollResult;

export interface DicePalette {
  id: string;
  name: string;
  body: string;
  number: string;
  accent?: string;
  /** Special material mode (e.g. rainbow gradient) */
  mode?: 'solid' | 'rainbow';
}

export const DEFAULT_PALETTES: readonly DicePalette[] = [
  { id: 'classic-white', name: 'Классические белые', body: '#F5F0E6', number: '#1A1510', accent: '#8B7355' },
  { id: 'obsidian', name: 'Чёрные', body: '#1C1C1E', number: '#F0E6D2', accent: '#4A4A4E' },
  { id: 'crimson', name: 'Красные', body: '#8B1E1E', number: '#FFF5E6', accent: '#C44' },
  { id: 'sapphire', name: 'Синие', body: '#1A3A6B', number: '#E8F0FF', accent: '#4A7FD4' },
  { id: 'emerald', name: 'Зелёные', body: '#1B4D3E', number: '#E8FFF4', accent: '#3D9B7A' },
  { id: 'amethyst', name: 'Фиолетовые', body: '#4A2C6A', number: '#F5ECFF', accent: '#9B6BC4' },
  { id: 'gold', name: 'Золотистые', body: '#C9A227', number: '#2A1F08', accent: '#E8C84A' },
  { id: 'rose', name: 'Розовые', body: '#E85A9B', number: '#FFF8FC', accent: '#FF9EC8' },
  {
    id: 'rainbow',
    name: 'Радужные',
    body: '#FF6B9D',
    number: '#1A1510',
    accent: '#7C5CFF',
    mode: 'rainbow',
  },
] as const;

export const DEFAULT_PALETTE_ID = 'classic-white';
