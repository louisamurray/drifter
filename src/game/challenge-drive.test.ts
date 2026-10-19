import { describe, expect, it } from 'vitest';
import cleanDriveJson from '../../docs/evidence/2026-10-19-challenge-clean-drive.json?raw';
import type { InputState } from '../core/input';
import type { AssistanceProfile } from './assistance';
import {
  CHALLENGE_REVISION,
  CHALLENGE_SCORING,
  CHALLENGE_SPAWN,
  challengeTotal,
  createChallenge,
  updateChallenge,
  type ChallengeEvent,
  type ChallengeState,
} from './challenge';
import {
  CLEAN_LINE,
  challengeDriver,
  driveLot,
  replay,
  type ChallengeLine,
  type Driver,
} from './drift-fixture';
import { FORCE_PHYSICS } from './handling';

interface Recording {
  identity: { physics: string; scoring: string; course: string };
  steer: number[];
  throttle: number[];
  handbrake: number[];
  expected: { total: number; zones: string[]; reason: string; events: ChallengeEvent[] };
}
const recording = JSON.parse(cleanDriveJson) as Recording;
const recordedInputs: InputState[] = recording.steer.map((steer, i) => ({
  steer,
  throttle: recording.throttle[i] ?? 0,
  handbrake: recording.handbrake[i] === 1,
}));

/** Run one attempt with the real force car, ending when the evaluator finishes. */
function attempt(driver: Driver, profile: AssistanceProfile = 'assisted'): ChallengeState {
  const s = createChallenge();
  driveLot(
    CHALLENGE_SPAWN,
    driver,
    (o, dt) => {
      updateChallenge(s, o, dt);
      return s.finished;
    },
    { profile },
  );
  return s;
}
const line = (change: Partial<ChallengeLine>) =>
  attempt(challengeDriver({ ...CLEAN_LINE, ...change }));

describe('recorded challenge drive with force handling', () => {
  it('was recorded under the current physics, scoring and course revisions', () => {
    expect(recording.identity).toMatchObject({
      physics: FORCE_PHYSICS,
      scoring: CHALLENGE_SCORING,
      course: CHALLENGE_REVISION,
    });
  });

  it('replays identical inputs to identical, reconciled score events', () => {
    const a = attempt(replay(recordedInputs));
    const b = attempt(replay(recordedInputs));
    expect(b.events).toEqual(a.events);
    expect(a.events).toEqual(recording.expected.events);
    expect(a.zones).toEqual(recording.expected.zones);
    expect(challengeTotal(a)).toBe(recording.expected.total);
    expect(a.events.reduce((sum, e) => sum + e.points, 0)).toBe(challengeTotal(a));
    expect(a.transition).toBeGreaterThan(0);
  });

  it('is still reachable by the scripted driver that recorded it', () => {
    const s = attempt(challengeDriver());
    expect(s.zones.every((z) => z === 'complete')).toBe(true);
    expect(s.reason).toBe('');
    expect(challengeTotal(s)).toBe(recording.expected.total);
  });
});

describe('exploit drives with the real car', () => {
  const clean = recording.expected.total;

  it('scores nothing for driving the line on grip', () => {
    const s = line({ slip: 0 });
    expect(challengeTotal(s)).toBe(0);
    expect(s.reason).toBe('Missed Outer 1. Build a controlled slide before the target.');
  });

  it('scores nothing for sliding wide of the marked gates', () => {
    const s = line({ offset: 400 });
    expect(challengeTotal(s)).toBe(0);
    expect(s.reason).toContain('Aim through the marked gate');
  });

  it('scores well below a clean link for excessive angle, and loses a spun corner', () => {
    const wild = line({ slip: 1.2 });
    expect(challengeTotal(wild)).toBeLessThan(clean / 2);
    expect(wild.transition).toBe(0);
    // Without automatic countersteer the same angle spins, and the corner's line is revoked.
    const spun = attempt(challengeDriver({ ...CLEAN_LINE, slip: 1.2 }), 'reduced');
    expect(spun.reason).toBe('Spun in corner 1. Countersteer sooner.');
    expect(spun.events.filter((e) => e.points < 0).map((e) => e.label)).toEqual(['Corner 1 lost']);
    expect(challengeTotal(spun)).toBe(0);
    expect(spun.events.reduce((sum, e) => sum + e.points, 0)).toBe(0);
  });

  it('awards no transition for steering jitter along the line', () => {
    const grip = challengeDriver({ ...CLEAN_LINE, slip: 0 });
    const s = attempt((car, t, frame) => {
      const input = grip(car, t, frame);
      return { ...input, steer: Math.floor(frame / 8) % 2 ? 1 : -1 };
    });
    expect(s.transition).toBe(0);
    expect(challengeTotal(s)).toBeLessThan(clean / 4);
  });

  it('scores nothing for doughnuts at the start', () => {
    const s = attempt(() => ({ steer: 1, throttle: 1, handbrake: false }));
    expect(challengeTotal(s)).toBe(0);
  });
});
