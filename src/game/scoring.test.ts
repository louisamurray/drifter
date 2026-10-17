import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { createScore, drainEvents, multiplierProgress, updateScore } from './scoring';

const dt = 1 / 60;
const drift = {
  drifting: true,
  offTrack: false,
  slipAngle: 0.7,
  speed: 300,
  lapCompleted: false,
  handbrake: false,
};
const straight = { ...drift, drifting: false, slipAngle: 0 };

function run(s: ReturnType<typeof createScore>, input: typeof drift, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) updateScore(s, input, dt);
}

describe('updateScore', () => {
  it('accrues chain points while drifting and nothing while straight', () => {
    const s = createScore();
    run(s, straight, 1);
    expect(s.chain).toBe(0);
    run(s, drift, 1);
    expect(s.chain).toBeCloseTo(0.7 * 300 * 1, 0);
    expect(s.score).toBe(0);
  });

  it('steps the multiplier every two seconds and caps it', () => {
    const s = createScore();
    run(s, drift, 1.9);
    expect(s.multiplier).toBe(1);
    run(s, drift, 0.2);
    expect(s.multiplier).toBe(1.5);
    run(s, drift, 20);
    expect(s.multiplier).toBe(config.scoring.multiplierMax);
    expect(multiplierProgress(s)).toBe(1);
    const ups = drainEvents(s).filter((e) => e.type === 'multiplier');
    expect(ups).toHaveLength((config.scoring.multiplierMax - 1) / config.scoring.multiplierStep);
  });

  it('banks the chain after the grace period', () => {
    const s = createScore();
    run(s, drift, 2);
    const chain = s.chain;
    run(s, straight, 0.9);
    expect(s.score).toBe(0);
    run(s, straight, 0.2);
    expect(s.score).toBeCloseTo(chain, 5);
    expect(s.chain).toBe(0);
    expect(s.multiplier).toBe(1);
    expect(drainEvents(s).some((e) => e.type === 'bank')).toBe(true);
  });

  it('keeps part of the chain and drops the multiplier when the car leaves the road', () => {
    const s = createScore();
    run(s, drift, 3);
    const chain = s.chain;
    expect(chain).toBeGreaterThan(0);
    expect(s.multiplier).toBeGreaterThan(1);
    updateScore(s, { ...drift, offTrack: true }, dt);
    expect(s.chain).toBe(0);
    expect(s.multiplier).toBe(1);
    expect(s.score).toBeCloseTo(chain * config.scoring.offTrackKeep, 5);
    const lost = drainEvents(s).find((e) => e.type === 'lost');
    expect(lost).toBeDefined();
    if (lost?.type === 'lost') expect(lost.amount + lost.kept).toBeCloseTo(chain, 5);
  });

  it('scores at a reduced rate under the handbrake', () => {
    const a = createScore();
    const b = createScore();
    run(a, drift, 1);
    run(b, { ...drift, handbrake: true }, 1);
    expect(b.chain).toBeCloseTo(a.chain * config.scoring.handbrakeScoreScale, 3);
  });

  it('adds a flat lap bonus straight to the score', () => {
    const s = createScore();
    updateScore(s, { ...straight, lapCompleted: true }, dt);
    expect(s.score).toBe(config.scoring.lapBonus);
  });

  it('ends the run at the time limit and banks what is left', () => {
    const s = createScore();
    run(s, drift, config.scoring.runSeconds + 1);
    expect(s.finished).toBe(true);
    expect(s.timeLeft).toBe(0);
    expect(s.chain).toBe(0);
    expect(s.score).toBeGreaterThan(0);
    const before = s.score;
    run(s, drift, 1);
    expect(s.score).toBe(before);
  });
});
