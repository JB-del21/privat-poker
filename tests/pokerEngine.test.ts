/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createDeck, shuffleDeck, validateDeck } from '../src/engine/deck';
import { evaluate5Cards, evaluate7Cards } from '../src/engine/evaluator';
import { PokerEngine } from '../src/engine/pokerEngine';
import { calculatePots } from '../src/engine/pot';
import { Card, PlayerState } from '../src/types/poker';

describe('1. Kéz-kiértékelő (Hand Evaluator)', () => {
  it('Felismeri a Royal Flush-t és magasabb pontszámot ad, mint a színhármasra', () => {
    const royal: Card[] = [
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 's' },
      { rank: 'Q', suit: 's' },
      { rank: 'J', suit: 's' },
      { rank: 'T', suit: 's' },
      { rank: '2', suit: 'd' },
      { rank: '4', suit: 'h' },
    ];
    const trips: Card[] = [
      { rank: 'A', suit: 'h' },
      { rank: 'A', suit: 'c' },
      { rank: 'A', suit: 'd' },
      { rank: 'K', suit: 'c' },
      { rank: 'Q', suit: 's' },
      { rank: '2', suit: 'd' },
      { rank: '4', suit: 'h' },
    ];

    const royalEval = evaluate7Cards(royal);
    const tripsEval = evaluate7Cards(trips);

    expect(royalEval.category).toBe('ROYAL_FLUSH');
    expect(tripsEval.category).toBe('THREE_OF_A_KIND');
    expect(royalEval.score).toBeGreaterThan(tripsEval.score);
  });

  it('Helyesen kezeli a Wheel sort (A-2-3-4-5) 5-ös magas sorként', () => {
    const wheel: Card[] = [
      { rank: 'A', suit: 'h' },
      { rank: '2', suit: 'c' },
      { rank: '3', suit: 'd' },
      { rank: '4', suit: 's' },
      { rank: '5', suit: 'h' },
      { rank: '9', suit: 'c' },
      { rank: 'K', suit: 's' },
    ];
    const res = evaluate7Cards(wheel);
    expect(res.category).toBe('STRAIGHT');
    expect(res.descr).toContain('Ötös');
  });

  it('Két egyforma pár esetén a magasabb kísérő (kicker) dönt', () => {
    const pairKickerKing: Card[] = [
      { rank: 'A', suit: 's' },
      { rank: 'A', suit: 'd' },
      { rank: 'K', suit: 'c' },
      { rank: '8', suit: 'h' },
      { rank: '3', suit: 's' },
      { rank: '2', suit: 'd' },
      { rank: '4', suit: 'c' },
    ];
    const pairKickerQueen: Card[] = [
      { rank: 'A', suit: 'h' },
      { rank: 'A', suit: 'c' },
      { rank: 'Q', suit: 'c' },
      { rank: '8', suit: 'h' },
      { rank: '3', suit: 's' },
      { rank: '2', suit: 'd' },
      { rank: '4', suit: 'c' },
    ];

    const evalKing = evaluate7Cards(pairKickerKing);
    const evalQueen = evaluate7Cards(pairKickerQueen);

    expect(evalKing.category).toBe('ONE_PAIR');
    expect(evalQueen.category).toBe('ONE_PAIR');
    expect(evalKing.score).toBeGreaterThan(evalQueen.score);
  });
});

describe('2. Pakli és véletlenszám-kezelés', () => {
  it('A pakli pontosan 52 egyedi érvényes lapból áll', () => {
    const deck = createDeck();
    expect(deck.length).toBe(52);
    expect(validateDeck(deck)).toBe(true);
  });

  it('A keverés megőrzi az összes lapot és duplikációmentes marad', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled.length).toBe(52);
    expect(validateDeck(shuffled)).toBe(true);
  });
});

