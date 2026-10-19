import type { LessonId } from './session';
import type { Pose } from './handling';

export interface Observation {
  x: number;
  y: number;
  speed: number;
  forwardSpeed: number;
  slipAngle: number;
  yawRate: number;
  offTrack: boolean;
}
export const LESSONS = {
  initiate: {
    name: 'Initiate',
    objective: 'Build speed, then start a slide. Hold it for half a second.',
    duration: 0.5,
    minSpeed: 70,
    minSlip: 0.2,
    maxSlip: 0.95,
    spawn: { x: 0, y: 800, heading: -Math.PI / 2 },
  },
  sustain: {
    name: 'Sustain',
    objective: 'Hold one slide for 4 seconds. Make small steering corrections.',
    duration: 4,
    minSpeed: 70,
    minSlip: 0.2,
    maxSlip: 0.95,
    spawn: { x: 0, y: 800, heading: -Math.PI / 2 },
  },
  transition: {
    name: 'Transition',
    objective: 'Follow the eight: slide left, cross the switch, then slide right.',
    duration: 0.5,
    minSpeed: 70,
    minSlip: 0.2,
    maxSlip: 0.95,
    spawn: { x: 0, y: 200, heading: Math.atan2(-1300, -400) },
  },
} satisfies Record<
  LessonId,
  {
    name: string;
    objective: string;
    duration: number;
    minSpeed: number;
    minSlip: number;
    maxSlip: number;
    spawn: Pose;
  }
>;
export interface LessonState {
  held: number;
  direction: number;
  stage: number;
  complete: boolean;
  cue: string;
  switchTime: number;
  lastX: number | null;
  lastY: number | null;
}
export function createLesson(id: LessonId): LessonState {
  return {
    held: 0,
    direction: 0,
    stage: 0,
    complete: false,
    cue: LESSONS[id].objective,
    switchTime: 0,
    lastX: null,
    lastY: null,
  };
}
/** Continuous progress, with a zero-angle gap allowed only during an ordered transition. */
export function updateLesson(s: LessonState, id: LessonId, o: Observation, dt: number): void {
  if (s.complete || !Number.isFinite(dt) || dt <= 0 || dt > 0.1) return;
  const lesson = LESSONS[id];
  const distance =
    s.lastX === null || s.lastY === null ? 0 : Math.hypot(o.x - s.lastX, o.y - s.lastY);
  s.lastX = o.x;
  s.lastY = o.y;
  const moving = distance > 0.05 && distance <= o.speed * dt * 2 + 2;
  const safe =
    Object.values(o).every((v) => typeof v === 'boolean' || Number.isFinite(v)) &&
    !o.offTrack &&
    o.speed >= lesson.minSpeed &&
    o.forwardSpeed > 40 &&
    Math.abs(o.yawRate) < 3.5 &&
    Math.abs(o.slipAngle) <= lesson.maxSlip;
  if (!safe) {
    s.held = 0;
    s.direction = 0;
    s.stage = 0;
    s.switchTime = 0;
    s.cue = o.offTrack
      ? 'Return to the asphalt, then try again.'
      : Math.abs(o.slipAngle) > lesson.maxSlip
        ? 'Too much angle. Countersteer sooner. Reset or keep going.'
        : lesson.objective;
    return;
  }
  const sign = Math.sign(o.slipAngle);
  const inSlide = Math.abs(o.slipAngle) >= lesson.minSlip && moving;
  if (id === 'transition') {
    if (s.stage === 1) {
      s.switchTime += dt;
      if (s.switchTime > 6) {
        s.stage = 0;
        s.held = 0;
        s.switchTime = 0;
      } else if (inSlide && sign === -1 && o.x >= -80 && o.y < 150) {
        s.held += dt;
        s.cue = 'Hold the right slide.';
        if (s.held >= lesson.duration) {
          s.complete = true;
          s.stage = 2;
          s.cue = 'Left to right, linked. Lesson complete.';
        }
      } else s.held = 0;
      return;
    }
    // Left loop first; rotating on the spot or driving an arbitrary S is insufficient.
    if (!(inSlide && sign === 1 && o.x < -80 && o.y < 800 && o.y > -100)) {
      s.held = 0;
      return;
    }
    s.held += dt;
    if (s.held >= lesson.duration) {
      s.stage = 1;
      s.held = 0;
      s.cue = 'Cross the switch and slide right.';
    }
    return;
  }
  if (!inSlide || (s.direction !== 0 && sign !== s.direction)) {
    s.held = 0;
    s.direction = inSlide ? sign : 0;
    return;
  }
  s.direction = sign;
  s.held += dt;
  s.cue = id === 'sustain' ? 'Keep the angle steady.' : 'Hold the slide.';
  if (s.held + 1e-8 >= lesson.duration) {
    s.complete = true;
    s.cue = `${lesson.name} complete. Keep driving or choose another lesson.`;
  }
}

/** Marked lesson eight, independent of the precision challenge. */
export function lessonEight(t: number): { x: number; y: number } {
  return { x: -400 * Math.sin(t), y: 200 - 650 * Math.sin(2 * t) };
}
