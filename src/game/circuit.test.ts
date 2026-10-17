import { describe, expect, it } from 'vitest';
import { config } from '../config';
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
    const n = track.points.length;
    let offSteps = 0;
    let offTrack = false;

    for (let step = 0; step < total; step++) {
      const q = nearestOnTrack(track, car.x, car.y);
      const t = telemetry(car);
      const ahead = Math.round(8 + t.speed / 30);
      const look = track.points[(q.index + ahead) % n];
      if (!look) throw new Error('missing point');
      const desired = Math.atan2(look.y - car.y, look.x - car.x);
      let err = desired - car.heading;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      const steer = Math.max(-1, Math.min(1, err * 2.5));

      let bend = 0;
      for (let k = 4; k < 26; k++) bend += Math.abs(track.points[(q.index + k) % n]?.turn ?? 0);
      const limit = bend > 1.4 ? 170 : bend > 0.9 ? 230 : bend > 0.5 ? 320 : Infinity;
      const throttle = t.speed < 120 ? 1 : t.speed > limit || Math.abs(err) > 0.7 ? 0 : 1;

      stepCar(car, { throttle, steer }, dt, config.physics, offTrack ? config.offTrack : ROAD);
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
      stepCar(road, { throttle: 1, steer: 0 }, 1 / 60, config.physics, ROAD);
      stepCar(grass, { throttle: 1, steer: 0 }, 1 / 60, config.physics, config.offTrack);
    }
    expect(telemetry(grass).speed).toBeLessThan(telemetry(road).speed * 0.4);
  });
});