describe('3. Kassza és Side-pot kalkuláció', () => {
  it('Különböző stack méretű all-in játékosok esetén pontos fő- és mellékkasszát számol', () => {
    // 3 játékos:
    // P1: 100 All-in
    // P2: 250 All-in
    // P3: 400 Call/Bet
    const players: PlayerState[] = [
      {
        id: 'p1',
        nickname: 'Alice',
        chips: 0,
        currentBet: 100,
        totalHandBet: 100,
        holeCards: [],
        folded: false,
        allIn: true,
        hasActedThisRound: true,
        isConnected: true,
      },
      {
        id: 'p2',
        nickname: 'Bob',
        chips: 0,
        currentBet: 250,
        totalHandBet: 250,
        holeCards: [],
        folded: false,
        allIn: true,
        hasActedThisRound: true,
        isConnected: true,
      },
      {
        id: 'p3',
        nickname: 'Charlie',
        chips: 500,
        currentBet: 250,
        totalHandBet: 250,
        holeCards: [],
        folded: false,
        allIn: false,
        hasActedThisRound: true,
        isConnected: true,
      },
    ];

    const pots = calculatePots(players);

    // Várt eredmény:
    // Főkassza: 100 * 3 = 300 (Alice, Bob, Charlie jogosult)
    // Side pot: (250 - 100) * 2 = 300 (Bob, Charlie jogosult)
    expect(pots.length).toBe(2);
    expect(pots[0].amount).toBe(300);
    expect(pots[0].eligiblePlayerIds).toEqual(['p1', 'p2', 'p3']);

    expect(pots[1].amount).toBe(300);
    expect(pots[1].eligiblePlayerIds).toEqual(['p2', 'p3']);
  });
});

