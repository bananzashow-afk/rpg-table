import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

export function resolveDbPath(): string {
  if (process.env.DATA_DIR) {
    const dir = path.resolve(process.env.DATA_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'rpg-table.sqlite');
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(here, '../../data');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'rpg-table.sqlite');
}

export function openDatabase(filePath = resolveDbPath()): Database.Database {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      session_token TEXT NOT NULL UNIQUE,
      joined_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      owner_player_id TEXT NOT NULL,
      name TEXT NOT NULL,
      race TEXT NOT NULL DEFAULT '',
      strength INTEGER NOT NULL DEFAULT 0,
      dexterity INTEGER NOT NULL DEFAULT 0,
      constitution INTEGER NOT NULL DEFAULT 0,
      intelligence INTEGER NOT NULL DEFAULT 0,
      wisdom INTEGER NOT NULL DEFAULT 0,
      charisma INTEGER NOT NULL DEFAULT 0,
      sheet_data TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      UNIQUE (room_id, owner_player_id),
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );

    CREATE TABLE IF NOT EXISTS rolls (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );

    CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
    CREATE INDEX IF NOT EXISTS idx_players_token ON players(session_token);
    CREATE INDEX IF NOT EXISTS idx_characters_room ON characters(room_id);
    CREATE INDEX IF NOT EXISTS idx_rolls_room ON rolls(room_id, timestamp);
  `);
}
