/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { PublicGameState, PublicPlayerView } from '../types/poker';
import { CardView } from './CardView';
import { evaluate7Cards } from '../engine/evaluator';
import { soundManager } from '../utils/audio';
import { getSeatBadges, phaseLabel, SeatBadge } from '../utils/seats';
import { AlertCircle, Eye, EyeOff, Minus, Plus, PlusCircle, RefreshCw, Tv, Volume2, VolumeX } from 'lucide-react';

type ActionKind = 'FOLD' | 'CHECK' | 'CALL' | 'BET' | 'RAISE';

interface PlayerViewProps {
  gameState: PublicGameState;
  myPlayerId: string;
  errorMessage?: string | null;
  onAction: (type: ActionKind, amount?: number) => void;
  onNextHand: () => void;
  onRebuy: () => void;
  onOpenTableView?: () => void;
}

const fmt = (n: number) => n.toLocaleString('hu-HU');

const BADGE_STYLE: Record<SeatBadge, string> = {
  D: 'bg-white text-slate-900',
  SB: 'bg-blue-500 text-white',
  BB: 'bg-amber-500 text-slate-950',
};

const Badges: React.FC<{ badges?: SeatBadge[] }> = ({ badges }) => (
  <>
    {badges?.map((b) => (
      <span
        key={b}
        className={`inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[9px] font-black leading-none ${BADGE_STYLE[b]}`}
      >
        {b}
      </span>
    ))}
  </>
);

