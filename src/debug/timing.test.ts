import { describe, expect, it } from 'vitest';
import { FrameTimer } from './timing';

describe('frame timing readout', () => {
  it('reports mean, 95th percentile and maximum cost per callback', () => {
    const timer = new FrameTimer(100);
    for (let i = 1; i <= 100; i++) timer.record('update', i / 100);
    timer.record('render', 2);
    expect(timer.stats('update')).toMatchObject({ p95: 0.95, max: 1, samples: 100 });
    expect(timer.stats('update').mean).toBeCloseTo(0.505, 12);
    expect(timer.stats('render')).toEqual({ mean: 2, p95: 2, max: 2, samples: 1 });
  });

  it('keeps only the most recent window of samples', () => {
    const timer = new FrameTimer(4);
    for (const ms of [9, 9, 1, 1, 1, 1]) timer.record('render', ms);
    expect(timer.stats('render')).toEqual({ mean: 1, p95: 1, max: 1, samples: 4 });
  });

  it('summarises both callbacks on one line, and is quiet before any sample', () => {
    const timer = new FrameTimer();
    expect(timer.summary()).toBe('update -- · render --');
    timer.record('update', 0.123);
    timer.record('render', 1.5);
    expect(timer.summary()).toBe('update 0.12 ms p95 0.12 · render 1.50 ms p95 1.50');
  });
});
