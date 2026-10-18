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
