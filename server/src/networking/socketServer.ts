import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  ClientEvents,
  MAX_TEXT_BLOCKS,
  MAX_TEXT_LENGTH,
  ServerEvents,
  canAccessCharacter,
  clampAttribute,
  isCharacterAttribute,
  parseCharacterExport,
  sanitizeLabel,
  sanitizeTextBlock,
  toSheetPage,
  type CharacterCreateTextPayload,
  type CharacterDeleteTextPayload,
  type CharacterEnsurePayload,
  type CharacterImportPayload,
  type CharacterMoveTextPayload,
  type CharacterPatch,
  type CharacterUpdateAttributePayload,
  type CharacterUpdateMetaPayload,
  type CharacterUpdateTextPayload,
  type CreateRoomPayload,
  type ErrorPayload,
  type JoinRoomPayload,
  type PlayerPublic,
  type ReconnectPayload,
  type RollHistoryEntry,
  type RollResult,
  type RoomPublic,
  type SessionInfo,
  type SheetTextBlock,
} from '@rpg-table/shared';
import type { ServerConfig } from '../config.js';
import { RoomError, RoomStore } from '../rooms/RoomStore.js';
import {
  charactersForViewer,
  filterHistoryForViewer,
  recipientsForRoll,
  summariesForViewer,
  toPlayerPublic,
  toRoomPublic,
  type PlayerRecord,
  type RoomRecord,
} from '../rooms/types.js';
import { executeRoll } from '../dice/rollService.js';
import { generateId } from '../util/ids.js';

interface SocketData {
  roomId?: string;
  playerId?: string;
  sessionToken?: string;
}

interface ClientToServerEvents {
  [ClientEvents.ROOM_CREATE]: (payload: CreateRoomPayload, ack?: Ack) => void;
  [ClientEvents.ROOM_JOIN]: (payload: JoinRoomPayload, ack?: Ack) => void;
  [ClientEvents.ROOM_RECONNECT]: (payload: ReconnectPayload, ack?: Ack) => void;
  [ClientEvents.ROOM_LEAVE]: (payload?: unknown, ack?: Ack) => void;
  [ClientEvents.ROLL_REQUEST]: (payload: unknown, ack?: Ack) => void;
  [ClientEvents.CHARACTER_UPDATE_ATTRIBUTE]: (
    payload: CharacterUpdateAttributePayload,
    ack?: Ack,
  ) => void;
  [ClientEvents.CHARACTER_UPDATE_META]: (payload: CharacterUpdateMetaPayload, ack?: Ack) => void;
  [ClientEvents.CHARACTER_CREATE_TEXT]: (payload: CharacterCreateTextPayload, ack?: Ack) => void;
  [ClientEvents.CHARACTER_UPDATE_TEXT]: (payload: CharacterUpdateTextPayload, ack?: Ack) => void;
  [ClientEvents.CHARACTER_MOVE_TEXT]: (payload: CharacterMoveTextPayload, ack?: Ack) => void;
  [ClientEvents.CHARACTER_DELETE_TEXT]: (payload: CharacterDeleteTextPayload, ack?: Ack) => void;
  [ClientEvents.CHARACTER_IMPORT]: (payload: CharacterImportPayload, ack?: Ack) => void;
  [ClientEvents.CHARACTER_ENSURE]: (payload: CharacterEnsurePayload, ack?: Ack) => void;
  [ClientEvents.PING]: (payload?: unknown, ack?: Ack) => void;
}

