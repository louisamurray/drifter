import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { createCar, stepCar, telemetry } from './car';
import { Handling, vehicleToWorld, worldToVehicle } from './handling';
import { ASPHALT, GRASS, STANDARD_VEHICLE, createVehicleState, stepVehicle } from './vehicle';

const pose = { x: 120, y: -350, heading: -Math.PI / 2 };
const gas = { throttle: 1, steer: 0, handbrake: false };
const raw = { offTrack: false, roadYaw: 0, lift: 0, counterSteer: 0 };
const dt = 1 / 60;

function closeCar(actual: ReturnType<typeof createCar>, expected: ReturnType<typeof createCar>) {
  for (const key of ['x', 'y', 'heading', 'vx', 'vy', 'yawRate'] as const) {
    expect(actual[key]).toBeCloseTo(expected[key], 10);
  }
  expect(actual.drifting).toBe(expected.drifting);
}

describe('unit and coordinate boundary', () => {
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7, -2.3, 2 * Math.PI + 0.3])(
    'round trips world position, velocity and yaw at heading %s',
    (heading) => {
      const world = {
        ...createCar(123, -456, heading),
        vx: 71,
        vy: -92,
        yawRate: 0.4,
        drifting: true,
      };
      const vehicle = worldToVehicle(world);
      expect(vehicle.x).toBeCloseTo(12.3);
      expect(vehicle.y).toBeCloseTo(45.6);
      expect(vehicle.heading).toBe(-heading);
      expect(vehicle.yawRate).toBe(-0.4);
      closeCar(vehicleToWorld(vehicle), world);
      const t = telemetry(world);
      expect(vehicle.forwardSpeed * 10).toBeCloseTo(t.forwardSpeed);
      expect(-vehicle.lateralSpeed * 10).toBeCloseTo(t.lateralSpeed);
    },
  );

  it('converts forward/left velocities without a quarter-turn offset', () => {
    const v = { ...createVehicleState(2, 3, 0), forwardSpeed: 4, lateralSpeed: 5 };
    expect(vehicleToWorld(v)).toMatchObject({ x: 20, y: -30, vx: 40, vy: -50, heading: -0 });
  });
});

describe('session handling adapter', () => {
  it.each(['legacy', 'force'] as const)(
    'keeps %s spawn stationary and resets all history',
    (model) => {
      const h = new Handling(model, pose);
      for (let i = 0; i < 240; i++) h.step({ ...gas, steer: 0.5 }, dt, { ...raw, counterSteer: 1 });
      h.reset(pose);
      closeCar(h.car, createCar(pose.x, pose.y, pose.heading));
      expect(h.appliedWheelAngle).toBe(0);
      const fresh = new Handling(model, pose);
      for (let i = 0; i < 120; i++) {
        h.step(gas, dt, raw);
        fresh.step(gas, dt, raw);
      }
      closeCar(h.car, fresh.car);
    },
  );

  it('preserves legacy trajectories including surfaces, road assist and corner lift', () => {
    const h = new Handling('legacy', pose);
    const car = createCar(pose.x, pose.y, pose.heading);
    for (let i = 0; i < 300; i++) {
      const input = { ...gas, steer: i > 120 ? -0.6 : 0 };
      const offTrack = i > 200;
      h.step(input, dt, { ...raw, offTrack, roadYaw: 0.2, lift: 0.3 });
      stepCar(car, input, dt, config.physics, offTrack ? config.offTrack : undefined, 0.2, 0.3);
      closeCar(h.car, car);
    }
    expect(h.appliedWheelAngle).toBe(-0.6 * 0.42);
    expect(h.referenceSpeed).toBe(config.physics.maxSpeed);
    expect(h.canSaveBest).toBe(true);
  });

  it('matches direct 120 Hz solver replay through steer/lift/grass transitions', () => {
    const h = new Handling('force', pose);
    const v = worldToVehicle(h.car);
    for (let i = 0; i < 600; i++) {
      const input = {
        throttle: i < 500 ? 1 : 0,
        steer: i < 200 ? 0 : i < 400 ? 0.6 : -0.3,
        handbrake: i >= 300 && i < 320,
      };
      const offTrack = i >= 400 && i < 500;
      const lift = i >= 500 ? 0.7 : 0;
      h.step(input, dt, { ...raw, offTrack, lift, counterSteer: 1 });
      for (let sub = 0; sub < 2; sub++)
        stepVehicle(
          v,
          { ...input, steer: -input.steer },
          dt / 2,
          STANDARD_VEHICLE,
          offTrack ? GRASS : ASPHALT,
          { steer: 0, lift, counterSteer: 1 },
        );
      closeCar(h.car, vehicleToWorld(v));
      expect(h.appliedWheelAngle).toBe(-v.steer);
      expect(h.telemetry().slipAngle).toBe(-v.slip);
      expect(h.telemetry().lateralSpeed).toBe(-v.lateralSpeed * 10);
    }
    expect(h.referenceSpeed).toBe(380);
    expect(h.canSaveBest).toBe(false);
  });

  it('turns right clockwise, mirrors left, and moves upwards from the web spawn', () => {
    const right = new Handling('force', pose);
    const left = new Handling('force', pose);
    for (let i = 0; i < 240; i++) {
      right.step({ ...gas, steer: i > 120 ? 0.3 : 0 }, dt, raw);
      left.step({ ...gas, steer: i > 120 ? -0.3 : 0 }, dt, raw);
    }
    expect(right.car.y).toBeLessThan(pose.y);
    expect(right.car.x).toBeGreaterThan(pose.x);
    expect(right.car.heading).toBeGreaterThan(pose.heading);
    expect(right.appliedWheelAngle).toBeGreaterThan(0);
    expect(right.car.x - pose.x).toBeCloseTo(pose.x - left.car.x, 8);
    expect(right.car.y).toBeCloseTo(left.car.y, 8);
  });

  it('translates road yaw into a signed wheel angle only on forward asphalt with hands off', () => {
    const drive = (offTrack: boolean, steer: number, roadYaw: number) => {
      const h = new Handling('force', pose);
      for (let i = 0; i < 120; i++) h.step(gas, dt, raw);
      h.step({ ...gas, steer }, dt, { ...raw, roadYaw, offTrack });
      return h;
    };
    expect(drive(false, 0, 0.5).appliedWheelAngle).toBeGreaterThan(0);
    closeCar(drive(true, 0, 0.5).car, drive(true, 0, 0).car);
    closeCar(drive(false, 0.5, 0.5).car, drive(false, 0.5, 0).car);
    const stationary = new Handling('force', pose);
    stationary.step({ ...gas, throttle: 0 }, dt, { ...raw, roadYaw: 1 });
    expect(stationary.appliedWheelAngle).toBeCloseTo(0);
  });

  it('rejects invalid timesteps before mutation and leaves zero dt unchanged', () => {
    const h = new Handling('force', pose);
    const before = { ...h.car };
    for (const invalid of [-1, NaN, Infinity, 1])
      expect(() => {
        h.step(gas, invalid, raw);
      }).toThrow(RangeError);
    h.step(gas, 0, raw);
    expect(h.car).toEqual(before);
  });
});

