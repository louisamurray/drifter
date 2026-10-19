import { describe, expect, it } from 'vitest';
import { Controller, controllerControls } from './controller';

import { pad } from './controller-fixture';

describe('controller', () => {
  it('maps analogue stick and trigger continuously with deadzones and finite bounds', () => {
    expect(controllerControls(pad(0, 0.1, 0.02))).toMatchObject({ steer: 0, throttle: 0 });
    expect(controllerControls(pad(0, 0.575, 0.525)).steer).toBeCloseTo(0.5);
    expect(controllerControls(pad(0, 0.575, 0.525)).throttle).toBeCloseTo(0.5);
    expect(controllerControls(pad(0, -1, 1, [0]))).toMatchObject({
      steer: -1,
      throttle: 1,
      handbrake: true,
    });
    expect(controllerControls(pad(0, NaN, Infinity))).toMatchObject({ steer: 0, throttle: 0 });
    expect(controllerControls(pad(0, 0, 0, [6])).handbrake).toBe(true);
  });

  it('requires neutral on connection and reset, with action edges once per press', () => {
    const c = new Controller();
    c.poll([pad(0, 1, 1, [9])]);
    expect(c.active).toBe(false);
    c.poll([pad()]);
    expect(c.poll([pad(0, 0, 0, [9])]).confirm).toBe(true);
    expect(c.poll([pad(0, 0, 0, [9])]).confirm).toBe(false);
    c.reset();
    c.poll([pad(0, 1, 1)]);
    expect(c.controls.throttle).toBe(0);
    c.poll([pad()]);
    c.poll([pad(0, 0.575, 0.525)]);
    expect(c.controls.throttle).toBeCloseTo(0.5);
    expect(c.poll([pad(0, 0, 0, [1])]).pause).toBe(true);
    expect(c.poll([pad(0, 0, 0, [1])]).pause).toBe(false);
  });

  it('locks selection, ignores nonstandard devices, and reports active disconnect even with a replacement', () => {
    const c = new Controller();
    const unsupported = pad();
    Object.defineProperty(unsupported, 'mapping', { value: '' });
    c.poll([unsupported]);
    c.poll([pad(1)]);
    c.poll([pad(0, 1, 1), pad(1, -1, 0.5)]);
    expect(c.controls.steer).toBe(-1);
    const result = c.poll([pad(0, 1, 1)]);
    expect(result.disconnected).toBe(true);
    expect(c.controls.throttle).toBe(0);
    expect(c.poll([]).disconnected).toBe(false);
  });
});

it('edge-triggers Y reset and requires release after session reset',()=>{
  const c=new Controller();c.poll([pad()]);
  expect(c.poll([pad(0,0,0,[3])]).reset).toBe(true);
  expect(c.poll([pad(0,0,0,[3])]).reset).toBe(false);
  c.reset();expect(c.poll([pad(0,0,0,[3])]).reset).toBe(false);
  c.poll([pad()]);expect(c.poll([pad(0,0,0,[3])]).reset).toBe(true);
});
