/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Card, PublicGameState, PublicPlayerView } from '../types/poker';
import { CardView } from './CardView';
import { TableCompact } from './TableCompact';
import { getSeatBadges } from '../utils/seats';
import { soundManager } from '../utils/audio';
import { Copy, Volume2, VolumeX, Maximize2, Users, RefreshCw } from 'lucide-react';
import tableFelt from '../assets/images/poker_table_felt_1793043187623.jpg';

interface TableViewProps {
  gameState: PublicGameState;
  onNextHand?: () => void;
  onSwitchToPlayer?: () => void;
  isHost?: boolean;
  myPlayerId?: string;
}


/** Álló telefon / keskeny képernyő → függőleges lista; fekvő TV/tablet → ovális asztal. */
function useCompactLayout(): boolean {
  const query = '(max-width: 767px), (max-aspect-ratio: 1/1)';
  const [compact, setCompact] = React.useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return compact;
}

export const TableView: React.FC<TableViewProps> = ({
  gameState,
  onNextHand,
  onSwitchToPlayer,
  isHost = false,
  myPlayerId,
}) => {
  const compact = useCompactLayout();
  const [copied, setCopied] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(soundManager.getMuted());

  // Fire confetti and sound on winners announcement
  useEffect(() => {
    if (gameState.phase === 'HAND_COMPLETE' && gameState.winners && gameState.winners.length > 0) {
      soundManager.playWinFanfare();
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // Ignored in environments where canvas-confetti is mocked
      }
    }
  }, [gameState.phase, gameState.winners]);

  const copyRoomLink = () => {
    const url = `${window.location.origin}?room=${gameState.roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleSound = () => {
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Seat relative layout coordinates around oval table (percentage [left, top])
  const SEAT_POSITIONS: { left: string; top: string; align: string }[] = [
    { left: '50%', top: '88%', align: '-translate-x-1/2 -translate-y-1/2' }, // 0: Bottom Center
    { left: '16%', top: '75%', align: '-translate-x-1/2 -translate-y-1/2' }, // 1: Bottom Left
    { left: '16%', top: '25%', align: '-translate-x-1/2 -translate-y-1/2' }, // 2: Top Left
    { left: '50%', top: '12%', align: '-translate-x-1/2 -translate-y-1/2' }, // 3: Top Center
    { left: '84%', top: '25%', align: '-translate-x-1/2 -translate-y-1/2' }, // 4: Top Right
    { left: '84%', top: '75%', align: '-translate-x-1/2 -translate-y-1/2' }, // 5: Bottom Right
  ];

  const totalPot = gameState.pots.reduce((sum, p) => sum + p.amount, 0);

  // Turn time percentage remaining calculation
  const [now, setNow] = React.useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  const turnRemainingSec = gameState.turnStartedAt
    ? Math.max(0, Math.ceil(gameState.turnTimeLimitSec - (now - gameState.turnStartedAt) / 1000))
    : gameState.turnTimeLimitSec;

  const activePlayer = gameState.players[gameState.currentActionIndex];
  const seatBadges = getSeatBadges(gameState.players.length, gameState.dealerIndex);

  if (compact) {
    return (
      <TableCompact
        gameState={gameState}
        myPlayerId={myPlayerId}
        remainingSec={turnRemainingSec}
        totalPot={totalPot}
        copied={copied}
        isMuted={isMuted}
        onCopyLink={copyRoomLink}
        onToggleSound={toggleSound}
        onNextHand={onNextHand}
        onSwitchToPlayer={onSwitchToPlayer}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-3 md:p-6 overflow-hidden select-none">
      {/* Top Bar HUD */}
      <header className="flex items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Szobakód</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl md:text-3xl font-extrabold font-mono tracking-widest text-amber-400">
                {gameState.roomCode}
              </span>
              <button
                onClick={copyRoomLink}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Meghívó link másolása"
              >
                <Copy className="w-4 h-4" />
              </button>
              {copied && <span className="text-xs text-emerald-400 font-medium">Másolva!</span>}
            </div>
          </div>
          <div className="hidden sm:flex flex-col border-l border-slate-800 pl-3">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Vakok</span>
            <span className="text-sm font-bold font-mono text-slate-200">
              {gameState.smallBlind} / {gameState.bigBlind}
            </span>
          </div>
        </div>

        {/* Phase & Hand Info */}
        <div className="flex flex-col items-center">
          <div className="px-3 py-1 rounded-full bg-slate-900 border border-slate-700/80 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
              {gameState.phase.replace('_', ' ')}
            </span>
            <span className="text-xs text-slate-400">· #{gameState.handNumber}. leosztás</span>
          </div>
        </div>

        {/* Actions & View Controls */}
        <div className="flex items-center gap-2">
          {onSwitchToPlayer && (
            <button
              onClick={onSwitchToPlayer}
              className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Saját telefon nézet</span>
            </button>
          )}

          <button
            onClick={toggleSound}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title={isMuted ? 'Hang bekapcsolása' : 'Némítás'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Teljes képernyő"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Poker Table Arena */}
      <main className="relative flex-1 w-full max-w-6xl mx-auto my-4 flex items-center justify-center min-h-[480px]">
        {/* Oval Table Outer Rim */}
        <div
          className="relative w-full aspect-[16/9] max-h-[640px] rounded-[180px] md:rounded-[220px] p-4 md:p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border-[10px] md:border-[16px] border-[#2b1810] bg-[#1a0f0a] flex items-center justify-center overflow-hidden"
          style={{
            backgroundImage: `url(${tableFelt})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Subtle Inner Felt Gradient Overlay */}
          <div className="absolute inset-0 bg-radial from-emerald-900/40 via-emerald-950/70 to-black/80 pointer-events-none" />

          {/* Golden Table Inlay Line */}
          <div className="absolute inset-4 md:inset-8 rounded-[160px] md:rounded-[200px] border border-amber-500/20 pointer-events-none" />

          {/* Center Table Area (Community Cards & Pots) */}
          <div className="relative z-10 flex flex-col items-center justify-center gap-3">
            {/* Pot Display */}
            <div className="px-5 py-2 rounded-2xl bg-black/75 backdrop-blur-md border border-amber-500/30 flex flex-col items-center shadow-2xl">
              <span className="text-[10px] uppercase font-bold tracking-widest text-amber-400">
                Összes Kassza (Pot)
              </span>
              <span className="text-2xl md:text-3xl font-black font-mono tracking-tight text-white tabular-nums">
                {totalPot.toLocaleString('hu-HU')}
              </span>
              {gameState.pots.length > 1 && (
                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-300">
                  <span>Főkassza: {gameState.pots[0].amount}</span>
                  {gameState.pots.slice(1).map((sp, idx) => (
                    <span key={idx}>· Mellékkassza {idx + 1}: {sp.amount}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Community Cards */}
            <div className="flex items-center gap-2 md:gap-3 min-h-[90px] md:min-h-[120px] p-2 rounded-2xl bg-black/40 backdrop-blur-sm border border-white/10">
              {gameState.communityCards.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-emerald-300/60 font-medium px-4 py-2">
                  <span>Osztásra várva...</span>
                </div>
              ) : (
                gameState.communityCards.map((card, idx) => (
                  <CardView key={idx} card={card} size="lg" />
                ))
              )}
            </div>

            {/* Turn Status or Winner Overlay */}
            {gameState.phase !== 'HAND_COMPLETE' && activePlayer && (
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-amber-400/40 text-xs font-semibold text-amber-200">
                <span>Soron következő:</span>
                <span className="font-bold text-white">{activePlayer.nickname}</span>
                <span className="font-mono tabular-nums text-amber-400">({turnRemainingSec}s)</span>
              </div>
            )}

            {/* Showdown Result Banner */}
            {gameState.phase === 'HAND_COMPLETE' && gameState.winners && (
              <div className="flex flex-col items-center gap-2 px-6 py-3 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-amber-400 shadow-2xl animate-in fade-in zoom-in-95">
                <span className="text-xs uppercase font-extrabold tracking-widest text-amber-400">
                  Leosztás Győztese
                </span>
                {gameState.winners.map((win, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <span className="text-lg md:text-xl font-black text-white">
                      {win.nickname} nyert {win.amount.toLocaleString('hu-HU')} zsetont!
                    </span>
                    {win.handDescr && (
                      <span className="text-xs text-emerald-400 font-medium">{win.handDescr}</span>
                    )}
                  </div>
                ))}
                {onNextHand && (
                  <button
                    onClick={onNextHand}
                    className="mt-2 px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-transform active:scale-95 flex items-center gap-1.5 shadow-lg"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Következő leosztás indítása</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Seated Players around the table */}
          {gameState.players.map((player, index) => {
            const pos = SEAT_POSITIONS[index % SEAT_POSITIONS.length];
            const isTurn = gameState.phase !== 'HAND_COMPLETE' && gameState.currentActionIndex === index;
            const isDealer = gameState.dealerIndex === index;
            const isSb = !!seatBadges[index]?.includes('SB');
            const isBb = !!seatBadges[index]?.includes('BB');

            return (
              <div
                key={player.id}
                className={`absolute ${pos.align} z-20 flex flex-col items-center transition-all duration-300 ${
                  player.folded ? 'opacity-40 grayscale' : 'opacity-100'
                }`}
                style={{ left: pos.left, top: pos.top }}
              >
                {/* Active Turn Halo Ring */}
                {isTurn && (
                  <div className="absolute -inset-2 rounded-2xl ring-4 ring-amber-400/80 animate-pulse pointer-events-none" />
                )}

                {/* Player Card Container */}
                <div className="relative flex items-center -space-x-4 mb-1">
                  {player.revealedCards && player.revealedCards.length > 0 ? (
                    player.revealedCards.map((c, i) => (
                      <CardView key={i} card={c} size="sm" isWinningCard={gameState.winners?.some((w) => w.playerId === player.id)} />
                    ))
                  ) : (
                    <>
                      <CardView faceDown size="sm" />
                      <CardView faceDown size="sm" />
                    </>
                  )}
                </div>

                {/* Player Badge / HUD */}
                <div
                  className={`px-3 py-1.5 rounded-xl border backdrop-blur-md flex flex-col items-center min-w-[96px] shadow-lg ${
                    isTurn
                      ? 'bg-amber-950/80 border-amber-400 text-white'
                      : 'bg-slate-900/85 border-slate-700/80 text-slate-200'
                  }`}
                >
                  {/* Name and Dealer Badge */}
                  <div className="flex items-center gap-1 w-full justify-between">
                    <span className="text-xs font-bold truncate max-w-[70px]">{player.nickname}</span>
                    <div className="flex items-center gap-0.5">
                      {isDealer && (
                        <span className="w-4 h-4 rounded-full bg-white text-slate-900 font-black text-[9px] flex items-center justify-center shadow">
                          D
                        </span>
                      )}
                      {isSb && (
                        <span className="w-4 h-4 rounded-full bg-blue-500 text-white font-bold text-[8px] flex items-center justify-center shadow">
                          SB
                        </span>
                      )}
                      {isBb && (
                        <span className="w-4 h-4 rounded-full bg-amber-500 text-white font-bold text-[8px] flex items-center justify-center shadow">
                          BB
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Chips Stack */}
                  <span className="text-xs font-mono font-bold text-amber-400 tabular-nums">
                    {player.chips.toLocaleString('hu-HU')}
                  </span>

                  {/* Status Tag */}
                  {player.folded && <span className="text-[9px] text-rose-400 font-bold uppercase">Fold</span>}
                  {player.allIn && <span className="text-[9px] text-amber-300 font-extrabold uppercase">All-In</span>}
                </div>

                {/* Current Bet Chips in front of player */}
                {player.currentBet > 0 && (
                  <div className="mt-1 px-2 py-0.5 rounded-full bg-black/80 border border-amber-400/50 text-[10px] font-mono font-bold text-amber-300 shadow">
                    +{player.currentBet}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Bottom Footer Information */}
      <footer className="text-center text-xs text-slate-400">
        Privát Texas Hold&apos;em Szoba · A zárt lapok csak a játékosok saját telefonján láthatók
      </footer>
    </div>
  );
};
