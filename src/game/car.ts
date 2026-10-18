import type { PhysicsConfig } from '../config';
import { angleDelta } from '../core/angle';
import type { InputState } from '../core/input';

export { angleDelta };

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
  /** Extra yaw (rad/s) from road assist. Applied only when the player is not steering. */
  assistYaw = 0,
  /** Corner lift, 0 (none) to 1 (throttle fully off, lift drag fully on). */
  lift = 0,
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
  const turn = Math.max(0, Math.abs(input.steer) - p.turnThrottleFrom) / (1 - p.turnThrottleFrom);
  const throttle = input.throttle * (1 - p.turnThrottleCut * Math.min(1, turn)) * (1 - lift);
  vF += accel * throttle * dt;
  const drag = p.drag * surface.drag + (input.handbrake ? p.handbrakeDrag : 0) + p.liftDrag * lift;
  vF -= drag * vF * dt;
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
  if (Math.abs(input.steer) < 0.05) yawRate += assistYaw * Math.min(1, vF / p.steerFullSpeed);
  const wx = fx * vF + -fy * vL;
  const wy = fy * vF + fx * vL;
  car.heading += yawRate * dt;
  fx = Math.cos(car.heading);
  fy = Math.sin(car.heading);
  vF = wx * fx + wy * fy;
  vL = wx * -fy + wy * fx;

  // Lateral grip, reduced by steering effort at speed so the car can break loose
  let baseGrip = car.drifting
    ? p.gripDrift
    : p.gripNormal * (1 - p.steerGripLoss * Math.abs(input.steer) * speedRatio);
  if (input.handbrake) baseGrip = Math.min(baseGrip, p.handbrakeGrip);
  const grip = baseGrip * surface.grip;
  vL *= Math.exp(-grip * dt);

  car.vx = fx * vF + -fy * vL;
  car.vy = fy * vF + fx * vL;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  return car;
}

/**
 * Road assist yaw towards the road direction. Zero off the road, so the grass
 * still punishes, and softer mid-drift so a slide exits on the player's terms.
 */
export function assistYaw(
  heading: number,
  roadHeading: number,
  drifting: boolean,
  offTrack: boolean,
  p: PhysicsConfig,
): number {
  if (offTrack) return 0;
  const err = angleDelta(heading, roadHeading);
  const yaw = Math.max(-p.assistMaxYaw, Math.min(p.assistMaxYaw, err * p.assistGain));
  return drifting ? yaw * p.assistDriftScale : yaw;
}

/** Speed (px/s) the car can carry round a centreline of radius `radius`. */
export function cornerSpeed(radius: number, p: PhysicsConfig): number {
  return Math.min(p.maxSpeed, Math.sqrt(p.cornerAccel * radius));
}

/**
 * Corner lift amount, 0 to 1, from the forward speed and the tightest radius
 * within the lookahead. Ramps in over `liftBand` px/s above the corner speed so
 * the throttle eases rather than snaps.
 */
export function cornerLift(forwardSpeed: number, minRadius: number, p: PhysicsConfig): number {
  const over = forwardSpeed - cornerSpeed(minRadius, p);
  if (over <= 0) return 0;
  return Math.min(1, over / p.liftBand);
}

/** How far ahead the lift looks at this speed, in world px. */
export function liftLookahead(forwardSpeed: number, p: PhysicsConfig): number {
  return Math.max(p.liftMinLook, forwardSpeed * p.liftLookSeconds);
}
