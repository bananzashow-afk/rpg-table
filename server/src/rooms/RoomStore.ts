import {
  MAX_PLAYER_NAME_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  emptySheetData,
  sanitizeSheetData,
  type Character,
  type SavedRoomSummary,
  type SheetTextBlock,
  type CharacterAttribute,
} from '@rpg-table/shared';
import type Database from 'better-sqlite3';
import type { PlayerRecord, RoomRecord } from './types.js';
import { generateId, generateRoomCode, generateSessionToken, normalizeRoomCode } from '../util/ids.js';

export class RoomStore {
  private roomsById = new Map<string, RoomRecord>();
  private roomsByCode = new Map<string, string>();
  private sessionToPlayer = new Map<string, { roomId: string; playerId: string }>();

  constructor(private readonly db: Database.Database) {
    this.hydrate();
  }

  createRoom(args: { playerName: string; roomName?: string }): {
    room: RoomRecord;
    player: PlayerRecord;
  } {
    const playerName = sanitizeName(args.playerName);
    if (!playerName) {
      throw new RoomError('INVALID_NAME', 'Укажите имя (1–32 символа)');
    }

    const roomName = sanitizeRoomName(args.roomName) || `Комната ${playerName}`;
    let code = generateRoomCode();
    while (this.roomsByCode.has(code)) {
      code = generateRoomCode();
    }

    const now = Date.now();
    const roomId = generateId();
    const player = this.createPlayer({ name: playerName, role: 'GM' });

    const room: RoomRecord = {
      id: roomId,
      code,
      name: roomName,
      createdAt: now,
      updatedAt: now,
      players: new Map([[player.id, player]]),
      characters: new Map(),
      history: [],
      extensions: {},
    };

    this.roomsById.set(roomId, room);
    this.roomsByCode.set(code, roomId);
    this.sessionToPlayer.set(player.sessionToken, { roomId, playerId: player.id });
    this.persistRoom(room);
    this.persistPlayer(room.id, player);
    this.ensureCharacter(room, player);

    return { room, player };
  }

  joinRoom(args: {
    code: string;
    playerName: string;
    sessionToken?: string;
  }): { room: RoomRecord; player: PlayerRecord; reconnected: boolean } {
    const code = normalizeRoomCode(args.code);
    const roomId = this.roomsByCode.get(code);
    if (!roomId) {
      throw new RoomError('ROOM_NOT_FOUND', 'Комната не найдена');
    }
    const room = this.roomsById.get(roomId)!;

    if (args.sessionToken) {
      const mapping = this.sessionToPlayer.get(args.sessionToken);
      if (mapping && mapping.roomId === roomId) {
        const existing = room.players.get(mapping.playerId);
        if (existing) {
          existing.lastSeenAt = Date.now();
          this.ensureCharacter(room, existing);
          this.persistPlayer(room.id, existing);
          this.touchRoom(room);
          return { room, player: existing, reconnected: true };
        }
      }
    }

    const playerName = sanitizeName(args.playerName);
    if (!playerName) {
      throw new RoomError('INVALID_NAME', 'Укажите имя (1–32 символа)');
    }

    const player = this.createPlayer({ name: playerName, role: 'PLAYER' });
    room.players.set(player.id, player);
    this.sessionToPlayer.set(player.sessionToken, { roomId: room.id, playerId: player.id });
    const created = this.ensureCharacter(room, player);
    this.persistPlayer(room.id, player);
    if (created) this.persistCharacter(created);
    this.touchRoom(room);

    return { room, player, reconnected: false };
  }

  reconnect(sessionToken: string): { room: RoomRecord; player: PlayerRecord } | null {
    const mapping = this.sessionToPlayer.get(sessionToken);
    if (!mapping) return null;
    const room = this.roomsById.get(mapping.roomId);
    if (!room) return null;
    const player = room.players.get(mapping.playerId);
    if (!player) return null;
    player.lastSeenAt = Date.now();
    this.ensureCharacter(room, player);
    this.persistPlayer(room.id, player);
    return { room, player };
  }

  getRoom(roomId: string): RoomRecord | undefined {
    return this.roomsById.get(roomId);
  }

  getRoomByCode(code: string): RoomRecord | undefined {
    const id = this.roomsByCode.get(normalizeRoomCode(code));
    return id ? this.roomsById.get(id) : undefined;
  }

  getPlayer(roomId: string, playerId: string): PlayerRecord | undefined {
    return this.roomsById.get(roomId)?.players.get(playerId);
  }

  getCharacter(roomId: string, characterId: string): Character | undefined {
    return this.roomsById.get(roomId)?.characters.get(characterId);
  }

  characterForOwner(room: RoomRecord, ownerPlayerId: string): Character | undefined {
    for (const c of room.characters.values()) {
      if (c.ownerPlayerId === ownerPlayerId) return c;
    }
    return undefined;
  }

