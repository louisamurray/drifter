import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { createCar } from './car';
import { createThumb, driveThumb, visibleAhead, type ThumbProfile } from './thumb';
import { buildTrack, CIRCUIT, startPose } from './track';

const track = buildTrack({ ...CIRCUIT, width: config.track.width, scale: config.track.scale });
const dt = config.loop.fixedDt;

/** CSS viewport heights of a phone held either way, and a tablet upright. */
const SCREENS = { portrait: 844, landscape: 390 } as const;

/** Where in the visible road a player might be looking. */
const LOOK_FRACTIONS = [0.5, 0.75, 1];

/** A run counts as drivable when the thumb is rarely on the grass and gets round. */
const MAX_OFF_TRACK = 0.15;
const MIN_LAPS = 2;

function profile(reactionSeconds: number, lookaheadPx: number): ThumbProfile {
  return { reactionSeconds, decisionSeconds: 0.1, lookaheadPx, deadband: 0.08 };
}

describe('createThumb', () => {
  it('waits out the reaction delay before holding anything', () => {
    const start = startPose(track);
    const car = createCar(start.x, start.y, start.heading + 0.5);
    const thumb = createThumb(track, profile(0.2, 200), dt);
    const delay = Math.round(0.2 / dt);
    for (let i = 0; i < delay; i++) expect(thumb(car)).toBeNull();
    expect(thumb(car)).not.toBeNull();
  });

  it('holds the side that turns the car back towards the road ahead', () => {
    const start = startPose(track);
    // Heading is clockwise-positive in screen space, so +0.5 points right of the road
    const pointingRight = createCar(start.x, start.y, start.heading + 0.5);
    const pointingLeft = createCar(start.x, start.y, start.heading - 0.5);
    const onLine = createCar(start.x, start.y, start.heading);
    // A thumb keeps its last decision for `decisionSeconds`, so use one per car
    const look = (car: typeof onLine) => createThumb(track, profile(0, 200), dt)(car);
    expect(look(pointingRight)).toBe('left');
    expect(look(pointingLeft)).toBe('right');
    expect(look(onLine)).toBeNull();
  });
});

describe('visibleAhead', () => {
  it('shows a landscape phone far less road than a portrait one', () => {
    expect(visibleAhead(SCREENS.landscape)).toBeLessThan(visibleAhead(SCREENS.portrait) * 0.7);
  });
});

/**
 * Drivability through the real input path. A thumb with an ordinary touch
 * reaction (200 to 250 ms), looking anywhere in the visible road, must be able
 * to lap the circuit without living on the grass. This is the bar the physics
 * is tuned against, in both phone orientations.
 *
 * These are marked `fails` because the shipped tuning does not clear the bar:
 * at 200 ms every profile spends 45 to 85% of the run off the road. When a
 * physics, track or input change gets a case passing, Vitest reports it as a
 * failure here, which is the cue to drop the `fails` marker and keep it green.
 */
describe('naive thumb on the circuit', () => {
  for (const [orientation, height] of Object.entries(SCREENS)) {
    const visible = visibleAhead(height);
    for (const reaction of [0.2, 0.25]) {
      it.fails(`${orientation}, ${String(reaction * 1000)} ms reaction, stays on the road`, () => {
        const results = LOOK_FRACTIONS.map((f) => {
          const r = driveThumb(track, profile(reaction, visible * f), 60);
          return { lookahead: Math.round(visible * f), ...r };
        });
        const failing = results.filter(
          (r) => r.offTrackFraction > MAX_OFF_TRACK || r.laps < MIN_LAPS,
        );
        const report = results
          .map(
            (r) =>
              `look ${String(r.lookahead)}px: off ${(r.offTrackFraction * 100).toFixed(0)}%, ` +
              `laps ${String(r.laps)}, excursions ${String(r.excursions)}`,
          )
          .join('\n');
        expect(failing, report).toEqual([]);
      });
    }
  }
});
