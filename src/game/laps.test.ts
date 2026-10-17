import { describe, expect, it } from 'vitest';
import { createLapState, updateLaps } from './laps';

const L = 1000;
const dt = 1 / 60;

function drive(state: ReturnType<typeof createLapState>, from: number, to: number, steps = 200) {
  for (let i = 1; i <= steps; i++) {
    const s = from + ((to - from) * i) / steps;
    updateLaps(state, ((s % L) + L) % L, L, dt);
  }
}

describe('updateLaps', () => {
  it('counts a full forward lap and records its time', () => {
    const st = createLapState();
    drive(st, 0, 1000);
    expect(st.laps).toBe(1);
    expect(st.bestLap).toBeCloseTo(200 * dt, 5);
    expect(st.lapTime).toBeLessThan(0.1);
  });

  it('does not count dithering across the start line', () => {
    const st = createLapState();
    drive(st, 950, 1050);
    drive(st, 1050, 950);
    drive(st, 950, 1050);
    expect(st.laps).toBe(0);
  });

  it('does not count a lap driven backwards', () => {
    const st = createLapState();
    drive(st, 0, -1000);
    expect(st.laps).toBe(0);
  });

  it('does not count a shortcut that skips checkpoints', () => {
    const st = createLapState();
    drive(st, 0, 300); // hit 25%
    drive(st, 300, 900, 1); // teleport past 50% and 75% in one step
    drive(st, 900, 1000);
    expect(st.laps).toBe(0);
  });

  it('keeps the best of several laps', () => {
    const st = createLapState();
    drive(st, 0, 1000, 300);
    drive(st, 0, 1000, 200);
    drive(st, 0, 1000, 400);
    expect(st.laps).toBe(3);
    expect(st.bestLap).toBeCloseTo(200 * dt, 5);
    expect(st.lastLap).toBeCloseTo(400 * dt, 5);
  });
});