interface ServerToClientEvents {
  [ServerEvents.SESSION]: (info: SessionInfo) => void;
  [ServerEvents.ROOM_STATE]: (payload: {
    room: RoomPublic;
    history: RollHistoryEntry[];
    characters: import('@rpg-table/shared').Character[];
    summaries: import('@rpg-table/shared').CharacterSummary[];
  }) => void;
  [ServerEvents.PLAYER_JOINED]: (player: PlayerPublic) => void;
  [ServerEvents.PLAYER_LEFT]: (playerId: string) => void;
  [ServerEvents.PLAYER_UPDATED]: (player: PlayerPublic) => void;
  [ServerEvents.ROLL_RESULT]: (roll: RollResult) => void;
  [ServerEvents.CHARACTERS]: (payload: {
    characters: import('@rpg-table/shared').Character[];
    summaries: import('@rpg-table/shared').CharacterSummary[];
  }) => void;
  [ServerEvents.CHARACTER_UPDATED]: (patch: CharacterPatch) => void;
  [ServerEvents.ERROR]: (error: ErrorPayload) => void;
  [ServerEvents.PONG]: (payload: { t: number }) => void;
}

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type Ack = (
  response:
    | { ok: true; data?: unknown }
    | { ok: false; error: { code: string; message: string } },
) => void;

