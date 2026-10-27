/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { PokerEngine } from './src/engine/pokerEngine';
import { GamePhase, GameState, PlayerAction } from './src/types/poker';
import { createRoomStore, StoredRoom } from './src/server/roomStore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ConnectedClient {
  ws: WebSocket;
  roomCode: string;
  playerId?: string;
  isSpectator: boolean;
}

interface RoomData {
  roomCode: string;
  hostPlayerId: string;
  settings: {
    smallBlind: number;
    bigBlind: number;
    startingChips: number;
    turnTimeLimitSec: number;
  };
  players: {
    id: string;
    nickname: string;
    chips: number;
    sessionToken: string;
    isConnected: boolean;
  }[];
  gameState: GameState | null;
  processedActionIds: Set<string>;
  turnTimer: NodeJS.Timeout | null;
  dealerIndex: number;
  handNumber: number;
  lastActiveAt: number;
}

const app = express();
app.use(express.json());

// Lightweight health endpoint (Render health check / external uptime pinger).
app.get('/healthz', (_req: Request, res: Response) => {
  res.type('text/plain').send('ok');
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map<string, RoomData>();
const store = createRoomStore(process.env.DATABASE_URL, (m) => console.error(`[store] ${m}`));

function toStored(room: RoomData): StoredRoom {
  return {
    roomCode: room.roomCode,
    hostPlayerId: room.hostPlayerId,
    settings: room.settings,
    players: room.players,
    gameState: room.gameState,
    processedActionIds: Array.from(room.processedActionIds),
    dealerIndex: room.dealerIndex,
    handNumber: room.handNumber,
    lastActiveAt: room.lastActiveAt,
  };
}
const connectedClients = new Set<ConnectedClient>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(4);
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(bytes[i] % chars.length);
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function generateSecureId(prefix: string, bytesLen: number = 8): string {
  return prefix + '_' + crypto.randomBytes(bytesLen).toString('hex');
}

/**
 * Synchronizes chips from completed hand back into room player store
 */
function syncRoomPlayerChips(room: RoomData) {
  if (room.gameState && room.gameState.phase === 'HAND_COMPLETE') {
    for (const p of room.gameState.players) {
      const rp = room.players.find((pl) => pl.id === p.id);
      if (rp) {
        rp.chips = p.chips;
      }
    }
  }
}

function broadcastRoom(room: RoomData) {
  room.lastActiveAt = Date.now();
  store.save(toStored(room));
  for (const client of connectedClients) {
    if (client.roomCode === room.roomCode && client.ws.readyState === WebSocket.OPEN) {
      if (room.gameState) {
        const view = client.playerId
          ? PokerEngine.getPublicView(room.gameState, client.playerId)
          : PokerEngine.getPublicView(room.gameState);
        client.ws.send(JSON.stringify({ type: 'GAME_STATE', state: view }));
      } else {
        // In lobby (WAITING)
        client.ws.send(
          JSON.stringify({
            type: 'LOBBY_STATE',
            roomCode: room.roomCode,
            hostPlayerId: room.hostPlayerId,
            settings: room.settings,
            players: room.players.map((p) => ({
              id: p.id,
              nickname: p.nickname,
              chips: p.chips,
              isConnected: p.isConnected,
            })),
            myPlayerId: client.playerId,
          })
        );
      }
    }
  }
}

function setupTurnTimer(room: RoomData) {
  if (room.turnTimer) {
    clearInterval(room.turnTimer);
    room.turnTimer = null;
  }

  if (!room.gameState || room.gameState.phase === 'SHOWDOWN' || room.gameState.phase === 'HAND_COMPLETE') {
    return;
  }

  const turnTimeMs = (room.gameState.turnTimeLimitSec || 30) * 1000;
  const turnStartTime = room.gameState.turnStartedAt || Date.now();

  room.turnTimer = setInterval(() => {
    if (!room.gameState || room.gameState.phase === 'SHOWDOWN' || room.gameState.phase === 'HAND_COMPLETE') {
      if (room.turnTimer) clearInterval(room.turnTimer);
      return;
    }

    const elapsed = Date.now() - turnStartTime;
    if (elapsed >= turnTimeMs) {
      if (room.turnTimer) clearInterval(room.turnTimer);
      room.turnTimer = null;

      // Auto-action: check if legal, otherwise fold
      const activePlayer = room.gameState.players[room.gameState.currentActionIndex];
      if (activePlayer && !activePlayer.folded && !activePlayer.allIn) {
        const callDiff = room.gameState.highestBet - activePlayer.currentBet;
        const autoAction: PlayerAction = {
          playerId: activePlayer.id,
          type: callDiff === 0 ? 'CHECK' : 'FOLD',
        };

        try {
          room.gameState = PokerEngine.applyAction(room.gameState, autoAction);
          syncRoomPlayerChips(room);
          setupTurnTimer(room);
          broadcastRoom(room);
        } catch {
          // If error during auto check, force fold
          try {
            room.gameState = PokerEngine.applyAction(room.gameState, {
              playerId: activePlayer.id,
              type: 'FOLD',
            });
            syncRoomPlayerChips(room);
            setupTurnTimer(room);
            broadcastRoom(room);
          } catch {
            // No-op
          }
        }
      }
    }
  }, 1000);
}

// REST API Endpoints

// 1. Create Room
app.post('/api/rooms', (req: Request, res: Response) => {
  const { nickname, smallBlind = 50, bigBlind = 100, startingChips = 5000, turnTimeLimitSec = 30 } = req.body;

  if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
    res.status(400).json({ error: 'Becenév megadása kötelező.' });
    return;
  }

  const roomCode = generateRoomCode();
  const playerId = generateSecureId('p', 6);
  const sessionToken = generateSecureId('tok', 16);

  const room: RoomData = {
    roomCode,
    hostPlayerId: playerId,
    settings: {
      smallBlind: Math.max(10, Math.floor(Number(smallBlind)) || 50),
      bigBlind: Math.max(20, Math.floor(Number(bigBlind)) || 100),
      startingChips: Math.max(500, Math.floor(Number(startingChips)) || 5000),
      turnTimeLimitSec: Math.min(120, Math.max(10, Math.floor(Number(turnTimeLimitSec)) || 30)),
    },
    players: [
      {
        id: playerId,
        nickname: nickname.trim().substring(0, 16),
        chips: Math.max(500, Math.floor(Number(startingChips)) || 5000),
        sessionToken,
        isConnected: true,
      },
    ],
    gameState: null,
    processedActionIds: new Set<string>(),
    turnTimer: null,
    dealerIndex: 0,
    handNumber: 0,
    lastActiveAt: Date.now(),
  };

  rooms.set(roomCode, room);
  store.save(toStored(room));

  res.status(201).json({
    roomCode,
    playerId,
    sessionToken,
    hostPlayerId: playerId,
    settings: room.settings,
  });
});

// 2. Join Room
app.post('/api/rooms/join', (req: Request, res: Response) => {
  const { roomCode, nickname } = req.body;

  if (!roomCode || typeof roomCode !== 'string') {
    res.status(400).json({ error: 'Érvénytelen szobakód.' });
    return;
  }

  const normalizedCode = roomCode.trim().toUpperCase();
  const room = rooms.get(normalizedCode);

  if (!room) {
    res.status(404).json({ error: 'A szoba nem található.' });
    return;
  }

  if (room.players.length >= 6) {
    res.status(400).json({ error: 'A szoba megtelt (maximum 6 játékos).' });
    return;
  }

  if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
    res.status(400).json({ error: 'Becenév megadása kötelező.' });
    return;
  }

  const playerId = generateSecureId('p', 6);
  const sessionToken = generateSecureId('tok', 16);

  room.players.push({
    id: playerId,
    nickname: nickname.trim().substring(0, 16),
    chips: room.settings.startingChips,
    sessionToken,
    isConnected: true,
  });

  broadcastRoom(room);

  res.json({
    roomCode: room.roomCode,
    playerId,
    sessionToken,
    hostPlayerId: room.hostPlayerId,
    settings: room.settings,
  });
});

