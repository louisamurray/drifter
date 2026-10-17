import { describe, expect, it, vi } from 'vitest';
import { stepAccumulator } from './loop';

const options = { fixedDt: 1 / 60, maxFrameDt: 0.25 };

describe('stepAccumulator', () => {
  it('runs one update for one 60 Hz frame', () => {
    const update = vi.fn();
    const result = stepAccumulator(0, 1 / 60, options, update);
    expect(result.steps).toBe(1);
    expect(update).toHaveBeenCalledWith(1 / 60);
    expect(result.accumulator).toBeCloseTo(0, 10);
  });

  it('runs zero updates for a 120 Hz frame and carries the remainder', () => {
    const update = vi.fn();
    const first = stepAccumulator(0, 1 / 120, options, update);
    expect(first.steps).toBe(0);
    const second = stepAccumulator(first.accumulator, 1 / 120, options, update);
    expect(second.steps).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('catches up with multiple steps after a slow frame', () => {
    const update = vi.fn();
    const result = stepAccumulator(0, 3 / 60, options, update);
    expect(result.steps).toBe(3);
  });

  it('clamps a huge frame delta so it cannot spiral', () => {
    const update = vi.fn();
    const result = stepAccumulator(0, 10, options, update);
    expect(result.steps).toBe(Math.floor(options.maxFrameDt / options.fixedDt));
  });
});
