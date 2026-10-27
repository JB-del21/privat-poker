/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PublicGameState } from './types/poker';
import { LobbyView } from './components/LobbyView';
import { TableView } from './components/TableView';
import { PlayerView } from './components/PlayerView';

interface LobbyState {
  roomCode: string;
  hostPlayerId: string;
  settings: {
    smallBlind: number;
    bigBlind: number;
    startingChips: number;
    turnTimeLimitSec: number;
  };
  players: { id: string; nickname: string; chips: number; isConnected: boolean }[];
  myPlayerId?: string;
}

export default function App() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isSpectator, setIsSpectator] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'PLAYER' | 'TABLE'>('PLAYER');

  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentRoomRef = useRef<string | null>(null);

  // Initialize from URL query param or LocalStorage on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room')?.trim().toUpperCase();

    const storedCode = localStorage.getItem('poker_room_code');
    const storedToken = localStorage.getItem('poker_session_token');
    const storedPlayerId = localStorage.getItem('poker_player_id');

    // If invitation URL param is provided and differs from stored room, prioritize the invitation link!
    if (roomParam && roomParam !== storedCode) {
      localStorage.removeItem('poker_room_code');
      localStorage.removeItem('poker_session_token');
      localStorage.removeItem('poker_player_id');
      setRoomCode(roomParam);
      currentRoomRef.current = roomParam;
      setSessionToken(null);
      setPlayerId(null);
      setIsSpectator(false);
    } else if (storedCode && storedToken && storedPlayerId) {
      setRoomCode(storedCode);
      currentRoomRef.current = storedCode;
      setSessionToken(storedToken);
      setPlayerId(storedPlayerId);
      setIsSpectator(false);
    } else if (roomParam) {
      setRoomCode(roomParam);
      currentRoomRef.current = roomParam;
    }
  }, []);

  // WebSocket Subscription & State Sync
  const connectWebSocket = useCallback((code: string, token?: string, spectator: boolean = false) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'SUBSCRIBE',
            roomCode: code,
            sessionToken: token,
            isSpectator: spectator,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'GAME_STATE') {
            setGameState(data.state);
            setLobbyState(null);
          } else if (data.type === 'LOBBY_STATE') {
            setLobbyState(data);
            setGameState(null);
          }
        } catch {
          // Ignored malformed WS frame
        }
      };

      ws.onclose = () => {
        // Auto-reconnect after 2 seconds ONLY if still in this room
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (currentRoomRef.current === code) {
            connectWebSocket(code, token, spectator);
          }
        }, 2000);
      };
    } catch {
      // WS fallback will rely on REST polls if needed
    }
  }, []);

  // Fetch initial REST state and connect WS whenever roomCode changes
  useEffect(() => {
    if (!roomCode) return;

    const token = sessionToken || undefined;
    connectWebSocket(roomCode, token, isSpectator);

    // Initial REST sync
    fetch(`/api/rooms/${roomCode}/state${token ? `?token=${token}` : ''}`)
      .then((res) => {
        if (!res.ok) throw new Error('Szoba nem található');
        return res.json();
      })
      .then((data) => {
        if (data.phase === 'WAITING') {
          setLobbyState(data);
          setGameState(null);
        } else {
          setGameState(data);
          setLobbyState(null);
        }
      })
      .catch((err) => {
        setError(err.message);
      });

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [roomCode, sessionToken, isSpectator, connectWebSocket]);

  // Create Room
  const handleCreateRoom = async (
    nickname: string,
    smallBlind: number,
    bigBlind: number,
    startingChips: number,
    turnTimeLimitSec: number
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, smallBlind, bigBlind, startingChips, turnTimeLimitSec }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Szoba létrehozása sikertelen.');

      localStorage.setItem('poker_room_code', data.roomCode);
      localStorage.setItem('poker_session_token', data.sessionToken);
      localStorage.setItem('poker_player_id', data.playerId);

      setRoomCode(data.roomCode);
      setSessionToken(data.sessionToken);
      setPlayerId(data.playerId);
      setIsSpectator(false);
      setViewMode('PLAYER');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Hiba történt.');
    } finally {
      setIsLoading(false);
    }
  };

  // Join Room
  const handleJoinRoom = async (code: string, nickname: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code, nickname }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Csatlakozás sikertelen.');

      localStorage.setItem('poker_room_code', data.roomCode);
      localStorage.setItem('poker_session_token', data.sessionToken);
      localStorage.setItem('poker_player_id', data.playerId);

      setRoomCode(data.roomCode);
      setSessionToken(data.sessionToken);
      setPlayerId(data.playerId);
      setIsSpectator(false);
      setViewMode('PLAYER');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Hiba történt.');
    } finally {
      setIsLoading(false);
    }
  };

  // Start Game
  const handleStartGame = async () => {
    if (!roomCode || !sessionToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'A játék indítása sikertelen.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Hiba történt.');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Player Action
  const handleAction = async (type: 'FOLD' | 'CHECK' | 'CALL' | 'BET' | 'RAISE', amount?: number) => {
    if (!roomCode || !sessionToken || !gameState) return;
    setError(null);

    const actionId = 'act_' + Math.random().toString(36).substring(2, 11);

    try {
      const res = await fetch(`/api/rooms/${roomCode}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          action_id: actionId,
          expected_version: gameState.stateVersion,
          type,
          amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Az akció elutasítva.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Hiba történt.');
    }
  };

  // Next Hand
  const handleNextHand = async () => {
    if (!roomCode) return;
    try {
      const res = await fetch(`/api/rooms/${roomCode}/next-hand`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Következő leosztás nem indítható.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Hiba történt.');
    }
  };

  // Rebuy
  const handleRebuy = async () => {
    if (!roomCode || !sessionToken) return;
    try {
      const res = await fetch(`/api/rooms/${roomCode}/rebuy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Újrazsetonálás sikertelen.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Hiba történt.');
    }
  };

  // Open Pure Spectator Mode
  const handleSpectate = (code: string) => {
    if (!code) return;
    setRoomCode(code.toUpperCase());
    setIsSpectator(true);
    setViewMode('TABLE');
  };

  // Leave room / Logout
  const handleLeaveRoom = () => {
    currentRoomRef.current = null;
    localStorage.removeItem('poker_room_code');
    localStorage.removeItem('poker_session_token');
    localStorage.removeItem('poker_player_id');
    setRoomCode(null);
    setSessionToken(null);
    setPlayerId(null);
    setIsSpectator(false);
    setLobbyState(null);
    setGameState(null);
    setError(null);
    if (wsRef.current) wsRef.current.close();
  };

  // VIEW 1: If no room or in WAITING lobby
  if (!roomCode || lobbyState) {
    return (
      <LobbyView
        roomCode={roomCode || undefined}
        hostPlayerId={lobbyState?.hostPlayerId}
        myPlayerId={playerId || undefined}
        players={lobbyState?.players}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onStartGame={handleStartGame}
        onSpectate={handleSpectate}
        error={error}
        isLoading={isLoading}
      />
    );
  }

  // VIEW 2: Active game in progress
  if (gameState) {
    const isHost = playerId === gameState.hostPlayerId;

    if (viewMode === 'TABLE' || isSpectator || !playerId) {
      return (
        <TableView
          gameState={gameState}
          onNextHand={handleNextHand}
          onSwitchToPlayer={!isSpectator && playerId ? () => setViewMode('PLAYER') : undefined}
          isHost={isHost}
          myPlayerId={playerId || undefined}
        />
      );
    }

    return (
      <PlayerView
        gameState={gameState}
        myPlayerId={playerId}
        errorMessage={error}
        onAction={handleAction}
        onNextHand={handleNextHand}
        onRebuy={handleRebuy}
        onOpenTableView={() => setViewMode('TABLE')}
      />
    );
  }

  // Loading state
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
      <h2 className="text-lg font-bold">Kapcsolódás a pókerasztalhoz...</h2>
      <p className="text-xs text-slate-400 mt-1">#{roomCode}</p>
      <button
        onClick={handleLeaveRoom}
        className="mt-6 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
      >
        Vissza a főmenübe
      </button>
    </div>
  );
}
