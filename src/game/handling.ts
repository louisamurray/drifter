import { ASSISTANCE, type AssistanceProfile } from './assistance';
import { config } from '../config';
import type { InputState } from '../core/input';
import { createCar, ROAD, stepCar, telemetry, type CarState, type CarTelemetry } from './car';
import {
  ASPHALT,
  GRASS,
  STANDARD_VEHICLE,
  createVehicleState,
  stepVehicle,
  type VehicleState,
  type VehicleAssist,
} from './vehicle';

/** The sole SI ↔ web-world boundary. Web angles and lateral speeds are clockwise/right-positive. */
export const WORLD_UNITS_PER_METRE = 10;
export type HandlingModel = 'legacy' | 'force';
export type Pose = Pick<CarState, 'x' | 'y' | 'heading'>;

export function vehicleToWorld(vehicle: VehicleState): CarState {
  const c = Math.cos(vehicle.heading);
  const s = Math.sin(vehicle.heading);
  return {
    x: vehicle.x * WORLD_UNITS_PER_METRE,
    y: -vehicle.y * WORLD_UNITS_PER_METRE,
    heading: -vehicle.heading,
    vx: (vehicle.forwardSpeed * c - vehicle.lateralSpeed * s) * WORLD_UNITS_PER_METRE,
    vy: -(vehicle.forwardSpeed * s + vehicle.lateralSpeed * c) * WORLD_UNITS_PER_METRE,
    yawRate: -vehicle.yawRate,
    drifting: vehicle.drifting,
  };
}

/** Used for spawn/import only; never discard the solver's force/load history between steps. */
export function worldToVehicle(car: CarState): VehicleState {
  const t = telemetry(car);
  return {
    ...createVehicleState(
      car.x / WORLD_UNITS_PER_METRE,
      -car.y / WORLD_UNITS_PER_METRE,
      -car.heading,
    ),
    forwardSpeed: t.forwardSpeed / WORLD_UNITS_PER_METRE,
    lateralSpeed: -t.lateralSpeed / WORLD_UNITS_PER_METRE,
    yawRate: -car.yawRate,
    drifting: car.drifting,
  };
}

export interface HandlingStep {
  offTrack: boolean;
  /** Web clockwise yaw request from the existing road-following controller. */
  roadYaw: number;
  lift: number;
  counterSteer: number;
}

/** Session-owned solver plus a stable world projection for existing course/render consumers. */
export class Handling {
  readonly car: CarState;
  private vehicle: VehicleState;
  private wheelAngle = 0;
  private assist: VehicleAssist = { steer: 0, lift: 0, counterSteer: 0 };

  constructor(
    readonly model: HandlingModel,
    pose: Pose,
    readonly profile: AssistanceProfile = 'assisted',
  ) {
    this.car = createCar(pose.x, pose.y, pose.heading);
    this.vehicle = worldToVehicle(this.car);
  }

  reset(pose: Pose): void {
    Object.assign(this.car, createCar(pose.x, pose.y, pose.heading));
    this.vehicle = worldToVehicle(this.car);
    this.wheelAngle = 0;
    this.assist = { steer: 0, lift: 0, counterSteer: 0 };
  }

  get referenceSpeed(): number {
    return this.model === 'legacy'
      ? config.physics.maxSpeed
      : STANDARD_VEHICLE.topSpeed * WORLD_UNITS_PER_METRE;
  }

  /** Force handling cannot enter legacy records until competitive ruleset identity exists. */
  get canSaveBest(): boolean {
    return this.model === 'legacy' && this.profile === 'assisted';
  }

  get appliedWheelAngle(): number {
    return this.wheelAngle;
  }

  telemetry(): CarTelemetry {
    if (this.model === 'legacy') return telemetry(this.car);
    return {
      speed:
        Math.hypot(this.vehicle.forwardSpeed, this.vehicle.lateralSpeed) * WORLD_UNITS_PER_METRE,
      forwardSpeed: this.vehicle.forwardSpeed * WORLD_UNITS_PER_METRE,
      lateralSpeed: -this.vehicle.lateralSpeed * WORLD_UNITS_PER_METRE,
      slipAngle: -this.vehicle.slip,
    };
  }

