import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { autopilot } from './autopilot';
import { createCar, ROAD, stepCar, telemetry } from './car';
import { createLapState, updateLaps } from './laps';
import { buildTrack, CIRCUIT, isOffTrack, nearestOnTrack, startPose } from './track';

/**
 * Drivability regression: a simple autopilot that brakes for bends must be able
 * to lap the circuit with the shipped physics and stay mostly on the road.
 * If a geometry or physics change breaks this, the track is too tight for the car.
 */
describe('circuit with shipped physics', () => {
  it('is lappable by a cautious autopilot', () => {
    const track = buildTrack({ ...CIRCUIT, width: config.track.width, scale: config.track.scale });
    const start = startPose(track);
    const car = createCar(start.x, start.y, start.heading);
    const laps = createLapState();
    const dt = 1 / 60;
    const total = 60 * 120;
    let offSteps = 0;
    let offTrack = false;

    for (let step = 0; step < total; step++) {
      const input = autopilot(track, car);
      stepCar(car, input, dt, config.physics, offTrack ? config.offTrack : ROAD);
      const after = nearestOnTrack(track, car.x, car.y);
      offTrack = isOffTrack(track, after.distance);
      if (offTrack) offSteps += 1;
      updateLaps(laps, after.s, track.length, dt);
    }

    expect(laps.laps).toBeGreaterThanOrEqual(4);
    expect(offSteps / total).toBeLessThan(0.25);
  });

  it('is much slower on grass than on the road', () => {
    const road = createCar();
    const grass = createCar();
    for (let i = 0; i < 180; i++) {
      stepCar(road, { throttle: 1, steer: 0, handbrake: false }, 1 / 60, config.physics, ROAD);
      stepCar(
        grass,
        { throttle: 1, steer: 0, handbrake: false },
        1 / 60,
        config.physics,
        config.offTrack,
      );
    }
    expect(telemetry(grass).speed).toBeLessThan(telemetry(road).speed * 0.4);
  });
});
