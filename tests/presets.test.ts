/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  BLIND_PRESETS,
  CHIP_PRESETS,
  DEFAULT_BLINDS_INDEX,
  DEFAULT_CHIPS,
  DEFAULT_TIME,
  TIME_PRESETS,
} from '../src/utils/presets';

// A szerver (server.ts) korlátai: SB>=10, BB>=20, zseton>=500, idő 10–120 mp.
describe('Lobby előre beállított értékei', () => {
  it('Minden érték a szerver által elfogadott tartományban van, és a nagyvak a kisvak kétszerese', () => {
    for (const b of BLIND_PRESETS) {
      expect(b.smallBlind).toBeGreaterThanOrEqual(10);
      expect(b.bigBlind).toBeGreaterThanOrEqual(20);
      expect(b.bigBlind).toBe(b.smallBlind * 2);
    }
    for (const c of CHIP_PRESETS) {
      expect(c).toBeGreaterThanOrEqual(500);
      // legalább 50 nagyvak mélység, hogy játszható legyen
      expect(c / BLIND_PRESETS[BLIND_PRESETS.length - 1].bigBlind).toBeGreaterThanOrEqual(25);
    }
    for (const t of TIME_PRESETS) {
      expect(t).toBeGreaterThanOrEqual(10);
      expect(t).toBeLessThanOrEqual(120);
    }
  });

  it('Az alapértékek szerepelnek a választható értékek között', () => {
    expect(CHIP_PRESETS).toContain(DEFAULT_CHIPS);
    expect(TIME_PRESETS).toContain(DEFAULT_TIME);
    expect(BLIND_PRESETS[DEFAULT_BLINDS_INDEX]).toBeDefined();
  });
});
