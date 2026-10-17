import { config } from '../config';

export type ScoreEvent =
  | { type: 'multiplier'; value: number }
  | { type: 'bank'; amount: number }
  | { type: 'lost'; amount: number; kept: number }
  | { type: 'lap'; bonus: number };

export interface ScoreState {
  score: number;
  /** Unbanked points in the current chain. */
  chain: number;
  /** Seconds of continuous drifting in the current chain. */
  chainTime: number;
  multiplier: number;
  /** Seconds since the car was last drifting. */
  grace: number;
  /** Seconds left in the run. */
  timeLeft: number;
  finished: boolean;
  events: ScoreEvent[];
}

export interface ScoreInput {
  drifting: boolean;
  offTrack: boolean;
  /** Signed slip angle in radians. */
  slipAngle: number;
  speed: number;
  /** True on the step a lap was completed. */
  lapCompleted: boolean;
  handbrake: boolean;
}

export function createScore(): ScoreState {
  return {
    score: 0,
    chain: 0,
    chainTime: 0,
    multiplier: 1,
    grace: 0,
    timeLeft: config.scoring.runSeconds,
    finished: false,
    events: [],
  };
}

/** 0..1 progress towards the next multiplier step, 1 when capped. */
export function multiplierProgress(s: ScoreState): number {
  const c = config.scoring;
  if (s.multiplier >= c.multiplierMax) return 1;
  if (s.chain === 0) return 0;
  return (s.chainTime % c.multiplierEvery) / c.multiplierEvery;
}

function bank(s: ScoreState): void {
  if (s.chain > 0) {
    s.score += s.chain;
    s.events.push({ type: 'bank', amount: s.chain });
  }
  resetChain(s);
}

function resetChain(s: ScoreState): void {
  s.chain = 0;
  s.chainTime = 0;
  s.multiplier = 1;
  s.grace = 0;
}

/** Advance scoring by one physics step. Events accumulate until the caller drains them. */
export function updateScore(s: ScoreState, input: ScoreInput, dt: number): void {
  if (s.finished) return;
  const c = config.scoring;

  s.timeLeft -= dt;
  if (s.timeLeft <= 0) {
    s.timeLeft = 0;
    bank(s);
    s.finished = true;
    return;
  }

  if (input.lapCompleted) {
    s.score += c.lapBonus;
    s.events.push({ type: 'lap', bonus: c.lapBonus });
  }

  if (input.offTrack) {
    // Running wide ends the chain: part of it banks, the rest is lost with the multiplier
    if (s.chain > 0) {
      const kept = s.chain * c.offTrackKeep;
      s.score += kept;
      s.events.push({ type: 'lost', amount: s.chain - kept, kept });
    }
    resetChain(s);
    return;
  }

  if (input.drifting) {
    s.grace = 0;
    s.chainTime += dt;
    const steps = Math.floor(s.chainTime / c.multiplierEvery);
    const next = Math.min(c.multiplierMax, 1 + steps * c.multiplierStep);
    if (next > s.multiplier) {
      s.multiplier = next;
      s.events.push({ type: 'multiplier', value: next });
    }
    const rate = c.pointsScale * (input.handbrake ? c.handbrakeScoreScale : 1);
    s.chain += rate * Math.abs(input.slipAngle) * input.speed * dt * s.multiplier;
    return;
  }

  if (s.chain > 0) {
    s.grace += dt;
    if (s.grace >= c.graceSeconds) bank(s);
  }
}

export function drainEvents(s: ScoreState): ScoreEvent[] {
  const out = s.events;
  s.events = [];
  return out;
}
