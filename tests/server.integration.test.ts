/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// End-to-end tests against a real server process (REST only).
// They guard the regressions found in the audit:
//  - a hand that ends via the server-side turn timer must still persist chips
//  - /next-hand requires a valid session token and a started game
//  - fractional bet amounts are rejected
//  - no rebuy during a running hand

import { ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;

let proc: ChildProcess;

async function api(pathname: string, init: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json } as { status: number; json: any };
}

async function newRoom(turnTimeLimitSec = 30) {
  const host = await api('/api/rooms', { method: 'POST', body: { nickname: 'Host', turnTimeLimitSec } });
  const code = host.json.roomCode as string;
  const guest = await api('/api/rooms/join', { method: 'POST', body: { roomCode: code, nickname: 'Guest' } });
  return { code, hostToken: host.json.sessionToken as string, guestToken: guest.json.sessionToken as string };
}

const stateOf = async (code: string, token: string) => (await api(`/api/rooms/${code}/state?token=${token}`)).json;
// After HAND_COMPLETE the pot is already paid out into `chips` (currentBet is not cleared),
// so only count open bets while the hand is still running.
const totalChips = (s: any) =>
  s.players.reduce((sum: number, p: any) => sum + p.chips + (s.phase === 'HAND_COMPLETE' ? 0 : p.currentBet), 0);

beforeAll(async () => {
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), ['server.ts'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 15000);
    proc.stdout!.on('data', (d) => {
      if (String(d).includes('running')) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on('exit', (c) => reject(new Error(`server exited early (${c})`)));
  });
}, 20000);

afterAll(() => {
  proc?.kill();
});

describe('Szerver integráció', () => {
  it('Időtúllépéssel véget ért leosztás után a zsetonok megmaradnak (nem áll vissza kezdőállásra)', async () => {
    const { code, hostToken, guestToken } = await newRoom(10);
    expect((await api(`/api/rooms/${code}/start`, { method: 'POST', token: hostToken })).status).toBe(200);

    // Host (dealer/SB) acts first heads-up and never moves -> server folds after ~10 s.
    await new Promise((r) => setTimeout(r, 12500));
    const done = await stateOf(code, hostToken);
    expect(done.phase).toBe('HAND_COMPLETE');
    expect(totalChips(done)).toBe(10000);

    const next = await api(`/api/rooms/${code}/next-hand`, { method: 'POST', token: guestToken });
    expect(next.status).toBe(200);

    const hand2 = await stateOf(code, hostToken);
    expect(hand2.handNumber).toBe(2);
    expect(totalChips(hand2)).toBe(10000);
    // Host lost the small blind in hand 1: it must carry over, not reset to 5000.
    const host = hand2.players.find((p: any) => p.nickname === 'Host');
    const guest = hand2.players.find((p: any) => p.nickname === 'Guest');
    expect(host.chips + host.currentBet).toBe(4950);
    expect(guest.chips + guest.currentBet).toBe(5050);
  }, 30000);

  it('A /next-hand token nélkül és el nem indított játéknál is elutasítva', async () => {
    const { code, hostToken, guestToken } = await newRoom();

    expect((await api(`/api/rooms/${code}/next-hand`, { method: 'POST' })).status).toBe(401);
    // authenticated, but the host has not started the game yet
    expect((await api(`/api/rooms/${code}/next-hand`, { method: 'POST', token: guestToken })).status).toBe(400);
    expect((await stateOf(code, hostToken)).phase).toBe('WAITING');

    // only the host may start
    expect((await api(`/api/rooms/${code}/start`, { method: 'POST', token: guestToken })).status).toBe(403);
  });

  it('Törtösszegű emelést a szerver elutasít', async () => {
    const { code, hostToken } = await newRoom();
    await api(`/api/rooms/${code}/start`, { method: 'POST', token: hostToken });
    const res = await api(`/api/rooms/${code}/action`, {
      method: 'POST',
      token: hostToken,
      body: { type: 'RAISE', amount: 250.5 },
    });
    expect(res.status).toBe(400);
  });

  it('Futó leosztás közben nem lehet újrazsetonálni', async () => {
    const { code, hostToken } = await newRoom();
    await api(`/api/rooms/${code}/start`, { method: 'POST', token: hostToken });
    expect((await api(`/api/rooms/${code}/rebuy`, { method: 'POST', token: hostToken })).status).toBe(400);
  });

  it('Más játékos tokenjével nem lehet lépni a másik nevében', async () => {
    const { code, hostToken, guestToken } = await newRoom();
    await api(`/api/rooms/${code}/start`, { method: 'POST', token: hostToken });
    // Host acts first; guest trying to act is rejected by the engine (not their turn).
    const res = await api(`/api/rooms/${code}/action`, { method: 'POST', token: guestToken, body: { type: 'CALL' } });
    expect(res.status).toBe(400);
    expect((await stateOf(code, hostToken)).handNumber).toBe(1);
  });
});
