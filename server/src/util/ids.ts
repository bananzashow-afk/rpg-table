import { randomBytes } from 'node:crypto';
import { ROOM_CODE_PREFIX } from '@rpg-table/shared';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateId(): string {
  return randomBytes(16).toString('hex');
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** Readable room code: DND-8K4M2 */
export function generateRoomCode(): string {
  let body = '';
  const bytes = randomBytes(5);
  for (let i = 0; i < 5; i++) {
    body += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `${ROOM_CODE_PREFIX}-${body}`;
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export function secureRandomBytes(size: number): Uint8Array {
  return randomBytes(size);
}
