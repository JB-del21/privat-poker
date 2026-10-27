/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// A szoba-létrehozás előre beállított értékei (nincs gépelés a telefonon).
// A szerver ennél szélesebb tartományt fogad el (SB>=10, BB>=20, zseton>=500, idő 10–120 mp).

export const CHIP_PRESETS = [5000, 10000, 20000] as const;

export const BLIND_PRESETS: ReadonlyArray<{ smallBlind: number; bigBlind: number }> = [
  { smallBlind: 25, bigBlind: 50 },
  { smallBlind: 50, bigBlind: 100 },
  { smallBlind: 100, bigBlind: 200 },
];

export const TIME_PRESETS = [15, 30, 45] as const;

export const DEFAULT_CHIPS = 5000;
export const DEFAULT_BLINDS_INDEX = 1; // 50 / 100
export const DEFAULT_TIME = 30;