it.each(['legacy', 'force'] as const)(
  'disables all automatic aids in reduced %s while preserving driver requests',
  (model) => {
    const reduced = new Handling(model, pose, 'reduced');
    const noAids = new Handling(model, pose, 'reduced');
    const assisted = new Handling(model, pose);
    for (let i = 0; i < 180; i++) {
      const input = { throttle: 1, steer: i < 120 ? 0.4 : 0, handbrake: false };
      reduced.step(input, dt, { offTrack: false, roadYaw: 1, lift: 0.8, counterSteer: 1 });
      noAids.step(input, dt, { offTrack: false, roadYaw: 0, lift: 0, counterSteer: 0 });
      assisted.step(input, dt, { offTrack: false, roadYaw: 1, lift: 0.8, counterSteer: 1 });
    }
    closeCar(reduced.car, noAids.car);
    expect(reduced.car.x).not.toBeCloseTo(assisted.car.x, 2);
    expect(reduced.telemetry().speed).toBeGreaterThan(0);
    expect(reduced.canSaveBest).toBe(false);
  },
);

describe('control feedback for tyre and engine cues', () => {
  it('reports grip use as axle force over available grip, low on a cruise and high in a slide', () => {
    const h = new Handling('force', pose);
    for (let i = 0; i < 240; i++) h.step({ ...gas, throttle: 0.35 }, dt, raw);
    const cruising = h.feedback().utilisation;
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      h.step({ throttle: 1, steer: 1, handbrake: i < 12 }, dt, raw);
      const { utilisation } = h.feedback();
      expect(utilisation).toBeGreaterThanOrEqual(0);
      expect(utilisation).toBeLessThanOrEqual(1);
      peak = Math.max(peak, utilisation);
    }
    expect(cruising).toBeLessThan(0.1);
    expect(peak).toBeGreaterThan(0.8);
  });

  it('flags approximate wheelspin only while drive exceeds rear grip', () => {
    const h = new Handling('force', pose);
    // A standing full-throttle launch, before load transfer adds rear grip.
    h.step(gas, dt, raw);
    expect(h.feedback().wheelspin).toBeGreaterThan(0);
    expect(h.feedback().wheelspin).toBeLessThanOrEqual(1);
    for (let i = 0; i < 30; i++) h.step({ ...gas, throttle: 0 }, dt, raw);
    expect(h.feedback().wheelspin).toBe(0);
    h.step({ ...gas, handbrake: true }, dt, raw);
    expect(h.feedback().wheelspin).toBe(0);
  });

  it('gives legacy handling no wheelspin signal', () => {
    const h = new Handling('legacy', pose);
    for (let i = 0; i < 60; i++) h.step(gas, dt, raw);
    expect(h.feedback().wheelspin).toBe(0);
  });
});
