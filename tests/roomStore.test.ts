/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { PokerEngine } from '../src/engine/pokerEngine';
import { PgRoomStore, Queryable, StoredRoom } from '../src/server/roomStore';

/** Egyszerű memóriabeli "adatbázis", ami a store által használt 3 lekérdezést érti. */
function fakeDb() {
  const table = new Map<string, { data: string; at: number }>();
  const db: Queryable = {
    async query(text, params = []) {
      if (text.includes('CREATE TABLE')) return { rows: [] };
      if (text.includes('INSERT INTO poker_rooms')) {
        table.set(params[0] as string, { data: params[1] as string, at: Date.now() });
        return { rows: [] };
      }
      if (text.includes('DELETE FROM')) {
        table.delete(params[0] as string);
        return { rows: [] };
      }
      if (text.includes('SELECT data')) {
        return { rows: [...table.values()].map((v) => ({ data: JSON.parse(v.data) })) };
      }
      throw new Error('ismeretlen lekérdezés: ' + text);
    },
  };
  return { db, table };
}

function sampleRoom(code = 'ABCD'): StoredRoom {
  const players = [
    { id: 'p1', nickname: 'Jim', chips: 5000 },
    { id: 'p2', nickname: 'Pisti', chips: 5000 },
    { id: 'p3', nickname: 'Anna', chips: 5000 },
  ];
  const gameState = PokerEngine.startHand(players, 0, 50, 100);
  return {
    roomCode: code,
    hostPlayerId: 'p1',
    settings: { smallBlind: 50, bigBlind: 100, startingChips: 5000, turnTimeLimitSec: 30 },
    players: players.map((p) => ({ ...p, sessionToken: 'tok_' + p.id, isConnected: true })),
    gameState,
    processedActionIds: ['a1', 'a2'],
    dealerIndex: 0,
    handNumber: 1,
    lastActiveAt: Date.now(),
  };
}

describe('Szobák mentése (PgRoomStore)', () => {
  it('Mentés után a szoba visszatölthető, és a visszatöltött játékállással folytatható a leosztás', async () => {
    vi.useFakeTimers();
    const { db } = fakeDb();
    const store = new PgRoomStore(db);
    await store.init();
    const room = sampleRoom();
    store.save(room);
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    const loaded = await new PgRoomStore(db).loadAll();
    expect(loaded).toHaveLength(1);
    const r = loaded[0];
    expect(r.players.map((p) => p.sessionToken)).toEqual(['tok_p1', 'tok_p2', 'tok_p3']);
    expect(r.processedActionIds).toEqual(['a1', 'a2']);

    // A JSON-on átment állapotból a motor tovább tud lépni (nem veszett el a pakli, a pot, stb.)
    const gs: any = r.gameState;
    const actor = gs.players[gs.currentActionIndex];
    const next = PokerEngine.applyAction(gs, { playerId: actor.id, type: 'FOLD' });
    expect(next.players.find((p: any) => p.id === actor.id)!.folded).toBe(true);
  });

  it('Gyors egymás utáni mentések egy írássá vonódnak össze, és mindig az utolsó állapot marad', async () => {
    vi.useFakeTimers();
    const { db, table } = fakeDb();
    const spy = vi.spyOn(db, 'query');
    const store = new PgRoomStore(db);
    for (let i = 0; i < 5; i++) {
      const r = sampleRoom();
      r.handNumber = i;
      store.save(r);
    }
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    expect(spy.mock.calls.filter((c) => String(c[0]).includes('INSERT')).length).toBe(1);
    expect(JSON.parse(table.get('ABCD')!.data).handNumber).toBe(4);
  });

  it('A flush() kiírja a függő mentést, a remove() törli a szobát', async () => {
    const { db, table } = fakeDb();
    const store = new PgRoomStore(db);
    store.save(sampleRoom('WXYZ'));
    await store.flush();
    expect(table.has('WXYZ')).toBe(true);
    store.remove('WXYZ');
    await store.flush();
    expect(table.has('WXYZ')).toBe(false);
  });

  it('Adatbázis-hiba nem dönti el a szervert, csak naplózódik', async () => {
    const log = vi.fn();
    const db: Queryable = { query: async () => { throw new Error('nincs kapcsolat'); } };
    const store = new PgRoomStore(db, log);
    store.save(sampleRoom());
    await store.flush();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('nincs kapcsolat'));
  });

  it('A 24 óránál régebbi szobákat nem tölti vissza, és csak az utolsó 200 művelet-azonosítót tartja meg', async () => {
    const { db } = fakeDb();
    const store = new PgRoomStore(db);
    const old = sampleRoom('OLD1');
    old.lastActiveAt = Date.now() - 25 * 3600 * 1000;
    const big = sampleRoom('BIG1');
    big.processedActionIds = Array.from({ length: 500 }, (_, i) => 'id' + i);
    store.save(old);
    store.save(big);
    await store.flush();
    const loaded = await store.loadAll();
    expect(loaded.map((r) => r.roomCode)).toEqual(['BIG1']);
    expect(loaded[0].processedActionIds).toHaveLength(200);
    expect(loaded[0].processedActionIds.at(-1)).toBe('id499');
  });
});
