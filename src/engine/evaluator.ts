/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Card, HandCategory, HandEvaluation, Rank } from '../types/poker';

export const RANK_VALUES: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  'T': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A': 14,
};

export const RANK_NAMES_HU: Record<number, string> = {
  2: 'Kettesek',
  3: 'Hármasok',
  4: 'Négyesek',
  5: 'Ötösök',
  6: 'Hatosok',
  7: 'Hetesek',
  8: 'Nyolcasok',
  9: 'Kilencesek',
  10: 'Tízesek',
  11: 'Bubik',
  12: 'Dámák',
  13: 'Királyok',
  14: 'Ászok',
};

export const RANK_INSTRUMENTAL_HU: Record<number, string> = {
  2: 'Kettesekkel',
  3: 'Hármasokkal',
  4: 'Négyesekkel',
  5: 'Ötösökkel',
  6: 'Hatosokkal',
  7: 'Hetesekkel',
  8: 'Nyolcasokkal',
  9: 'Kilencesekkel',
  10: 'Tízesekkel',
  11: 'Bubikkal',
  12: 'Dámákkal',
  13: 'Királyokkal',
  14: 'Ászokkal',
};

export const RANK_SINGULAR_HU: Record<number, string> = {
  2: 'Kettes',
  3: 'Hármas',
  4: 'Négyes',
  5: 'Ötös',
  6: 'Hatos',
  7: 'Hetes',
  8: 'Nyolcas',
  9: 'Kilences',
  10: 'Tízes',
  11: 'Bubi',
  12: 'Dáma',
  13: 'Király',
  14: 'Ász',
};

const CATEGORY_SCORES: Record<HandCategory, number> = {
  HIGH_CARD: 100_000_000,
  ONE_PAIR: 200_000_000,
  TWO_PAIR: 300_000_000,
  THREE_OF_A_KIND: 400_000_000,
  STRAIGHT: 500_000_000,
  FLUSH: 600_000_000,
  FULL_HOUSE: 700_000_000,
  FOUR_OF_A_KIND: 800_000_000,
  STRAIGHT_FLUSH: 900_000_000,
  ROYAL_FLUSH: 1_000_000_000,
};

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...tail] = arr;
  const withHead = combinations(tail, k - 1).map((comb) => [head, ...comb]);
  const withoutHead = combinations(tail, k);
  return [...withHead, ...withoutHead];
}