// 3. Start Game (Host only)
app.post('/api/rooms/:code/start', (req: Request, res: Response) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: 'Szoba nem található.' });
    return;
  }

  const sessionToken = req.headers.authorization?.replace('Bearer ', '') || (req.query.token as string);
  const caller = room.players.find((p) => p.sessionToken === sessionToken);

  if (!caller || caller.id !== room.hostPlayerId) {
    res.status(403).json({ error: 'Csak a szobagazda indíthatja el a játékot.' });
    return;
  }

  if (room.players.length < 2) {
    res.status(400).json({ error: 'Legalább 2 játékos szükséges az indításhoz.' });
    return;
  }

  room.handNumber = 1;
  room.dealerIndex = 0;

  room.gameState = PokerEngine.startHand(
    room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      chips: p.chips,
      isConnected: p.isConnected,
      sessionToken: p.sessionToken,
    })),
    room.dealerIndex,
    room.settings.smallBlind,
    room.settings.bigBlind,
    room.settings.turnTimeLimitSec
  );

  room.gameState.roomCode = room.roomCode;
  room.gameState.hostPlayerId = room.hostPlayerId;
  room.gameState.handNumber = room.handNumber;

  syncRoomPlayerChips(room);
  setupTurnTimer(room);
  broadcastRoom(room);

  res.json({ success: true, phase: room.gameState.phase });
});

