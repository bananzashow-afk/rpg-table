import type { Role, SheetPage } from '@rpg-table/shared';

const SESSION_KEY = 'rpg-table:session';
const PALETTE_KEY = 'rpg-table:dice-palette';
const KNOWN_SESSIONS_KEY = 'rpg-table:known-sessions';
const SHEET_UI_KEY = 'rpg-table:sheet-ui';

export interface StoredSession {
  sessionToken: string;
  playerId: string;
  roomId: string;
  roomCode: string;
  role: string;
  playerName: string;
}

export interface KnownSession {
  sessionToken: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  playerName: string;
  role: Role;
  lastPlayedAt: number;
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function loadKnownSessions(): KnownSession[] {
  try {
    const raw = localStorage.getItem(KNOWN_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as KnownSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberSession(session: StoredSession, roomName?: string): void {
  const list = loadKnownSessions().filter((s) => s.sessionToken !== session.sessionToken);
  list.unshift({
    sessionToken: session.sessionToken,
    roomId: session.roomId,
    roomCode: session.roomCode,
    roomName: roomName || session.roomCode,
    playerName: session.playerName,
    role: session.role === 'GM' ? 'GM' : 'PLAYER',
    lastPlayedAt: Date.now(),
  });
  localStorage.setItem(KNOWN_SESSIONS_KEY, JSON.stringify(list.slice(0, 20)));
}

export function forgetSession(sessionToken: string): void {
  const list = loadKnownSessions().filter((s) => s.sessionToken !== sessionToken);
  localStorage.setItem(KNOWN_SESSIONS_KEY, JSON.stringify(list));
}

export interface StoredPalette {
  paletteId: string;
  body: string;
  number: string;
  custom: boolean;
  mode?: 'solid' | 'rainbow';
}

export function loadPalette(): StoredPalette | null {
  try {
    const raw = localStorage.getItem(PALETTE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredPalette;
  } catch {
    return null;
  }
}

export function savePalette(palette: StoredPalette): void {
  localStorage.setItem(PALETTE_KEY, JSON.stringify(palette));
}

export interface SheetUiState {
  page: SheetPage;
  zoom: number;
  panX: number;
  panY: number;
  winX: number;
  winY: number;
  winW: number;
  winH: number;
}

export function loadSheetUi(characterId: string): SheetUiState | null {
  try {
    const raw = localStorage.getItem(`${SHEET_UI_KEY}:${characterId}`);
    if (!raw) return null;
    return JSON.parse(raw) as SheetUiState;
  } catch {
    return null;
  }
}

export function saveSheetUi(characterId: string, state: SheetUiState): void {
  localStorage.setItem(`${SHEET_UI_KEY}:${characterId}`, JSON.stringify(state));
}
