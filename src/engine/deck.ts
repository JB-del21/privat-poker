/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card, Rank, Suit } from '../types/poker';

export const ALL_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const ALL_SUITS: Suit[] = ['c', 'd', 'h', 's'];

/**
 * Creates a brand new standard 52-card deck without jokers
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ALL_SUITS) {
    for (const rank of ALL_RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Secure Fisher-Yates shuffle
 * If a custom RNG is provided (e.g. for deterministic unit testing), it will use it.
 */
export function shuffleDeck(deck: Card[], rng?: () => number): Card[] {
  const shuffled = [...deck];
  const getRandom = rng || (() => {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0] / (0xffffffff + 1);
    }
    return Math.random();
  });

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(getRandom() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  return shuffled;
}

/**
 * Verifies that a deck has exactly 52 unique valid cards
 */
export function validateDeck(deck: Card[]): boolean {
  if (deck.length !== 52) return false;
  const set = new Set<string>();
  for (const card of deck) {
    if (!ALL_RANKS.includes(card.rank) || !ALL_SUITS.includes(card.suit)) {
      return false;
    }
    const key = `${card.rank}${card.suit}`;
    if (set.has(key)) return false;
    set.add(key);
  }
  return true;
}
