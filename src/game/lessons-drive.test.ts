import { describe, expect, it } from 'vitest';
import type { AssistanceProfile } from './assistance';
import { circleDriver, driveLot, EIGHT_LINE, eightDriver, type Driver } from './drift-fixture';
import { createLesson, LESSONS, updateLesson, type LessonState } from './lessons';
import type { LessonId } from './session';

/** Drive one lesson attempt with the real force car until it completes or time runs out. */
function attempt(id: LessonId, driver: Driver, profile: AssistanceProfile = 'assisted') {
  const s: LessonState = createLesson(id);
  let seconds = 0;
  driveLot(
    LESSONS[id].spawn,
    driver,
    (o, dt) => {
      updateLesson(s, id, o, dt);
      seconds += dt;
      return s.complete;
    },
    { profile, seconds: 40 },
  );
  return { complete: s.complete, seconds, cue: s.cue };
}
const profiles: AssistanceProfile[] = ['assisted', 'reduced'];

describe('lessons with force handling', () => {
  for (const profile of profiles) {
    it(`initiates and sustains left and right slides (${profile})`, () => {
      for (const sign of [1, -1] as const) {
        expect(attempt('initiate', circleDriver(sign), profile).complete).toBe(true);
        expect(attempt('sustain', circleDriver(sign), profile).complete).toBe(true);
      }
    });
    it(`links left into right round the marked eight (${profile})`, () => {
      const run = attempt('transition', eightDriver(), profile);
      expect(run.complete).toBe(true);
      expect(run.cue).toBe('Left to right, linked. Lesson complete.');
      expect(run.seconds).toBeLessThan(30);
    });
  }

  it('does not complete a lesson for handbrake rotation on the spot', () => {
    const spin: Driver = () => ({ steer: 1, throttle: 0, handbrake: true });
    for (const id of ['initiate', 'sustain', 'transition'] as const)
      expect(attempt(id, spin).complete).toBe(false);
  });

  it('does not complete the transition right-first or on grip', () => {
    expect(attempt('transition', eightDriver({ ...EIGHT_LINE, loops: [1, -1] })).complete).toBe(
      false,
    );
    expect(attempt('transition', eightDriver({ ...EIGHT_LINE, slip: 0, flick: 0 })).complete).toBe(
      false,
    );
  });
});
