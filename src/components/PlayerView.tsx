/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Card, PublicGameState } from '../types/poker';
import { CardView } from './CardView';
import { evaluate7Cards } from '../engine/evaluator';
import { soundManager } from '../utils/audio';
import { Eye, EyeOff, Tv, Volume2, VolumeX, AlertCircle, RefreshCw, PlusCircle } from 'lucide-react';

interface PlayerViewProps {
  gameState: PublicGameState;
  myPlayerId: string;
  errorMessage?: string | null;
  onAction: (type: 'FOLD' | 'CHECK' | 'CALL' | 'BET' | 'RAISE', amount?: number) => void;
  onNextHand: () => void;
  onRebuy: () => void;
  onOpenTableView?: () => void;
}

export const PlayerView: React.FC<PlayerViewProps> = ({
  gameState,
  myPlayerId,
  errorMessage: externalError,
  onAction,
  onNextHand,
  onRebuy,
  onOpenTableView,
}) => {
  // Mobile Privacy: cards are hidden by default to prevent couch peekers!
  const [isCardsHidden, setIsCardsHidden] = useState<boolean>(true);
  const [raiseAmount, setRaiseAmount] = useState<number>(gameState.minRaise);
  const [isMuted, setIsMuted] = useState<boolean>(soundManager.getMuted());
  const [internalError, setInternalError] = useState<string | null>(null);

  const me = gameState.players.find((p) => p.id === myPlayerId);
  const isMyTurn =
    gameState.phase !== 'SHOWDOWN' &&
    gameState.phase !== 'HAND_COMPLETE' &&
    gameState.players[gameState.currentActionIndex]?.id === myPlayerId;

  // Sound alert when turn transitions to this player
  useEffect(() => {
    if (isMyTurn) {
      soundManager.playTurnAlert();
    }
  }, [isMyTurn]);

  // Sync raise amount default when turn or highestBet changes
  useEffect(() => {
    if (gameState.myAllowedActions) {
      setRaiseAmount(gameState.myAllowedActions.minRaiseAmount);
    }
  }, [gameState.myAllowedActions, gameState.highestBet]);

  // Turn timer calculation
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const turnRemainingSec = gameState.turnStartedAt
    ? Math.max(0, Math.ceil(gameState.turnTimeLimitSec - (now - gameState.turnStartedAt) / 1000))
    : gameState.turnTimeLimitSec;

  const totalPot = gameState.pots.reduce((sum, p) => sum + p.amount, 0);

  // Calculate current hand strength if we have hole cards
  let currentHandDescription = '';
  if (gameState.myHoleCards && gameState.myHoleCards.length === 2) {
    const allKnownCards = [...gameState.myHoleCards, ...gameState.communityCards];
    if (allKnownCards.length >= 5) {
      try {
        const evaluation = evaluate7Cards(allKnownCards);
        currentHandDescription = evaluation.descr;
      } catch {
        currentHandDescription = '';
      }
    }
  }

  const handleAction = (type: 'FOLD' | 'CHECK' | 'CALL' | 'BET' | 'RAISE', amount?: number) => {
    setInternalError(null);
    if (type === 'FOLD') soundManager.playFold();
    else soundManager.playChip();

    try {
      onAction(type, amount);
    } catch (err) {
      setInternalError(err instanceof Error ? err.message : 'Hiba történt.');
    }
  };

  /**
   * Correct No-Limit Texas Hold'em pot-sized raise calculation:
   * Target bet = current highest bet + call amount + pot before call
   */
  const handleQuickRaise = (mode: 'min' | 'allin' | 'half_pot' | 'pot') => {
    if (!gameState.myAllowedActions || !me) return;
    const minTarget = gameState.myAllowedActions.minRaiseAmount;
    const maxTarget = gameState.myAllowedActions.maxRaiseAmount;

    if (mode === 'min') {
      setRaiseAmount(minTarget);
    } else if (mode === 'allin') {
      setRaiseAmount(maxTarget);
    } else if (mode === 'half_pot') {
      const callDiff = Math.max(0, gameState.highestBet - me.currentBet);
      const potAfterCall = totalPot + callDiff;
      let target = Math.round(gameState.highestBet + potAfterCall * 0.5);
      target = Math.max(minTarget, Math.min(maxTarget, target));
      setRaiseAmount(target);
    } else if (mode === 'pot') {
      const callDiff = Math.max(0, gameState.highestBet - me.currentBet);
      const potAfterCall = totalPot + callDiff;
      let target = gameState.highestBet + potAfterCall;
      target = Math.max(minTarget, Math.min(maxTarget, target));
      setRaiseAmount(target);
    }
  };

  const toggleSound = () => {
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  };

  const allowed = gameState.myAllowedActions;
  const activeError = externalError || internalError;

  if (!me) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold mb-2">Nem található a játékosod ebben a szobában</h2>
        <p className="text-sm text-slate-400 mb-6">A munkameneted lejárhatott vagy újracsatlakozás szükséges.</p>
        {onOpenTableView && (
          <button
            onClick={onOpenTableView}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold transition-colors"
          >
            Közös asztal megnyitása
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-md mx-auto relative select-none shadow-2xl border-x border-slate-800/60">
      {/* Mobile Top App Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black flex items-center justify-center text-xs shadow">
            {me.nickname.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white truncate max-w-[120px]">{me.nickname}</span>
            <span className="text-[11px] font-mono font-bold text-amber-400 tabular-nums">
              {me.chips.toLocaleString('hu-HU')} zseton
            </span>
          </div>
        </div>

        {/* Room Code & Utility Buttons */}
        <div className="flex items-center gap-1.5">
          <div className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-[11px] font-mono font-bold text-amber-400">
            #{gameState.roomCode}
          </div>

          {onOpenTableView && (
            <button
              onClick={onOpenTableView}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Közös asztal nézet (TV / Tablet)"
            >
              <Tv className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={toggleSound}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Hang"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Stretch Zone: Community Cards, Pot & Opponents State */}
      <main className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
        {/* Pot & Phase Strip */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Kassza:</span>
            <span className="text-base font-extrabold font-mono text-amber-400 tabular-nums">
              {totalPot.toLocaleString('hu-HU')}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-300">
            <span className="text-amber-400 font-bold">{gameState.phase.replace('_', ' ')}</span>
            <span className="text-slate-400">· #{gameState.handNumber}. leosztás</span>
          </div>
        </div>

        {/* Community Board Cards */}
        <div className="flex flex-col items-center justify-center py-2 px-3 rounded-2xl bg-emerald-950/40 border border-emerald-900/40 min-h-[96px]">
          <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400/80 mb-1.5">
            Közös lapok (Board)
          </span>
          <div className="flex items-center gap-1.5">
            {gameState.communityCards.length === 0 ? (
              <span className="text-xs text-slate-400 py-4 font-medium">Osztás előtt</span>
            ) : (
              gameState.communityCards.map((card, idx) => (
                <CardView key={idx} card={card} size="md" />
              ))
            )}
          </div>
        </div>

        {/* Other Players Status List */}
        <div className="grid grid-cols-2 gap-2">
          {gameState.players
            .filter((p) => p.id !== myPlayerId)
            .map((p) => {
              const isCurrentActor =
                gameState.phase !== 'SHOWDOWN' &&
                gameState.phase !== 'HAND_COMPLETE' &&
                gameState.players[gameState.currentActionIndex]?.id === p.id;

              return (
                <div
                  key={p.id}
                  className={`p-2 rounded-xl border flex flex-col justify-between text-xs transition-all ${
                    isCurrentActor
                      ? 'bg-amber-950/40 border-amber-500/80 ring-1 ring-amber-500/50'
                      : 'bg-slate-900/60 border-slate-800/80'
                  } ${p.folded ? 'opacity-40 grayscale' : 'opacity-100'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white truncate max-w-[80px]">{p.nickname}</span>
                    {p.folded ? (
                      <span className="text-[9px] font-bold text-rose-400 uppercase">Fold</span>
                    ) : p.allIn ? (
                      <span className="text-[9px] font-extrabold text-amber-300 uppercase">All-In</span>
                    ) : isCurrentActor ? (
                      <span className="text-[9px] font-bold text-amber-400 animate-pulse">Lép</span>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between mt-1 text-[11px]">
                    <span className="font-mono text-slate-300 tabular-nums">{p.chips.toLocaleString('hu-HU')}</span>
                    {p.currentBet > 0 && (
                      <span className="font-mono font-bold text-amber-400 tabular-nums">+{p.currentBet}</span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Player's Secret Hole Cards Zone */}
        <div className="mt-auto pt-2 flex flex-col items-center">
          <div className="flex items-center justify-between w-full px-2 mb-1">
            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400">
              Saját zárt lapjaid
            </span>

            {/* Privacy Peek Toggle */}
            <button
              onClick={() => setIsCardsHidden(!isCardsHidden)}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-amber-400 transition-colors"
            >
              {isCardsHidden ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>Lapok felfedése</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>Lapok elrejtése</span>
                </>
              )}
            </button>
          </div>

          {/* Cards Display with Peek Protection */}
          <div
            onClick={() => setIsCardsHidden(!isCardsHidden)}
            className="relative flex items-center justify-center gap-3 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl w-full cursor-pointer"
            title="Kattints ide a lapjaid felfedéséhez vagy elrejtéséhez"
          >
            {gameState.myHoleCards && gameState.myHoleCards.length === 2 ? (
              <>
                <CardView card={gameState.myHoleCards[0]} size="lg" isCardHidden={isCardsHidden} />
                <CardView card={gameState.myHoleCards[1]} size="lg" isCardHidden={isCardsHidden} />
              </>
            ) : (
              <div className="py-6 text-xs text-slate-400 font-medium">Várakozás az osztásra...</div>
            )}
          </div>

          {/* Hand Strength Indicator (only shown when cards are visible) */}
          {currentHandDescription && !isCardsHidden && (
            <div className="mt-1.5 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/60 text-xs font-semibold text-indigo-200">
              {currentHandDescription}
            </div>
          )}
        </div>

        {/* Turn Indicator Banner */}
        {isMyTurn && (
          <div className="p-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-between shadow-lg shadow-amber-500/20 animate-pulse">
            <span>A te köröd van! Válassz akciót:</span>
            <span className="font-mono tabular-nums text-sm bg-slate-950/20 px-2 py-0.5 rounded">
              {turnRemainingSec}s
            </span>
          </div>
        )}

        {/* Hand Complete Results Overlay */}
        {gameState.phase === 'HAND_COMPLETE' && gameState.winners && (
          <div className="p-3 rounded-xl bg-slate-900 border border-amber-400/80 flex flex-col items-center gap-1 text-center">
            <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Leosztás véget ért</span>
            {gameState.winners.map((w, idx) => (
              <div key={idx} className="text-xs font-bold text-white">
                {w.nickname} nyert {w.amount.toLocaleString('hu-HU')} zsetont ({w.handDescr || 'Showdown'})
              </div>
            ))}
            <button
              onClick={onNextHand}
              className="mt-2 w-full py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-transform active:scale-98"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Következő leosztás indítása</span>
            </button>
          </div>
        )}

        {/* All-in notification during active hand (NOT rebuy!) */}
        {me.chips === 0 && gameState.phase !== 'HAND_COMPLETE' && (
          <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-600/60 flex items-center justify-center gap-2 text-center">
            <span className="text-xs font-bold text-amber-300">All-in vagy! Várakozás a leosztás kimenetelére...</span>
          </div>
        )}

        {/* Busted out / Rebuy Option (ONLY when hand is complete!) */}
        {me.chips === 0 && gameState.phase === 'HAND_COMPLETE' && (
          <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/80 flex flex-col items-center gap-1 text-center">
            <span className="text-xs font-bold text-rose-300">Elfogyott a zsetonod a leosztás után!</span>
            <button
              onClick={onRebuy}
              className="mt-1 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Újrazsetonálás (Rebuy)</span>
            </button>
          </div>
        )}

        {/* Error notification */}
        {activeError && (
          <div className="p-2 rounded-lg bg-rose-950/80 border border-rose-700 text-xs text-rose-200 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{activeError}</span>
          </div>
        )}
      </main>

      {/* Natural Thumb Zone: Primary Action Controls (Bottom 40%) */}
      <footer className="bg-slate-900 border-t border-slate-800 p-3 flex flex-col gap-2">
        {isMyTurn && allowed ? (
          <>
            {/* Quick Raise Shortcuts Bar (if allowed to bet or raise) */}
            {(allowed.canBet || allowed.canRaise) && (
              <div className="flex flex-col gap-1.5 pb-1">
                <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                  <span>Cél tét: {raiseAmount.toLocaleString('hu-HU')}</span>
                  <span className="text-slate-400">
                    Max: {allowed.maxRaiseAmount.toLocaleString('hu-HU')}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => handleQuickRaise('min')}
                    className="py-1 text-xs font-semibold rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    Min
                  </button>
                  <button
                    onClick={() => handleQuickRaise('half_pot')}
                    className="py-1 text-xs font-semibold rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    ½ Pot
                  </button>
                  <button
                    onClick={() => handleQuickRaise('pot')}
                    className="py-1 text-xs font-semibold rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    Pot
                  </button>
                  <button
                    onClick={() => handleQuickRaise('allin')}
                    className="py-1 text-xs font-bold rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors"
                  >
                    All-in
                  </button>
                </div>

                {/* Range Slider for granular control */}
                <input
                  type="range"
                  min={allowed.minRaiseAmount}
                  max={allowed.maxRaiseAmount}
                  step={gameState.bigBlind}
                  value={raiseAmount}
                  onChange={(e) => setRaiseAmount(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
              </div>
            )}

            {/* Primary Action Buttons (Thumb Hitboxes >= 48px) */}
            <div className="grid grid-cols-3 gap-2">
              {/* 1. Fold */}
              <button
                onClick={() => handleAction('FOLD')}
                disabled={!allowed.canFold}
                className="h-12 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-sm flex items-center justify-center shadow-lg shadow-rose-900/30 transition-all disabled:opacity-40"
              >
                Fold
              </button>

              {/* 2. Check / Call */}
              {allowed.canCheck ? (
                <button
                  onClick={() => handleAction('CHECK')}
                  className="h-12 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-sm flex items-center justify-center shadow-lg shadow-blue-900/30 transition-all"
                >
                  Check
                </button>
              ) : (
                <button
                  onClick={() => handleAction('CALL')}
                  disabled={!allowed.canCall}
                  className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex flex-col items-center justify-center shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-40 leading-tight"
                >
                  <span>Megadás</span>
                  <span className="font-mono text-[11px] opacity-90 tabular-nums">
                    +{allowed.callAmount}
                  </span>
                </button>
              )}

              {/* 3. Bet / Raise */}
              {allowed.canBet || allowed.canRaise ? (
                <button
                  onClick={() => handleAction(allowed.canBet ? 'BET' : 'RAISE', raiseAmount)}
                  className="h-12 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs flex flex-col items-center justify-center shadow-lg shadow-amber-500/20 transition-all leading-tight"
                >
                  <span>{allowed.canBet ? 'Tét (Bet)' : 'Emelés'}</span>
                  <span className="font-mono text-[11px] tabular-nums">{raiseAmount}</span>
                </button>
              ) : (
                <button
                  disabled
                  className="h-12 rounded-xl bg-slate-800 text-slate-500 font-bold text-xs flex items-center justify-center cursor-not-allowed"
                >
                  Emelés
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="h-12 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-xs text-slate-400 font-medium">
            {gameState.phase === 'HAND_COMPLETE'
              ? 'Leosztás befejeződött.'
              : me.folded
              ? 'Ebből a leosztásból kiszálltál (Fold).'
              : me.allIn
              ? 'All-in vagy! Sok szerencsét a kártyákhoz.'
              : 'Várakozás a többi játékos lépésére...'}
          </div>
        )}
      </footer>
    </div>
  );
};
