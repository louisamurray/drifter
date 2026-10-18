import { describe, expect, it } from 'vitest';
import nativeReferenceJson from '../../docs/evidence/2026-10-19-native-vehicle-reference.json?raw';
import { angleDelta } from '../core/angle';
import {
  ASPHALT,
  GRASS,
  COUNTERSTEER_ASSIST,
  GRAVITY,
  STANDARD_VEHICLE,
  createVehicleConfig,
  createVehicleState,
  stepVehicle,
  vehicleSteerLock,
  type VehicleState,
  type VehicleInput,
  type VehicleConfig,
} from './vehicle';

const dt = 1 / 120;
const coast: VehicleInput = { throttle: 0, steer: 0, handbrake: false };
const gas: VehicleInput = { throttle: 1, steer: 0, handbrake: false };

interface NativeScenario {
  name: string;
  seconds: number;
  speed: number;
  maxSlip: number;
  driftSeconds: number;
  timeTo100?: number;
}

const nativeReference = JSON.parse(nativeReferenceJson) as { scenarios: NativeScenario[] };

function speed(car: VehicleState): number {
  return Math.hypot(car.forwardSpeed, car.lateralSpeed);
}

function energy(car: VehicleState, model: VehicleConfig = STANDARD_VEHICLE): number {
  return 0.5 * model.mass * speed(car) ** 2 + 0.5 * model.yawInertia * car.yawRate ** 2;
}

function run(car: VehicleState, seconds: number, input: VehicleInput, timestep = dt): VehicleState {
  for (let i = 0; i < Math.round(seconds / timestep); i++) stepVehicle(car, input, timestep);
  return car;
}

function assertFinite(car: VehicleState): void {
  expect(
    Object.values(car).every((value) => typeof value !== 'number' || Number.isFinite(value)),
  ).toBe(true);
}

describe('vehicle configuration and fixed-step boundary', () => {
  it('creates immutable validated tuning without modifying the standard model', () => {
    const config = createVehicleConfig({ driveForce: 0 });
    expect(Object.isFrozen(config)).toBe(true);
    expect(config.driveForce).toBe(0);
    expect(STANDARD_VEHICLE.driveForce).toBe(7200);
  });

  it.each([
    { mass: 0 },
    { yawInertia: -1 },
    { frontAxleDistance: 0 },
    { topSpeed: NaN },
    { lowSpeed: 0 },
    { maxSteer: Math.PI / 2 },
    { minSteer: 1 },
    { tyreE: 2 },
    { tyreCRear: 3 },
    { driftExitSlip: 1 },
  ])('rejects invalid model tuning: %j', (overrides) => {
    expect(() => createVehicleConfig(overrides)).toThrow(RangeError);
  });

  it.each([-1, Infinity, NaN, 1 / 30])('rejects timestep %s before mutating state', (timestep) => {
    const car = createVehicleState();
    const before = { ...car };
    expect(() => {
      stepVehicle(car, gas, timestep);
    }).toThrow(RangeError);
    expect(car).toEqual(before);
  });

  it('does not advance for a zero timestep', () => {
    const car = createVehicleState();
    const before = { ...car };
    stepVehicle(car, gas, 0);
    expect(car).toEqual(before);
  });

  it('rejects non-finite inputs and negative surface coefficients before mutation', () => {
    const car = createVehicleState();
    const before = { ...car };
    expect(() => {
      stepVehicle(car, { ...gas, steer: NaN }, dt);
    }).toThrow(RangeError);
    expect(() => {
      stepVehicle(car, gas, dt, STANDARD_VEHICLE, { ...ASPHALT, friction: -1 });
    }).toThrow(RangeError);
    expect(car).toEqual(before);
  });

  it('bounds finite input demands to the supported range', () => {
    const a = createVehicleState();
    const b = createVehicleState();
    stepVehicle(a, { ...gas, throttle: 9, steer: -7 }, dt);
    stepVehicle(b, { ...gas, steer: -1 }, dt);
    expect(a).toEqual(b);
  });
});

