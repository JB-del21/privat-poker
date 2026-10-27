/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PublicGameState } from '../types/poker';
import { CardView } from './CardView';
import { getSeatBadges, phaseLabel, SeatBadge } from '../utils/seats';
import { Copy, RefreshCw, Smartphone, Volume2, VolumeX } from 'lucide-react';

interface TableCompactProps {
  gameState: PublicGameState;
  myPlayerId?: string;
  remainingSec: number;
  totalPot: number;
  copied: boolean;
  isMuted: boolean;
  onCopyLink: () => void;
  onToggleSound: () => void;
  onNextHand?: () => void;
  onSwitchToPlayer?: () => void;
}

const fmt = (n: number) => n.toLocaleString('hu-HU');

const BADGE_STYLE: Record<SeatBadge, string> = {
  D: 'bg-white text-slate-900',
  SB: 'bg-blue-500 text-white',
  BB: 'bg-amber-500 text-slate-950',
};

/**
 * Álló telefon / keskeny képernyő: függőleges lista az ovális asztal helyett.
 * (A TV / fekvő tablet továbbra is az ovális asztalt kapja.)
 */
export const TableCompact: React.FC<TableCompactProps> = ({
  gameState,
  myPlayerId,
  remainingSec,
  totalPot,
  copied,
  isMuted,
  onCopyLink,
  onToggleSound,
  onNextHand,
  onSwitchToPlayer,
}) => {
  const handRunning = gameState.phase !== 'SHOWDOWN' && gameState.phase !== 'HAND_COMPLETE';
  const actor = gameState.players[gameState.currentActionIndex];
  const badges = getSeatBadges(gameState.players.length, gameState.dealerIndex);
  const myTurn = handRunning && !!myPlayerId && actor?.id === myPlayerId;

  return (
    <div className="h-dvh bg-slate-950 text-slate-100 flex flex-col select-none">
      <header className="flex-none px-3 h-14 flex items-center justify-between border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2">
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Szobakód</div>
            <div className="text-xl font-black font-mono tracking-widest text-amber-400">{gameState.roomCode}</div>
          </div>
          <button
            onClick={onCopyLink}
            aria-label="Meghívó link másolása"
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 active:bg-slate-700"
          >
            <Copy className="w-4 h-4" />
          </button>
          {copied && <span className="text-xs text-emerald-400 font-medium">Másolva!</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="px-2.5 h-8 flex items-center rounded-full bg-slate-800 border border-slate-700 text-[11px] font-bold text-amber-300 uppercase">
            {phaseLabel(gameState.phase)}
          </div>
          <button
            onClick={onToggleSound}
            aria-label="Hang"
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 active:bg-slate-700"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Ha a bejelentkezett játékos itt a közös nézetben van, ne ragadjon be */}
      {onSwitchToPlayer && (
        <button
          onClick={onSwitchToPlayer}
          className={`flex-none h-12 flex items-center justify-center gap-2 text-sm font-black ${
            myTurn ? 'bg-amber-500 text-slate-950 animate-pulse' : 'bg-indigo-600 text-white'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          {myTurn ? 'Te jössz! Vissza a lapjaimhoz és a gombokhoz' : 'Vissza a saját lapjaimhoz'}
        </button>
      )}

      <main className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="leading-tight">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Kassza</div>
              <div className="text-2xl font-black font-mono text-amber-400 tabular-nums">{fmt(totalPot)}</div>
            </div>
            <div className="text-right text-[11px] text-slate-400 leading-tight">
              #{gameState.handNumber}. leosztás
              <br />
              Vak {gameState.smallBlind}/{gameState.bigBlind}
            </div>
          </div>
          {gameState.pots.length > 1 && (
            <div className="mt-1 text-[11px] text-slate-300">
              Főkassza: {fmt(gameState.pots[0].amount)}
              {gameState.pots.slice(1).map((sp, i) => (
                <span key={i}> · Mellékkassza {i + 1}: {fmt(sp.amount)}</span>
              ))}
            </div>
          )}
        </div>

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

        {handRunning && actor && (
          <div className="rounded-full bg-amber-950/60 border border-amber-400/60 px-4 py-2 text-center text-sm font-bold text-amber-200">
            <span className="text-white">{actor.nickname}</span> lép ·{' '}
            <span className="font-mono tabular-nums text-amber-400">{remainingSec} mp</span>
          </div>
        )}

        {gameState.phase === 'HAND_COMPLETE' && gameState.winners && (
          <div className="rounded-2xl bg-slate-900 border border-amber-400 px-4 py-3 text-center">
            <div className="text-[10px] uppercase font-extrabold tracking-widest text-amber-400">Leosztás győztese</div>
            {gameState.winners.map((w, i) => (
              <div key={i} className="mt-1">
                <div className="text-base font-black text-white">
                  {w.nickname} nyert {fmt(w.amount)} zsetont!
                </div>
                {w.handDescr && <div className="text-xs text-emerald-400 font-medium">{w.handDescr}</div>}
              </div>
            ))}
            {onNextHand && (
              <button
                onClick={onNextHand}
                className="mt-3 w-full h-12 rounded-xl bg-amber-400 active:bg-amber-300 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Következő leosztás
              </button>
            )}
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {gameState.players.map((p, idx) => {
            const isActor = handRunning && actor?.id === p.id;
            return (
              <li
                key={p.id}
                className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 ${
                  isActor ? 'bg-amber-950/50 border-amber-400 ring-1 ring-amber-400/60' : 'bg-slate-900/70 border-slate-800'
                } ${p.folded ? 'opacity-45' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[15px] font-bold text-white truncate">
                      {p.nickname}
                      {p.id === myPlayerId ? ' (te)' : ''}
                    </span>
                    {badges[idx]?.map((b) => (
                      <span
                        key={b}
                        className={`inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[9px] font-black leading-none ${BADGE_STYLE[b]}`}
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                    <span className="text-slate-300">{fmt(p.chips)}</span>
                    {p.currentBet > 0 && <span className="font-bold text-amber-400">+{fmt(p.currentBet)}</span>}
                    {p.folded ? (
                      <span className="text-[10px] font-bold uppercase text-rose-400">Fold</span>
                    ) : p.allIn ? (
                      <span className="text-[10px] font-extrabold uppercase text-amber-300">All-in</span>
                    ) : !p.isConnected ? (
                      <span className="text-[10px] font-bold uppercase text-slate-500">Offline</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex -space-x-2 shrink-0">
                  {p.revealedCards?.length ? (
                    p.revealedCards.map((c, i) => (
                      <CardView
                        key={i}
                        card={c}
                        size="sm"
                        isWinningCard={gameState.winners?.some((w) => w.playerId === p.id)}
                      />
                    ))
                  ) : p.folded ? null : (
                    <>
                      <CardView faceDown size="sm" />
                      <CardView faceDown size="sm" />
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
};
