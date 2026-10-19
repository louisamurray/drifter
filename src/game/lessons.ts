import type { LessonId } from './session';
import type { Pose } from './handling';
import type { CarState, CarTelemetry } from './car';

export interface Observation {
  x: number;
  y: number;
  speed: number;
  forwardSpeed: number;
  slipAngle: number;
  yawRate: number;
  offTrack: boolean;
}
/** What lessons and the challenge see of one physics step, in web-world units. */
export function observe(car: CarState, t: CarTelemetry, offTrack: boolean): Observation {
  return {
    x: car.x,
    y: car.y,
    speed: t.speed,
    forwardSpeed: t.forwardSpeed,
    slipAngle: t.slipAngle,
    yawRate: car.yawRate,
    offTrack,
  };
}
/** The marked transition eight: two loops of `radius` meeting at a crossing, left loop first. */
export const LESSON_EIGHT = { x: 0, y: 900, radius: 300, band: 180 } as const;
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
    // Drive up into the crossing, where the left loop begins.
    spawn: { x: LESSON_EIGHT.x, y: LESSON_EIGHT.y + 500, heading: -Math.PI / 2 },
    /** Longest gap between the end of the left slide and a held right slide. */
    switchSeconds: 4,
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
    switchSeconds?: number;
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
    // Left loop first; rotating on the spot or driving an arbitrary S is insufficient.
    const left = inSlide && sign === 1 && onLoop(o, -1);
    if (s.stage === 1) {
      // The link stays armed while the first slide continues; the window starts when it ends.
      if (left) {
        s.switchTime = 0;
        s.held = 0;
        return;
      }
      s.switchTime += dt;
      if (s.switchTime > LESSONS.transition.switchSeconds) {
        s.stage = 0;
        s.held = 0;
        s.switchTime = 0;
        s.cue = 'Link the slides sooner. Slide left, then switch at the crossing.';
      } else if (inSlide && sign === -1 && onLoop(o, 1)) {
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
    if (!left) {
      s.held = 0;
      return;
    }
    s.held += dt;
    if (s.held >= lesson.duration) {
      s.stage = 1;
      s.held = 0;
      s.switchTime = 0;
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

/** On the marked loop of `side` (-1 left, +1 right): within its band and past the crossing. */
function onLoop(o: Observation, side: -1 | 1): boolean {
  const { x, y, radius, band } = LESSON_EIGHT;
  const fromCentre = Math.hypot(o.x - (x + side * radius), o.y - y);
  return side * (o.x - x) > 0 && Math.abs(fromCentre - radius) <= band;
}

/**
 * Marked lesson eight, independent of the precision challenge. Over 0..2π: up from the
 * crossing round the left loop (anticlockwise on screen), then round the right (clockwise).
 */
export function lessonEight(t: number): { x: number; y: number } {
  const { x, y, radius } = LESSON_EIGHT;
  const u = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const side = u < Math.PI ? -1 : 1;
  const a = 2 * (u < Math.PI ? u : u - Math.PI);
  return { x: x + side * radius * (1 - Math.cos(a)), y: y - radius * Math.sin(a) };
}
