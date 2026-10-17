import { describe, expect, it } from 'vitest';
import { steerFromDrag } from './input';

describe('steerFromDrag', () => {
  it('returns zero inside the dead zone', () => {
    expect(steerFromDrag(0, 8, 60)).toBe(0);
    expect(steerFromDrag(8, 8, 60)).toBe(0);
    expect(steerFromDrag(-5, 8, 60)).toBe(0);
  });

  it('ramps linearly from dead zone to full lock', () => {
    expect(steerFromDrag(34, 8, 60)).toBeCloseTo(0.5);
    expect(steerFromDrag(-34, 8, 60)).toBeCloseTo(-0.5);
  });

  it('clamps at full lock', () => {
    expect(steerFromDrag(60, 8, 60)).toBe(1);
    expect(steerFromDrag(500, 8, 60)).toBe(1);
    expect(steerFromDrag(-500, 8, 60)).toBe(-1);
  });
});
