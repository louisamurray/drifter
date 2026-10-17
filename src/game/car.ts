import type { PhysicsConfig } from '../config';
import type { InputState } from '../core/input';

export interface CarState {
  x: number;
  y: number;
  /** Radians, 0 = +x, increasing clockwise in screen space. */
  heading: number;
  vx: number;
  vy: number;
  drifting: boolean;
}

/** Derived values, recomputed each step for rendering and scoring. */
export interface CarTelemetry {
  forwardSpeed: number;
  lateralSpeed: number;
  /** Angle between heading and velocity in radians, signed. 0 when driving straight. */
  slipAngle: number;
  speed: number;
}

/** Multipliers for the surface under the car. On the road all are 1. */
export interface Surface {
  accel: number;
  drag: number;
  grip: number;
}

export const ROAD: Surface = { accel: 1, drag: 1, grip: 1 };

export function createCar(x = 0, y = 0, heading = -Math.PI / 2): CarState {
  return { x, y, heading, vx: 0, vy: 0, drifting: false };
}

export function telemetry(car: CarState): CarTelemetry {
  const fx = Math.cos(car.heading);
  const fy = Math.sin(car.heading);
  const forwardSpeed = car.vx * fx + car.vy * fy;
  const lateralSpeed = car.vx * -fy + car.vy * fx;
  const speed = Math.hypot(car.vx, car.vy);
  const slipAngle = speed > 1 ? Math.atan2(lateralSpeed, forwardSpeed) : 0;
  return { forwardSpeed, lateralSpeed, slipAngle, speed };
}

/**
 * Arcade drift step. Velocity is split into forward and lateral parts along the
 * current heading. Steering yaws the heading, which converts forward speed into
 * lateral speed; grip damps lateral speed back out, which is what turns the car.
 * Grip falls with steer and speed so the rear breaks loose, and drops further
 * once drifting so the slide holds. Mutates and returns `car`.
 */
export function stepCar(
  car: CarState,
  input: InputState,
  dt: number,
  p: PhysicsConfig,
  surface: Surface = ROAD,
): CarState {
  // Decompose in the current heading frame
  let fx = Math.cos(car.heading);
  let fy = Math.sin(car.heading);
  let vF = car.vx * fx + car.vy * fy;
  let vL = car.vx * -fy + car.vy * fx;

  // Drift state with hysteresis, judged on lateral speed entering this step
  const absLateral = Math.abs(vL);
  if (car.drifting) {
    car.drifting = absLateral > p.driftExitLateral && vF > p.driftMinForward * 0.6;
  } else {
    car.drifting = absLateral > p.driftEnterLateral && vF > p.driftMinForward;
  }

  // Longitudinal
  const accel = (car.drifting ? p.accel * p.driftAccelBoost : p.accel) * surface.accel;
  vF += accel * input.throttle * dt;
  vF -= p.drag * surface.drag * vF * dt;
  if (input.throttle === 0) {
    const roll = p.rolling * dt;
    vF = Math.abs(vF) <= roll ? 0 : vF - Math.sign(vF) * roll;
  }
  vF = Math.max(0, Math.min(vF, p.maxSpeed));
  const speedRatio = Math.min(vF / p.maxSpeed, 1);

  // Yaw the heading. Velocity stays fixed in world space, so this converts some
  // forward speed into lateral speed when we re-decompose below.
  const authority = Math.min(vF / p.steerFullSpeed, 1) * (1 - p.highSpeedSteerLoss * speedRatio);
  let yawRate = input.steer * p.steerRate * authority;
  if (car.drifting) yawRate *= p.driftYawBoost;
  const wx = fx * vF + -fy * vL;
  const wy = fy * vF + fx * vL;
  car.heading += yawRate * dt;
  fx = Math.cos(car.heading);
  fy = Math.sin(car.heading);
  vF = wx * fx + wy * fy;
  vL = wx * -fy + wy * fx;

  // Lateral grip, reduced by steering effort at speed so the car can break loose
  const baseGrip = car.drifting
    ? p.gripDrift
    : p.gripNormal * (1 - p.steerGripLoss * Math.abs(input.steer) * speedRatio);
  const grip = baseGrip * surface.grip;
  vL *= Math.exp(-grip * dt);

  car.vx = fx * vF + -fy * vL;
  car.vy = fy * vF + fx * vL;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  return car;
}