describe('force-based handling', () => {
  it('accelerates straight, reaches 100 km/h and remains below the model top speed', () => {
    const car = createVehicleState(0, 0, 0);
    run(car, 8, gas);
    expect(speed(car)).toBeGreaterThan(27.78);
    run(car, 12, gas);
    expect(speed(car)).toBeGreaterThan(110 / 3.6);
    expect(speed(car)).toBeLessThan(STANDARD_VEHICLE.topSpeed);
    expect(car.lateralSpeed).toBe(0);
    expect(car.heading).toBe(0);
    expect(car.drifting).toBe(false);
  });

  it('uses less steering lock at high speeds', () => {
    expect(vehicleSteerLock(2)).toBe(STANDARD_VEHICLE.maxSteer);
    expect(vehicleSteerLock(20)).toBeLessThan(vehicleSteerLock(10));
    expect(vehicleSteerLock(60)).toBeGreaterThanOrEqual(STANDARD_VEHICLE.minSteer);
  });

  it('holds a stable part-throttle turn with explicit countersteer assistance', () => {
    const car = createVehicleState(0, 0, 0);
    run(car, 4, { ...gas, throttle: 0.55 });
    let maxSlip = 0;
    for (let i = 0; i < 720; i++) {
      stepVehicle(
        car,
        { ...gas, throttle: 0.55, steer: 1 },
        dt,
        STANDARD_VEHICLE,
        ASPHALT,
        COUNTERSTEER_ASSIST,
      );
      maxSlip = Math.max(maxSlip, Math.abs(car.slip));
    }
    expect(maxSlip).toBeLessThan(0.35);
    expect(Math.abs(car.yawRate)).toBeGreaterThan(0.3);
    expect(speed(car)).toBeGreaterThan(10);
  });

  it('sustains a power-over slide through a desired-heading driver without physical assists', () => {
    const car = createVehicleState(0, 0, 0);
    car.forwardSpeed = 15;
    let driftSeconds = 0;
    let maxSlip = 0;
    for (let i = 0; i < 600; i++) {
      const travel = car.heading + Math.atan2(car.lateralSpeed, car.forwardSpeed);
      const steer =
        i < 60 ? 1 : Math.max(-1, Math.min(1, angleDelta(car.heading, travel + 0.35) / 0.6));
      stepVehicle(car, { ...gas, steer }, dt);
      if (car.drifting) driftSeconds += dt;
      maxSlip = Math.max(maxSlip, Math.abs(car.slip));
    }
    expect(driftSeconds).toBeGreaterThan(3);
    expect(maxSlip).toBeGreaterThan(0.3);
    expect(maxSlip).toBeLessThan(1.2);
  });

  it('releases a handbrake-initiated slide and catches it with explicit countersteer assistance', () => {
    const car = createVehicleState(0, 0, 0);
    car.forwardSpeed = 20;
    let driftSeconds = 0;
    let maxSlip = 0;
    for (let i = 0; i < 480; i++) {
      const handbrake = i < 50;
      stepVehicle(
        car,
        { throttle: handbrake ? 0 : 1, steer: i < 80 ? 1 : 0, handbrake },
        dt,
        STANDARD_VEHICLE,
        ASPHALT,
        COUNTERSTEER_ASSIST,
      );
      if (car.drifting) driftSeconds += dt;
      maxSlip = Math.max(maxSlip, Math.abs(car.slip));
    }
    expect(driftSeconds).toBeGreaterThan(0.8);
    expect(maxSlip).toBeGreaterThan(0.3);
    expect(Math.abs(car.slip)).toBeLessThan(0.1);
    expect(car.drifting).toBe(false);
  });

  it('does not silently apply countersteer when assistance is omitted', () => {
    const car = createVehicleState();
    car.forwardSpeed = 20;
    car.lateralSpeed = -5;
    const assisted = { ...car };
    stepVehicle(car, gas, dt);
    stepVehicle(assisted, gas, dt, STANDARD_VEHICLE, ASPHALT, COUNTERSTEER_ASSIST);
    expect(car.steer).toBe(0);
    expect(assisted.steer).toBeLessThan(0);
  });

  it('allows a wrong steering correction to spin a slide while countersteer catches the same initial rotation', () => {
    const caught = Object.assign(createVehicleState(0, 0, 0), {
      forwardSpeed: 15,
      lateralSpeed: -12,
      yawRate: 1.5,
    });
    const spun = { ...caught };
    let caughtPeak = 0;
    let spunPeak = 0;
    for (let i = 0; i < 360; i++) {
      stepVehicle(caught, { ...gas, steer: -1 }, dt);
      stepVehicle(spun, { ...gas, steer: 1 }, dt);
      caughtPeak = Math.max(caughtPeak, Math.abs(caught.slip));
      spunPeak = Math.max(spunPeak, Math.abs(spun.slip));
    }
    expect(caughtPeak).toBeLessThan(Math.PI / 2);
    expect(spunPeak).toBeGreaterThan(Math.PI / 2);
    expect(speed(caught)).toBeGreaterThan(8);
  });

  it('slows on grass and stays finite through surface transitions', () => {
    const road = createVehicleState();
    const grass = createVehicleState();
    for (let i = 0; i < 600; i++) {
      stepVehicle(road, gas, dt);
      stepVehicle(grass, gas, dt, STANDARD_VEHICLE, GRASS);
    }
    expect(speed(grass)).toBeLessThan(speed(road) * 0.7);
    for (let i = 0; i < 600; i++) {
      stepVehicle(
        grass,
        { ...gas, steer: 0.7, handbrake: i < 30 },
        dt,
        STANDARD_VEHICLE,
        i < 300 ? ASPHALT : GRASS,
      );
      assertFinite(grass);
    }
  });

  it('replays identically and mirrors left/right through throttle, handbrake and grass changes', () => {
    function replay(mirror = 1) {
      const car = createVehicleState(0, 0, 0);
      for (let i = 0; i < 1200; i++) {
        stepVehicle(
          car,
          {
            throttle: i < 900 ? 1 : 0,
            steer: (i < 300 ? 0.4 : -0.7) * mirror,
            handbrake: i >= 300 && i < 340,
          },
          dt,
          STANDARD_VEHICLE,
          i < 600 ? ASPHALT : GRASS,
        );
      }
      return car;
    }
    const right = replay();
    expect(right).toEqual(replay());
    const left = replay(-1);
    expect(left.x).toBeCloseTo(right.x, 10);
    expect(left.y).toBeCloseTo(-right.y, 10);
    expect(left.heading).toBeCloseTo(-right.heading, 10);
    expect(left.yawRate).toBeCloseTo(-right.yawRate, 10);
    expect(left.lateralSpeed).toBeCloseTo(-right.lateralSpeed, 10);
    expect(left.forwardSpeed).toBeCloseTo(right.forwardSpeed, 10);
  });
});