// 4. Submit Player Action
app.post('/api/rooms/:code/action', (req: Request, res: Response) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room || !room.gameState) {
    res.status(404).json({ error: 'Nincs aktív leosztás ebben a szobában.' });
    return;
  }

  const sessionToken = req.headers.authorization?.replace('Bearer ', '') || (req.query.token as string);
  const player = room.players.find((p) => p.sessionToken === sessionToken);

  if (!player) {
    res.status(401).json({ error: 'Érvénytelen munkamenet / session token.' });
    return;
  }

  const { action_id, expected_version, type, amount } = req.body;

  // Idempotency check: duplicate action_id protection
  if (action_id && room.processedActionIds.has(action_id)) {
    res.json({ success: true, note: 'Akció már feldolgozva (idempotens).' });
    return;
  }

  // Version check
  if (typeof expected_version === 'number' && expected_version !== room.gameState.stateVersion) {
    res.status(409).json({
      error: 'Állapot verzióeltérés (State conflict). Kérlek frissítsd az asztalt.',
      currentVersion: room.gameState.stateVersion,
    });
    return;
  }

  // Amount validation: no fractional numbers allowed
  if (amount !== undefined) {
    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'A tét összegének pozitív egész számnak kell lennie.' });
      return;
    }
  }

  try {
    const action: PlayerAction = {
      playerId: player.id,
      type,
      amount: amount !== undefined ? Math.floor(Number(amount)) : undefined,
    };

    room.gameState = PokerEngine.applyAction(room.gameState, action);

    if (action_id) {
      room.processedActionIds.add(action_id);
    }

    // Sync chips to room records if hand finished
    syncRoomPlayerChips(room);

    setupTurnTimer(room);
    broadcastRoom(room);

    res.json({ success: true, version: room.gameState.stateVersion, phase: room.gameState.phase });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ismeretlen hiba az akció során.';
    res.status(400).json({ error: msg });
  }
});

