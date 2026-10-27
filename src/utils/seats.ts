/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SeatBadge = 'D' | 'SB' | 'BB';

/**
 * Melyik ülésnél van a dealer-gomb és a két vak. A motorral egyezően:
 * heads-up (2 fő) esetén a dealer a kisvak, a másik játékos a nagyvak;
 * 3+ főnél a dealer után következő a kisvak, utána a nagyvak.
 * A visszaadott kulcs a játékos indexe a `gameState.players` listában.
 */
export function getSeatBadges(playerCount: number, dealerIndex: number): Record<number, SeatBadge[]> {
  if (playerCount < 2) return {};
  const d = ((dealerIndex % playerCount) + playerCount) % playerCount;
  if (playerCount === 2) {
    return { [d]: ['D', 'SB'], [(d + 1) % 2]: ['BB'] };
  }
  return {
    [d]: ['D'],
    [(d + 1) % playerCount]: ['SB'],
    [(d + 2) % playerCount]: ['BB'],
  };
}

const PHASE_LABELS: Record<string, string> = {
  WAITING: 'VÁRAKOZÁS',
  PRE_FLOP: 'PREFLOP',
  FLOP: 'FLOP',
  TURN: 'TURN',
  RIVER: 'RIVER',
  SHOWDOWN: 'SHOWDOWN',
  HAND_COMPLETE: 'LEOSZTÁS VÉGE',
};

/** A játékfázis magyar, kijelzőre szánt neve. */
export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase.replace('_', ' ');
}
