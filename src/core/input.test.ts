import { describe, expect, it } from 'vitest';
import {
  advanceControls,
  NO_KEYS,
  rampSteer,
  resolveControls,
  stickSteer,
  zoneAt,
  type InputState,
  type Keys,
  type PadLayout,
} from './input';

const keys = (k: Partial<Keys>): Keys => ({ ...NO_KEYS, ...k });

describe('resolveControls with one thumb', () => {
  it('steers towards the held side with the throttle on', () => {
    expect(resolveControls(['left'], NO_KEYS)).toEqual({
      steer: -1,
      analog: false,
      handbrake: false,
      throttle: 1,
    });
    expect(resolveControls(['right'], NO_KEYS).steer).toBe(1);
  });

  it('keeps the first side when both are held, engages the handbrake and lifts', () => {
    expect(resolveControls(['right', 'left'], NO_KEYS)).toEqual({
      steer: 1,
      analog: false,
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
      analog: false,
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
      analog: false,
      handbrake: false,
      throttle: 0,
    });
    expect(resolveControls(['gas'], NO_KEYS, 'pedals').throttle).toBe(1);
    expect(resolveControls([], keys({ gas: true }), 'pedals').throttle).toBe(1);
  });

  it('steers by the stick while the other thumb holds the gas or the brake', () => {
    expect(resolveControls(['gas', 'stick'], NO_KEYS, 'pedals', -0.4)).toEqual({
      steer: -0.4,
      analog: true,
      handbrake: false,
      throttle: 1,
    });
    expect(resolveControls(['stick', 'brake'], NO_KEYS, 'pedals', 1)).toEqual({
      steer: 1,
      analog: true,
      handbrake: true,
      throttle: 0,
    });
  });

  it('keeps the gas on through a handbrake pull', () => {
    expect(resolveControls(['gas', 'brake'], NO_KEYS, 'pedals')).toEqual({
      steer: 0,
      analog: false,
      handbrake: true,
      throttle: 1,
    });
  });

  it('steers digitally from the keyboard when no thumb is on the stick', () => {
    expect(resolveControls([], keys({ right: true, gas: true }), 'pedals')).toEqual({
      steer: 1,
      analog: false,
      handbrake: false,
      throttle: 1,
    });
  });
});

const pad: PadLayout = { inset: 24, pedalSize: 80, pedalGap: 12, stickRadius: 70, bandTop: 0.55 };

describe('zoneAt', () => {
  it('splits the screen in halves for one thumb, at any height', () => {
    expect(zoneAt(10, 10, 390, 844, 'thumb', pad)).toBe('left');
    expect(zoneAt(194, 800, 390, 844, 'thumb', pad)).toBe('left');
    expect(zoneAt(195, 400, 390, 844, 'thumb', pad)).toBe('right');
  });

  it('puts the pedals bottom left and the stick bottom right for two thumbs', () => {
    expect(zoneAt(40, 800, 390, 844, 'pedals', pad)).toBe('gas');
    expect(zoneAt(109, 800, 390, 844, 'pedals', pad)).toBe('gas');
    expect(zoneAt(111, 800, 390, 844, 'pedals', pad)).toBe('brake');
    expect(zoneAt(190, 600, 390, 844, 'pedals', pad)).toBe('brake');
    expect(zoneAt(200, 800, 390, 844, 'pedals', pad)).toBe('stick');
    expect(zoneAt(380, 500, 390, 844, 'pedals', pad)).toBe('stick');
  });

  it('ignores touches above the control band for two thumbs', () => {
    expect(zoneAt(40, 100, 390, 844, 'pedals', pad)).toBeNull();
    expect(zoneAt(380, 460, 390, 844, 'pedals', pad)).toBeNull();
  });
});

describe('stickSteer', () => {
  it('is centred within the deadzone and full at the radius', () => {
    expect(stickSteer(0, 70)).toBe(0);
    expect(stickSteer(4, 70)).toBe(0);
    expect(stickSteer(70, 70)).toBe(1);
    expect(stickSteer(-120, 70)).toBe(-1);
  });

  it('is proportional between, with no step at the deadzone edge', () => {
    expect(stickSteer(70 * 0.08 + 0.01, 70)).toBeCloseTo(0, 2);
    expect(stickSteer(35, 70)).toBeGreaterThan(0.4);
    expect(stickSteer(35, 70)).toBeLessThan(0.5);
    expect(stickSteer(-35, 70)).toBeCloseTo(-stickSteer(35, 70), 6);
  });
});

const ramp = { stage1: 0.5, stage1Seconds: 0.3, stage2Seconds: 0.5, releaseSeconds: 0.1 };
const dt = 1 / 60;

describe('advanceControls', () => {
  it('eases the throttle in and lets go at once', () => {
    const state: InputState = { throttle: 0, steer: 0, handbrake: false };
    const gas = { steer: 0, analog: false, handbrake: false, throttle: 1 };
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
    advanceControls(state, { steer: 0, analog: false, handbrake: false, throttle: 1 }, dt, ramp);
    expect(state.throttle).toBe(1);
  });

  it('ramps digital steer but applies stick steer as is', () => {
    const digital: InputState = { throttle: 0, steer: 0, handbrake: false };
    advanceControls(digital, { steer: 1, analog: false, handbrake: false, throttle: 0 }, dt, ramp);
    expect(digital.steer).toBeLessThan(0.1);
    const stick: InputState = { throttle: 0, steer: 0, handbrake: false };
    advanceControls(stick, { steer: 0.6, analog: true, handbrake: false, throttle: 0 }, dt, ramp);
    expect(stick.steer).toBe(0.6);
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