export function createSocketServer(
  httpServer: HttpServer,
  config: ServerConfig,
  store: RoomStore,
): AppServer {
  const io: AppServer = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin === '*' ? true : config.corsOrigin,
      methods: ['GET', 'POST'],
    },
    transports: ['polling', 'websocket'],
    allowUpgrades: true,
    perMessageDeflate: false,
  });

  io.on('connection', (socket: AppSocket) => {
    socket.on(ClientEvents.ROOM_CREATE, (payload, ack) => {
      try {
        const { room, player } = store.createRoom({
          playerName: payload?.playerName,
          roomName: payload?.roomName,
        });
        attachToRoom(store, socket, room, player);
        const session = buildSession(room, player);
        pushRoomState(socket, room, player);
        socket.emit(ServerEvents.SESSION, session);
        ackOk(ack, { session, room: toRoomPublic(room), ...charsPayload(room, player) });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.ROOM_JOIN, (payload, ack) => {
      try {
        const { room, player, reconnected } = store.joinRoom({
          code: payload?.code,
          playerName: payload?.playerName,
          sessionToken: payload?.sessionToken,
        });
        attachToRoom(store, socket, room, player);
        const session = buildSession(room, player);
        pushRoomState(socket, room, player);
        socket.emit(ServerEvents.SESSION, session);

        if (!reconnected) {
          socket.to(room.id).emit(ServerEvents.PLAYER_JOINED, toPlayerPublic(player));
        }
        broadcastRoomStates(io, room);

        ackOk(ack, { session, room: toRoomPublic(room), reconnected, ...charsPayload(room, player) });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.ROOM_RECONNECT, (payload, ack) => {
      try {
        const result = store.reconnect(payload?.sessionToken);
        if (!result) {
          throw new RoomError('SESSION_EXPIRED', 'Сессия истекла — войдите снова');
        }
        const { room, player } = result;
        attachToRoom(store, socket, room, player);
        const session = buildSession(room, player);
        pushRoomState(socket, room, player);
        socket.emit(ServerEvents.SESSION, session);
        broadcastRoomStates(io, room);
        ackOk(ack, { session, room: toRoomPublic(room), ...charsPayload(room, player) });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.ROOM_LEAVE, (_payload, ack) => {
      try {
        detachFromRoom(io, store, socket);
        ackOk(ack, { ok: true });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.ROLL_REQUEST, (payload, ack) => {
      try {
        const ctx = requireMembership(store, socket);
        const roll = executeRoll({ room: ctx.room, player: ctx.player, payload });
        store.appendRoll(ctx.room.id, roll);

        for (const viewer of recipientsForRoll(ctx.room, roll)) {
          if (viewer.socketId) {
            io.to(viewer.socketId).emit(ServerEvents.ROLL_RESULT, roll);
          }
        }

        ackOk(ack, { rollId: roll.id });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.CHARACTER_UPDATE_ATTRIBUTE, (payload, ack) => {
      try {
        const { room, character } = requireCharacter(store, socket, payload?.characterId);
        if (!isCharacterAttribute(payload?.attribute)) {
          throw new RoomError('INVALID_ATTRIBUTE', 'Неизвестная характеристика');
        }
        store.updateAttribute(character, payload.attribute, clampAttribute(payload.value));
        const patch: CharacterPatch = {
          characterId: character.id,
          version: character.version,
          updatedAt: character.updatedAt,
          attributes: { [payload.attribute]: character[payload.attribute] },
        };
        emitCharacterPatch(io, room, character, patch);
        ackOk(ack, { version: character.version });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.CHARACTER_UPDATE_META, (payload, ack) => {
      try {
        const { room, character } = requireCharacter(store, socket, payload?.characterId);
        const name = payload?.name !== undefined ? sanitizeLabel(payload.name, 48) : undefined;
        const race = payload?.race !== undefined ? sanitizeLabel(payload.race, 48) : undefined;
        store.updateMeta(character, { name, race });
        const patch: CharacterPatch = {
          characterId: character.id,
          version: character.version,
          updatedAt: character.updatedAt,
          name: character.name,
          race: character.race,
        };
        emitCharacterPatch(io, room, character, patch);
        ackOk(ack, { version: character.version });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.CHARACTER_CREATE_TEXT, (payload, ack) => {
      try {
        const { room, character } = requireCharacter(store, socket, payload?.characterId);
        if (character.sheetData.textBlocks.length >= MAX_TEXT_BLOCKS) {
          throw new RoomError('TEXT_LIMIT', `Максимум ${MAX_TEXT_BLOCKS} текстовых блоков`);
        }
        const page = toSheetPage(payload?.block?.page);
        if (!page) throw new RoomError('INVALID_TEXT', 'Некорректная страница');
        const id =
          typeof payload?.block?.id === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(payload.block.id)
            ? payload.block.id
            : generateId();
        const candidate = sanitizeTextBlock({ ...payload.block, id, page });
        if (!candidate) throw new RoomError('INVALID_TEXT', 'Некорректный текстовый блок');
        store.upsertTextBlock(character, candidate);
        emitCharacterPatch(io, room, character, {
          characterId: character.id,
          version: character.version,
          updatedAt: character.updatedAt,
          textBlock: candidate,
        });
        ackOk(ack, { block: candidate, version: character.version });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.CHARACTER_UPDATE_TEXT, (payload, ack) => {
      try {
        const { room, character } = requireCharacter(store, socket, payload?.characterId);
        const existing = character.sheetData.textBlocks.find((b) => b.id === payload?.blockId);
        if (!existing) throw new RoomError('TEXT_NOT_FOUND', 'Текстовый блок не найден');
        const next: SheetTextBlock = {
          ...existing,
          text:
            typeof payload.text === 'string' ? payload.text.slice(0, MAX_TEXT_LENGTH) : existing.text,
          fontSize: payload.fontSize ?? existing.fontSize,
          align: payload.align ?? existing.align,
          width: payload.width ?? existing.width,
        };
        const sanitized = sanitizeTextBlock(next);
        if (!sanitized) throw new RoomError('INVALID_TEXT', 'Некорректный текстовый блок');
        store.upsertTextBlock(character, sanitized);
        emitCharacterPatch(io, room, character, {
          characterId: character.id,
          version: character.version,
          updatedAt: character.updatedAt,
          textBlock: sanitized,
        });
        ackOk(ack, { block: sanitized, version: character.version });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.CHARACTER_MOVE_TEXT, (payload, ack) => {
      try {
        const { room, character } = requireCharacter(store, socket, payload?.characterId);
        const existing = character.sheetData.textBlocks.find((b) => b.id === payload?.blockId);
        if (!existing) throw new RoomError('TEXT_NOT_FOUND', 'Текстовый блок не найден');
        const sanitized = sanitizeTextBlock({
          ...existing,
          x: payload.x,
          y: payload.y,
        });
        if (!sanitized) throw new RoomError('INVALID_TEXT', 'Некорректная позиция');
        store.upsertTextBlock(character, sanitized);
        emitCharacterPatch(io, room, character, {
          characterId: character.id,
          version: character.version,
          updatedAt: character.updatedAt,
          textBlock: sanitized,
        });
        ackOk(ack, { block: sanitized, version: character.version });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.CHARACTER_DELETE_TEXT, (payload, ack) => {
      try {
        const { room, character } = requireCharacter(store, socket, payload?.characterId);
        const existing = character.sheetData.textBlocks.find((b) => b.id === payload?.blockId);
        if (!existing) throw new RoomError('TEXT_NOT_FOUND', 'Текстовый блок не найден');
        store.deleteTextBlock(character, existing.id);
        emitCharacterPatch(io, room, character, {
          characterId: character.id,
          version: character.version,
          updatedAt: character.updatedAt,
          deletedTextBlockId: existing.id,
        });
        ackOk(ack, { version: character.version });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.CHARACTER_IMPORT, (payload, ack) => {
      try {
        const ctx = requireMembership(store, socket);
        const parsed = parseCharacterExport(payload?.file);
        if (!parsed.ok) throw new RoomError('INVALID_IMPORT', parsed.error);
        let ownerId = ctx.player.id;
        if (ctx.player.role === 'GM' && payload?.ownerPlayerId) {
          if (!ctx.room.players.has(payload.ownerPlayerId)) {
            throw new RoomError('PLAYER_NOT_FOUND', 'Игрок не найден в комнате');
          }
          ownerId = payload.ownerPlayerId;
        }
        let character = store.characterForOwner(ctx.room, ownerId);
        if (!character) {
          const owner = ctx.room.players.get(ownerId);
          if (!owner) throw new RoomError('PLAYER_NOT_FOUND', 'Игрок не найден');
          store.ensureCharacter(ctx.room, owner);
          character = store.characterForOwner(ctx.room, ownerId);
        }
        if (!character || !canAccessCharacter(ctx.player, character)) {
          throw new RoomError('FORBIDDEN', 'Нельзя импортировать чужой лист');
        }
        store.replaceFromImport(character, parsed.data.character);
        emitCharacterPatch(io, ctx.room, character, {
          characterId: character.id,
          version: character.version,
          updatedAt: character.updatedAt,
          character,
        });
        broadcastCharacterLists(io, ctx.room);
        ackOk(ack, { character });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.CHARACTER_ENSURE, (payload, ack) => {
      try {
        const ctx = requireMembership(store, socket);
        if (ctx.player.role !== 'GM') {
          throw new RoomError('FORBIDDEN', 'Только мастер может создать персонажа игроку');
        }
        const owner = ctx.room.players.get(payload?.ownerPlayerId);
        if (!owner) throw new RoomError('PLAYER_NOT_FOUND', 'Игрок не найден');
        const created = store.ensureCharacter(ctx.room, owner);
        const character = store.characterForOwner(ctx.room, owner.id);
        if (created && character) {
          emitCharacterPatch(io, ctx.room, character, {
            characterId: character.id,
            version: character.version,
            updatedAt: character.updatedAt,
            character,
          });
        }
        broadcastCharacterLists(io, ctx.room);
        ackOk(ack, { character });
      } catch (err) {
        handleError(socket, err, ack);
      }
    });

    socket.on(ClientEvents.PING, (_payload, ack) => {
      const t = Date.now();
      socket.emit(ServerEvents.PONG, { t });
      ackOk(ack, { t });
    });

    socket.on('disconnect', () => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) return;

      const room = store.getRoom(roomId);
      const player = room?.players.get(playerId);
      if (player && player.socketId === socket.id) {
        store.setConnected(roomId, playerId, null, false);
        socket.to(roomId).emit(ServerEvents.PLAYER_UPDATED, toPlayerPublic(player));
        if (room) broadcastRoomStates(io, room);
      }
    });
  });

  return io;
}

function charsPayload(room: RoomRecord, player: PlayerRecord) {
  return {
    characters: charactersForViewer(room, player),
    summaries: summariesForViewer(room, player),
  };
}

function emitCharacterPatch(
  io: AppServer,
  room: RoomRecord,
  character: { ownerPlayerId: string },
  patch: CharacterPatch,
): void {
  for (const viewer of room.players.values()) {
    if (!viewer.socketId) continue;
    if (!canAccessCharacter(viewer, character)) continue;
    io.to(viewer.socketId).emit(ServerEvents.CHARACTER_UPDATED, patch);
  }
}

function broadcastCharacterLists(io: AppServer, room: RoomRecord): void {
  for (const player of room.players.values()) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit(ServerEvents.CHARACTERS, charsPayload(room, player));
  }
}

function attachToRoom(
  store: RoomStore,
  socket: AppSocket,
  room: RoomRecord,
  player: PlayerRecord,
): void {
  if (socket.data.roomId && socket.data.roomId !== room.id) {
    socket.leave(socket.data.roomId);
  }
  socket.join(room.id);
  socket.data.roomId = room.id;
  socket.data.playerId = player.id;
  socket.data.sessionToken = player.sessionToken;
  store.setConnected(room.id, player.id, socket.id, true);
}

function detachFromRoom(io: AppServer, store: RoomStore, socket: AppSocket): void {
  const { roomId, playerId } = socket.data;
  if (!roomId || !playerId) return;

  store.setConnected(roomId, playerId, null, false);
  const room = store.getRoom(roomId);
  socket.leave(roomId);
  socket.data.roomId = undefined;
  socket.data.playerId = undefined;
  socket.data.sessionToken = undefined;

  if (room) {
    const player = room.players.get(playerId);
    if (player) {
      io.to(roomId).emit(ServerEvents.PLAYER_UPDATED, toPlayerPublic(player));
      broadcastRoomStates(io, room);
    }
  }
}

function requireMembership(
  store: RoomStore,
  socket: AppSocket,
): { room: RoomRecord; player: PlayerRecord } {
  const { roomId, playerId } = socket.data;
  if (!roomId || !playerId) {
    throw new RoomError('NOT_IN_ROOM', 'Вы не в комнате');
  }
  const room = store.getRoom(roomId);
  const player = room?.players.get(playerId);
  if (!room || !player) {
    throw new RoomError('NOT_IN_ROOM', 'Вы не в комнате');
  }
  if (!player.connected || player.socketId !== socket.id) {
    throw new RoomError('DISCONNECTED', 'Соединение разорвано');
  }
  return { room, player };
}

function requireCharacter(
  store: RoomStore,
  socket: AppSocket,
  characterId: string | undefined,
): { room: RoomRecord; player: PlayerRecord; character: import('@rpg-table/shared').Character } {
  const ctx = requireMembership(store, socket);
  if (!characterId) {
    throw new RoomError('CHARACTER_NOT_FOUND', 'Персонаж не указан');
  }
  const character = store.getCharacter(ctx.room.id, characterId);
  if (!character || !canAccessCharacter(ctx.player, character)) {
    throw new RoomError('FORBIDDEN', 'Нет доступа к этому листу персонажа');
  }
  return { ...ctx, character };
}

function buildSession(room: RoomRecord, player: PlayerRecord): SessionInfo {
  return {
    sessionToken: player.sessionToken,
    playerId: player.id,
    roomId: room.id,
    roomCode: room.code,
    role: player.role,
    playerName: player.name,
  };
}

function pushRoomState(socket: AppSocket, room: RoomRecord, player: PlayerRecord): void {
  socket.emit(ServerEvents.ROOM_STATE, {
    room: toRoomPublic(room),
    history: filterHistoryForViewer(room.history, player),
    ...charsPayload(room, player),
  });
}

function broadcastRoomStates(io: AppServer, room: RoomRecord): void {
  for (const player of room.players.values()) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit(ServerEvents.ROOM_STATE, {
      room: toRoomPublic(room),
      history: filterHistoryForViewer(room.history, player),
      ...charsPayload(room, player),
    });
  }
}

function ackOk(ack: Ack | undefined, data?: unknown): void {
  ack?.({ ok: true, data });
}

function handleError(socket: AppSocket, err: unknown, ack?: Ack): void {
  const code = err instanceof RoomError ? err.code : 'INTERNAL';
  const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
  const payload = { code, message };
  socket.emit(ServerEvents.ERROR, payload);
  ack?.({ ok: false, error: payload });
}

