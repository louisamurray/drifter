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

const ramp = { stage1: 0.5, stage1Seconds: 0.3, stage2Seconds: 0.5, releaseSeconds: 0.1 };
const dt = 1 / 60;

function hold(from: number, target: number, seconds: number): number {
  let s = from;
  for (let i = 0; i < Math.round(seconds * 60); i++) s = rampSteer(s, target, dt, ramp);
  return s;
}

describe('rampSteer', () => {
  it('reaches the grip stage first and full lock only on a longer hold', () => {
    expect(hold(0, 1, 0.3)).toBeCloseTo(0.5, 2);
    expect(hold(0, 1, 0.5)).toBeLessThan(0.75);
    expect(hold(0, 1, 0.8)).toBeCloseTo(1, 2);
    expect(hold(0, 1, 2)).toBe(1);
  });

  it('releases to centre quickly', () => {
    expect(hold(1, 0, 0.1)).toBeCloseTo(0, 2);
    expect(hold(-0.5, 0, 0.05)).toBeCloseTo(0, 2);
  });

  it('crosses centre at the release rate before ramping the other way', () => {
    const mid = hold(1, -1, 0.1);
    expect(mid).toBeCloseTo(0, 2);
    expect(hold(1, -1, 0.4)).toBeCloseTo(-0.5, 1);
  });
});