// 5. Next Hand (Requires valid session token and finished hand)
app.post('/api/rooms/:code/next-hand', (req: Request, res: Response) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: 'Szoba nem található.' });
    return;
  }

  // Authentication check
  const sessionToken = req.headers.authorization?.replace('Bearer ', '') || (req.query.token as string);
  const caller = room.players.find((p) => p.sessionToken === sessionToken);
  if (!caller) {
    res.status(401).json({ error: 'Hitelesítés szükséges a következő leosztáshoz.' });
    return;
  }

  if (!room.gameState) {
    res.status(400).json({ error: 'A játékot még nem indította el a szobagazda.' });
    return;
  }

  if (room.gameState.phase !== 'HAND_COMPLETE') {
    res.status(400).json({ error: 'A jelenlegi leosztás még nem ért véget.' });
    return;
  }

  // Filter players who have chips > 0
  const eligiblePlayers = room.players.filter((p) => p.chips > 0);
  if (eligiblePlayers.length < 2) {
    res.status(400).json({ error: 'Nincs elegendő zsetonnal rendelkező játékos az új leosztáshoz.' });
    return;
  }

  room.handNumber += 1;

  // Move dealer button to next eligible player with chips
  let nextDealer = (room.dealerIndex + 1) % room.players.length;
  for (let i = 0; i < room.players.length; i++) {
    if (room.players[nextDealer].chips > 0) {
      break;
    }
    nextDealer = (nextDealer + 1) % room.players.length;
  }
  room.dealerIndex = nextDealer;

  // Find index in eligible list
  const activeDealerIndex = Math.max(0, eligiblePlayers.findIndex((p) => p.id === room.players[room.dealerIndex].id));

  room.gameState = PokerEngine.startHand(
    eligiblePlayers.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      chips: p.chips,
      isConnected: p.isConnected,
      sessionToken: p.sessionToken,
    })),
    activeDealerIndex,
    room.settings.smallBlind,
    room.settings.bigBlind,
    room.settings.turnTimeLimitSec
  );

  room.gameState.roomCode = room.roomCode;
  room.gameState.hostPlayerId = room.hostPlayerId;
  room.gameState.handNumber = room.handNumber;

  syncRoomPlayerChips(room);
  setupTurnTimer(room);
  broadcastRoom(room);

  res.json({ success: true, handNumber: room.handNumber });
});

// 6. Get State (REST fallback)
app.get('/api/rooms/:code/state', (req: Request, res: Response) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: 'Szoba nem található.' });
    return;
  }

  const sessionToken = req.headers.authorization?.replace('Bearer ', '') || (req.query.token as string);
  const player = room.players.find((p) => p.sessionToken === sessionToken);

  if (room.gameState) {
    const view = player ? PokerEngine.getPublicView(room.gameState, player.id) : PokerEngine.getPublicView(room.gameState);
    res.json(view);
  } else {
    res.json({
      phase: 'WAITING' as GamePhase,
      roomCode: room.roomCode,
      hostPlayerId: room.hostPlayerId,
      players: room.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        chips: p.chips,
        isConnected: p.isConnected,
      })),
      settings: room.settings,
      myPlayerId: player?.id,
    });
  }
});

// 7. Rebuy / Reset Chips
app.post('/api/rooms/:code/rebuy', (req: Request, res: Response) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: 'Szoba nem található.' });
    return;
  }

  const sessionToken = req.headers.authorization?.replace('Bearer ', '') || (req.query.token as string);
  const player = room.players.find((p) => p.sessionToken === sessionToken);

  if (!player) {
    res.status(401).json({ error: 'Érvénytelen munkamenet.' });
    return;
  }

  // Disallow rebuying during an active hand
  if (room.gameState && room.gameState.phase !== 'HAND_COMPLETE') {
    res.status(400).json({ error: 'Leosztás közben nem lehet újrazsetonálni. Várj a leosztás végéig!' });
    return;
  }

  if (player.chips > 0) {
    res.status(400).json({ error: 'Csak akkor vásárolhatsz új zsetont, ha teljesen elfogyott (0 zseton).' });
    return;
  }

  player.chips = room.settings.startingChips;
  broadcastRoom(room);

  res.json({ success: true, chips: player.chips });
});

