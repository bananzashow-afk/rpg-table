import type {
  Character,
  CharacterAttribute,
  CharacterExportFile,
  CharacterSummary,
  SheetTextBlock,
  TextAlign,
} from './character.js';

/** Socket.IO event names — single source of truth */

export const ClientEvents = {
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_RECONNECT: 'room:reconnect',
  ROLL_REQUEST: 'roll:request',
  CHARACTER_UPDATE_ATTRIBUTE: 'character:updateAttribute',
  CHARACTER_UPDATE_META: 'character:updateMeta',
  CHARACTER_CREATE_TEXT: 'character:createTextBlock',
  CHARACTER_UPDATE_TEXT: 'character:updateTextBlock',
  CHARACTER_MOVE_TEXT: 'character:moveTextBlock',
  CHARACTER_DELETE_TEXT: 'character:deleteTextBlock',
  CHARACTER_IMPORT: 'character:import',
  CHARACTER_ENSURE: 'character:ensure',
  PING: 'ping',
} as const;

export const ServerEvents = {
  SESSION: 'session',
  ROOM_STATE: 'room:state',
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left',
  PLAYER_UPDATED: 'player:updated',
  ROLL_RESULT: 'roll:result',
  CHARACTERS: 'characters:state',
  CHARACTER_UPDATED: 'character:updated',
  ERROR: 'error',
  PONG: 'pong',
} as const;

export type ClientEvent = (typeof ClientEvents)[keyof typeof ClientEvents];
export type ServerEvent = (typeof ServerEvents)[keyof typeof ServerEvents];

export interface CreateRoomPayload {
  playerName: string;
  roomName?: string;
}

export interface JoinRoomPayload {
  code: string;
  playerName: string;
  sessionToken?: string;
}

export interface ReconnectPayload {
  sessionToken: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface CharacterUpdateAttributePayload {
  characterId: string;
  attribute: CharacterAttribute;
  value: number;
}

export interface CharacterUpdateMetaPayload {
  characterId: string;
  name?: string;
  race?: string;
}

export interface CharacterCreateTextPayload {
  characterId: string;
  block: Omit<SheetTextBlock, 'id'> & { id?: string };
}

export interface CharacterUpdateTextPayload {
  characterId: string;
  blockId: string;
  text?: string;
  fontSize?: number;
  align?: TextAlign;
  width?: number;
}

export interface CharacterMoveTextPayload {
  characterId: string;
  blockId: string;
  x: number;
  y: number;
}

export interface CharacterDeleteTextPayload {
  characterId: string;
  blockId: string;
}

export interface CharacterImportPayload {
  /** GM may target another player; ignored for regular players */
  ownerPlayerId?: string;
  file: unknown;
}

export interface CharacterEnsurePayload {
  ownerPlayerId: string;
}

export interface CharacterPatch {
  characterId: string;
  version: number;
  updatedAt: number;
  name?: string;
  race?: string;
  attributes?: Partial<Record<CharacterAttribute, number>>;
  textBlock?: SheetTextBlock;
  deletedTextBlockId?: string;
  /** Full snapshot when a character is created / imported */
  character?: Character;
}

export interface CharactersStatePayload {
  characters: Character[];
  summaries: CharacterSummary[];
}

export type { CharacterExportFile };
