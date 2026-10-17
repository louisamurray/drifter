/**
 * Lap counting via ordered checkpoints. A lap counts when the car crosses the
 * start line forwards having passed 25%, 50% and 75% of the track in order,
 * so dithering across the line or driving backwards never counts.
 */
const CHECKPOINTS = [0.25, 0.5, 0.75];

export interface LapState {
  laps: number;
  /** Seconds elapsed in the current lap. */
  lapTime: number;
  bestLap: number | null;
  lastLap: number | null;
  /** How many checkpoints have been passed in order this lap. */
  nextCheckpoint: number;
  prevFraction: number;
}

export function createLapState(): LapState {
  return { laps: 0, lapTime: 0, bestLap: null, lastLap: null, nextCheckpoint: 0, prevFraction: 0 };
}

export function updateLaps(state: LapState, s: number, trackLength: number, dt: number): void {
  state.lapTime += dt;
  const f = s / trackLength;
  const prev = state.prevFraction;
  state.prevFraction = f;

  const crossedForward = prev > 0.8 && f < 0.2;
  const crossedBackward = prev < 0.2 && f > 0.8;

  if (crossedForward) {
    if (state.nextCheckpoint === CHECKPOINTS.length) {
      state.laps += 1;
      state.lastLap = state.lapTime;
      state.bestLap =
        state.bestLap === null ? state.lapTime : Math.min(state.bestLap, state.lapTime);
      state.lapTime = 0;
    }
    state.nextCheckpoint = 0;
    return;
  }
  if (crossedBackward) {
    state.nextCheckpoint = 0;
    return;
  }

  const target = CHECKPOINTS[state.nextCheckpoint];
  if (target !== undefined && prev < target && f >= target) {
    state.nextCheckpoint += 1;
  }
}