// Periodic inactive room garbage collection (rooms idle for > 24 hours)
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms.entries()) {
    if (now - r.lastActiveAt > 24 * 60 * 60 * 1000) {
      if (r.turnTimer) clearInterval(r.turnTimer);
      rooms.delete(code);
      store.remove(code);
    }
  }
}, 60 * 60 * 1000);

// WebSocket Handler
wss.on('connection', (ws: WebSocket) => {
  const client: ConnectedClient = {
    ws,
    roomCode: '',
    isSpectator: true,
  };
  connectedClients.add(client);

  ws.on('message', (data: Buffer | string) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'SUBSCRIBE') {
        const { roomCode, sessionToken, isSpectator } = msg;
        if (!roomCode) return;

        client.roomCode = roomCode.toUpperCase();
        client.isSpectator = Boolean(isSpectator);

        const room = rooms.get(client.roomCode);
        if (room) {
          if (sessionToken) {
            const pl = room.players.find((p) => p.sessionToken === sessionToken);
            if (pl) {
              client.playerId = pl.id;
              client.isSpectator = false;
              pl.isConnected = true;
            }
          }

          // Send current state
          if (room.gameState) {
            const view = client.playerId
              ? PokerEngine.getPublicView(room.gameState, client.playerId)
              : PokerEngine.getPublicView(room.gameState);
            ws.send(JSON.stringify({ type: 'GAME_STATE', state: view }));
          } else {
            ws.send(
              JSON.stringify({
                type: 'LOBBY_STATE',
                roomCode: room.roomCode,
                hostPlayerId: room.hostPlayerId,
                settings: room.settings,
                players: room.players.map((p) => ({
                  id: p.id,
                  nickname: p.nickname,
                  chips: p.chips,
                  isConnected: p.isConnected,
                })),
                myPlayerId: client.playerId,
              })
            );
          }
        }
      }
    } catch {
      // Ignored malformed WS payloads
    }
  });

  ws.on('close', () => {
    connectedClients.delete(client);
    if (client.roomCode && client.playerId) {
      const room = rooms.get(client.roomCode);
      if (room) {
        const pl = room.players.find((p) => p.id === client.playerId);
        if (pl) {
          const otherConnected = Array.from(connectedClients).some(
            (c) => c.roomCode === client.roomCode && c.playerId === client.playerId
          );
          if (!otherConnected) {
            pl.isConnected = false;
            broadcastRoom(room);
          }
        }
      }
    }
  });
});

// Vite Integration
async function restoreRooms() {
  try {
    await store.init();
    const stored = await store.loadAll();
    for (const sr of stored) {
      const room: RoomData = {
        roomCode: sr.roomCode,
        hostPlayerId: sr.hostPlayerId,
        settings: sr.settings,
        players: sr.players.map((p) => ({ ...p, isConnected: false })),
        gameState: sr.gameState as GameState | null,
        processedActionIds: new Set(sr.processedActionIds),
        turnTimer: null,
        dealerIndex: sr.dealerIndex,
        handNumber: sr.handNumber,
        lastActiveAt: sr.lastActiveAt,
      };
      // Újraindítás alatt eltelt idő ne számítson bele a gondolkodási időbe.
      if (room.gameState && room.gameState.phase !== 'SHOWDOWN' && room.gameState.phase !== 'HAND_COMPLETE') {
        room.gameState = { ...room.gameState, turnStartedAt: Date.now() };
        setupTurnTimer(room);
      }
      rooms.set(room.roomCode, room);
    }
    // eslint-disable-next-line no-console
    if (stored.length) console.log(`[store] ${stored.length} szoba visszatöltve`);
  } catch (e) {
    console.error(`[store] visszatöltés sikertelen, memóriával megyünk tovább: ${(e as Error).message}`);
  }
}

async function startServer() {
  await restoreRooms();
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Poker Room server running at http://0.0.0.0:${PORT}`);
  });
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    store.flush().finally(() => process.exit(0));
  });
}

startServer();
