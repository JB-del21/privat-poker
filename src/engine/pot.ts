/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PlayerState, Pot } from '../types/poker';

/**
 * Calculates main pot and all necessary side pots based on player contributions and fold status.
 * Handles excess/uncalled bets gracefully.
 */
export function calculatePots(players: PlayerState[]): Pot[] {
  const contributors = players.filter((p) => p.totalHandBet > 0);
  if (contributors.length === 0) {
    return [];
  }

  // Get all unique positive bet levels in ascending order
  const distinctLevels = Array.from(new Set(contributors.map((p) => p.totalHandBet))).sort((a, b) => a - b);

  const pots: Pot[] = [];
  let prevLevel = 0;

  for (const level of distinctLevels) {
    const tierContribution = level - prevLevel;
    let tierAmount = 0;
    const eligible: string[] = [];

    for (const p of contributors) {
      if (p.totalHandBet > prevLevel) {
        // Player contributes min(tierContribution, p.totalHandBet - prevLevel)
        const contributedInThisTier = Math.min(tierContribution, p.totalHandBet - prevLevel);
        tierAmount += contributedInThisTier;

        // Player is eligible to win this pot if they have not folded and put in at least this level
        if (!p.folded && p.totalHandBet >= level) {
          eligible.push(p.id);
        }
      }
    }

    if (tierAmount > 0) {
      // If no one is eligible (everyone at this level folded), assign to remaining non-folded players who contributed
      const effectiveEligible = eligible.length > 0 ? eligible : contributors.filter((p) => !p.folded).map((p) => p.id);

      // Check if we can merge with previous pot if eligibility is identical
      if (
        pots.length > 0 &&
        pots[pots.length - 1].eligiblePlayerIds.length === effectiveEligible.length &&
        pots[pots.length - 1].eligiblePlayerIds.every((id) => effectiveEligible.includes(id))
      ) {
        pots[pots.length - 1].amount += tierAmount;
      } else {
        pots.push({
          amount: tierAmount,
          eligiblePlayerIds: effectiveEligible,
        });
      }
    }

    prevLevel = level;
  }

  return pots;
}
