/**
 * Hold-left, hold-right controls.
 *
 * Touching the left half of the screen steers left at full lock, the right
 * half steers right. Holding both is the handbrake; steer stays with whichever
 * side was pressed first so a second thumb adds the handbrake without changing
 * direction. The car accelerates by itself. Keyboard: arrows or A/D steer,
 * Space or Down is the handbrake, Escape or P pauses.
 */
export type Side = 'left' | 'right';

/** Normalised control state the game reads each physics step. */
export interface InputState {
  /** 0 (off) to 1 (full throttle). */
  throttle: number;
  /** -1 (full left) to 1 (full right). */
  steer: number;
  handbrake: boolean;
}

export interface RawControls {
  /** -1, 0 or 1. */
  steer: number;
  handbrake: boolean;
}

/** Pure mapping from held sides (in press order) and keys to steer and handbrake. */
export function resolveControls(
  heldInOrder: readonly Side[],
  keyLeft: boolean,
  keyRight: boolean,
  keyBrake: boolean,
): RawControls {
  const left = heldInOrder.includes('left');
  const right = heldInOrder.includes('right');
  if (left || right) {
    const first = heldInOrder[0];
    const steer = first === 'left' ? -1 : 1;
    return { steer, handbrake: (left && right) || keyBrake };
  }
  const steer = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
  return { steer, handbrake: keyBrake };
}

/** Move `current` towards `target` so that a full swing takes `rampSeconds`. */
export function rampSteer(
  current: number,
  target: number,
  dt: number,
  rampSeconds: number,
): number {
  if (rampSeconds <= 0) return target;
  const step = dt / rampSeconds;
  if (target > current) return Math.min(target, current + step);
  if (target < current) return Math.max(target, current - step);
  return current;
}

export class TouchControls {
  /** Smoothed state, updated by `sample`. */
  readonly state: InputState = { throttle: 0, steer: 0, handbrake: false };
  /** Which sides are currently held, for on-screen cues. */
  readonly held = { left: false, right: false };

  /** Called on Escape or P for desktop pause. */
  onPauseKey: (() => void) | null = null;

  private readonly pointers = new Map<number, Side>();
  private readonly keys = new Set<string>();

  constructor(private readonly target: HTMLElement) {
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onUp);
    target.addEventListener('contextmenu', preventDefault);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.reset);
  }

  dispose(): void {
    this.target.removeEventListener('pointerdown', this.onDown);
    this.target.removeEventListener('pointerup', this.onUp);
    this.target.removeEventListener('pointercancel', this.onUp);
    this.target.removeEventListener('contextmenu', preventDefault);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.reset);
  }

  /** Raw, unsmoothed controls right now. */
  raw(): RawControls {
    return resolveControls(
      [...this.pointers.values()],
      this.keys.has('arrowleft') || this.keys.has('a'),
      this.keys.has('arrowright') || this.keys.has('d'),
      this.keys.has(' ') || this.keys.has('arrowdown') || this.keys.has('s'),
    );
  }

  /**
   * Advance the smoothed state by one physics step. Throttle is automatic:
   * full unless the handbrake is held.
   */
  sample(dt: number, rampSeconds: number): InputState {
    const r = this.raw();
    this.state.steer = rampSteer(this.state.steer, r.steer, dt, rampSeconds);
    this.state.handbrake = r.handbrake;
    this.state.throttle = r.handbrake ? 0 : 1;
    this.held.left = [...this.pointers.values()].includes('left');
    this.held.right = [...this.pointers.values()].includes('right');
    return this.state;
  }

  /** Drop any held input, e.g. when leaving the playing state. */
  readonly reset = (): void => {
    this.pointers.clear();
    this.keys.clear();
    this.state.steer = 0;
    this.state.handbrake = false;
    this.state.throttle = 0;
    this.held.left = false;
    this.held.right = false;
  };

  private readonly onDown = (e: PointerEvent): void => {
    e.preventDefault();
    const side: Side = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
    this.pointers.set(e.pointerId, side);
    this.target.setPointerCapture(e.pointerId);
  };

  private readonly onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    if (e.type === 'keydown' && (key === 'escape' || key === 'p')) {
      this.onPauseKey?.();
      return;
    }
    if (!KEYS.has(key)) return;
    e.preventDefault();
    if (e.type === 'keydown') this.keys.add(key);
    else this.keys.delete(key);
  };
}

const KEYS = new Set(['arrowleft', 'arrowright', 'arrowdown', 'a', 'd', 's', ' ']);

function preventDefault(e: Event): void {
  e.preventDefault();
}
