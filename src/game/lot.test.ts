import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { createCar, ROAD, stepCar } from './car';
import { createLotPilot, insideLot, lotBounds, lotStartPose, type Lot } from './lot';

const lot: Lot = { width: 1000, height: 1400, corner: 200, ring: 230 };

describe('insideLot', () => {
  it('is true in the middle and false past the sides', () => {
    expect(insideLot(lot, 0, 0)).toBe(true);
    expect(insideLot(lot, 499, 0)).toBe(true);
    expect(insideLot(lot, 501, 0)).toBe(false);
    expect(insideLot(lot, 0, -701)).toBe(false);
  });

  it('cuts the corners', () => {
    // The corner of the bounding box is off the asphalt; the corner arc's midpoint is on it
    expect(insideLot(lot, 495, 695)).toBe(false);
    const inset = 200 * (1 - Math.SQRT1_2) + 1;
    expect(insideLot(lot, 500 - inset, 700 - inset)).toBe(true);
    expect(insideLot(lot, -500 + inset, 700 - inset)).toBe(true);
  });

  it('bounds the asphalt', () => {
    expect(lotBounds(lot)).toEqual({ minX: -500, minY: -700, maxX: 500, maxY: 700 });
  });
});

/**
 * The title-screen ghost must put on a show without leaving the lot: slide for
 * a good part of the run, and reach both ends of the eight rather than circle
 * the middle.
 */
describe('createLotPilot', () => {
  it('drifts a figure of eight and stays on the asphalt', () => {
    const start = lotStartPose();
    const car = createCar(start.x, start.y, start.heading);
    const pilot = createLotPilot(lot);
    const dt = config.loop.fixedDt;
    const total = Math.round(60 / dt);
    let offSteps = 0;
    let driftSteps = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    let off = false;
    for (let i = 0; i < total; i++) {
      const input = pilot(car, dt);
      stepCar(car, input, dt, config.physics, off ? config.offTrack : ROAD);
      off = !insideLot(lot, car.x, car.y);
      if (off) offSteps += 1;
      if (car.drifting) driftSteps += 1;
      minY = Math.min(minY, car.y);
      maxY = Math.max(maxY, car.y);
    }
    const report =
      `off ${((offSteps / total) * 100).toFixed(1)}%, drift ${((driftSteps / total) * 100).toFixed(0)}%, ` +
      `y ${minY.toFixed(0)}..${maxY.toFixed(0)}`;
    expect(offSteps / total, report).toBeLessThan(0.02);
    expect(driftSteps / total, report).toBeGreaterThan(0.15);
    expect(minY, report).toBeLessThan(-lot.height * 0.2);
    expect(maxY, report).toBeGreaterThan(lot.height * 0.2);
  });
});