export function evaluate5Cards(cards: Card[]): HandEvaluation {
  if (cards.length !== 5) {
    throw new Error('Pontosan 5 lap szükséges az alapértékeléshez.');
  }

  const sorted = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  const ranks = sorted.map((c) => RANK_VALUES[c.rank]);
  const suits = sorted.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);

  // Straight check (including Ace-low / Wheel: A-2-3-4-5)
  let isStraight = false;
  let straightHigh = 0;
  const uniqueRanks = Array.from(new Set(ranks));

  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      isStraight = true;
      straightHigh = uniqueRanks[0];
    } else if (
      uniqueRanks[0] === 14 &&
      uniqueRanks[1] === 5 &&
      uniqueRanks[2] === 4 &&
      uniqueRanks[3] === 3 &&
      uniqueRanks[4] === 2
    ) {
      isStraight = true;
      straightHigh = 5; // In wheel straight, 5 is high card
    }
  }

  // Count occurrences
  const countMap: Record<number, number> = {};
  for (const r of ranks) {
    countMap[r] = (countMap[r] || 0) + 1;
  }

  const counts = Object.entries(countMap)
    .map(([rankStr, count]) => ({ rank: Number(rankStr), count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  // 1. Royal Flush
  if (isStraight && isFlush && straightHigh === 14) {
    return {
      category: 'ROYAL_FLUSH',
      score: CATEGORY_SCORES.ROYAL_FLUSH,
      descr: 'Royal Flush (Ász-magas színsor)',
    };
  }

  // 2. Straight Flush
  if (isStraight && isFlush) {
    return {
      category: 'STRAIGHT_FLUSH',
      score: CATEGORY_SCORES.STRAIGHT_FLUSH + straightHigh,
      descr: `Színsor (${RANK_SINGULAR_HU[straightHigh]} magas)`,
    };
  }

  // 3. Four of a Kind (Póker)
  if (counts[0].count === 4) {
    const quadRank = counts[0].rank;
    const kicker = counts[1].rank;
    return {
      category: 'FOUR_OF_A_KIND',
      score: CATEGORY_SCORES.FOUR_OF_A_KIND + quadRank * 100 + kicker,
      descr: `Póker (${RANK_NAMES_HU[quadRank]})`,
    };
  }

  // 4. Full House
  if (counts[0].count === 3 && counts[1].count === 2) {
    const tripRank = counts[0].rank;
    const pairRank = counts[1].rank;
    return {
      category: 'FULL_HOUSE',
      score: CATEGORY_SCORES.FULL_HOUSE + tripRank * 100 + pairRank,
      descr: `Full House (${RANK_NAMES_HU[tripRank]} ${RANK_INSTRUMENTAL_HU[pairRank]})`,
    };
  }

  // 5. Flush
  if (isFlush) {
    const kickerScore = ranks.reduce((sum, r, idx) => sum + r * Math.pow(15, 4 - idx), 0);
    return {
      category: 'FLUSH',
      score: CATEGORY_SCORES.FLUSH + kickerScore,
      descr: `Flöss (${RANK_SINGULAR_HU[ranks[0]]} magas)`,
    };
  }

  // 6. Straight
  if (isStraight) {
    return {
      category: 'STRAIGHT',
      score: CATEGORY_SCORES.STRAIGHT + straightHigh,
      descr: `Sor (${RANK_SINGULAR_HU[straightHigh]} magas)`,
    };
  }

  // 7. Three of a Kind (Drill)
  if (counts[0].count === 3) {
    const tripRank = counts[0].rank;
    const kickers = counts.slice(1).reduce((sum, entry, idx) => sum + entry.rank * Math.pow(15, 1 - idx), 0);
    return {
      category: 'THREE_OF_A_KIND',
      score: CATEGORY_SCORES.THREE_OF_A_KIND + tripRank * 1000 + kickers,
      descr: `Drill (${RANK_NAMES_HU[tripRank]})`,
    };
  }

  // 8. Two Pair (Két pár)
  if (counts[0].count === 2 && counts[1].count === 2) {
    const highPair = counts[0].rank;
    const lowPair = counts[1].rank;
    const kicker = counts[2].rank;
    return {
      category: 'TWO_PAIR',
      score: CATEGORY_SCORES.TWO_PAIR + highPair * 15 * 15 + lowPair * 15 + kicker,
      descr: `Két pár (${RANK_NAMES_HU[highPair]} és ${RANK_NAMES_HU[lowPair]})`,
    };
  }

  // 9. One Pair (Egy pár)
  if (counts[0].count === 2) {
    const pairRank = counts[0].rank;
    const kickers = counts.slice(1).reduce((sum, entry, idx) => sum + entry.rank * Math.pow(15, 2 - idx), 0);
    return {
      category: 'ONE_PAIR',
      score: CATEGORY_SCORES.ONE_PAIR + pairRank * 5000 + kickers,
      descr: `Egy pár (${RANK_NAMES_HU[pairRank]})`,
    };
  }

  // 10. High Card (Magas lap)
  const kickerScore = ranks.reduce((sum, r, idx) => sum + r * Math.pow(15, 4 - idx), 0);
  return {
    category: 'HIGH_CARD',
    score: CATEGORY_SCORES.HIGH_CARD + kickerScore,
    descr: `Magas lap (${RANK_SINGULAR_HU[ranks[0]]})`,
  };
}

export function evaluate7Cards(cards: Card[]): HandEvaluation {
  if (cards.length < 5) {
    throw new Error('A kiértékeléshez legalább 5 lap szükséges.');
  }

  // If exactly 5 cards, evaluate directly
  if (cards.length === 5) {
    return evaluate5Cards(cards);
  }

  // If 6 or 7 cards, find the best combination of 5
  const allCombinations = combinations(cards, 5);
  let bestEval: HandEvaluation | null = null;

  for (const combo of allCombinations) {
    const cur = evaluate5Cards(combo);
    if (!bestEval || cur.score > bestEval.score) {
      bestEval = cur;
    }
  }

  if (!bestEval) {
    throw new Error('Sikertelen lapkiértékelés.');
  }

  return bestEval;
}