describe('standalone native reference at the same 120 Hz timestep', () => {
  it.each(nativeReference.scenarios)(
    'retains the $name manoeuvre within declared port tolerances',
    (reference) => {
      const car = createVehicleState(0, 0, 0);
      if (reference.name === 'powerOver') car.forwardSpeed = 15;
      if (reference.name === 'handbrakeRelease') car.forwardSpeed = 20;
      let maxSlip = 0;
      let driftSeconds = 0;
      let timeTo100: number | undefined;
      for (let i = 0; i < reference.seconds * 120; i++) {
        let throttle = 1;
        let steer = 0;
        let handbrake = false;
        let counterSteer = 0;
        if (reference.name === 'partThrottleTurn') {
          throttle = 0.55;
          steer = i < 480 ? 0 : 1;
          counterSteer = 1;
        } else if (reference.name === 'powerOver') {
          const travel = car.heading + Math.atan2(car.lateralSpeed, car.forwardSpeed);
          steer =
            i < 60 ? 1 : Math.max(-1, Math.min(1, angleDelta(car.heading, travel + 0.35) / 0.6));
        } else if (reference.name === 'handbrakeRelease') {
          handbrake = i < 50;
          throttle = handbrake ? 0 : 1;
          steer = i < 80 ? 1 : 0;
          counterSteer = 1;
        }
        stepVehicle(
          car,
          { throttle, steer, handbrake },
          dt,
          STANDARD_VEHICLE,
          reference.name === 'grass' ? GRASS : ASPHALT,
          { steer: 0, counterSteer, lift: 0 },
        );
        maxSlip = Math.max(maxSlip, Math.abs(car.slip));
        if (car.drifting) driftSeconds += dt;
        if (timeTo100 === undefined && speed(car) >= 27.78) timeTo100 = (i + 1) * dt;
      }
      // Allow bounded changes from wheel-frame slip and resistance integration, not exact equivalence.
      expect(Math.abs(speed(car) - reference.speed)).toBeLessThan(0.05);
      expect(Math.abs(maxSlip - reference.maxSlip)).toBeLessThan(0.01);
      expect(Math.abs(driftSeconds - reference.driftSeconds)).toBeLessThanOrEqual(2 * dt);
      if (reference.timeTo100 !== undefined) {
        expect(timeTo100).toBeDefined();
        expect(Math.abs((timeTo100 ?? Infinity) - reference.timeTo100)).toBeLessThanOrEqual(2 * dt);
      }
    },
  );
});

