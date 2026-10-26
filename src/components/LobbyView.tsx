/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Copy, Users, Play, Tv, ShieldCheck, ArrowRight, Loader2, Crown } from 'lucide-react';
import roomBanner from '../assets/images/poker_room_banner_1793043188481.jpg';

interface LobbyViewProps {
  roomCode?: string;
  hostPlayerId?: string;
  myPlayerId?: string;
  players?: { id: string; nickname: string; chips: number; isConnected: boolean }[];
  onCreateRoom: (nickname: string, smallBlind: number, bigBlind: number, startingChips: number) => Promise<void>;
  onJoinRoom: (roomCode: string, nickname: string) => Promise<void>;
  onStartGame: () => Promise<void>;
  onSpectate: (roomCode: string) => void;
  error?: string | null;
  isLoading?: boolean;
}

const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, 7);

/** Üres vagy minimum alatti értéket a minimumra (vagy alapértékre) javít. */
const clampNumber = (v: string, min: number, fallback: number) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return String(fallback);
  return String(Math.max(min, n));
};

export const LobbyView: React.FC<LobbyViewProps> = ({
  roomCode,
  hostPlayerId,
  myPlayerId,
  players,
  onCreateRoom,
  onJoinRoom,
  onStartGame,
  onSpectate,
  error,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'join' | 'spectate'>('create');
  const [nickname, setNickname] = useState('');
  const [inputCode, setInputCode] = useState('');
  // Számmezők szövegként tárolva, hogy törölhetők és szabadon újraírhatók legyenek
  // (a number + Number('') = 0 miatt az '5' beírása '05' lett, a visszaírás nem ment).
  const [smallBlind, setSmallBlind] = useState('50');
  const [bigBlind, setBigBlind] = useState('100');
  const [startingChips, setStartingChips] = useState('5000');
  const [copied, setCopied] = useState(false);

  // If already in a room in WAITING phase
  if (roomCode && players) {
    const isHost = myPlayerId === hostPlayerId;
    const canStart = players.length >= 2;

    const copyInvite = () => {
      const url = `${window.location.origin}?room=${roomCode}`;
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 md:p-8 max-w-xl mx-auto select-none">
        <header className="text-center pt-6">
          <span className="text-xs uppercase font-extrabold tracking-widest text-amber-400">
            Várakozás a játékosokra
          </span>
          <h1 className="text-3xl font-black tracking-tight text-white mt-1">Privát Póker Szoba</h1>
        </header>

        {/* Room Code Card */}
        <div className="my-6 p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col items-center text-center">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Szobakód</span>
          <div className="flex items-center gap-3">
            <span className="text-5xl font-mono font-black tracking-widest text-amber-400 tabular-nums">
              {roomCode}
            </span>
          </div>

          <button
            onClick={copyInvite}
            className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-colors"
          >
            <Copy className="w-4 h-4 text-amber-400" />
            <span>{copied ? 'Meghívó link kimásolva!' : 'Meghívó link másolása'}</span>
          </button>
          <span className="text-[11px] text-slate-400 mt-2">
            Oszd meg a szobakódot a barátaiddal, hogy telefonról csatlakozzanak!
          </span>
        </div>

        {/* Players List */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
              Csatlakozott játékosok ({players.length}/6)
            </span>
            <span className="text-xs text-slate-400">Minimum 2 fő szükséges</span>
          </div>

          <div className="space-y-2 mb-6">
            {players.map((p) => {
              const playerIsHost = p.id === hostPlayerId;
              const isMe = p.id === myPlayerId;

              return (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                    isMe
                      ? 'bg-amber-950/30 border-amber-500/50 text-white'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-amber-400">
                      {p.nickname.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white">{p.nickname}</span>
                      {isMe && <span className="text-[10px] text-amber-400 font-semibold">(Te)</span>}
                      {playerIsHost && (
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-300 font-bold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                          <Crown className="w-3 h-3 text-amber-400" />
                          <span>Gazda</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold text-slate-300 tabular-nums">
                    {p.chips.toLocaleString('hu-HU')} zseton
                  </span>
                </div>
              );
            })}
          </div>

          {/* Action Zone */}
          <div className="space-y-3">
            {isHost ? (
              <button
                onClick={onStartGame}
                disabled={!canStart || isLoading}
                className="w-full h-14 rounded-2xl bg-amber-400 hover:bg-amber-300 active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-amber-400/20 transition-all"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    <span>Játék indítása ({players.length} játékos)</span>
                  </>
                )}
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>Várakozás a szobagazdára a játék indításához...</span>
              </div>
            )}

            <button
              onClick={() => onSpectate(roomCode)}
              className="w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors border border-slate-700"
            >
              <Tv className="w-4 h-4 text-indigo-400" />
              <span>Közös kijelző (Tévé / Tablet nézet) megnyitása</span>
            </button>
          </div>
        </div>

        <footer className="text-center text-[11px] text-slate-400 mt-6">
          Privát baráti játék · Zárt lapok titkosak
        </footer>
      </div>
    );
  }

  // Pre-Room Lobby (Create / Join / Spectate)
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-lg mx-auto p-4 md:p-6 select-none">
      {/* Brand & Hero Banner */}
      <header className="flex flex-col items-center text-center pt-2">
        <div
          className="w-full h-36 md:h-44 rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden relative shadow-2xl flex items-end p-4 mb-4"
          style={{
            backgroundImage: `url(${roomBanner})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent pointer-events-none" />
          <div className="relative z-10 text-left">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-amber-400">
              Texas Hold&apos;em No-Limit
            </span>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">Privát Poker Room</h1>
          </div>
        </div>

        <p className="text-xs text-slate-400 max-w-sm">
          Játssz a haverokkal kényelmesen: a telefonodon látod a saját lapjaidat, és kitehetitek a közös asztalt tévére!
        </p>
      </header>

      {/* Segmented Control Mode Tabs */}
      <div className="my-4 grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-900 border border-slate-800">
        <button
          onClick={() => setActiveTab('create')}
          className={`py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'create'
              ? 'bg-amber-400 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Új szoba
        </button>
        <button
          onClick={() => setActiveTab('join')}
          className={`py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'join'
              ? 'bg-amber-400 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Csatlakozás
        </button>
        <button
          onClick={() => setActiveTab('spectate')}
          className={`py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'spectate'
              ? 'bg-amber-400 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Tévé nézet
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Main Form Body */}
      <main className="flex-1 bg-slate-900/90 border border-slate-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between">
        {activeTab === 'create' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const sb = parseInt(clampNumber(smallBlind, 10, 50), 10);
              const bb = Math.max(parseInt(clampNumber(bigBlind, 20, 100), 10), sb);
              const chips = parseInt(clampNumber(startingChips, 500, 5000), 10);
              onCreateRoom(nickname, sb, bb, chips);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Beceneved (asztalnál megjelenő név)
              </label>
              <input
                type="text"
                required
                maxLength={14}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="pl. Pisti"
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-400 text-sm font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Kezdő zseton</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={startingChips}
                  onChange={(e) => setStartingChips(digitsOnly(e.target.value))}
                  onBlur={() => setStartingChips(clampNumber(startingChips, 500, 5000))}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Vakok (SB / BB)</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="Kisvak"
                    value={smallBlind}
                    onChange={(e) => setSmallBlind(digitsOnly(e.target.value))}
                    onBlur={() => setSmallBlind(clampNumber(smallBlind, 10, 50))}
                    className="h-11 px-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono font-bold text-center"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="Nagyvak"
                    value={bigBlind}
                    onChange={(e) => setBigBlind(digitsOnly(e.target.value))}
                    onBlur={() => setBigBlind(clampNumber(bigBlind, 20, 100))}
                    className="h-11 px-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono font-bold text-center"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !nickname.trim()}
              className="w-full h-13 mt-4 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-98 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20 transition-all disabled:opacity-40"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Szoba létrehozása</span>}
            </button>
            {!nickname.trim() && (
              <p className="text-center text-xs text-slate-400">Add meg a neved a szoba létrehozásához.</p>
            )}
          </form>
        )}

        {activeTab === 'join' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onJoinRoom(inputCode, nickname);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Szobakód (4 karakter)</label>
              <input
                type="text"
                required
                maxLength={6}
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="pl. K7PQ"
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-800 text-amber-400 placeholder-slate-600 focus:outline-none focus:border-amber-400 text-lg font-mono font-black tracking-widest uppercase text-center"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Beceneved</label>
              <input
                type="text"
                required
                maxLength={14}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="pl. Gábor"
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-400 text-sm font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !inputCode.trim() || !nickname.trim()}
              className="w-full h-13 mt-4 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-98 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20 transition-all disabled:opacity-40"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Csatlakozás a szobához</span>}
            </button>
          </form>
        )}

        {activeTab === 'spectate' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSpectate(inputCode);
            }}
            className="space-y-4"
          >
            <div className="p-3 rounded-2xl bg-indigo-950/40 border border-indigo-800/60 text-xs text-indigo-200">
              <span className="font-bold">Közös tévé nézet:</span> Itt megnyithatod a nyilvános asztalt anélkül, hogy játékosként helyet foglalnál. Kiváló nappaliba vagy tabletre!
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Szobakód</label>
              <input
                type="text"
                required
                maxLength={6}
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="pl. K7PQ"
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-800 text-amber-400 placeholder-slate-600 focus:outline-none focus:border-amber-400 text-lg font-mono font-black tracking-widest uppercase text-center"
              />
            </div>

            <button
              type="submit"
              disabled={!inputCode.trim()}
              className="w-full h-13 mt-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-40"
            >
              <Tv className="w-4 h-4" />
              <span>Közös kijelző indítása</span>
            </button>
          </form>
        )}

        {/* Feature Badges */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Szerveroldali titkosítás</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>2–6 játékos</span>
          </div>
        </div>
      </main>

      <footer className="text-center text-[11px] text-slate-400 pt-4">
        Texas Hold&apos;em · No-Limit · Valódi pénz nélkül
      </footer>
    </div>
  );
};
