import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  ClientEvents,
  ServerEvents,
  applyCharacterPatch,
  type Character,
  type CharacterAttribute,
  type CharacterPatch,
  type CharacterSummary,
  type CreateRoomPayload,
  type ErrorPayload,
  type JoinRoomPayload,
  type PlayerPublic,
  type RollHistoryEntry,
  type RollRequestPayload,
  type RollResult,
  type RoomPublic,
  type SessionInfo,
  type SheetTextBlock,
  type TextAlign,
} from '@rpg-table/shared';
import { clearSession, loadSession, rememberSession, saveSession } from '../storage/local';

function resolveWsUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;
  return window.location.origin;
}

interface RoomStatePayload {
  room: RoomPublic;
  history: RollHistoryEntry[];
  characters?: Character[];
  summaries?: CharacterSummary[];
}

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  session: SessionInfo | null;
  room: RoomPublic | null;
  history: RollHistoryEntry[];
  lastRoll: RollResult | null;
  lastError: ErrorPayload | null;
  characters: Character[];
  summaries: CharacterSummary[];
  clearError: () => void;
  clearLastRoll: () => void;
  createRoom: (payload: CreateRoomPayload) => Promise<SessionInfo>;
  joinRoom: (payload: JoinRoomPayload) => Promise<SessionInfo>;
  reconnectSession: () => Promise<SessionInfo | null>;
  leaveRoom: () => Promise<void>;
  requestRoll: (payload: RollRequestPayload) => Promise<void>;
  updateAttribute: (characterId: string, attribute: CharacterAttribute, value: number) => Promise<void>;
  updateMeta: (characterId: string, patch: { name?: string; race?: string }) => Promise<void>;
  createTextBlock: (characterId: string, block: SheetTextBlock) => Promise<void>;
  updateTextBlock: (
    characterId: string,
    blockId: string,
    patch: { text?: string; fontSize?: number; align?: TextAlign; width?: number },
  ) => Promise<void>;
  moveTextBlock: (characterId: string, blockId: string, x: number, y: number) => Promise<void>;
  deleteTextBlock: (characterId: string, blockId: string) => Promise<void>;
  importCharacterFile: (file: unknown, ownerPlayerId?: string) => Promise<void>;
  ensureCharacter: (ownerPlayerId: string) => Promise<void>;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [history, setHistory] = useState<RollHistoryEntry[]>([]);
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
  const [lastError, setLastError] = useState<ErrorPayload | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [summaries, setSummaries] = useState<CharacterSummary[]>([]);

  const applySession = useCallback((info: SessionInfo, roomName?: string) => {
    setSession(info);
    saveSession(info);
    rememberSession(info, roomName);
  }, []);

  useEffect(() => {
    const s = io(resolveWsUrl(), {
      autoConnect: true,
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = s;
    setSocket(s);

    const onConnect = () => {
      setConnected(true);
      const stored = loadSession();
      if (stored?.sessionToken) {
        s.emit(ClientEvents.ROOM_RECONNECT, { sessionToken: stored.sessionToken }, (res: AckResponse) => {
          if (!res?.ok) clearSession();
        });
      }
    };
    const onDisconnect = () => setConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on(ServerEvents.SESSION, (info: SessionInfo) => {
      applySession(info);
    });
    s.on(ServerEvents.ROOM_STATE, (payload: RoomStatePayload) => {
      setRoom(payload.room);
      setHistory(payload.history);
      if (payload.characters) setCharacters(payload.characters);
      if (payload.summaries) setSummaries(payload.summaries);
    });
    s.on(ServerEvents.PLAYER_JOINED, (_player: PlayerPublic) => {
      /* room:state follows */
    });
    s.on(ServerEvents.ROLL_RESULT, (roll: RollResult) => {
      setLastRoll(roll);
      setHistory((prev) => {
        if (prev.some((h) => h.id === roll.id)) return prev;
        return [...prev, roll].slice(-200);
      });
    });
    s.on(ServerEvents.CHARACTERS, (payload: { characters: Character[]; summaries: CharacterSummary[] }) => {
      setCharacters(payload.characters);
      setSummaries(payload.summaries);
    });
    s.on(ServerEvents.CHARACTER_UPDATED, (patch: CharacterPatch) => {
      setCharacters((prev) => {
        if (patch.character) {
          const others = prev.filter((c) => c.id !== patch.characterId);
          return [...others, patch.character];
        }
        return prev.map((c) => applyCharacterPatch(c, patch));
      });
      if (patch.name !== undefined || patch.character) {
        setSummaries((prev) =>
          prev.map((s) =>
            s.id === patch.characterId
              ? {
                  ...s,
                  name: patch.character?.name ?? patch.name ?? s.name,
                  race: patch.character?.race ?? patch.race ?? s.race,
                }
              : s,
          ),
        );
      }
    });
    s.on(ServerEvents.ERROR, (err: ErrorPayload) => {
      setLastError(err);
    });

    return () => {
      s.removeAllListeners();
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [applySession]);

  const httpJson = useCallback(async <T,>(url: string, payload: unknown): Promise<T> => {
    let json: AckResponse;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      json = (await res.json()) as AckResponse;
    } catch {
      const err = { code: 'NETWORK', message: 'Нет соединения с сервером' };
      setLastError(err);
      throw new Error(err.message);
    }
    if (!json.ok) {
      const err = json.error ?? { code: 'UNKNOWN', message: 'Ошибка запроса' };
      setLastError(err);
      throw new Error(err.message);
    }
    return json.data as T;
  }, []);

  const emitAck = useCallback(<T,>(event: string, payload: unknown): Promise<T> => {
    const s = socketRef.current;
    if (!s || !s.connected) {
      return Promise.reject(new Error('Нет соединения с сервером'));
    }
    return new Promise((resolve, reject) => {
      s.emit(event, payload, (res: AckResponse) => {
        if (!res?.ok) {
          const err = res?.error ?? { code: 'UNKNOWN', message: 'Ошибка запроса' };
          setLastError(err);
          reject(new Error(err.message));
          return;
        }
        resolve(res.data as T);
      });
    });
  }, []);

  const ingestRoomData = useCallback(
    (data: {
      session: SessionInfo;
      room: RoomPublic;
      characters?: Character[];
      summaries?: CharacterSummary[];
      history?: RollHistoryEntry[];
    }) => {
      applySession(data.session, data.room.name);
      setRoom(data.room);
      if (data.characters) setCharacters(data.characters);
      if (data.summaries) setSummaries(data.summaries);
      if (data.history) setHistory(data.history);
    },
    [applySession],
  );

  const createRoom = useCallback(
    async (payload: CreateRoomPayload) => {
      const data = socketRef.current?.connected
        ? await emitAck<{
            session: SessionInfo;
            room: RoomPublic;
            characters?: Character[];
            summaries?: CharacterSummary[];
          }>(ClientEvents.ROOM_CREATE, payload)
        : await httpJson<{
            session: SessionInfo;
            room: RoomPublic;
            characters?: Character[];
            summaries?: CharacterSummary[];
          }>('/api/rooms', payload);
      ingestRoomData(data);
      return data.session;
    },
    [emitAck, httpJson, ingestRoomData],
  );

  const joinRoom = useCallback(
    async (payload: JoinRoomPayload) => {
      const data = socketRef.current?.connected
        ? await emitAck<{
            session: SessionInfo;
            room: RoomPublic;
            characters?: Character[];
            summaries?: CharacterSummary[];
            history?: RollHistoryEntry[];
          }>(ClientEvents.ROOM_JOIN, payload)
        : await httpJson<{
            session: SessionInfo;
            room: RoomPublic;
            characters?: Character[];
            summaries?: CharacterSummary[];
            history?: RollHistoryEntry[];
          }>('/api/rooms/join', payload);
      ingestRoomData(data);
      return data.session;
    },
    [emitAck, httpJson, ingestRoomData],
  );

  const reconnectSession = useCallback(async () => {
    const stored = loadSession();
    if (!stored?.sessionToken) return null;
    try {
      const data = socketRef.current?.connected
        ? await emitAck<{
            session: SessionInfo;
            room: RoomPublic;
            characters?: Character[];
            summaries?: CharacterSummary[];
            history?: RollHistoryEntry[];
          }>(ClientEvents.ROOM_RECONNECT, { sessionToken: stored.sessionToken })
        : await httpJson<{
            session: SessionInfo;
            room: RoomPublic;
            characters?: Character[];
            summaries?: CharacterSummary[];
            history?: RollHistoryEntry[];
          }>('/api/session/restore', {
            sessionToken: stored.sessionToken,
          });
      ingestRoomData(data);
      return data.session;
    } catch {
      clearSession();
      return null;
    }
  }, [emitAck, httpJson, ingestRoomData]);

  const leaveRoom = useCallback(async () => {
    try {
      await emitAck(ClientEvents.ROOM_LEAVE, {});
    } catch {
      /* ignore */
    }
    clearSession();
    setSession(null);
    setRoom(null);
    setHistory([]);
    setLastRoll(null);
    setCharacters([]);
    setSummaries([]);
  }, [emitAck]);

  const requestRoll = useCallback(
    async (payload: RollRequestPayload) => {
      await emitAck(ClientEvents.ROLL_REQUEST, payload);
    },
    [emitAck],
  );

  const updateAttribute = useCallback(
    async (characterId: string, attribute: CharacterAttribute, value: number) => {
      setCharacters((prev) =>
        prev.map((c) => (c.id === characterId ? { ...c, [attribute]: value } : c)),
      );
      await emitAck(ClientEvents.CHARACTER_UPDATE_ATTRIBUTE, { characterId, attribute, value });
    },
    [emitAck],
  );

  const updateMeta = useCallback(
    async (characterId: string, patch: { name?: string; race?: string }) => {
      setCharacters((prev) => prev.map((c) => (c.id === characterId ? { ...c, ...patch } : c)));
      await emitAck(ClientEvents.CHARACTER_UPDATE_META, { characterId, ...patch });
    },
    [emitAck],
  );

  const createTextBlock = useCallback(
    async (characterId: string, block: SheetTextBlock) => {
      setCharacters((prev) =>
        prev.map((c) =>
          c.id === characterId
            ? { ...c, sheetData: { ...c.sheetData, textBlocks: [...c.sheetData.textBlocks, block] } }
            : c,
        ),
      );
      await emitAck(ClientEvents.CHARACTER_CREATE_TEXT, { characterId, block });
    },
    [emitAck],
  );

  const updateTextBlock = useCallback(
    async (
      characterId: string,
      blockId: string,
      patch: { text?: string; fontSize?: number; align?: TextAlign; width?: number },
    ) => {
      setCharacters((prev) =>
        prev.map((c) => {
          if (c.id !== characterId) return c;
          return {
            ...c,
            sheetData: {
              ...c.sheetData,
              textBlocks: c.sheetData.textBlocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
            },
          };
        }),
      );
      await emitAck(ClientEvents.CHARACTER_UPDATE_TEXT, { characterId, blockId, ...patch });
    },
    [emitAck],
  );

  const moveTextBlock = useCallback(
    async (characterId: string, blockId: string, x: number, y: number) => {
      setCharacters((prev) =>
        prev.map((c) => {
          if (c.id !== characterId) return c;
          return {
            ...c,
            sheetData: {
              ...c.sheetData,
              textBlocks: c.sheetData.textBlocks.map((b) => (b.id === blockId ? { ...b, x, y } : b)),
            },
          };
        }),
      );
      await emitAck(ClientEvents.CHARACTER_MOVE_TEXT, { characterId, blockId, x, y });
    },
    [emitAck],
  );

  const deleteTextBlock = useCallback(
    async (characterId: string, blockId: string) => {
      setCharacters((prev) =>
        prev.map((c) => {
          if (c.id !== characterId) return c;
          return {
            ...c,
            sheetData: {
              ...c.sheetData,
              textBlocks: c.sheetData.textBlocks.filter((b) => b.id !== blockId),
            },
          };
        }),
      );
      await emitAck(ClientEvents.CHARACTER_DELETE_TEXT, { characterId, blockId });
    },
    [emitAck],
  );

  const importCharacterFile = useCallback(
    async (file: unknown, ownerPlayerId?: string) => {
      const data = await emitAck<{ character: Character }>(ClientEvents.CHARACTER_IMPORT, {
        file,
        ownerPlayerId,
      });
      if (data?.character) {
        setCharacters((prev) => {
          const others = prev.filter((c) => c.id !== data.character.id);
          return [...others, data.character];
        });
      }
    },
    [emitAck],
  );

  const ensureCharacter = useCallback(
    async (ownerPlayerId: string) => {
      await emitAck(ClientEvents.CHARACTER_ENSURE, { ownerPlayerId });
    },
    [emitAck],
  );

  const value = useMemo<SocketContextValue>(
    () => ({
      socket,
      connected,
      session,
      room,
      history,
      lastRoll,
      lastError,
      characters,
      summaries,
      clearError: () => setLastError(null),
      clearLastRoll: () => setLastRoll(null),
      createRoom,
      joinRoom,
      reconnectSession,
      leaveRoom,
      requestRoll,
      updateAttribute,
      updateMeta,
      createTextBlock,
      updateTextBlock,
      moveTextBlock,
      deleteTextBlock,
      importCharacterFile,
      ensureCharacter,
    }),
    [
      socket,
      connected,
      session,
      room,
      history,
      lastRoll,
      lastError,
      characters,
      summaries,
      createRoom,
      joinRoom,
      reconnectSession,
      leaveRoom,
      requestRoll,
      updateAttribute,
      updateMeta,
      createTextBlock,
      updateTextBlock,
      moveTextBlock,
      deleteTextBlock,
      importCharacterFile,
      ensureCharacter,
    ],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

interface AckResponse {
  ok: boolean;
  data?: unknown;
  error?: ErrorPayload;
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
