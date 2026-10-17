import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { createCar, stepCar, telemetry } from './car';

const p = config.physics;
const dt = 1 / 60;

function run(steps: number, steer: number, throttle = 1, car = createCar()) {
  for (let i = 0; i < steps; i++) stepCar(car, { throttle, steer, handbrake: false }, dt, p);
  return car;
}

describe('stepCar', () => {
  it('is deterministic for identical inputs', () => {
    const a = run(300, 0.7);
    const b = run(300, 0.7);
    expect(a).toEqual(b);
  });

  it('accelerates straight without drifting and caps at max speed', () => {
    const car = run(600, 0);
    const t = telemetry(car);
    expect(t.forwardSpeed).toBeGreaterThan(0);
    expect(t.forwardSpeed).toBeLessThanOrEqual(p.maxSpeed + 1e-6);
    expect(Math.abs(t.lateralSpeed)).toBeLessThan(1e-6);
    expect(car.drifting).toBe(false);
  });

  it('does not steer when stationary', () => {
    const car = run(60, 1, 0);
    expect(car.heading).toBeCloseTo(createCar().heading);
  });

  it('breaks into a drift under full lock at speed and recovers when released', () => {
    const car = run(180, 0); // build speed
    run(120, 1, 1, car); // full lock
    expect(car.drifting).toBe(true);
    expect(Math.abs(telemetry(car).slipAngle)).toBeGreaterThan(0.2);

    run(180, 0, 1, car); // straighten
    expect(car.drifting).toBe(false);
    expect(Math.abs(telemetry(car).lateralSpeed)).toBeLessThan(p.driftExitLateral);
  });

  it('handbrake slows the car faster than coasting', () => {
    const coast = run(120, 0);
    const braked = run(120, 0);
    for (let i = 0; i < 60; i++) {
      stepCar(coast, { throttle: 0, steer: 0, handbrake: false }, dt, p);
      stepCar(braked, { throttle: 0, steer: 0, handbrake: true }, dt, p);
    }
    expect(telemetry(braked).speed).toBeLessThan(telemetry(coast).speed * 0.6);
  });

  it('handbrake lets the rear step out further under steering', () => {
    const grip = run(120, 0);
    const braked = run(120, 0);
    for (let i = 0; i < 20; i++) {
      stepCar(grip, { throttle: 0, steer: 1, handbrake: false }, dt, p);
      stepCar(braked, { throttle: 0, steer: 1, handbrake: true }, dt, p);
    }
    expect(Math.abs(telemetry(braked).slipAngle)).toBeGreaterThan(
      Math.abs(telemetry(grip).slipAngle),
    );
  });

  it('coasts to a stop when throttle is released', () => {
    const car = run(120, 0);
    run(60 * 20, 0, 0, car);
    expect(telemetry(car).speed).toBe(0);
  });
});
