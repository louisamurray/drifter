import type { GameMode } from '../core/mode';
import type { HandlingModel } from './handling';

export type Activity = 'timed' | 'practice' | 'lesson' | 'challenge';
export type LessonId = 'initiate' | 'sustain' | 'transition';
export interface Session {
  activity: Activity;
  course: GameMode;
  model: HandlingModel;
  lesson: LessonId | null;
}

/** Course and activity are independent; the scorer only owns existing timed runs. */
export function createSession(
  activity: Activity,
  course: GameMode,
  lesson: LessonId | null = null,
): Session {
  return {
    activity,
    course: activity === 'timed' ? course : 'free',
    model: activity === 'timed' ? 'legacy' : 'force',
    lesson,
  };
}
export function isUntimed(session: Session): boolean {
  return session.activity === 'practice' || session.activity === 'lesson';
}
