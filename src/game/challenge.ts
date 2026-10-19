import type { Observation } from './lessons';

/** Frozen candidate rules. Change this revision whenever geometry or scoring changes. */
export const CHALLENGE_REVISION = 's-bend-2';
/** Scoring and event accounting. Change it whenever an award, revocation or rounding rule changes. */
export const CHALLENGE_SCORING = 'precision-2';
export const CHALLENGE_RULES = {
  minSpeed: 70,
  minSlip: 0.2,
  maxSlip: 0.95,
  maxYaw: 3.5,
  linePerZone: 500,
  anglePerCorner: 1500,
  transition: 600,
  seconds: 60,
} as const;
/** Driven upwards from y 1000: a left-hand corner bulging right, then a right-hand corner. */
export function pathPoint(t: number): { x: number; y: number } {
  return { x: 400 * Math.sin(2 * Math.PI * t), y: 1000 - 2000 * t };
}
const times = [0, 0.12, 0.25, 0.5, 0.62, 0.75, 1];
const labels = ['Start', 'Outer 1', 'Clip 1', 'Switch', 'Outer 2', 'Clip 2', 'Finish'];
export const CHALLENGE_GATES = times.map((t, i) => {
  const p = pathPoint(t);
  const dx = 800 * Math.PI * Math.cos(2 * Math.PI * t);
  const dy = -2000;
  const length = Math.hypot(dx, dy);
  return { ...p, nx: dx / length, ny: dy / length, halfWidth: 180, label: labels[i] ?? '', t };
});
export const CHALLENGE_SPAWN = { x: -150, y: 1120, heading: Math.atan2(-2000, 800 * Math.PI) };
export type ZoneState = 'upcoming' | 'complete' | 'missed';
/** One change to the total. Revocations are negative, so the events always sum to the total. */
export interface ChallengeEvent {
  /** Seconds since Start. */
  at: number;
  category: 'line' | 'angle' | 'transition';
  label: string;
  points: number;
}
export interface ChallengeState {
  next: number;
  started: boolean;
  finished: boolean;
  elapsed: number;
  zones: ZoneState[];
  line: number;
  angle: number;
  transition: number;
  reason: string;
  previous: Observation | null;
  progress: number;
  /** Angle quality earned in each corner, committed as one event when the corner closes. */
  cornerAngle: number[];
  cornerLine: number[];
  angleCommitted: number[];
  invalid: boolean[];
  leftSlide: boolean;
  rightHold: number;
  events: ChallengeEvent[];
}
export function createChallenge(): ChallengeState {
  return {
    next: 0,
    started: false,
    finished: false,
    elapsed: 0,
    zones: times.map(() => 'upcoming'),
    line: 0,
    angle: 0,
    transition: 0,
    reason: '',
    previous: null,
    progress: 0,
    cornerAngle: [0, 0],
    cornerLine: [0, 0],
    angleCommitted: [-1, -1],
    invalid: [false, false],
    leftSlide: false,
    rightHold: 0,
    events: [],
  };
}
export function challengeTotal(s: ChallengeState): number {
  return s.line + s.angle + s.transition;
}
function loss(s: ChallengeState, text: string): void {
  if (!s.reason) s.reason = text;
}
function award(
  s: ChallengeState,
  category: ChallengeEvent['category'],
  label: string,
  points: number,
): void {
  if (points === 0) return;
  s.events.push({ at: s.elapsed, category, label, points });
  s[category] += points;
}
/** Close a corner once: its earned angle becomes one rounded event, unless it was lost. */
function commitAngle(s: ChallengeState, corner: number): void {
  if ((s.angleCommitted[corner] ?? 0) >= 0) return;
  const points = s.invalid[corner] ? 0 : Math.round(s.cornerAngle[corner] ?? 0);
  s.angleCommitted[corner] = points;
  award(s, 'angle', `Corner ${String(corner + 1)} angle`, points);
}
/** The first spin or run-wide in a corner revokes what that corner and the link had earned. */
function invalidate(s: ChallengeState, corner: number): void {
  if (s.invalid[corner]) return;
  s.invalid[corner] = true;
  const label = `Corner ${String(corner + 1)} lost`;
  award(s, 'line', label, -(s.cornerLine[corner] ?? 0));
  award(s, 'angle', label, -Math.max(0, s.angleCommitted[corner] ?? 0));
  award(s, 'transition', 'Transition lost', -s.transition);
  s.cornerLine[corner] = 0;
  s.cornerAngle[corner] = 0;
}
function finish(s: ChallengeState, reason?: string): void {
  if (reason) loss(s, reason);
  commitAngle(s, 0);
  commitAngle(s, 1);
  s.finished = true;
}
/** End an attempt early, for example from the pause menu. Settled attempts are unchanged. */
export function endChallenge(s: ChallengeState): void {
  if (!s.finished) finish(s, 'Finish not reached. Retry from the start.');
}
export function updateChallenge(s: ChallengeState, o: Observation, dt: number): void {
  if (s.finished || dt <= 0 || dt > 0.1 || !Number.isFinite(dt)) return;
  if (!Object.values(o).every((v) => typeof v === 'boolean' || Number.isFinite(v))) {
    finish(s, 'Invalid motion. Reset to try again.');
    return;
  }
  const prev = s.previous;
  s.previous = { ...o };
  if (!prev) return;
  const distance = Math.hypot(o.x - prev.x, o.y - prev.y);
  if (distance > Math.max(prev.speed, o.speed) * dt * 2 + 5) {
    finish(s, 'Course skipped. Follow the targets in order.');
    return;
  }
  if (s.started) {
    s.elapsed += dt;
    if (s.elapsed >= CHALLENGE_RULES.seconds) {
      finish(s, 'Time limit reached. Carry more forward speed.');
      return;
    }
  }
  const t = Math.max(0, Math.min(1, (1000 - o.y) / 2000));
  const corner = t < 0.5 ? 0 : 1;
  const expected = corner === 0 ? 1 : -1;
  const controlled =
    !o.offTrack &&
    o.forwardSpeed > 40 &&
    o.speed >= CHALLENGE_RULES.minSpeed &&
    Math.abs(o.slipAngle) <= CHALLENGE_RULES.maxSlip &&
    Math.abs(o.yawRate) < CHALLENGE_RULES.maxYaw;
  const sliding =
    controlled &&
    Math.abs(o.slipAngle) >= CHALLENGE_RULES.minSlip &&
    Math.sign(o.slipAngle) === expected &&
    distance > 0.05;
  if (
    s.started &&
    !controlled &&
    (o.offTrack ||
      Math.abs(o.slipAngle) > CHALLENGE_RULES.maxSlip ||
      Math.abs(o.yawRate) >= CHALLENGE_RULES.maxYaw)
  ) {
    invalidate(s, corner);
    if (corner === 0) s.leftSlide = false;
    loss(
      s,
      o.offTrack
        ? `Ran wide in corner ${String(corner + 1)}. Stay on the asphalt.`
        : `Spun in corner ${String(corner + 1)}. Countersteer sooner.`,
    );
  }
  const linePoint = pathPoint(t);
  const nearLine = Math.hypot(o.x - linePoint.x, o.y - linePoint.y) <= 180;
  if (s.started && t > s.progress && nearLine && sliding && !s.invalid[corner]) {
    const advance = Math.min(t - s.progress, distance / 2000);
    const quality = Math.max(0, 1 - Math.abs(Math.abs(o.slipAngle) - 0.5) / 0.5);
    s.cornerAngle[corner] = Math.min(
      CHALLENGE_RULES.anglePerCorner,
      (s.cornerAngle[corner] ?? 0) + advance * 2 * CHALLENGE_RULES.anglePerCorner * quality,
    );
    if (corner === 0 && t > 0.2 && t < 0.5) s.leftSlide = true;
    if (corner === 1 && t < 0.7 && s.leftSlide && !s.invalid[0]) {
      s.rightHold += dt;
      if (s.rightHold >= 0.25 && !s.transition)
        award(s, 'transition', 'Transition', CHALLENGE_RULES.transition);
    }
  } else if (!sliding) s.rightHold = 0;
  if (s.started) s.progress = Math.max(s.progress, t);
  const gate = CHALLENGE_GATES[s.next];
  if (gate) {
    const a = (prev.x - gate.x) * gate.nx + (prev.y - gate.y) * gate.ny;
    const b = (o.x - gate.x) * gate.nx + (o.y - gate.y) * gate.ny;
    if (a <= 0 && b > 0 && o.forwardSpeed > 0) {
      const f = -a / (b - a);
      const x = prev.x + (o.x - prev.x) * f - gate.x;
      const y = prev.y + (o.y - prev.y) * f - gate.y;
      const within = Math.abs(-x * gate.ny + y * gate.nx) <= gate.halfWidth;
      if (s.next === 0 && !within) return;
      const zoneCorner = s.next < 3 ? 0 : 1;
      const scoredZone = [1, 2, 4, 5].includes(s.next);
      const valid = within && (!scoredZone || (sliding && !s.invalid[zoneCorner]));
      s.zones[s.next] = valid ? 'complete' : 'missed';
      if (scoredZone && valid) {
        s.cornerLine[zoneCorner] = (s.cornerLine[zoneCorner] ?? 0) + CHALLENGE_RULES.linePerZone;
        award(s, 'line', gate.label, CHALLENGE_RULES.linePerZone);
      }
      if (!valid)
        loss(
          s,
          `Missed ${gate.label}. ${within ? 'Build a controlled slide before the target.' : 'Aim through the marked gate.'}`,
        );
      s.started = true;
      s.next += 1;
      if (s.next === 4) commitAngle(s, 0);
      if (s.next === CHALLENGE_GATES.length)
        finish(
          s,
          s.transition
            ? undefined
            : 'Transition not linked. Catch the left slide, then hold the right.',
        );
    }
  }
}