describe('4. PokerEngine játékállapot-gép és leosztás-menet', () => {
  it('Heads-up pozíciók: a dealer a kisvak és ő lép először preflop', () => {
    const players = [
      { id: 'p1', nickname: 'Alice', chips: 1000 },
      { id: 'p2', nickname: 'Bob', chips: 1000 },
    ];

    const state = PokerEngine.startHand(players, 0, 50, 100);

    // Alice is dealerIndex 0 -> Small Blind: 50
    expect(state.players[0].chips).toBe(950);
    expect(state.players[0].currentBet).toBe(50);

    // Bob is dealerIndex 1 -> Big Blind: 100
    expect(state.players[1].chips).toBe(900);
    expect(state.players[1].currentBet).toBe(100);

    // In Heads-Up, Dealer (SB) acts first preflop!
    expect(state.currentActionIndex).toBe(0);
  });

  it('Mindenki dobása esetén az utolsó játékos azonnal megnyeri a kasszát', () => {
    const players = [
      { id: 'p1', nickname: 'Alice', chips: 1000 },
      { id: 'p2', nickname: 'Bob', chips: 1000 },
    ];

    let state = PokerEngine.startHand(players, 0, 50, 100);
    // Alice folds
    state = PokerEngine.applyAction(state, { playerId: 'p1', type: 'FOLD' });

    expect(state.phase).toBe('HAND_COMPLETE');
    expect(state.winners?.[0].playerId).toBe('p2');
    expect(state.players[1].chips).toBe(1050); // 900 remaining + 150 pot
  });

  it('Teljes leosztás végigjátszása all-in esetén automata közös lapokkal és showdownnal', () => {
    // Custom deck:
    // Bob (p2): [Qh, Qd]
    // Alice (p1): [As, Ks]
    // Board: [Ts, Js, Qs, 2c, 3h] -> Alice has Royal Flush!
    const customDeck: Card[] = [
      { rank: '3', suit: 'h' },
      { rank: '2', suit: 'c' },
      { rank: 'Q', suit: 's' },
      { rank: 'J', suit: 's' },
      { rank: 'T', suit: 's' },
      { rank: 'Q', suit: 'd' }, // Bob card 2
      { rank: 'K', suit: 's' }, // Alice card 2
      { rank: 'Q', suit: 'h' }, // Bob card 1
      { rank: 'A', suit: 's' }, // Alice card 1
    ];

    const players = [
      { id: 'p1', nickname: 'Alice', chips: 500 },
      { id: 'p2', nickname: 'Bob', chips: 500 },
    ];

    let state = PokerEngine.startHand(players, 0, 50, 100, 30, customDeck);

    // Alice (SB) raises all-in to 500
    state = PokerEngine.applyAction(state, { playerId: 'p1', type: 'RAISE', amount: 500 });
    // Bob (BB) calls with remaining 400 chips (all-in)
    state = PokerEngine.applyAction(state, { playerId: 'p2', type: 'CALL' });

    // Since both players are all-in, the engine runs out the board automatically and reaches HAND_COMPLETE
    expect(state.phase).toBe('HAND_COMPLETE');
    expect(state.communityCards.length).toBe(5);
    expect(state.winners?.length).toBe(1);
    expect(state.winners?.[0].playerId).toBe('p1');
    expect(state.winners?.[0].handDescr).toContain('Royal Flush');
    expect(state.players[0].chips).toBe(1000);
    expect(state.players[1].chips).toBe(0);
  });

  it('A nyilvános nézet (getPublicView) szigorúan elrejti a többi játékos zárt lapjait', () => {
    const players = [
      { id: 'p1', nickname: 'Alice', chips: 1000 },
      { id: 'p2', nickname: 'Bob', chips: 1000 },
    ];
    const state = PokerEngine.startHand(players, 0, 50, 100);

    // Alice requests her view:
    const aliceView = PokerEngine.getPublicView(state, 'p1');
    expect(aliceView.myHoleCards?.length).toBe(2);
    // Alice should NOT see Bob's hole cards in players array:
    expect(aliceView.players.find((p) => p.id === 'p2')?.revealedCards).toBeUndefined();

    // Spectator requests view:
    const spectatorView = PokerEngine.getPublicView(state);
    expect(spectatorView.myHoleCards).toBeUndefined();
    expect(spectatorView.players[0].revealedCards).toBeUndefined();
    expect(spectatorView.players[1].revealedCards).toBeUndefined();
  });

  it('Patt megelőzése: ha a vakok mindkét játékost all-inbe viszik, azonnal lefut a showdownig', () => {
    // Both players have stack <= blinds (e.g. Alice has 40 chips, Bob has 80 chips; SB=50, BB=100)
    const microStackPlayers = [
      { id: 'p1', nickname: 'Alice', chips: 40 },
      { id: 'p2', nickname: 'Bob', chips: 80 },
    ];

    const state = PokerEngine.startHand(microStackPlayers, 0, 50, 100);

    // Both players are all-in from blinds; the hand must immediately complete and deal 5 cards
    expect(state.phase).toBe('HAND_COMPLETE');
    expect(state.communityCards.length).toBe(5);
    expect(state.winners).toBeDefined();
    expect(state.winners!.length).toBeGreaterThan(0);
    // Total chips in room must be exactly preserved: 40 + 80 = 120
    const totalChips = state.players.reduce((sum, p) => sum + p.chips, 0);
    expect(totalChips).toBe(120);
  });

  it('River fold esetén a győztes lapjai rejtve maradnak (a blöff nem lepleződik le)', () => {
    const players = [
      { id: 'p1', nickname: 'Alice', chips: 2000 },
      { id: 'p2', nickname: 'Bob', chips: 2000 },
    ];

    let state = PokerEngine.startHand(players, 0, 50, 100);

    // Pre-flop: Alice calls 50 (to 100), Bob checks
    state = PokerEngine.applyAction(state, { playerId: 'p1', type: 'CALL' });
    state = PokerEngine.applyAction(state, { playerId: 'p2', type: 'CHECK' });
    expect(state.phase).toBe('FLOP');

    // Flop: Bob checks, Alice checks
    state = PokerEngine.applyAction(state, { playerId: 'p2', type: 'CHECK' });
    state = PokerEngine.applyAction(state, { playerId: 'p1', type: 'CHECK' });
    expect(state.phase).toBe('TURN');

    // Turn: Bob checks, Alice checks
    state = PokerEngine.applyAction(state, { playerId: 'p2', type: 'CHECK' });
    state = PokerEngine.applyAction(state, { playerId: 'p1', type: 'CHECK' });
    expect(state.phase).toBe('RIVER');
    expect(state.communityCards.length).toBe(5);

    // River: Bob checks, Alice bets 300, Bob folds!
    state = PokerEngine.applyAction(state, { playerId: 'p2', type: 'CHECK' });
    state = PokerEngine.applyAction(state, { playerId: 'p1', type: 'BET', amount: 300 });
    state = PokerEngine.applyAction(state, { playerId: 'p2', type: 'FOLD' });

    expect(state.phase).toBe('HAND_COMPLETE');
    expect(state.winners?.[0].playerId).toBe('p1');
    expect(state.winners?.[0].handDescr).toBe('Minden ellenfél dobott');

    // Now test public view: Bob or Spectator must NOT see Alice's cards!
    const bobView = PokerEngine.getPublicView(state, 'p2');
    const aliceInBobView = bobView.players.find((p) => p.id === 'p1');
    expect(aliceInBobView?.revealedCards).toBeUndefined();

    const spectatorView = PokerEngine.getPublicView(state);
    const aliceInSpectatorView = spectatorView.players.find((p) => p.id === 'p1');
    expect(aliceInSpectatorView?.revealedCards).toBeUndefined();
  });

  it('Törtösszegű emelést szigorúan elutasít a motor', () => {
    const players = [
      { id: 'p1', nickname: 'Alice', chips: 1000 },
      { id: 'p2', nickname: 'Bob', chips: 1000 },
    ];

    const state = PokerEngine.startHand(players, 0, 50, 100);

    expect(() => {
      PokerEngine.applyAction(state, {
        playerId: 'p1',
        type: 'RAISE',
        amount: 250.5,
      });
    }).toThrow('Érvénytelen összeg: a tétnek pozitív egész számnak kell lennie.');
  });
});