describe('traction, rest and numerical stability', () => {
  it('trades rear lateral capacity for drive demand and reports approximate saturation', () => {
    const model = createVehicleConfig({ driveForce: 50_000 });
    const driven = Object.assign(createVehicleState(), { forwardSpeed: 15, lateralSpeed: 6 });
    const coasting = { ...driven };
    stepVehicle(driven, gas, dt, model);
    stepVehicle(coasting, coast, dt, model);
    expect(driven.wheelspin).toBeGreaterThan(0.9);
    expect(Math.abs(driven.forceRearY)).toBeLessThan(Math.abs(coasting.forceRearY));
    expect(Math.hypot(driven.forceRearX, driven.forceRearY)).toBeLessThanOrEqual(
      ASPHALT.friction * model.rearGrip * driven.loadRear + 1e-8,
    );
    const ice = createVehicleState();
    stepVehicle(ice, gas, dt, model, { ...ASPHALT, friction: 0 });
    assertFinite(ice);
    expect(ice.wheelspin).toBe(1);
    expect(ice.forceRearX).toBe(0);
    expect(ice.forceRearY).toBeCloseTo(0, 12);
  });

  it('keeps both axle force vectors within their traction circles, including zero grip and locked rear tyres', () => {
    for (const surface of [ASPHALT, GRASS, { ...ASPHALT, friction: 0 }]) {
      for (const forwardSpeed of [-20, 0, 20]) {
        for (const lateralSpeed of [-8, 0, 8]) {
          for (const yawRate of [-3, 0, 3]) {
            for (const steer of [-1, 0, 1]) {
              for (const handbrake of [false, true]) {
                const car = createVehicleState();
                Object.assign(car, { forwardSpeed, lateralSpeed, yawRate, acceleration: 100 });
                stepVehicle(car, { ...gas, steer, handbrake }, dt, STANDARD_VEHICLE, surface, {
                  steer: 0,
                  counterSteer: 0,
                  lift: handbrake ? 0 : 1,
                });
                assertFinite(car);
                expect(car.loadFront).toBeGreaterThan(0);
                expect(car.loadRear).toBeGreaterThan(0);
                expect(car.loadFront + car.loadRear).toBeCloseTo(
                  STANDARD_VEHICLE.mass * GRAVITY,
                  8,
                );
                expect(Math.hypot(car.forceFrontX, car.forceFrontY)).toBeLessThanOrEqual(
                  surface.friction * STANDARD_VEHICLE.frontGrip * car.loadFront + 1e-8,
                );
                expect(Math.hypot(car.forceRearX, car.forceRearY)).toBeLessThanOrEqual(
                  surface.friction * STANDARD_VEHICLE.rearGrip * car.loadRear + 1e-8,
                );
              }
            }
          }
        }
      }
    }
  });

  it.each([0.001, 0.1, 20, -0.001, -0.1, -20])(
    'comes to rest without reversing a straight coast from %s m/s',
    (initial) => {
      const car = createVehicleState();
      car.forwardSpeed = initial;
      for (let i = 0; i < 120 * 60; i++) {
        stepVehicle(car, coast, dt);
        expect(car.forwardSpeed * initial).toBeGreaterThanOrEqual(0);
      }
      expect(speed(car)).toBe(0);
      expect(car.yawRate).toBe(0);
    },
  );

  it.each([0.01, 0.03, 0.1, -0.01, -0.03, -0.1])(
    'does not let two axles independently spend the same stopping impulse at %s m/s',
    (initial) => {
      // Disable rolling resistance so it cannot conceal a brake-induced reversal.
      const model = createVehicleConfig({ rollingCoefficient: 0 });
      const car = createVehicleState();
      car.forwardSpeed = initial;
      for (let i = 0; i < 120; i++) {
        stepVehicle(car, coast, 1 / 60, model, ASPHALT, { steer: 0, counterSteer: 0, lift: 1 });
        expect(car.forwardSpeed * initial).toBeGreaterThanOrEqual(-1e-14);
      }
      expect(speed(car)).toBeLessThan(1e-8);
    },
  );

  it.each([1 / 60, 1 / 120, 1 / 240])(
    'does not gain kinetic energy in unpowered spins or reverse slides at dt=%s',
    (timestep) => {
      for (const initial of [
        { forwardSpeed: 0, lateralSpeed: 0, yawRate: 8 },
        { forwardSpeed: -15, lateralSpeed: 6, yawRate: -2 },
        { forwardSpeed: 0.1, lateralSpeed: -0.15, yawRate: 0.3 },
        { forwardSpeed: 12, lateralSpeed: -8, yawRate: 4 },
      ]) {
        for (const lift of [0, 1]) {
          for (const handbrake of [false, true]) {
            const car = Object.assign(createVehicleState(), initial);
            for (let i = 0; i < Math.round(8 / timestep); i++) {
              const before = energy(car);
              stepVehicle(
                car,
                { ...coast, steer: 0.6, handbrake },
                timestep,
                STANDARD_VEHICLE,
                ASPHALT,
                { steer: 0, counterSteer: 0, lift },
              );
              assertFinite(car);
              expect(energy(car)).toBeLessThanOrEqual(before + 1e-8);
            }
          }
        }
      }
    },
  );

  it('preserves free world momentum through yaw without a Coriolis energy term', () => {
    const model = createVehicleConfig({
      yawDamping: 0,
      rollingCoefficient: 0,
      dragArea: 0,
      engineBrake: 0,
    });
    const car = createVehicleState(0, 0, 0);
    car.forwardSpeed = 12;
    car.lateralSpeed = 3;
    car.yawRate = 4;
    const initialEnergy = energy(car, model);
    for (let i = 0; i < 120; i++) {
      stepVehicle(car, coast, dt, model, { friction: 0, rollingResistance: 0, drive: 0 });
      const worldX =
        car.forwardSpeed * Math.cos(car.heading) - car.lateralSpeed * Math.sin(car.heading);
      const worldY =
        car.forwardSpeed * Math.sin(car.heading) + car.lateralSpeed * Math.cos(car.heading);
      expect(worldX).toBeCloseTo(12, 9);
      expect(worldY).toBeCloseTo(3, 9);
      expect(energy(car, model)).toBeCloseTo(initialEnergy, 6);
      expect(car.acceleration).toBeCloseTo(0, 9);
    }
  });

  it('converges under timestep refinement on a reproducible turn', () => {
    function turn(timestep: number) {
      const car = createVehicleState(0, 0, 0);
      car.forwardSpeed = 15;
      return run(car, 2, { ...gas, throttle: 0.4, steer: 0.3 }, timestep);
    }
    const coarse = turn(1 / 60);
    const standard = turn(1 / 120);
    const fine = turn(1 / 240);
    const reference = turn(1 / 960);
    const error = (car: VehicleState) => Math.hypot(car.x - reference.x, car.y - reference.y);
    expect(error(fine)).toBeLessThan(error(standard));
    expect(error(standard)).toBeLessThan(error(coarse));
    expect(error(standard)).toBeLessThan(0.2);
    expect(Math.abs(standard.heading - reference.heading)).toBeLessThan(0.02);
  });
});
