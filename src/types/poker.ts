/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Suit = 'c' | 'd' | 'h' | 's'; // Clubs, Diamonds, Hearts, Spades
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type HandCategory =
  | 'HIGH_CARD'
  | 'ONE_PAIR'
  | 'TWO_PAIR'
  | 'THREE_OF_A_KIND'
  | 'STRAIGHT'
  | 'FLUSH'
  | 'FULL_HOUSE'
  | 'FOUR_OF_A_KIND'
  | 'STRAIGHT_FLUSH'
  | 'ROYAL_FLUSH';

export interface HandEvaluation {
  category: HandCategory;
  score: number;
  descr: string;
}

export type GamePhase =
  | 'WAITING'
  | 'PRE_FLOP'
  | 'FLOP'
  | 'TURN'
  | 'RIVER'
  | 'SHOWDOWN'
  | 'HAND_COMPLETE';

export type ActionType = 'FOLD' | 'CHECK' | 'CALL' | 'BET' | 'RAISE';

export interface PlayerAction {
  playerId: string;
  type: ActionType;
  amount?: number; // Target total bet for current street (e.g. RAISE to 200)
}

export interface PlayerState {
  id: string;
  nickname: string;
  chips: number;
  currentBet: number;      // Current bet in active betting round
  totalHandBet: number;    // Cumulative bet in whole hand (for side pot calculation)
  holeCards: Card[];       // Server-authoritative secret cards
  folded: boolean;
  allIn: boolean;
  hasActedThisRound: boolean;
  isConnected: boolean;
  sessionToken?: string;   // Secret authentication token for reconnection
}

export interface PublicPlayerView {
  id: string;
  nickname: string;
  chips: number;
  currentBet: number;
  totalHandBet: number;
  folded: boolean;
  allIn: boolean;
  hasActedThisRound: boolean;
  isConnected: boolean;
  cardCount: number;
  revealedCards?: Card[];  // Shown only during SHOWDOWN / HAND_COMPLETE
  handDescr?: string;      // Shown during SHOWDOWN
}

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface WinnerResult {
  playerId: string;
  nickname: string;
  amount: number;
  handDescr?: string;
  winningCards?: Card[];
}

export interface GameSettings {
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  actionTimeLimitSec: number;
}

export interface GameState {
  roomCode: string;
  hostPlayerId: string;
  phase: GamePhase;
  players: PlayerState[];
  communityCards: Card[];
  deck: Card[];
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  currentActionIndex: number;
  highestBet: number;
  minRaise: number;
  lastRaiseAmount: number;
  pots: Pot[];
  winners?: WinnerResult[];
  stateVersion: number;
  handNumber: number;
  turnStartedAt?: number;  // Timestamp in ms for countdown
  turnTimeLimitSec: number;
}

export interface PublicGameState {
  roomCode: string;
  hostPlayerId: string;
  phase: GamePhase;
  players: PublicPlayerView[];
  communityCards: Card[];
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  currentActionIndex: number;
  highestBet: number;
  minRaise: number;
  pots: Pot[];
  winners?: WinnerResult[];
  stateVersion: number;
  handNumber: number;
  turnStartedAt?: number;
  turnTimeLimitSec: number;
  // Personal view data (injected only if requesting player is authenticated):
  myPlayerId?: string;
  myHoleCards?: Card[];
  myAllowedActions?: {
    canFold: boolean;
    canCheck: boolean;
    canCall: boolean;
    callAmount: number;
    canBet: boolean;
    canRaise: boolean;
    minRaiseAmount: number;
    maxRaiseAmount: number;
  };
}
