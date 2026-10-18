import { describe, expect, it } from 'vitest';
import {
  advanceControls,
  NO_KEYS,
  rampSteer,
  resolveControls,
  zoneAt,
  type InputState,
  type Keys,
} from './input';

const keys = (k: Partial<Keys>): Keys => ({ ...NO_KEYS, ...k });

describe('resolveControls with one thumb', () => {
  it('steers towards the held side with the throttle on', () => {
    expect(resolveControls(['left'], NO_KEYS)).toEqual({
      steer: -1,
      handbrake: false,
      throttle: 1,
    });
    expect(resolveControls(['right'], NO_KEYS)).toEqual({
      steer: 1,
      handbrake: false,
      throttle: 1,
    });
  });

  it('keeps the first side when both are held, engages the handbrake and lifts', () => {
    expect(resolveControls(['right', 'left'], NO_KEYS)).toEqual({
      steer: 1,
      handbrake: true,
      throttle: 0,
    });
    expect(resolveControls(['left', 'right'], NO_KEYS).steer).toBe(-1);
  });

  it('falls back to keyboard when nothing is touched, ignoring the gas key', () => {
    expect(resolveControls([], keys({ left: true })).steer).toBe(-1);
    expect(resolveControls([], keys({ left: true, right: true })).steer).toBe(0);
    expect(resolveControls([], keys({ brake: true }))).toEqual({
      steer: 0,
      handbrake: true,
      throttle: 0,
    });
    expect(resolveControls([], NO_KEYS).throttle).toBe(1);
  });
});

describe('resolveControls with two thumbs', () => {
  it('only moves on the gas', () => {
    expect(resolveControls([], NO_KEYS, 'pedals')).toEqual({
      steer: 0,
      handbrake: false,
      throttle: 0,
    });
    expect(resolveControls(['gas'], NO_KEYS, 'pedals').throttle).toBe(1);
    expect(resolveControls([], keys({ gas: true }), 'pedals').throttle).toBe(1);
  });

  it('steers with the right thumb while the left holds the gas or the brake', () => {
    expect(resolveControls(['gas', 'left'], NO_KEYS, 'pedals')).toEqual({
      steer: -1,
      handbrake: false,
      throttle: 1,
    });
    expect(resolveControls(['right', 'brake'], NO_KEYS, 'pedals')).toEqual({
      steer: 1,
      handbrake: true,
      throttle: 0,
    });
  });

  it('keeps the gas on through a handbrake pull', () => {
    expect(resolveControls(['gas', 'brake'], NO_KEYS, 'pedals')).toEqual({
      steer: 0,
      handbrake: true,
      throttle: 1,
    });
  });

  it('steers with whichever side was pressed first, with no handbrake from both', () => {
    expect(resolveControls(['right', 'left'], NO_KEYS, 'pedals')).toEqual({
      steer: 1,
      handbrake: false,
      throttle: 0,
    });
  });
});

describe('zoneAt', () => {
  it('splits the screen in halves for one thumb', () => {
    expect(zoneAt(0.1, 'thumb')).toBe('left');
    expect(zoneAt(0.49, 'thumb')).toBe('left');
    expect(zoneAt(0.5, 'thumb')).toBe('right');
  });

  it('splits the screen in four columns: pedals on the left, steering on the right', () => {
    expect(zoneAt(0.1, 'pedals')).toBe('gas');
    expect(zoneAt(0.3, 'pedals')).toBe('brake');
    expect(zoneAt(0.6, 'pedals')).toBe('left');
    expect(zoneAt(0.9, 'pedals')).toBe('right');
    expect(zoneAt(1, 'pedals')).toBe('right');
  });
});

const ramp = { stage1: 0.5, stage1Seconds: 0.3, stage2Seconds: 0.5, releaseSeconds: 0.1 };
const dt = 1 / 60;

describe('advanceControls', () => {
  it('eases the throttle in and lets go at once', () => {
    const state: InputState = { throttle: 0, steer: 0, handbrake: false };
    const gas = { steer: 0, handbrake: false, throttle: 1 };
    advanceControls(state, gas, dt, ramp, 0.15);
    expect(state.throttle).toBeGreaterThan(0);
    expect(state.throttle).toBeLessThan(0.2);
    for (let i = 0; i < 12; i++) advanceControls(state, gas, dt, ramp, 0.15);
    expect(state.throttle).toBe(1);
    advanceControls(state, { ...gas, throttle: 0 }, dt, ramp, 0.15);
    expect(state.throttle).toBe(0);
  });

  it('applies the throttle instantly with no ramp', () => {
    const state: InputState = { throttle: 0, steer: 0, handbrake: false };
    advanceControls(state, { steer: 0, handbrake: false, throttle: 1 }, dt, ramp);
    expect(state.throttle).toBe(1);
  });
});

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