export const PlayerView: React.FC<PlayerViewProps> = ({
  gameState,
  myPlayerId,
  errorMessage,
  onAction,
  onNextHand,
  onRebuy,
  onOpenTableView,
}) => {
  // Privacy: a zárt lapok alapból rejtettek, hogy a szomszéd ne lásson bele.
  const [isCardsHidden, setIsCardsHidden] = useState<boolean>(true);
  const [raiseOpen, setRaiseOpen] = useState<boolean>(false);
  const [raiseAmount, setRaiseAmount] = useState<number>(gameState.minRaise);
  const [isMuted, setIsMuted] = useState<boolean>(soundManager.getMuted());
  const [now, setNow] = useState(Date.now());

  const me = gameState.players.find((p) => p.id === myPlayerId);
  const handRunning = gameState.phase !== 'SHOWDOWN' && gameState.phase !== 'HAND_COMPLETE';
  const actor = gameState.players[gameState.currentActionIndex];
  const isMyTurn = handRunning && actor?.id === myPlayerId;
  const allowed = gameState.myAllowedActions;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (isMyTurn) soundManager.playTurnAlert();
    if (!isMyTurn) setRaiseOpen(false);
  }, [isMyTurn]);

  // Új leosztásnál a lapok újra elrejtve indulnak.
  useEffect(() => {
    setIsCardsHidden(true);
  }, [gameState.handNumber]);

  useEffect(() => {
    if (allowed) setRaiseAmount(allowed.minRaiseAmount);
  }, [allowed?.minRaiseAmount, allowed?.maxRaiseAmount, gameState.highestBet, gameState.phase]);

  const limit = gameState.turnTimeLimitSec || 30;
  const remainingSec = gameState.turnStartedAt
    ? Math.max(0, Math.ceil(limit - (now - gameState.turnStartedAt) / 1000))
    : limit;
  const remainingFraction = Math.max(0, Math.min(1, remainingSec / limit));

  const totalPot = gameState.pots.reduce((sum, p) => sum + p.amount, 0);
  const badges = getSeatBadges(gameState.players.length, gameState.dealerIndex);
  const myIndex = gameState.players.findIndex((p) => p.id === myPlayerId);

  let handDescr = '';
  if (gameState.myHoleCards?.length === 2 && gameState.communityCards.length >= 3) {
    try {
      handDescr = evaluate7Cards([...gameState.myHoleCards, ...gameState.communityCards]).descr;
    } catch {
      handDescr = '';
    }
  }

  const act = (type: ActionKind, amount?: number) => {
    if (type === 'FOLD') soundManager.playFold();
    else soundManager.playChip();
    setRaiseOpen(false);
    onAction(type, amount);
  };

  const clampRaise = (v: number) =>
    allowed ? Math.max(allowed.minRaiseAmount, Math.min(allowed.maxRaiseAmount, Math.round(v))) : v;

  const quickRaise = (mode: 'min' | 'half' | 'pot' | 'allin') => {
    if (!allowed || !me) return;
    const callDiff = Math.max(0, gameState.highestBet - me.currentBet);
    const potAfterCall = totalPot + callDiff;
    if (mode === 'min') setRaiseAmount(allowed.minRaiseAmount);
    else if (mode === 'allin') setRaiseAmount(allowed.maxRaiseAmount);
    else if (mode === 'half') setRaiseAmount(clampRaise(gameState.highestBet + potAfterCall * 0.5));
    else setRaiseAmount(clampRaise(gameState.highestBet + potAfterCall));
  };

  const toggleSound = () => setIsMuted(soundManager.toggleMute());

  if (!me) {
    return (
      <div className="h-dvh bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold mb-2">Nem található a játékosod ebben a szobában</h2>
        <p className="text-sm text-slate-400 mb-6">A munkameneted lejárhatott vagy újracsatlakozás szükséges.</p>
        {onOpenTableView && (
          <button
            onClick={onOpenTableView}
            className="h-12 px-6 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold"
          >
            Közös asztal megnyitása
          </button>
        )}
      </div>
    );
  }

  const renderOpponent = (p: PublicPlayerView) => {
    const idx = gameState.players.findIndex((x) => x.id === p.id);
    const isActor = handRunning && actor?.id === p.id;
    return (
      <div
        key={p.id}
        className={`relative rounded-xl border px-2.5 py-2 flex items-center gap-2 min-w-0 ${
          isActor ? 'bg-amber-950/50 border-amber-400 ring-1 ring-amber-400/60' : 'bg-slate-900/70 border-slate-800'
        } ${p.folded ? 'opacity-45' : ''}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[13px] font-bold text-white truncate">{p.nickname}</span>
            <Badges badges={badges[idx]} />
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums">
            <span className="text-slate-300">{fmt(p.chips)}</span>
            {p.currentBet > 0 && <span className="font-bold text-amber-400">+{fmt(p.currentBet)}</span>}
          </div>
          <div className="text-[10px] font-bold uppercase leading-tight h-3">
            {p.folded ? (
              <span className="text-rose-400">Fold</span>
            ) : p.allIn ? (
              <span className="text-amber-300">All-in</span>
            ) : isActor ? (
              <span className="text-amber-400 animate-pulse">Lép · {remainingSec}s</span>
            ) : !p.isConnected ? (
              <span className="text-slate-500">Offline</span>
            ) : null}
          </div>
        </div>
        <div className="flex -space-x-2 shrink-0">
          {p.revealedCards?.length ? (
            p.revealedCards.map((c, i) => <CardView key={i} card={c} size="xs" />)
          ) : p.folded ? null : (
            <>
              <CardView faceDown size="xs" />
              <CardView faceDown size="xs" />
            </>
          )}
        </div>
      </div>
    );
  };

  const opponents = gameState.players.filter((p) => p.id !== myPlayerId);

  return (
    <div className="h-dvh bg-slate-950 text-slate-100 flex flex-col max-w-md mx-auto relative select-none border-x border-slate-800/60">
      {/* Fejléc */}
      <header className="relative flex-none bg-slate-900 border-b border-slate-800 px-3 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black flex items-center justify-center text-xs">
            {me.nickname.substring(0, 2).toUpperCase()}
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[13px] font-bold text-white truncate max-w-[120px]">{me.nickname}</div>
            <div className="text-[12px] font-mono font-bold text-amber-400 tabular-nums">{fmt(me.chips)} zseton</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="px-2 h-8 flex items-center rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-mono font-bold text-amber-400">
            #{gameState.roomCode}
          </span>
          {onOpenTableView && (
            <button
              onClick={onOpenTableView}
              aria-label="Közös asztal nézet"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 active:bg-slate-700"
            >
              <Tv className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={toggleSound}
            aria-label="Hang"
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 active:bg-slate-700"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
        {handRunning && (
          <div
            className={`absolute left-0 bottom-0 h-0.5 transition-[width] duration-300 ${
              remainingSec <= 5 ? 'bg-rose-500' : 'bg-amber-400'
            }`}
            style={{ width: `${remainingFraction * 100}%` }}
          />
        )}
      </header>

      {/* Játéktér (ha kevés a hely, ez görög, a lenti gombok nem) */}
      <main className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {/* Kassza + szakasz + ki lép */}
        <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-2 flex items-center justify-between">
          <div className="leading-tight">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Kassza</div>
            <div className="text-xl font-black font-mono text-amber-400 tabular-nums">{fmt(totalPot)}</div>
          </div>
          <div className="text-right leading-tight">
            <div className="text-[13px] font-bold text-amber-300">{phaseLabel(gameState.phase)}</div>
            <div className="text-[11px] text-slate-400">
              #{gameState.handNumber}. leosztás · Vak {gameState.smallBlind}/{gameState.bigBlind}
            </div>
          </div>
        </div>

        {/* Közös lapok: mindig 5 hely */}
        <div className="rounded-2xl bg-emerald-950/40 border border-emerald-900/50 py-3 flex items-center justify-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => {
            const card = gameState.communityCards[i];
            return card ? (
              <CardView key={i} card={card} size="md" />
            ) : (
              <div key={i} className="w-14 h-20 rounded-lg border border-dashed border-emerald-800/60 bg-emerald-950/30" />
            );
          })}
        </div>

        {/* Ellenfelek */}
        {opponents.length > 0 && (
          <div className="grid grid-cols-2 gap-2">{opponents.map(renderOpponent)}</div>
        )}

        {/* Saját lapok */}
        <div className="mt-auto">
          <div className="flex items-center justify-between px-1 mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Saját lapjaid</span>
              <Badges badges={badges[myIndex]} />
              {me.currentBet > 0 && (
                <span className="text-[11px] font-mono font-bold text-amber-400">+{fmt(me.currentBet)}</span>
              )}
            </div>
            <button
              onClick={() => setIsCardsHidden((h) => !h)}
              className="flex items-center gap-1 h-8 px-2 -mr-2 text-[12px] font-semibold text-slate-300 active:text-amber-400"
            >
              {isCardsHidden ? <Eye className="w-4 h-4 text-amber-400" /> : <EyeOff className="w-4 h-4" />}
              <span>{isCardsHidden ? 'Felfedés' : 'Elrejtés'}</span>
            </button>
          </div>
          <div
            onClick={() => setIsCardsHidden((h) => !h)}
            className={`flex items-center justify-center gap-3 py-3 rounded-2xl bg-slate-900/90 border cursor-pointer ${
              isMyTurn ? 'border-amber-400/70' : 'border-slate-800'
            } ${me.folded ? 'opacity-50' : ''}`}
          >
            {gameState.myHoleCards?.length === 2 ? (
              <>
                <CardView card={gameState.myHoleCards[0]} size="lg" isCardHidden={isCardsHidden} />
                <CardView card={gameState.myHoleCards[1]} size="lg" isCardHidden={isCardsHidden} />
              </>
            ) : (
              <div className="py-8 text-xs text-slate-400 font-medium">Várakozás az osztásra...</div>
            )}
          </div>
          <div className="h-7 mt-1.5 flex items-center justify-center">
            {handDescr && !isCardsHidden && (
              <span className="px-3 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-700/60 text-xs font-semibold text-indigo-200">
                {handDescr}
              </span>
            )}
          </div>
        </div>
      </main>

      {/* Akciósáv: mindig látszik, a képernyő alján */}
      <footer className="flex-none bg-slate-900 border-t border-slate-800 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-2">
        {errorMessage && (
          <div className="px-2.5 py-1.5 rounded-lg bg-rose-950/80 border border-rose-700 text-xs text-rose-200 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {gameState.phase === 'HAND_COMPLETE' ? (
          <>
            <div className="text-center leading-snug">
              <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400">Leosztás vége</div>
              {gameState.winners?.map((w, i) => (
                <div key={i} className="text-[13px] font-bold text-white">
                  {w.nickname} nyert {fmt(w.amount)} zsetont
                  {w.handDescr ? <span className="text-slate-400 font-medium"> · {w.handDescr}</span> : null}
                </div>
              ))}
            </div>
            {me.chips === 0 ? (
              <button
                onClick={onRebuy}
                className="h-14 rounded-xl bg-emerald-600 active:bg-emerald-500 text-white font-black text-sm flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-5 h-5" />
                Elfogyott a zsetonod, újra beszállok
              </button>
            ) : (
              <button
                onClick={onNextHand}
                className="h-14 rounded-xl bg-amber-400 active:bg-amber-300 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                Következő leosztás
              </button>
            )}
          </>
        ) : isMyTurn && allowed ? (
          <>
            {raiseOpen && (allowed.canBet || allowed.canRaise) && (
              <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setRaiseAmount((v) => clampRaise(v - gameState.bigBlind))}
                    aria-label="Kevesebb"
                    className="w-12 h-12 rounded-xl bg-slate-800 active:bg-slate-700 flex items-center justify-center"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <div className="text-center leading-tight">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Emelés erre</div>
                    <div className="text-2xl font-black font-mono text-amber-400 tabular-nums">{fmt(raiseAmount)}</div>
                  </div>
                  <button
                    onClick={() => setRaiseAmount((v) => clampRaise(v + gameState.bigBlind))}
                    aria-label="Több"
                    className="w-12 h-12 rounded-xl bg-slate-800 active:bg-slate-700 flex items-center justify-center"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      ['min', 'Min'],
                      ['half', '½ Pot'],
                      ['pot', 'Pot'],
                      ['allin', 'All-in'],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => quickRaise(mode)}
                      className={`h-10 rounded-lg text-xs font-bold border active:scale-95 ${
                        mode === 'allin'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 text-slate-200 border-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  aria-label="Emelés összege"
                  min={allowed.minRaiseAmount}
                  max={allowed.maxRaiseAmount}
                  step={1}
                  value={raiseAmount}
                  onChange={(e) => setRaiseAmount(clampRaise(Number(e.target.value)))}
                  className="w-full h-8 accent-amber-400"
                />
              </div>
            )}

            {raiseOpen ? (
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setRaiseOpen(false)}
                  className="h-14 rounded-xl bg-slate-800 active:bg-slate-700 text-slate-200 font-bold text-sm"
                >
                  Mégse
                </button>
                <button
                  onClick={() => act(allowed.canBet ? 'BET' : 'RAISE', raiseAmount)}
                  className="col-span-2 h-14 rounded-xl bg-amber-500 active:bg-amber-400 text-slate-950 font-black text-base flex items-center justify-center gap-2"
                >
                  {raiseAmount >= allowed.maxRaiseAmount ? 'All-in' : allowed.canBet ? 'Tét' : 'Emelés'}
                  <span className="font-mono tabular-nums">{fmt(raiseAmount)}</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => act('FOLD')}
                  className="h-14 rounded-xl bg-rose-600 active:bg-rose-500 text-white font-black text-base"
                >
                  Fold
                </button>
                {allowed.canCheck ? (
                  <button
                    onClick={() => act('CHECK')}
                    className="h-14 rounded-xl bg-blue-600 active:bg-blue-500 text-white font-black text-base"
                  >
                    Check
                  </button>
                ) : (
                  <button
                    onClick={() => act('CALL')}
                    disabled={!allowed.canCall}
                    className="h-14 rounded-xl bg-emerald-600 active:bg-emerald-500 text-white font-black text-base leading-tight flex flex-col items-center justify-center disabled:opacity-40"
                  >
                    <span>Megadás</span>
                    <span className="font-mono text-xs tabular-nums opacity-90">{fmt(allowed.callAmount)}</span>
                  </button>
                )}
                {allowed.canBet || allowed.canRaise ? (
                  <button
                    onClick={() => setRaiseOpen(true)}
                    className="h-14 rounded-xl bg-amber-500 active:bg-amber-400 text-slate-950 font-black text-base"
                  >
                    {allowed.canBet ? 'Tét…' : 'Emelés…'}
                  </button>
                ) : (
                  <button disabled className="h-14 rounded-xl bg-slate-800 text-slate-500 font-bold text-sm">
                    Nem emelhetsz
                  </button>
                )}
              </div>
            )}
            <div className="text-center text-[11px] font-semibold text-amber-300">
              A te köröd van · {remainingSec} mp
            </div>
          </>
        ) : (
          <div className="h-14 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-sm text-slate-300 font-medium text-center px-3">
            {me.folded
              ? 'Kiszálltál ebből a leosztásból.'
              : me.allIn
              ? 'All-in vagy, várjuk a lapokat.'
              : actor
              ? `${actor.nickname} lép · ${remainingSec} mp`
              : 'Várakozás...'}
          </div>
        )}
      </footer>
    </div>
  );
};
