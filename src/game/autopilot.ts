import type { InputState } from '../core/input';
import { telemetry, type CarState } from './car';
import { nearestOnTrack, type Track } from './track';

/**
 * A cautious driver that follows the centreline and lifts for bends. Used for
 * the title-screen ghost lap and the drivability regression test.
 */
export function autopilot(track: Track, car: CarState, aggression = 1): InputState {
  const q = nearestOnTrack(track, car.x, car.y);
  const t = telemetry(car);
  const n = track.points.length;
  const ahead = Math.round(8 + t.speed / 30);
  const look = track.points[(q.index + ahead) % n];
  if (!look) return { throttle: 0, steer: 0, handbrake: false };

  const desired = Math.atan2(look.y - car.y, look.x - car.x);
  let err = desired - car.heading;
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;
  // Digital steering like a thumb: hold a side when off the line, release near it
  const deadband = 0.06 + Math.min(0.1, t.speed / 4000);
  const steer = err > deadband ? 1 : err < -deadband ? -1 : 0;

  let bend = 0;
  for (let k = 4; k < 26; k++) bend += Math.abs(track.points[(q.index + k) % n]?.turn ?? 0);
  const base = bend > 1.4 ? 170 : bend > 0.9 ? 230 : bend > 0.5 ? 320 : Infinity;
  const limit = base * aggression;
  const handbrake = t.speed > 120 && (t.speed > limit || Math.abs(err) > 0.7);
  return { throttle: handbrake ? 0 : 1, steer, handbrake };
}
