/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Card,
  GamePhase,
  GameState,
  PlayerAction,
  PlayerState,
  PublicGameState,
  PublicPlayerView,
  WinnerResult,
} from '../types/poker';
import { createDeck, shuffleDeck } from './deck';
import { evaluate7Cards } from './evaluator';
import { calculatePots } from './pot';

export class PokerEngine {
  /**
   * Initializes a brand new Texas Hold'em hand
   */
  public static startHand(
    players: { id: string; nickname: string; chips: number; isConnected?: boolean; sessionToken?: string }[],
    dealerIndex: number,
    smallBlind: number,
    bigBlind: number,
    turnTimeLimitSec: number = 30,
    customDeck?: Card[]
  ): GameState {
    if (players.length < 2 || players.length > 6) {
      throw new Error('A játékosok száma 2 és 6 között kell legyen.');
    }

    // Filter players who have chips > 0
    const activePlayers = players.filter((p) => p.chips > 0);
    if (activePlayers.length < 2) {
      throw new Error('Legalább 2 zsetonnal rendelkező játékos szükséges.');
    }

    const deck = customDeck ? [...customDeck] : shuffleDeck(createDeck());
    const isHeadsUp = activePlayers.length === 2;

    const playerStates: PlayerState[] = activePlayers.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      chips: p.chips,
      currentBet: 0,
      totalHandBet: 0,
      holeCards: [],
      folded: false,
      allIn: false,
      hasActedThisRound: false,
      isConnected: p.isConnected ?? true,
      sessionToken: p.sessionToken,
    }));

    // Deal 2 hole cards to each player (one at a time in clockwise order)
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < playerStates.length; i++) {
        const card = deck.pop();
        if (!card) throw new Error('Elfogyott a pakli lapja osztás közben.');
        playerStates[i].holeCards.push(card);
      }
    }

    // Determine blind positions
    // Heads-up: Dealer is Small Blind. Other player is Big Blind.
    // 3-6 players: Dealer + 1 is Small Blind, Dealer + 2 is Big Blind.
    const sbIndex = isHeadsUp ? dealerIndex % playerStates.length : (dealerIndex + 1) % playerStates.length;
    const bbIndex = (sbIndex + 1) % playerStates.length;

    // Deduct Small Blind
    const sbPlayer = playerStates[sbIndex];
    const actualSb = Math.min(sbPlayer.chips, smallBlind);
    sbPlayer.chips -= actualSb;
    sbPlayer.currentBet = actualSb;
    sbPlayer.totalHandBet = actualSb;
    if (sbPlayer.chips === 0) sbPlayer.allIn = true;

    // Deduct Big Blind
    const bbPlayer = playerStates[bbIndex];
    const actualBb = Math.min(bbPlayer.chips, bigBlind);
    bbPlayer.chips -= actualBb;
    bbPlayer.currentBet = actualBb;
    bbPlayer.totalHandBet = actualBb;
    if (bbPlayer.chips === 0) bbPlayer.allIn = true;

    // First action preflop:
    // Heads-up: SB (Dealer) acts first preflop
    // 3-6 players: UTG (after Big Blind) acts first preflop
    const firstActor = isHeadsUp ? sbIndex : (bbIndex + 1) % playerStates.length;

    const state: GameState = {
      roomCode: '',
      hostPlayerId: playerStates[0].id,
      phase: 'PRE_FLOP',
      players: playerStates,
      communityCards: [],
      deck,
      dealerIndex: dealerIndex % playerStates.length,
      smallBlind,
      bigBlind,
      currentActionIndex: firstActor,
      highestBet: Math.max(actualSb, actualBb),
      minRaise: bigBlind,
      lastRaiseAmount: bigBlind,
      pots: calculatePots(playerStates),
      stateVersion: 1,
      handNumber: 1,
      turnStartedAt: Date.now(),
      turnTimeLimitSec,
    };

    // Check if blinds put all or all-but-one players all-in with bets settled
    const playersWithChips = state.players.filter((p) => !p.allIn);
    if (
      playersWithChips.length === 0 ||
      (playersWithChips.length === 1 && playersWithChips[0].currentBet >= state.highestBet)
    ) {
      while (state.communityCards.length < 5) {
        const nextCard = state.deck.pop();
        if (nextCard) state.communityCards.push(nextCard);
      }
      return this.resolveShowdown(state);
    }

    // If first actor is all-in from blind, find next actor
    if (state.players[state.currentActionIndex].allIn) {
      state.currentActionIndex = this.getNextActionIndex(state, state.currentActionIndex);
    }

    return state;
  }

  /**
   * Applies a player action with strict validation and transitions game state
   */
  public static applyAction(currentState: GameState, action: PlayerAction): GameState {
    const state: GameState = JSON.parse(JSON.stringify(currentState));

    if (state.phase === 'SHOWDOWN' || state.phase === 'HAND_COMPLETE') {
      throw new Error('A leosztás már befejeződött.');
    }

    const activePlayer = state.players[state.currentActionIndex];
    if (!activePlayer) {
      throw new Error('Nincs aktív játékos.');
    }

    if (activePlayer.id !== action.playerId) {
      throw new Error(`Nem a(z) ${action.playerId} játékos köre van.`);
    }

    if (activePlayer.folded || activePlayer.allIn) {
      throw new Error('A játékos már nem tehet lépést ebben a leosztásban.');
    }

    const callDifference = state.highestBet - activePlayer.currentBet;

    switch (action.type) {
      case 'FOLD': {
        activePlayer.folded = true;
        activePlayer.hasActedThisRound = true;
        break;
      }

      case 'CHECK': {
        if (callDifference > 0) {
          throw new Error('Nem lehet check-elni, ha van aktív tét/emelés a körben.');
        }
        activePlayer.hasActedThisRound = true;
        break;
      }

      case 'CALL': {
        const payAmount = Math.min(activePlayer.chips, callDifference);
        activePlayer.chips -= payAmount;
        activePlayer.currentBet += payAmount;
        activePlayer.totalHandBet += payAmount;
        if (activePlayer.chips === 0) {
          activePlayer.allIn = true;
        }
        activePlayer.hasActedThisRound = true;
        break;
      }

      case 'BET':
      case 'RAISE': {
        if (typeof action.amount !== 'number' || !Number.isInteger(action.amount) || action.amount <= 0) {
          throw new Error('Érvénytelen összeg: a tétnek pozitív egész számnak kell lennie.');
        }

        const targetBet = action.amount;
        if (targetBet <= state.highestBet) {
          throw new Error('Az emelésnek meg kell haladnia az aktuális legmagasabb tétet.');
        }

        const addedChips = targetBet - activePlayer.currentBet;
        if (addedChips > activePlayer.chips) {
          throw new Error('Nincs elegendő zseton az emeléshez.');
        }

        const raiseDifference = targetBet - state.highestBet;
        const isAllIn = addedChips === activePlayer.chips;

        // If not all-in, must satisfy minimum raise rule
        if (!isAllIn && raiseDifference < state.minRaise) {
          throw new Error(`Minimális emelés összege: ${state.highestBet + state.minRaise}`);
        }

        activePlayer.chips -= addedChips;
        activePlayer.currentBet = targetBet;
        activePlayer.totalHandBet += addedChips;
        if (isAllIn) {
          activePlayer.allIn = true;
        }

        // A full raise re-opens the betting round
        if (raiseDifference >= state.minRaise) {
          state.minRaise = raiseDifference;
          state.lastRaiseAmount = raiseDifference;
          for (const p of state.players) {
            if (!p.folded && !p.allIn) {
              p.hasActedThisRound = false;
            }
          }
        }

        state.highestBet = targetBet;
        activePlayer.hasActedThisRound = true;
        break;
      }

      default:
        throw new Error(`Ismeretlen akciótípus: ${(action as { type: string }).type}`);
    }

    state.pots = calculatePots(state.players);
    state.stateVersion += 1;
    state.turnStartedAt = Date.now();

    // Check if only 1 player remains uncontested
    const nonFolded = state.players.filter((p) => !p.folded);
    if (nonFolded.length === 1) {
      return this.awardUncontestedPot(state, nonFolded[0]);
    }

    // Check if current betting round is finished
    if (this.isBettingRoundComplete(state)) {
      return this.advanceStreet(state);
    } else {
      state.currentActionIndex = this.getNextActionIndex(state, state.currentActionIndex);
      return state;
    }
  }

  /**
   * Evaluates whether all eligible players have contributed equally and had a chance to act
   */
  public static isBettingRoundComplete(state: GameState): boolean {
    const activeContenders = state.players.filter((p) => !p.folded && !p.allIn);

    // If zero or one contender is left with chips, check if any remaining active player matched the highest bet
    if (activeContenders.length <= 1) {
      return activeContenders.every((p) => p.currentBet === state.highestBet && p.hasActedThisRound);
    }

    return activeContenders.every((p) => p.hasActedThisRound && p.currentBet === state.highestBet);
  }

  /**
   * Advances the game to the next street (Flop, Turn, River, Showdown)
   */
  public static advanceStreet(state: GameState): GameState {
    // Reset round bets
    for (const p of state.players) {
      p.currentBet = 0;
      p.hasActedThisRound = false;
    }
    state.highestBet = 0;
    state.minRaise = state.bigBlind;

    const contendersWithChips = state.players.filter((p) => !p.folded && !p.allIn);

    // If 0 or 1 player has chips remaining (everyone else is all-in or folded),
    // deal remaining board cards immediately and proceed straight to showdown!
    if (contendersWithChips.length <= 1) {
      while (state.communityCards.length < 5) {
        const nextCard = state.deck.pop();
        if (nextCard) state.communityCards.push(nextCard);
      }
      return this.resolveShowdown(state);
    }

    if (state.phase === 'PRE_FLOP') {
      state.phase = 'FLOP';
      state.communityCards.push(state.deck.pop()!, state.deck.pop()!, state.deck.pop()!);
    } else if (state.phase === 'FLOP') {
      state.phase = 'TURN';
      state.communityCards.push(state.deck.pop()!);
    } else if (state.phase === 'TURN') {
      state.phase = 'RIVER';
      state.communityCards.push(state.deck.pop()!);
    } else if (state.phase === 'RIVER') {
      return this.resolveShowdown(state);
    }

    // Next actor: First active player clockwise from the dealer
    state.currentActionIndex = this.getNextActionIndex(state, state.dealerIndex);
    state.turnStartedAt = Date.now();
    return state;
  }

  /**
   * Finds the next player clockwise from startIndex who is eligible to act
   */
  public static getNextActionIndex(state: GameState, startIndex: number): number {
    const n = state.players.length;
    let next = (startIndex + 1) % n;
    for (let i = 0; i < n; i++) {
      const p = state.players[next];
      if (!p.folded && !p.allIn) {
        return next;
      }
      next = (next + 1) % n;
    }
    return startIndex;
  }

  /**
   * When all players fold except one, award all pots directly to the winner
   */
  private static awardUncontestedPot(state: GameState, winner: PlayerState): GameState {
    const totalPot = state.pots.reduce((sum, pot) => sum + pot.amount, 0);
    winner.chips += totalPot;
    state.phase = 'HAND_COMPLETE';
    state.winners = [
      {
        playerId: winner.id,
        nickname: winner.nickname,
        amount: totalPot,
        handDescr: 'Minden ellenfél dobott',
      },
    ];
    return state;
  }

  /**
   * Showdown resolution: evaluates all eligible hands, splits pots, handles odd chips
   */
  public static resolveShowdown(state: GameState): GameState {
    state.phase = 'SHOWDOWN';
    state.pots = calculatePots(state.players);

    // Evaluate 7 cards for each player who didn't fold
    const playerEvals = new Map<string, ReturnType<typeof evaluate7Cards>>();
    for (const p of state.players) {
      if (!p.folded) {
        const fullCards = [...p.holeCards, ...state.communityCards];
        playerEvals.set(p.id, evaluate7Cards(fullCards));
      }
    }

    const winningsMap: Record<string, { amount: number; descr: string; cards: Card[] }> = {};

    // Evaluate each pot tier
    for (const pot of state.pots) {
      if (pot.amount <= 0 || pot.eligiblePlayerIds.length === 0) continue;

      let topScore = -1;
      let potWinners: string[] = [];

      for (const pid of pot.eligiblePlayerIds) {
        const ev = playerEvals.get(pid);
        if (!ev) continue;
        if (ev.score > topScore) {
          topScore = ev.score;
          potWinners = [pid];
        } else if (ev.score === topScore) {
          potWinners.push(pid);
        }
      }

      if (potWinners.length === 0) continue;

      const equalShare = Math.floor(pot.amount / potWinners.length);
      let remainder = pot.amount % potWinners.length;

      // Distribute odd chips in clockwise order from dealer
      const sortedWinners = [...potWinners].sort((a, b) => {
        const distA = (state.players.findIndex((p) => p.id === a) - state.dealerIndex + state.players.length) % state.players.length;
        const distB = (state.players.findIndex((p) => p.id === b) - state.dealerIndex + state.players.length) % state.players.length;
        return distA - distB;
      });

      for (const wid of sortedWinners) {
        const extraChip = remainder > 0 ? 1 : 0;
        if (remainder > 0) remainder--;

        const winTotal = equalShare + extraChip;
        const p = state.players.find((pl) => pl.id === wid);
        if (p) {
          p.chips += winTotal;
        }

        const ev = playerEvals.get(wid);
        if (!winningsMap[wid]) {
          winningsMap[wid] = {
            amount: 0,
            descr: ev ? ev.descr : 'Showdown nyertes',
            cards: p ? p.holeCards : [],
          };
        }
        winningsMap[wid].amount += winTotal;
      }
    }

    const winners: WinnerResult[] = Object.entries(winningsMap).map(([pid, val]) => {
      const pl = state.players.find((p) => p.id === pid);
      return {
        playerId: pid,
        nickname: pl ? pl.nickname : pid,
        amount: val.amount,
        handDescr: val.descr,
        winningCards: val.cards,
      };
    });

    state.winners = winners;
    state.phase = 'HAND_COMPLETE';
    return state;
  }

  /**
   * Generates sanitized view for a specific player or spectator (zero hole card leaks)
   */
  public static getPublicView(state: GameState, requestingPlayerId?: string): PublicGameState {
    // Cards are only revealed at showdown if 2 or more players reached showdown without folding
    const isActualShowdown =
      (state.phase === 'SHOWDOWN' || state.phase === 'HAND_COMPLETE') &&
      state.players.filter((pl) => !pl.folded).length >= 2 &&
      state.winners?.[0]?.handDescr !== 'Minden ellenfél dobott';

    const publicPlayers: PublicPlayerView[] = state.players.map((p) => {
      const isMe = requestingPlayerId && p.id === requestingPlayerId;
      const revealCards = Boolean(isActualShowdown && !p.folded);

      return {
        id: p.id,
        nickname: p.nickname,
        chips: p.chips,
        currentBet: p.currentBet,
        totalHandBet: p.totalHandBet,
        folded: p.folded,
        allIn: p.allIn,
        hasActedThisRound: p.hasActedThisRound,
        isConnected: p.isConnected,
        cardCount: p.holeCards.length,
        revealedCards: revealCards ? p.holeCards : undefined,
        handDescr: revealCards ? state.winners?.find((w) => w.playerId === p.id)?.handDescr : undefined,
      };
    });

    const activePlayer = state.players[state.currentActionIndex];
    let myAllowedActions: PublicGameState['myAllowedActions'] | undefined = undefined;
    let myHoleCards: Card[] | undefined = undefined;

    if (requestingPlayerId) {
      const me = state.players.find((p) => p.id === requestingPlayerId);
      if (me) {
        myHoleCards = me.holeCards;

        if (activePlayer && activePlayer.id === requestingPlayerId && !me.folded && !me.allIn) {
          const callDiff = state.highestBet - me.currentBet;
          const canCheck = callDiff === 0;
          const canCall = callDiff > 0 && me.chips > 0;
          const actualCall = Math.min(me.chips, callDiff);

          const minRaiseTarget = state.highestBet + state.minRaise;
          const canBet = state.highestBet === 0 && me.chips >= state.bigBlind;
          const canRaise = state.highestBet > 0 && me.chips > callDiff;

          myAllowedActions = {
            canFold: true,
            canCheck,
            canCall,
            callAmount: actualCall,
            canBet,
            canRaise,
            minRaiseAmount: Math.min(me.currentBet + me.chips, Math.max(state.bigBlind, minRaiseTarget)),
            maxRaiseAmount: me.currentBet + me.chips,
          };
        }
      }
    }

    return {
      roomCode: state.roomCode,
      hostPlayerId: state.hostPlayerId,
      phase: state.phase,
      players: publicPlayers,
      communityCards: state.communityCards,
      dealerIndex: state.dealerIndex,
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      currentActionIndex: state.currentActionIndex,
      highestBet: state.highestBet,
      minRaise: state.minRaise,
      pots: state.pots,
      winners: state.winners,
      stateVersion: state.stateVersion,
      handNumber: state.handNumber,
      turnStartedAt: state.turnStartedAt,
      turnTimeLimitSec: state.turnTimeLimitSec,
      myPlayerId: requestingPlayerId,
      myHoleCards,
      myAllowedActions,
    };
  }
}
