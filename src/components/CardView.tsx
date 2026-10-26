/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Card, Rank, Suit } from '../types/poker';
import { EyeOff } from 'lucide-react';

interface CardViewProps {
  card?: Card;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isCardHidden?: boolean;
  className?: string;
  isWinningCard?: boolean;
  onClick?: () => void;
}

const SUIT_SYMBOLS: Record<Suit, { char: string; color: string; bgBadge: string; name: string }> = {
  s: { char: '♠', color: 'text-slate-900', bgBadge: 'bg-slate-100', name: 'Pikk' },
  h: { char: '♥', color: 'text-rose-600', bgBadge: 'bg-rose-50', name: 'Kőr' },
  d: { char: '♦', color: 'text-blue-600', bgBadge: 'bg-blue-50', name: 'Káró' },
  c: { char: '♣', color: 'text-emerald-700', bgBadge: 'bg-emerald-50', name: 'Treff' },
};

const RANK_LABELS: Record<Rank, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', 'T': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
};

export const CardView: React.FC<CardViewProps> = ({
  card,
  faceDown = false,
  size = 'md',
  isCardHidden = false,
  className = '',
  isWinningCard = false,
  onClick,
}) => {
  const sizeClasses = {
    sm: 'w-10 h-14 text-xs rounded-md shadow-sm',
    md: 'w-14 h-20 text-sm rounded-lg shadow-md',
    lg: 'w-20 h-28 text-base rounded-xl shadow-lg',
    xl: 'w-24 h-36 text-lg rounded-2xl shadow-xl',
  }[size];

  if (faceDown || !card) {
    return (
      <div
        onClick={onClick}
        className={`relative ${sizeClasses} bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 border-2 border-indigo-400/30 flex items-center justify-center overflow-hidden transition-transform ${className}`}
      >
        {/* Ornate Card Back Pattern */}
        <div className="absolute inset-1 rounded border border-indigo-400/20 bg-[radial-gradient(#818cf8_1px,transparent_1px)] [background-size:6px_6px] opacity-40" />
        <div className="w-6 h-6 rounded-full border border-indigo-300/30 flex items-center justify-center bg-indigo-950/80 z-10">
          <span className="text-[10px] font-bold text-indigo-300">♠</span>
        </div>
      </div>
    );
  }

  const suitInfo = SUIT_SYMBOLS[card.suit];
  const rankLabel = RANK_LABELS[card.rank];

  return (
    <div
      onClick={onClick}
      className={`relative ${sizeClasses} bg-white border ${
        isWinningCard ? 'border-amber-400 ring-2 ring-amber-400/80 shadow-amber-400/30' : 'border-slate-300'
      } flex flex-col justify-between p-1.5 select-none transition-transform hover:-translate-y-0.5 cursor-pointer ${className}`}
    >
      {/* Top Left Rank + Suit */}
      <div className="flex flex-col items-center leading-none">
        <span className={`font-bold font-mono ${suitInfo.color}`}>{rankLabel}</span>
        <span className={`text-[11px] ${suitInfo.color}`}>{suitInfo.char}</span>
      </div>

      {/* Center Suit Symbol */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={`text-2xl font-bold opacity-85 ${suitInfo.color}`}>{suitInfo.char}</span>
      </div>

      {/* Bottom Right Rank + Suit (rotated) */}
      <div className="flex flex-col items-center leading-none rotate-180 self-end">
        <span className={`font-bold font-mono ${suitInfo.color}`}>{rankLabel}</span>
        <span className={`text-[11px] ${suitInfo.color}`}>{suitInfo.char}</span>
      </div>

      {/* Privacy Peek Overlay for private cards (Active when isCardHidden === true) */}
      {isCardHidden && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md rounded-xl border border-slate-700/80 flex flex-col items-center justify-center text-slate-300 p-1.5 shadow-inner">
          <EyeOff className="w-5 h-5 text-amber-400 mb-1 animate-pulse" />
          <span className="text-[9px] text-center font-bold uppercase tracking-wider text-slate-300 leading-tight">
            Kattints a felfedéshez
          </span>
        </div>
      )}
    </div>
  );
};
