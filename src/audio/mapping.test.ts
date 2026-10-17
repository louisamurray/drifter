import { describe, expect, it } from 'vitest';
import {
  bankRootHz,
  ENGINE_IDLE_HZ,
  ENGINE_TOP_HZ,
  engineFrequency,
  engineGain,
  squealGain,
} from './mapping';

describe('audio mapping', () => {
  it('engine pitch spans idle to top and rises in a drift', () => {
    expect(engineFrequency(0, false, false)).toBeCloseTo(ENGINE_IDLE_HZ);
    expect(engineFrequency(1, false, false)).toBeCloseTo(ENGINE_TOP_HZ);
    expect(engineFrequency(0.5, true, false)).toBeGreaterThan(engineFrequency(0.5, false, false));
    expect(engineFrequency(2, false, false)).toBeCloseTo(ENGINE_TOP_HZ);
  });

  it('engine gain is never silent and grows with throttle', () => {
    expect(engineGain(0, 0)).toBeGreaterThan(0);
    expect(engineGain(0.5, 1)).toBeGreaterThan(engineGain(0.5, 0));
    expect(engineGain(1, 1)).toBeLessThan(0.4);
  });

  it('squeal is silent at rest and off the road, and capped', () => {
    expect(squealGain(0, false)).toBe(0);
    expect(squealGain(1, true)).toBe(0);
    expect(squealGain(1, false)).toBeLessThanOrEqual(0.3);
    expect(squealGain(0.5, false)).toBeGreaterThan(0);
  });

  it('bank chime rises with amount and caps', () => {
    expect(bankRootHz(10)).toBeCloseTo(392);
    expect(bankRootHz(1000)).toBeGreaterThan(bankRootHz(100));
    expect(bankRootHz(1e9)).toBeCloseTo(bankRootHz(1e4));
  });
});
