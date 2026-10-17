import { describe, expect, it } from 'vitest';
import { rampSteer, resolveControls } from './input';

describe('resolveControls', () => {
  it('steers towards the held side', () => {
    expect(resolveControls(['left'], false, false, false)).toEqual({ steer: -1, handbrake: false });
    expect(resolveControls(['right'], false, false, false)).toEqual({ steer: 1, handbrake: false });
  });

  it('keeps the first side when both are held and engages the handbrake', () => {
    expect(resolveControls(['right', 'left'], false, false, false)).toEqual({
      steer: 1,
      handbrake: true,
    });
    expect(resolveControls(['left', 'right'], false, false, false)).toEqual({
      steer: -1,
      handbrake: true,
    });
  });

  it('switches to the remaining side when the first is released', () => {
    expect(resolveControls(['left'], false, false, false).steer).toBe(-1);
  });

  it('falls back to keyboard when nothing is touched', () => {
    expect(resolveControls([], true, false, false)).toEqual({ steer: -1, handbrake: false });
    expect(resolveControls([], true, true, false).steer).toBe(0);
    expect(resolveControls([], false, false, true)).toEqual({ steer: 0, handbrake: true });
  });

  it('is neutral with no input', () => {
    expect(resolveControls([], false, false, false)).toEqual({ steer: 0, handbrake: false });
  });
});

describe('rampSteer', () => {
  it('reaches full lock in the ramp time and not before', () => {
    let s = 0;
    for (let i = 0; i < 5; i++) s = rampSteer(s, 1, 1 / 60, 0.1);
    expect(s).toBeCloseTo(5 / 6);
    s = rampSteer(s, 1, 1 / 60, 0.1);
    expect(s).toBeCloseTo(1);
  });

  it('swings through centre when the side changes', () => {
    let s = 1;
    for (let i = 0; i < 6; i++) s = rampSteer(s, -1, 1 / 60, 0.1);
    expect(s).toBeCloseTo(0);
  });
});
