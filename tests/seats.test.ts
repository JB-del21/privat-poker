/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { PokerEngine } from '../src/engine/pokerEngine';
import { getSeatBadges } from '../src/utils/seats';

describe('Ülés-jelvények (D / SB / BB)', () => {
  it('Heads-up: a dealer a kisvak is, a másik játékos a nagyvak', () => {
    expect(getSeatBadges(2, 0)).toEqual({ 0: ['D', 'SB'], 1: ['BB'] });
    expect(getSeatBadges(2, 1)).toEqual({ 1: ['D', 'SB'], 0: ['BB'] });
  });

  it('3+ főnél a dealer után jön a kisvak, majd a nagyvak, körbeérve is', () => {
    expect(getSeatBadges(3, 0)).toEqual({ 0: ['D'], 1: ['SB'], 2: ['BB'] });
    expect(getSeatBadges(3, 2)).toEqual({ 2: ['D'], 0: ['SB'], 1: ['BB'] });
    expect(getSeatBadges(6, 5)).toEqual({ 5: ['D'], 0: ['SB'], 1: ['BB'] });
  });

  it('Egyezik a motor tényleges vak-fizetésével (2–6 fő, minden dealer-pozíció)', () => {
    for (let n = 2; n <= 6; n++) {
      for (let dealer = 0; dealer < n; dealer++) {
        const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `P${i}`, chips: 1000 }));
        const state = PokerEngine.startHand(players, dealer, 50, 100);
        const badges = getSeatBadges(n, dealer);
        const sbIdx = Number(Object.keys(badges).find((k) => badges[Number(k)].includes('SB')));
        const bbIdx = Number(Object.keys(badges).find((k) => badges[Number(k)].includes('BB')));
        expect(state.players[sbIdx].currentBet).toBe(50);
        expect(state.players[bbIdx].currentBet).toBe(100);
      }
    }
  });
});

describe('Fázisnevek', () => {
  it('Minden játékfázishoz van magyar felirat', async () => {
    const { phaseLabel } = await import('../src/utils/seats');
    expect(phaseLabel('HAND_COMPLETE')).toBe('LEOSZTÁS VÉGE');
    expect(phaseLabel('PRE_FLOP')).toBe('PREFLOP');
    expect(phaseLabel('FLOP')).toBe('FLOP');
  });
});
