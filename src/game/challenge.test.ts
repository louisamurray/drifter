import { describe, expect, it } from 'vitest';
import { angleDelta } from '../core/angle';
import { config } from '../config';
import {
  CHALLENGE_GATES,
  CHALLENGE_REVISION,
  CHALLENGE_RULES,
  CHALLENGE_SPAWN,
  challengeTotal,
  createChallenge,
  pathPoint,
  updateChallenge,
} from './challenge';
import type { Observation } from './lessons';
import { insideLot } from './lot';
function run(kind: 'clean' | 'straight' | 'spin' | 'backwards' = 'clean') {
  const s = createChallenge();
  for (let i = -10; i <= 1010; i++) {
    const t = i / 1000;
    const p = pathPoint(t);
    const prev = pathPoint(t - 0.001);
    const o: Observation = {
      ...p,
      speed: Math.hypot(p.x - prev.x, p.y - prev.y) * 60,
      forwardSpeed: kind === 'backwards' ? -100 : 100,
      slipAngle: kind === 'straight' ? 0 : kind === 'spin' ? 1.8 : t < 0.5 ? 0.5 : -0.5,
      yawRate: 0.8,
      offTrack: false,
    };
    updateChallenge(s, o, 1 / 60);
  }
  return s;
}
/** +1 where the path bends left on screen (a left drift), -1 where it bends right. */
function bend(t: number): number {
  const a = pathPoint(t - 0.005);
  const b = pathPoint(t);
  const c = pathPoint(t + 0.005);
  // y-down screen: a positive cross product turns clockwise, to the right.
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 0 ? -1 : 1;
}
describe('course geometry', () => {
  it('credits slides that turn the way each corner bends', () => {
    const s = createChallenge();
    for (let i = -10; i <= 1010; i++) {
      const t = i / 1000;
      const p = pathPoint(t);
      const prev = pathPoint(t - 0.001);
      updateChallenge(
        s,
        {
          ...p,
          speed: Math.hypot(p.x - prev.x, p.y - prev.y) * 60,
          forwardSpeed: 100,
          slipAngle: 0.5 * bend(Math.min(0.995, Math.max(0.005, t))),
          yawRate: 0.8,
          offTrack: false,
        },
        1 / 60,
      );
    }
    expect(s.zones).toEqual(Array(7).fill('complete'));
    expect(s.transition).toBe(600);
  });
  it('spawns on the lot, facing the start gate', () => {
    const start = CHALLENGE_GATES[0];
    if (!start) throw new Error('No start gate');
    expect(insideLot(config.lot, CHALLENGE_SPAWN.x, CHALLENGE_SPAWN.y)).toBe(true);
    const toStart = Math.atan2(start.y - CHALLENGE_SPAWN.y, start.x - CHALLENGE_SPAWN.x);
    expect(Math.abs(angleDelta(CHALLENGE_SPAWN.heading, toStart))).toBeLessThan(0.6);
    for (const gate of CHALLENGE_GATES) expect(insideLot(config.lot, gate.x, gate.y)).toBe(true);
  });
  it('names a new revision whenever gates or rules change', () => {
    const fingerprint = JSON.stringify({ CHALLENGE_GATES, CHALLENGE_RULES, CHALLENGE_SPAWN });
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++)
      hash = (Math.imul(hash, 31) + fingerprint.charCodeAt(i)) | 0;
    expect({ revision: CHALLENGE_REVISION, hash }).toEqual({
      revision: 's-bend-2',
      hash: 1151966221,
    });
  });
});
describe('frozen precision rules', () => {
  it('produces deterministic reconciled events and a clean link beats straight/spin exploits', () => {
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a.finished).toBe(true);
    expect(a.next).toBe(7);
    expect(a.zones).toEqual(Array(7).fill('complete'));
    expect(a.line).toBe(2000);
    expect(a.transition).toBe(600);
    expect(challengeTotal(a)).toBe(a.line + a.angle + a.transition);
    expect(challengeTotal(a)).toBeGreaterThan(challengeTotal(run('straight')));
    expect(challengeTotal(run('spin'))).toBe(0);
    expect(run('backwards').started).toBe(false);
  });
  it('does not change after finish or allow repeated zones to farm points', () => {
    const s = run();
    const snapshot = structuredClone(s);
    for (let i = 0; i < 100; i++)
      updateChallenge(
        s,
        { x: 0, y: 0, speed: 100, forwardSpeed: 100, slipAngle: 0.5, yawRate: 1, offTrack: false },
        1 / 60,
      );
    expect(s).toEqual(snapshot);
  });
  it('rejects teleporting over gates and non-finite observations', () => {
    const s = createChallenge();
    const o = {
      x: 0,
      y: 1200,
      speed: 100,
      forwardSpeed: 100,
      slipAngle: 0.5,
      yawRate: 1,
      offTrack: false,
    };
    updateChallenge(s, o, 1 / 60);
    updateChallenge(s, { ...o, y: -1200 }, 1 / 60);
    expect(s.finished).toBe(true);
    expect(challengeTotal(s)).toBe(0);
    const invalid = createChallenge();
    updateChallenge(invalid, { ...o, x: NaN }, 1 / 60);
    expect(invalid.finished).toBe(true);
  });
  it('fails to award progress or angle for rotation without movement or sign jitter', () => {
    const s = createChallenge();
    for (let i = 0; i < 500; i++)
      updateChallenge(
        s,
        {
          x: 0,
          y: 1000,
          speed: 100,
          forwardSpeed: 100,
          slipAngle: i % 2 ? 0.21 : -0.21,
          yawRate: 1,
          offTrack: false,
        },
        1 / 60,
      );
    expect(challengeTotal(s)).toBe(0);
  });
});
