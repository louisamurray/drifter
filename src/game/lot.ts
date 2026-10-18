import type { InputState } from '../core/input';
import { angleDelta, telemetry, type CarState } from './car';
import type { Bounds } from './track';

/**
 * An open lot: a rounded rectangle of asphalt centred on the origin, grass
 * beyond its edge, and nothing to follow. The free drift mode's course. No
 * road direction means no road assist and no corner lift; the only rule is
 * to stay on the asphalt.
 */
export interface Lot {
  width: number;
  height: number;
  /** Corner radius of the asphalt. */
  corner: number;
  /** Radius of the painted ring in the middle: a skidpad circle to slide around. */
  ring: number;
  /** Painted parking bays along the long edges: how deep they reach in and how far apart they are. */
  bayDepth: number;
  bayPitch: number;
}

export function lotBounds(lot: Lot): Bounds {
  return {
    minX: -lot.width / 2,
    minY: -lot.height / 2,
    maxX: lot.width / 2,
    maxY: lot.height / 2,
  };
}

/** True when (x, y) is on the asphalt. */
export function insideLot(lot: Lot, x: number, y: number): boolean {
  const hx = lot.width / 2;
  const hy = lot.height / 2;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > hx || ay > hy) return false;
  const dx = ax - (hx - lot.corner);
  const dy = ay - (hy - lot.corner);
  return dx <= 0 || dy <= 0 || dx * dx + dy * dy <= lot.corner * lot.corner;
}

/** A run starts in the middle of the lot, facing up it. */
export function lotStartPose(): { x: number; y: number; heading: number } {
  return { x: 0, y: 0, heading: -Math.PI / 2 };
}

export interface LotPilotOptions {
  /** How fast the chased point moves along the eight, in world px/s. */
  speed: number;
  /** The point runs at double speed while closer than this, so the car never overtakes it. */
  lead: number;
  /** The point waits when the car falls further behind than this. */
  leash: number;
  /** Speed above which the pilot pulls the handbrake to start a slide. */
  limit: number;
}

const PILOT: LotPilotOptions = { speed: 230, lead: 140, leash: 320, limit: 260 };

export type LotPilot = (car: CarState, dt: number) => InputState;

/**
 * A ghost for the title screen: chases a point moving round a figure of eight
 * inside the lot, holding a side like a thumb and pulling the handbrake to
 * swing the nose through the direction changes. The point waits when the car
 * falls behind, so the eight is drawn rather than cut across.
 */
export function createLotPilot(lot: Lot, o: LotPilotOptions = PILOT): LotPilot {
  // Demonstrate the same tight, catchable slides even when the practice area grows.
  // Scaling the eight with a larger lot flattens its bends until the ghost stops drifting.
  const a = Math.min(lot.width * 0.3, 540);
  const b = Math.min(lot.height * 0.3, 780);
  let t = 0;
  return (car, dt) => {
    const wx = a * Math.sin(2 * t);
    const wy = -b * Math.sin(t);
    const dist = Math.hypot(wx - car.x, wy - car.y);
    const rate = dist < o.lead ? o.speed * 2 : dist < o.leash ? o.speed : 0;
    const pathSpeed = Math.max(1, Math.hypot(2 * a * Math.cos(2 * t), b * Math.cos(t)));
    t += (rate * dt) / pathSpeed;

    const tel = telemetry(car);
    const err = angleDelta(car.heading, Math.atan2(wy - car.y, wx - car.x));
    const deadband = 0.08;
    const steer = err > deadband ? 1 : err < -deadband ? -1 : 0;
    const handbrake = tel.speed > 120 && (Math.abs(err) > 0.7 || tel.speed > o.limit);
    return { throttle: handbrake ? 0 : 1, steer, handbrake };
  };
}
