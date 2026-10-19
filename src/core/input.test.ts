import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TouchControls,
  advanceControls,
  NO_KEYS,
  rampSteer,
  headingSteer,
  resolveControls,
  stickHeading,
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

  it('steers towards the stick heading while the other thumb holds the gas or the brake', () => {
    // Car pointing up (-PI/2), stick a little to the left of that: half lock left
    const up = -Math.PI / 2;
    const half = resolveControls(['gas', 'stick'], NO_KEYS, 'pedals', up - 0.3, up, 0.6);
    expect(half.steer).toBeCloseTo(-0.5, 6);
    expect(half).toMatchObject({ analog: true, handbrake: false, throttle: 1 });
    // Stick pointing straight down: turn around, full lock, with the brake on
    const back = resolveControls(['stick', 'brake'], NO_KEYS, 'pedals', Math.PI / 2, up, 0.6);
    expect(Math.abs(back.steer)).toBe(1);
    expect(back).toMatchObject({ analog: true, handbrake: true, throttle: 0 });
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

const pad: PadLayout = {
  inset: 24,
  pedalSize: 80,
  pedalGap: 12,
  stickRadius: 70,
  stickFullAngle: 0.6,
  bandTop: 0.55,
};

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

describe('stickHeading', () => {
  it('asks for nothing inside the deadzone', () => {
    expect(stickHeading(0, 0, 70)).toBeNull();
    expect(stickHeading(8, 8, 70)).toBeNull();
  });

  it('reads the direction on screen, however far the thumb is', () => {
    expect(stickHeading(0, -40, 70)).toBeCloseTo(-Math.PI / 2, 6);
    expect(stickHeading(200, 0, 70)).toBeCloseTo(0, 6);
    expect(stickHeading(0, 30, 70)).toBeCloseTo(Math.PI / 2, 6);
    expect(stickHeading(-30, 0, 70)).toBeCloseTo(Math.PI, 6);
  });
});

describe('headingSteer', () => {
  it('is zero on heading, proportional nearby and full lock from the full angle', () => {
    expect(headingSteer(1, 1, 0.6)).toBe(0);
    expect(headingSteer(1, 1.3, 0.6)).toBeCloseTo(0.5, 6);
    expect(headingSteer(1, 1 - 0.3, 0.6)).toBeCloseTo(-0.5, 6);
    expect(headingSteer(1, 2, 0.6)).toBe(1);
  });

  it('turns the short way across the wrap', () => {
    expect(headingSteer(Math.PI - 0.1, -Math.PI + 0.1, 0.6)).toBeCloseTo(0.2 / 0.6, 6);
    expect(headingSteer(-Math.PI + 0.1, Math.PI - 0.1, 0.6)).toBeCloseTo(-0.2 / 0.6, 6);
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

describe('desktop keyboard events', () => {
  let input: TouchControls;
  afterEach(() => {
    input.dispose();
    document.body.replaceChildren();
  });

  function setup() {
    input = new TouchControls(document.createElement('canvas'));
    input.scheme = 'pedals';
    return input;
  }

  function key(type: 'keydown' | 'keyup', value: string, options: KeyboardEventInit = {}) {
    const event = new KeyboardEvent(type, {
      key: value,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    (document.activeElement ?? window).dispatchEvent(event);
    return event;
  }

  it('drives with WASD and arrows, and releases each held key independently', () => {
    const controls = setup();
    key('keydown', 'W');
    key('keydown', 'a');
    key('keydown', 'ArrowLeft');
    expect(controls.raw()).toMatchObject({ throttle: 1, steer: -1, handbrake: false });
    key('keyup', 'a');
    expect(controls.raw().steer).toBe(-1);
    key('keyup', 'ArrowLeft');
    key('keydown', ' ');
    expect(controls.raw()).toMatchObject({ throttle: 1, steer: 0, handbrake: true });
    key('keyup', 'W');
    key('keyup', ' ');
    expect(controls.raw()).toMatchObject({ throttle: 0, steer: 0, handbrake: false });
  });

  it('fires pause and confirm once per press rather than on key repeat', () => {
    const controls = setup();
    controls.onPauseKey = vi.fn();
    controls.onConfirmKey = vi.fn();
    for (const value of ['Escape', 'p', 'Enter']) {
      expect(key('keydown', value).defaultPrevented).toBe(true);
      key('keydown', value, { repeat: true });
      key('keyup', value);
    }
    expect(controls.onPauseKey).toHaveBeenCalledTimes(2);
    expect(controls.onConfirmKey).toHaveBeenCalledTimes(1);
  });

  it('leaves focused UI controls and browser shortcuts alone', () => {
    const controls = setup();
    controls.onConfirmKey = vi.fn();
    key('keydown', 'w', { metaKey: true });
    expect(controls.raw().throttle).toBe(0);
    for (const tag of ['input', 'button', 'select', 'textarea']) {
      const field = document.createElement(tag);
      document.body.append(field);
      field.focus();
      expect(key('keydown', 'Enter').defaultPrevented).toBe(false);
      key('keydown', 'w');
      expect(controls.raw().throttle).toBe(0);
    }
    expect(controls.onConfirmKey).not.toHaveBeenCalled();
  });

  it('clears held keys on blur and removes listeners when disposed', () => {
    const controls = setup();
    key('keydown', 'w');
    key('keydown', 'd');
    window.dispatchEvent(new Event('blur'));
    expect(controls.raw()).toMatchObject({ throttle: 0, steer: 0 });
    controls.dispose();
    key('keydown', 'w');
    expect(controls.raw().throttle).toBe(0);
  });

  it('releases a driving key after focus moves to a field', () => {
    const controls = setup();
    key('keydown', 'w');
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    key('keyup', 'w');
    expect(controls.raw().throttle).toBe(0);
  });
});

describe('T5 response and controller takeover', () => {
  it('separates initial turn-in, centre return and full reversal with mirrored response', () => {
    const r = {
      stage1: 0.5,
      stage1Seconds: 0.18,
      stage2Seconds: 0.24,
      releaseSeconds: 0.12,
      reversalSeconds: 0.24,
    };
    const run = (from: number, target: number, frames: number) => {
      const state = { steer: from, throttle: 0, handbrake: false };
      for (let i = 0; i < frames; i++)
        advanceControls(
          state,
          { steer: target, throttle: 0, handbrake: false, analog: false },
          dt,
          r,
        );
      return state.steer;
    };
    expect(run(0, 1, 26)).toBe(1);
    expect(run(0, -1, 26)).toBe(-1);
    expect(run(1, -1, 15)).toBe(-1);
    expect(run(-1, 1, 15)).toBe(1);
    expect(run(1, 0, 8)).toBeCloseTo(0);
    expect(run(0, 1, 15)).toBeLessThan(1);
  });

  it('smooths binary release briefly but cuts immediately for the handbrake', () => {
    const state = { steer: 0, throttle: 1, handbrake: false };
    const raw = { steer: 0, throttle: 0, handbrake: false, analog: false };
    advanceControls(state, raw, dt, ramp, 0.12, 0.04);
    expect(state.throttle).toBeGreaterThan(0);
    advanceControls(state, { ...raw, handbrake: true }, dt, ramp, 0.12, 0.04);
    expect(state.throttle).toBe(0);
  });

  it('allows keyboard takeover, preserves analogue trigger values, and blocks held values after blur', async () => {
    const { pad } = await import('./controller-fixture');
    let pads = [pad()];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
    const input = new TouchControls(document.createElement('canvas'));
    input.scheme = 'thumb';
    input.onControllerDisconnect = vi.fn();
    input.pollController();
    pads = [pad(0, 0.575, 0.525)];
    input.pollController();
    expect(input.sample(dt, ramp, 1).steer).toBeCloseTo(0.5);
    expect(input.state.throttle).toBeCloseTo(0.5);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    input.pollController();
    expect(input.source).toBe('keyboard');
    expect(input.raw()).toMatchObject({ steer: -1, throttle: 1 });
    pads = [pad()];
    input.pollController();
    pads = [pad(0, 1, 1)];
    input.pollController();
    window.dispatchEvent(new Event('blur'));
    input.pollController();
    expect(input.source).toBe('keyboard');
    pads = [pad()];
    input.pollController();
    pads = [pad(0, 1, 1)];
    input.pollController();
    pads = [];
    input.pollController();
    expect(input.onControllerDisconnect).toHaveBeenCalledOnce();
    expect(input.state).toEqual({ steer: 0, throttle: 0, handbrake: false });
    expect(input.scheme).toBe('thumb');
    input.dispose();
    Reflect.deleteProperty(navigator, 'getGamepads');
    vi.restoreAllMocks();
  });
});
