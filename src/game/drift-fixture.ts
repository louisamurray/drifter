import { angleDelta } from '../core/angle';
import { config } from '../config';
import type { InputState } from '../core/input';
import type { AssistanceProfile } from './assistance';
import type { CarState, CarTelemetry } from './car';
import { pathPoint } from './challenge';
import { Handling, type Pose } from './handling';
import { observe, type Observation } from './lessons';
import { insideLot } from './lot';

/**
 * Scripted drivers for activity fixtures. Tests only: nothing in the game imports this.
 * Drivers see the car as the renderer does, in web-world units with clockwise angles.
 */
export type Driver = (car: CarState, t: CarTelemetry, frame: number) => InputState;

/** Steering and throttle quantised to 1/1000 so a recording replays exactly from JSON. */
function quantise(input: InputState): InputState {
  return {
    steer: Math.round(Math.max(-1, Math.min(1, input.steer)) * 1000) / 1000,
    throttle: Math.round(Math.max(0, Math.min(1, input.throttle)) * 1000) / 1000,
    handbrake: input.handbrake,
  };
}

/**
 * Drive force handling on the lot at the web's 60 Hz step, as a practice, lesson or
 * challenge session does: no road following or corner lift, grass beyond the slab.
 * `onStep` returns true to stop.
 */
export function driveLot(
  spawn: Pose,
  driver: Driver,
  onStep: (o: Observation, dt: number) => boolean,
  options: { profile?: AssistanceProfile; seconds?: number } = {},
): { inputs: InputState[]; observations: Observation[] } {
  const handling = new Handling('force', spawn, options.profile ?? 'assisted');
  const inputs: InputState[] = [];
  const observations: Observation[] = [];
  const dt = 1 / 60;
  let offTrack = false;
  for (let frame = 0; frame < (options.seconds ?? 40) * 60; frame++) {
    const input = quantise(driver(handling.car, handling.telemetry(), frame));
    inputs.push(input);
    handling.step(input, dt, { offTrack, roadYaw: 0, lift: 0, counterSteer: 1 });
    offTrack = !insideLot(config.lot, handling.car.x, handling.car.y);
    const o = observe(handling.car, handling.telemetry(), offTrack);
    observations.push(o);
    if (onStep(o, dt)) break;
  }
  return { inputs, observations };
}

export function replay(inputs: readonly InputState[]): Driver {
  return (_car, _t, frame) => inputs[frame] ?? { steer: 0, throttle: 0, handbrake: false };
}

/** Course progress as the challenge evaluator measures it. */
function progress(car: CarState): number {
  return (1000 - car.y) / 2000;
}

export interface ChallengeLine {
  /** Target body slip in radians while cornering; 0 drives the line on grip. */
  slip: number;
  /** Speed above which the driver lifts, in world units per second. */
  topSpeed: number;
  /** Frames of handbrake flick at corner entry and at the switch. */
  entryFlick: number;
  switchFlick: number;
  /** Lateral offset from the marked line, in world units (positive is to the right). */
  offset: number;
}

export const CLEAN_LINE: ChallengeLine = {
  slip: 0.6,
  topSpeed: 230,
  entryFlick: 18,
  switchFlick: 8,
  offset: 0,
};

/**
 * Follows the marked S-bend: grip to Start, a handbrake flick into the left-hand corner,
 * a held slide, a flick across the switch, a held right slide, then grip to Finish.
 */
export function challengeDriver(line: ChallengeLine = CLEAN_LINE): Driver {
  let phase = 0;
  let flick = 0;
  return (car, t) => {
    const at = progress(car);
    const travel = t.speed > 20 ? Math.atan2(car.vy, car.vx) : car.heading;
    const p = pathPoint(Math.min(1.2, Math.max(0, at) + 0.08));
    const target = { x: p.x + line.offset, y: p.y };
    const want = Math.atan2(target.y - car.y, target.x - car.x);
    // +1 is a left slide in web telemetry.
    const sign = at < 0.5 ? 1 : -1;
    if (phase === 0 && at > 0.05) {
      phase = 1;
      flick = line.entryFlick;
    } else if (phase === 1 && at > 0.5) {
      phase = 2;
      flick = line.switchFlick;
    }
    const throttle = t.speed > line.topSpeed ? 0.35 : 1;
    if (phase === 0 || at > 0.9 || line.slip === 0)
      return {
        steer: angleDelta(car.heading, want) * 2,
        throttle: at > 0.9 ? Math.min(throttle, 0.3) : throttle,
        handbrake: false,
      };
    if (flick > 0) {
      flick -= 1;
      return { steer: -sign, throttle: 0, handbrake: true };
    }
    // A left slide points the nose anticlockwise of travel: heading = travel - slip.
    const heading = travel + 0.5 * angleDelta(travel, want) - sign * line.slip;
    return { steer: angleDelta(car.heading, heading) * 3, throttle, handbrake: false };
  };
}