  /** Axle force / available grip. This is utilisation, not simulated wheel RPM. */
  feedback(): { utilisation: number; wheelspin: number } {
    if (this.model === 'legacy')
      return {
        utilisation: Math.min(
          1,
          Math.abs(this.telemetry().lateralSpeed) / config.juice.fullIntensityLateral,
        ),
        wheelspin: 0,
      };
    const v = this.vehicle;
    return {
      utilisation: Math.min(
        1,
        Math.max(
          Math.abs(v.forceFrontY) / Math.max(1, v.loadFront * STANDARD_VEHICLE.frontGrip),
          Math.abs(v.forceRearY) / Math.max(1, v.loadRear * STANDARD_VEHICLE.rearGrip),
        ),
      ),
      wheelspin: Math.max(0, Math.min(1, v.wheelspin)),
    };
  }

  diagnostics(): string {
    if (this.model === 'legacy') return 'legacy · road yaw / corner lift';
    const v = this.vehicle;
    return `force · no best saves\nroad wheel ${(-this.assist.steer).toFixed(2)} lift ${this.assist.lift.toFixed(2)} counter ${this.assist.counterSteer.toFixed(1)}\napplied ${this.wheelAngle.toFixed(2)} · axle slip ${(-v.slipFront).toFixed(2)}/${(-v.slipRear).toFixed(2)}\nload N ${v.loadFront.toFixed(0)}/${v.loadRear.toFixed(0)}\naxle force N ${Math.hypot(v.forceFrontX, v.forceFrontY).toFixed(0)}/${Math.hypot(v.forceRearX, v.forceRearY).toFixed(0)}\napproximate wheelspin ${v.wheelspin.toFixed(2)}`;
  }

  step(input: InputState, dt: number, options: HandlingStep): void {
    if (!Number.isFinite(dt) || dt < 0 || dt > 1 / 60)
      throw new RangeError('Invalid handling timestep');
    if (dt === 0) return;
    const policy = ASSISTANCE[this.profile];
    const roadYaw = options.roadYaw * policy.roadFollowing;
    const lift = options.lift * policy.cornerBraking;
    const counterSteer = options.counterSteer * policy.counterSteer;
    if (this.model === 'legacy') {
      stepCar(
        this.car,
        input,
        dt,
        config.physics,
        options.offTrack ? config.offTrack : ROAD,
        roadYaw,
        lift,
        policy.counterSteer,
      );
      this.wheelAngle = input.steer * 0.42;
      return;
    }
    // Convert a desired yaw rate to a bicycle road-wheel angle. Keep it hands-off,
    // forward-only and disabled on grass, as in the legacy road-following policy.
    const speed = this.vehicle.forwardSpeed;
    this.assist = {
      steer:
        Math.abs(input.steer) < 0.05 && !options.offTrack && speed > STANDARD_VEHICLE.lowSpeed
          ? -Math.atan(
              (roadYaw * (STANDARD_VEHICLE.frontAxleDistance + STANDARD_VEHICLE.rearAxleDistance)) /
                speed,
            )
          : 0,
      lift,
      counterSteer,
    };
    const demand = { ...input, steer: -input.steer };
    const surface = options.offTrack ? GRASS : ASPHALT;
    // Sample controls once per web step; retain force history through 120 Hz substeps.
    const steps = Math.ceil(dt / (1 / 120));
    for (let i = 0; i < steps; i++) {
      stepVehicle(this.vehicle, demand, dt / steps, STANDARD_VEHICLE, surface, this.assist);
    }
    Object.assign(this.car, vehicleToWorld(this.vehicle));
    this.wheelAngle = -this.vehicle.steer;
  }
}
