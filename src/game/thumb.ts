import { config } from '../config';
import {
  advanceControls,
  resolveControls,
  type InputState,
  type Side,
  type SteerRamp,
} from '../core/input';
import { angleDelta, assistYaw, createCar, ROAD, stepCar, type CarState } from './car';
import { createLapState, updateLaps } from './laps';
import {
  isOffTrack,
  nearestOnTrack,
  startPose,
  type Track,
  type TrackPoint,
  type TrackQuery,
} from './track';

/**
 * A naive thumb: the player model the physics is tuned against. It looks a
 * fixed distance up the road, holds a side whenever the car points off that
 * spot, re-decides a few times a second, moves after a human reaction delay,
 * and never touches the handbrake. The autopilot in `autopilot.ts` is a better
 * driver than most players; this one is deliberately worse than most.
 */
export interface ThumbProfile {
  /** Seconds between seeing the road and the thumb moving. */
  reactionSeconds: number;
  /** Seconds between decisions. Thumbs do not re-decide every frame. */
  decisionSeconds: number;
  /** How far up the road the player looks, in world px along the centreline. */
  lookaheadPx: number;
  /** Heading error in radians tolerated before a side is held. */
  deadband: number;
}

/**
 * World px of road visible ahead of the car at top speed on a screen of the
 * given CSS height. The car sits at `carScreenY`, the camera zooms out to
 * `zoomFast` and leads by `leadTime`. Landscape phones see far less road.
 */
export function visibleAhead(viewportHeight: number): number {
  const { render, camera, physics } = config;
  return (
    (viewportHeight * (1 - render.carScreenY)) / camera.zoomFast +
    camera.leadTime * physics.maxSpeed
  );
}

/** Which side the thumb holds this step, or null for none. */
export type ThumbDriver = (car: CarState) => Side | null;

export function createThumb(track: Track, profile: ThumbProfile, dt: number): ThumbDriver {
  const delaySteps = Math.round(profile.reactionSeconds / dt);
  const decideSteps = Math.max(1, Math.round(profile.decisionSeconds / dt));
  const queue: (Side | null)[] = [];
  let step = 0;
  let decision: Side | null = null;

  return (car) => {
    if (step % decideSteps === 0) decision = decide(track, car, profile);
    step += 1;
    queue.push(decision);
    return queue.length > delaySteps ? (queue.shift() ?? null) : null;
  };
}

function decide(track: Track, car: CarState, profile: ThumbProfile): Side | null {
  const q = nearestOnTrack(track, car.x, car.y);
  const target = pointAhead(track, q, profile.lookaheadPx);
  if (!target) return null;
  const err = angleDelta(car.heading, Math.atan2(target.y - car.y, target.x - car.x));
  if (err > profile.deadband) return 'right';
  if (err < -profile.deadband) return 'left';
  return null;
}

/** First centreline point at least `distance` further along the track than `q`. */
function pointAhead(track: Track, q: TrackQuery, distance: number): TrackPoint | undefined {
  const pts = track.points;
  const n = pts.length;
  for (let k = 1; k < n; k++) {
    const p = pts[(q.index + k) % n];
    if (!p) break;
    const along = (p.s - q.s + track.length) % track.length;
    if (along >= distance) return p;
  }
  return pts[q.index];
}

export interface DriveResult {
  laps: number;
  /** Fraction of steps spent off the road. */
  offTrackFraction: number;
  /** Fraction of steps spent drifting. */
  driftFraction: number;
  /** Number of separate trips onto the grass. */
  excursions: number;
}

/**
 * Drive the circuit for `seconds` exactly as a player's thumb would reach the
 * physics: held side -> `resolveControls` -> steering ramp -> road assist ->
 * `stepCar`, with the grass surface when off the road.
 */
export function driveThumb(
  track: Track,
  profile: ThumbProfile,
  seconds: number,
  ramp: SteerRamp = config.input.steer,
): DriveResult {
  const dt = config.loop.fixedDt;
  const p = config.physics;
  const thumb = createThumb(track, profile, dt);
  const start = startPose(track);
  const car = createCar(start.x, start.y, start.heading);
  const laps = createLapState();
  const input: InputState = { throttle: 0, steer: 0, handbrake: false };
  let roadHeading = start.heading;
  let offTrack = false;
  let offSteps = 0;
  let driftSteps = 0;
  let excursions = 0;
  const total = Math.round(seconds / dt);

  for (let i = 0; i < total; i++) {
    const side = thumb(car);
    advanceControls(input, resolveControls(side ? [side] : [], false, false, false), dt, ramp);
    const assist = assistYaw(car.heading, roadHeading, car.drifting, offTrack, p);
    stepCar(car, input, dt, p, offTrack ? config.offTrack : ROAD, assist);
    const q = nearestOnTrack(track, car.x, car.y);
    const tp = track.points[q.index];
    if (tp) roadHeading = Math.atan2(tp.ty, tp.tx);
    const wasOff = offTrack;
    offTrack = isOffTrack(track, q.distance);
    if (offTrack) offSteps += 1;
    if (offTrack && !wasOff) excursions += 1;
    if (car.drifting) driftSteps += 1;
    updateLaps(laps, q.s, track.length, dt);
  }
  return {
    laps: laps.laps,
    offTrackFraction: offSteps / total,
    driftFraction: driftSteps / total,
    excursions,
  };
}