  setConnected(roomId: string, playerId: string, socketId: string | null, connected: boolean): void {
    const player = this.getPlayer(roomId, playerId);
    if (!player) return;
    player.connected = connected;
    player.socketId = socketId;
    player.lastSeenAt = Date.now();
    this.persistPlayer(roomId, player);
  }

  appendRoll(roomId: string, roll: RoomRecord['history'][number]): void {
    const room = this.roomsById.get(roomId);
    if (!room) return;
    room.history.push(roll);
    if (room.history.length > 200) {
      room.history.splice(0, room.history.length - 200);
    }
    this.touchRoom(room);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO rolls (id, room_id, payload, timestamp) VALUES (@id, @room_id, @payload, @timestamp)`,
      )
      .run({
        id: roll.id,
        room_id: roomId,
        payload: JSON.stringify(roll),
        timestamp: roll.timestamp,
      });
  }

  listSavedRooms(tokens: unknown): SavedRoomSummary[] {
    if (!Array.isArray(tokens)) return [];
    const out: SavedRoomSummary[] = [];
    const seen = new Set<string>();
    for (const token of tokens) {
      if (typeof token !== 'string' || token.length < 16) continue;
      const mapping = this.sessionToPlayer.get(token);
      if (!mapping) continue;
      const room = this.roomsById.get(mapping.roomId);
      const player = room?.players.get(mapping.playerId);
      if (!room || !player) continue;
      const key = `${room.id}:${player.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        sessionToken: token,
        roomId: room.id,
        roomCode: room.code,
        roomName: room.name,
        playerName: player.name,
        role: player.role,
        playerCount: room.players.size,
        lastPlayedAt: Math.max(room.updatedAt, player.lastSeenAt),
      });
    }
    return out.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
  }

  ensureCharacter(room: RoomRecord, player: PlayerRecord): Character | null {
    const existing = this.characterForOwner(room, player.id);
    if (existing) return null;
    const now = Date.now();
    const character: Character = {
      id: generateId(),
      roomId: room.id,
      ownerPlayerId: player.id,
      name: player.name,
      race: '',
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 0,
      wisdom: 0,
      charisma: 0,
      sheetData: emptySheetData(),
      version: 1,
      updatedAt: now,
    };
    room.characters.set(character.id, character);
    this.persistCharacter(character);
    this.touchRoom(room);
    return character;
  }

  updateAttribute(
    character: Character,
    attribute: CharacterAttribute,
    value: number,
  ): Character {
    character[attribute] = value;
    return this.bumpCharacter(character);
  }

  updateMeta(character: Character, patch: { name?: string; race?: string }): Character {
    if (patch.name !== undefined) character.name = patch.name;
    if (patch.race !== undefined) character.race = patch.race;
    return this.bumpCharacter(character);
  }

  upsertTextBlock(character: Character, block: SheetTextBlock): Character {
    const blocks = character.sheetData.textBlocks.filter((b) => b.id !== block.id);
    blocks.push(block);
    character.sheetData = { ...character.sheetData, textBlocks: blocks };
    return this.bumpCharacter(character);
  }

  deleteTextBlock(character: Character, blockId: string): Character {
    character.sheetData = {
      ...character.sheetData,
      textBlocks: character.sheetData.textBlocks.filter((b) => b.id !== blockId),
    };
    return this.bumpCharacter(character);
  }

  replaceFromImport(
    character: Character,
    data: {
      name: string;
      race: string;
      strength: number;
      dexterity: number;
      constitution: number;
      intelligence: number;
      wisdom: number;
      charisma: number;
      sheetData: Character['sheetData'];
    },
  ): Character {
    character.name = data.name;
    character.race = data.race;
    character.strength = data.strength;
    character.dexterity = data.dexterity;
    character.constitution = data.constitution;
    character.intelligence = data.intelligence;
    character.wisdom = data.wisdom;
    character.charisma = data.charisma;
    character.sheetData = data.sheetData;
    return this.bumpCharacter(character);
  }

  private bumpCharacter(character: Character): Character {
    character.version += 1;
    character.updatedAt = Date.now();
    this.persistCharacter(character);
    const room = this.roomsById.get(character.roomId);
    if (room) this.touchRoom(room);
    return character;
  }

  private touchRoom(room: RoomRecord): void {
    room.updatedAt = Date.now();
    this.db
      .prepare(`UPDATE rooms SET name = @name, updated_at = @updated_at WHERE id = @id`)
      .run({ id: room.id, name: room.name, updated_at: room.updatedAt });
  }

  private persistRoom(room: RoomRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO rooms (id, code, name, created_at, updated_at)
         VALUES (@id, @code, @name, @created_at, @updated_at)`,
      )
      .run({
        id: room.id,
        code: room.code,
        name: room.name,
        created_at: room.createdAt,
        updated_at: room.updatedAt,
      });
  }

  private persistPlayer(roomId: string, player: PlayerRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO players
          (id, room_id, name, role, session_token, joined_at, last_seen_at)
         VALUES (@id, @room_id, @name, @role, @session_token, @joined_at, @last_seen_at)`,
      )
      .run({
        id: player.id,
        room_id: roomId,
        name: player.name,
        role: player.role,
        session_token: player.sessionToken,
        joined_at: player.joinedAt,
        last_seen_at: player.lastSeenAt,
      });
  }

  private persistCharacter(character: Character): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO characters (
          id, room_id, owner_player_id, name, race,
          strength, dexterity, constitution, intelligence, wisdom, charisma,
          sheet_data, version, updated_at
        ) VALUES (
          @id, @room_id, @owner_player_id, @name, @race,
          @strength, @dexterity, @constitution, @intelligence, @wisdom, @charisma,
          @sheet_data, @version, @updated_at
        )`,
      )
      .run({
        id: character.id,
        room_id: character.roomId,
        owner_player_id: character.ownerPlayerId,
        name: character.name,
        race: character.race,
        strength: character.strength,
        dexterity: character.dexterity,
        constitution: character.constitution,
        intelligence: character.intelligence,
        wisdom: character.wisdom,
        charisma: character.charisma,
        sheet_data: JSON.stringify(character.sheetData),
        version: character.version,
        updated_at: character.updatedAt,
      });
  }

  private hydrate(): void {
    const roomRows = this.db
      .prepare(`SELECT id, code, name, created_at, updated_at FROM rooms`)
      .all() as Array<{
      id: string;
      code: string;
      name: string;
      created_at: number;
      updated_at: number;
    }>;

    for (const row of roomRows) {
      const room: RoomRecord = {
        id: row.id,
        code: row.code,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        players: new Map(),
        characters: new Map(),
        history: [],
        extensions: {},
      };
      this.roomsById.set(room.id, room);
      this.roomsByCode.set(room.code, room.id);
    }

    const playerRows = this.db
      .prepare(
        `SELECT id, room_id, name, role, session_token, joined_at, last_seen_at FROM players`,
      )
      .all() as Array<{
      id: string;
      room_id: string;
      name: string;
      role: PlayerRecord['role'];
      session_token: string;
      joined_at: number;
      last_seen_at: number;
    }>;

    for (const row of playerRows) {
      const room = this.roomsById.get(row.room_id);
      if (!room) continue;
      const player: PlayerRecord = {
        id: row.id,
        name: row.name,
        role: row.role,
        sessionToken: row.session_token,
        connected: false,
        socketId: null,
        joinedAt: row.joined_at,
        lastSeenAt: row.last_seen_at,
      };
      room.players.set(player.id, player);
      this.sessionToPlayer.set(player.sessionToken, { roomId: room.id, playerId: player.id });
    }

    const charRows = this.db
      .prepare(
        `SELECT id, room_id, owner_player_id, name, race, strength, dexterity, constitution,
                intelligence, wisdom, charisma, sheet_data, version, updated_at
         FROM characters`,
      )
      .all() as Array<{
      id: string;
      room_id: string;
      owner_player_id: string;
      name: string;
      race: string;
      strength: number;
      dexterity: number;
      constitution: number;
      intelligence: number;
      wisdom: number;
      charisma: number;
      sheet_data: string;
      version: number;
      updated_at: number;
    }>;

    for (const row of charRows) {
      const room = this.roomsById.get(row.room_id);
      if (!room) continue;
      let sheetRaw: unknown = emptySheetData();
      try {
        sheetRaw = JSON.parse(row.sheet_data);
      } catch {
        sheetRaw = emptySheetData();
      }
      const character: Character = {
        id: row.id,
        roomId: row.room_id,
        ownerPlayerId: row.owner_player_id,
        name: row.name,
        race: row.race,
        strength: row.strength,
        dexterity: row.dexterity,
        constitution: row.constitution,
        intelligence: row.intelligence,
        wisdom: row.wisdom,
        charisma: row.charisma,
        sheetData: sanitizeSheetData(sheetRaw),
        version: row.version,
        updatedAt: row.updated_at,
      };
      room.characters.set(character.id, character);
    }

    const rollRows = this.db
      .prepare(`SELECT room_id, payload FROM rolls ORDER BY timestamp ASC`)
      .all() as Array<{ room_id: string; payload: string }>;
    for (const row of rollRows) {
      const room = this.roomsById.get(row.room_id);
      if (!room) continue;
      try {
        const roll = JSON.parse(row.payload) as RoomRecord['history'][number];
        room.history.push(roll);
      } catch {
        /* skip corrupt row */
      }
    }
    for (const room of this.roomsById.values()) {
      if (room.history.length > 200) {
        room.history.splice(0, room.history.length - 200);
      }
    }
  }

  private createPlayer(args: { name: string; role: PlayerRecord['role'] }): PlayerRecord {
    const now = Date.now();
    return {
      id: generateId(),
      name: args.name,
      role: args.role,
      sessionToken: generateSessionToken(),
      connected: false,
      socketId: null,
      joinedAt: now,
      lastSeenAt: now,
    };
  }
}

export class RoomError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}

function sanitizeName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
}

function sanitizeRoomName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.trim().slice(0, MAX_ROOM_NAME_LENGTH);
}
