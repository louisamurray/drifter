import { isAssistanceProfile, type AssistanceProfile } from './game/assistance';
import { isControlScheme, type ControlScheme } from './core/input';
import { isGameMode, type GameMode } from './core/mode';

const MODE_KEY = 'drifter.mode';

/** Each mode keeps its own best. The circuit keeps the original key so old scores survive. */
function bestKey(mode: GameMode): string {
  return mode === 'track' ? 'drifter.best' : `drifter.best.${mode}`;
}

export function loadBest(mode: GameMode): number {
  try {
    const v = Number(localStorage.getItem(bestKey(mode)));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function saveBest(mode: GameMode, score: number): void {
  try {
    localStorage.setItem(bestKey(mode), String(Math.round(score)));
  } catch {
    // Storage unavailable (private mode, quota). Best simply does not persist.
  }
}

/** The mode the player last chose, or the circuit. */
export function loadMode(): GameMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return isGameMode(v) ? v : 'track';
  } catch {
    return 'track';
  }
}

export function saveMode(mode: GameMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // As above: the choice simply does not persist.
  }
}

const CONTROLS_KEY = 'drifter.controls';

/** The control scheme the player last chose. Two thumbs unless they picked one. */
export function loadScheme(): ControlScheme {
  try {
    const v = localStorage.getItem(CONTROLS_KEY);
    return isControlScheme(v) ? v : 'pedals';
  } catch {
    return 'pedals';
  }
}

export function saveScheme(scheme: ControlScheme): void {
  try {
    localStorage.setItem(CONTROLS_KEY, scheme);
  } catch {
    // As above: the choice simply does not persist.
  }
}

export function loadAssistance(): AssistanceProfile {
  try {
    const value = localStorage.getItem('drifter.assistance');
    return isAssistanceProfile(value) ? value : 'assisted';
  } catch {
    return 'assisted';
  }
}

export function saveAssistance(profile: AssistanceProfile): void {
  try {
    localStorage.setItem('drifter.assistance', profile);
  } catch {
    /* Optional preference. */
  }
}

export interface RecordIdentity {
  physics: string;
  scoring: string;
  course: string;
  assistance: AssistanceProfile;
  controls: string;
}
export function recordKey(identity: RecordIdentity): string {
  return `drifter.record.${encodeURIComponent(JSON.stringify([identity.physics, identity.scoring, identity.course, identity.assistance, identity.controls]))}`;
}
export function loadRecord(identity: RecordIdentity): number {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(recordKey(identity)) ?? 'null');
    if (typeof raw !== 'object' || raw === null || !('score' in raw) || !('identity' in raw))
      return 0;
    return JSON.stringify(raw.identity) === JSON.stringify(identity) &&
      typeof raw.score === 'number' &&
      Number.isFinite(raw.score) &&
      raw.score >= 0
      ? raw.score
      : 0;
  } catch {
    return 0;
  }
}
export function saveRecord(identity: RecordIdentity, score: number): boolean {
  if (!Number.isFinite(score) || score < 0) return false;
  try {
    localStorage.setItem(
      recordKey(identity),
      JSON.stringify({ identity, score: Math.round(score) }),
    );
    return true;
  } catch {
    return false;
  }
}
