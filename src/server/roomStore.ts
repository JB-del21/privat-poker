/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import pg from 'pg';

/** A szoba mentett (JSON-barát) alakja. Időzítő és Set nélkül. */
export interface StoredRoom {
  roomCode: string;
  hostPlayerId: string;
  settings: { smallBlind: number; bigBlind: number; startingChips: number; turnTimeLimitSec: number };
  players: { id: string; nickname: string; chips: number; sessionToken: string; isConnected: boolean }[];
  gameState: unknown | null;
  processedActionIds: string[];
  dealerIndex: number;
  handNumber: number;
  lastActiveAt: number;
}

/** Minimális lekérdező felület, hogy tesztben ki lehessen váltani. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface RoomStore {
  init(): Promise<void>;
  loadAll(): Promise<StoredRoom[]>;
  /** Összevonja a gyors egymás utáni mentéseket szobánként. */
  save(room: StoredRoom): void;
  remove(roomCode: string): void;
  /** Függő mentések kiírása (leállításkor). */
  flush(): Promise<void>;
}

const MAX_IDS = 200;
const DEBOUNCE_MS = 300;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class PgRoomStore implements RoomStore {
  private pending = new Map<string, { room: StoredRoom; timer: NodeJS.Timeout }>();
  private inflight = new Set<Promise<void>>();

  constructor(private db: Queryable, private log: (m: string) => void = () => {}) {}

  async init(): Promise<void> {
    await this.db.query(
      `CREATE TABLE IF NOT EXISTS poker_rooms (
         room_code text PRIMARY KEY,
         data jsonb NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT now()
       )`
    );
  }

  async loadAll(): Promise<StoredRoom[]> {
    const { rows } = await this.db.query(
      `SELECT data FROM poker_rooms WHERE updated_at > now() - interval '24 hours'`
    );
    const cutoff = Date.now() - MAX_AGE_MS;
    return rows.map((r) => r.data as StoredRoom).filter((r) => r && r.lastActiveAt > cutoff);
  }

  save(room: StoredRoom): void {
    const trimmed = { ...room, processedActionIds: room.processedActionIds.slice(-MAX_IDS) };
    const prev = this.pending.get(room.roomCode);
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => this.write(room.roomCode), DEBOUNCE_MS);
    this.pending.set(room.roomCode, { room: trimmed, timer });
  }

  remove(roomCode: string): void {
    const prev = this.pending.get(roomCode);
    if (prev) clearTimeout(prev.timer);
    this.pending.delete(roomCode);
    this.track(
      this.db
        .query('DELETE FROM poker_rooms WHERE room_code = $1', [roomCode])
        .then(() => undefined)
        .catch((e) => this.log(`mentés (törlés) hiba: ${e.message}`))
    );
  }

  async flush(): Promise<void> {
    for (const code of [...this.pending.keys()]) this.write(code);
    await Promise.all([...this.inflight]);
  }

  private write(roomCode: string) {
    const entry = this.pending.get(roomCode);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(roomCode);
    this.track(
      this.db
        .query(
          `INSERT INTO poker_rooms (room_code, data, updated_at) VALUES ($1, $2::jsonb, now())
           ON CONFLICT (room_code) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [roomCode, JSON.stringify(entry.room)]
        )
        .then(() => undefined)
        .catch((e) => this.log(`mentés hiba: ${e.message}`))
    );
  }

  private track(p: Promise<void>) {
    this.inflight.add(p);
    p.finally(() => this.inflight.delete(p));
  }
}

/** Ha nincs DATABASE_URL, nem ment semmit (marad a memória). */
export class NoopRoomStore implements RoomStore {
  async init() {}
  async loadAll() { return []; }
  save() {}
  remove() {}
  async flush() {}
}

export function createRoomStore(databaseUrl: string | undefined, log: (m: string) => void): RoomStore {
  if (!databaseUrl) return new NoopRoomStore();
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSL_DISABLE ? false : { rejectUnauthorized: false }, // Supabase pooler
    max: 3,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', (e) => log(`adatbázis kapcsolat hiba: ${e.message}`));
  return new PgRoomStore(pool, log);
}
