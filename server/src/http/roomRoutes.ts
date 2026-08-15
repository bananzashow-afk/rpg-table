import type { Express, Request, Response } from 'express';
import {
  buildCharacterExport,
  canAccessCharacter,
  parseCharacterExport,
  sanitizeLabel,
  type SessionInfo,
} from '@rpg-table/shared';
import { RoomError, RoomStore } from '../rooms/RoomStore.js';
import {
  charactersForViewer,
  filterHistoryForViewer,
  summariesForViewer,
  toRoomPublic,
  type PlayerRecord,
  type RoomRecord,
} from '../rooms/types.js';

export function registerRoomRoutes(app: Express, store: RoomStore): void {
  app.post('/api/rooms', (req, res) => {
    try {
      const { room, player } = store.createRoom({
        playerName: req.body?.playerName,
        roomName: req.body?.roomName,
      });
      sendOk(res, roomPayload(room, player));
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.post('/api/rooms/join', (req, res) => {
    try {
      const { room, player } = store.joinRoom({
        code: req.body?.code,
        playerName: req.body?.playerName,
        sessionToken: req.body?.sessionToken,
      });
      sendOk(res, {
        ...roomPayload(room, player),
        history: filterHistoryForViewer(room.history, player),
      });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.post('/api/session/restore', (req, res) => {
    try {
      const result = store.reconnect(req.body?.sessionToken);
      if (!result) {
        throw new RoomError('SESSION_EXPIRED', 'Сессия истекла — войдите снова');
      }
      sendOk(res, {
        ...roomPayload(result.room, result.player),
        history: filterHistoryForViewer(result.room.history, result.player),
      });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.post('/api/sessions/lookup', (req, res) => {
    try {
      const rooms = store.listSavedRooms(req.body?.tokens);
      sendOk(res, { rooms });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.get('/api/characters/:id', (req, res) => {
    try {
      const { room, player } = requireSession(store, req);
      const character = store.getCharacter(room.id, req.params.id ?? '');
      if (!character || !canAccessCharacter(player, character)) {
        throw new RoomError('FORBIDDEN', 'Нет доступа к этому листу персонажа');
      }
      sendOk(res, { character });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.get('/api/characters/:id/export', (req, res) => {
    try {
      const { room, player } = requireSession(store, req);
      const character = store.getCharacter(room.id, req.params.id ?? '');
      if (!character || !canAccessCharacter(player, character)) {
        throw new RoomError('FORBIDDEN', 'Нет доступа к этому листу персонажа');
      }
      sendOk(res, buildCharacterExport(character));
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.post('/api/characters/import', (req, res) => {
    try {
      const { room, player } = requireSession(store, req);
      const parsed = parseCharacterExport(req.body?.file ?? req.body);
      if (!parsed.ok) {
        throw new RoomError('INVALID_IMPORT', parsed.error);
      }
      let ownerId = player.id;
      if (player.role === 'GM' && typeof req.body?.ownerPlayerId === 'string') {
        if (!room.players.has(req.body.ownerPlayerId)) {
          throw new RoomError('PLAYER_NOT_FOUND', 'Игрок не найден в комнате');
        }
        ownerId = req.body.ownerPlayerId;
      }
      let character = store.characterForOwner(room, ownerId);
      if (!character) {
        const owner = room.players.get(ownerId);
        if (!owner) throw new RoomError('PLAYER_NOT_FOUND', 'Игрок не найден в комнате');
        store.ensureCharacter(room, owner);
        character = store.characterForOwner(room, ownerId);
      }
      if (!character) {
        throw new RoomError('CHARACTER_NOT_FOUND', 'Не удалось создать персонажа');
      }
      if (!canAccessCharacter(player, character)) {
        throw new RoomError('FORBIDDEN', 'Нельзя импортировать чужой лист');
      }
      store.replaceFromImport(character, {
        ...parsed.data.character,
        name: sanitizeLabel(parsed.data.character.name, 48) || character.name,
        race: sanitizeLabel(parsed.data.character.race, 48),
      });
      sendOk(res, { character });
    } catch (err) {
      sendErr(res, err);
    }
  });

  // Explicit deny for guessed "other player" paths
  app.get(['/character/:id', '/api/character/:id'], (_req, res) => {
    res.status(403).json({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Нет доступа к этому листу персонажа' },
    });
  });
}

function roomPayload(room: RoomRecord, player: PlayerRecord) {
  return {
    session: buildSession(room, player),
    room: toRoomPublic(room),
    characters: charactersForViewer(room, player),
    summaries: summariesForViewer(room, player),
  };
}

function requireSession(
  store: RoomStore,
  req: Request,
): { room: RoomRecord; player: PlayerRecord } {
  const token =
    (typeof req.body?.sessionToken === 'string' && req.body.sessionToken) ||
    (typeof req.query.sessionToken === 'string' && req.query.sessionToken) ||
    bearerToken(req);
  if (!token) {
    throw new RoomError('UNAUTHORIZED', 'Нужна сессия');
  }
  const result = store.reconnect(token);
  if (!result) {
    throw new RoomError('SESSION_EXPIRED', 'Сессия истекла — войдите снова');
  }
  return result;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const [type, value] = header.split(' ');
  if (type?.toLowerCase() !== 'bearer' || !value) return null;
  return value;
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

function sendOk(res: Response, data: unknown): void {
  res.json({ ok: true, data });
}

function sendErr(res: Response, err: unknown): void {
  const code = err instanceof RoomError ? err.code : 'INTERNAL';
  const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
  const status =
    code === 'ROOM_NOT_FOUND' || code === 'SESSION_EXPIRED' || code === 'CHARACTER_NOT_FOUND'
      ? 404
      : code === 'FORBIDDEN' || code === 'UNAUTHORIZED'
        ? 403
        : 400;
  res.status(status).json({ ok: false, error: { code, message } });
}
