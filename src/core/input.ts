import { config } from '../config';

/** Normalised control state the game reads each physics step. */
export interface InputState {
  /** 0 (off) to 1 (full throttle). */
  throttle: number;
  /** -1 (full left) to 1 (full right). */
  steer: number;
}

/** Map a horizontal drag distance to a steering value with a dead zone and full lock. */
export function steerFromDrag(dx: number, deadZonePx: number, fullLockPx: number): number {
  const magnitude = Math.abs(dx);
  if (magnitude <= deadZonePx) return 0;
  const range = Math.max(fullLockPx - deadZonePx, 1);
  const t = Math.min((magnitude - deadZonePx) / range, 1);
  return Math.sign(dx) * t;
}

/**
 * One-thumb touch control: press anywhere for throttle, drag sideways from the
 * press point to steer, release to coast. Keyboard (arrows / WASD) is a desktop
 * fallback for development.
 */
export class PointerInput {
  readonly state: InputState = { throttle: 0, steer: 0 };

  private activePointer: number | null = null;
  private originX = 0;
  private pointerSteer = 0;
  private readonly keys = new Set<string>();

  /** Called when a second finger touches while one is already down. */
  onSecondPointer: (() => void) | null = null;

  constructor(private readonly target: HTMLElement) {
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onUp);
    target.addEventListener('contextmenu', preventDefault);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.reset);
  }

  dispose(): void {
    this.target.removeEventListener('pointerdown', this.onDown);
    this.target.removeEventListener('pointermove', this.onMove);
    this.target.removeEventListener('pointerup', this.onUp);
    this.target.removeEventListener('pointercancel', this.onUp);
    this.target.removeEventListener('contextmenu', preventDefault);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.reset);
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (this.activePointer !== null) {
      this.onSecondPointer?.();
      return;
    }
    e.preventDefault();
    this.activePointer = e.pointerId;
    this.originX = e.clientX;
    this.pointerSteer = 0;
    this.target.setPointerCapture(e.pointerId);
    this.recompute();
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    this.pointerSteer = steerFromDrag(
      e.clientX - this.originX,
      config.input.deadZonePx,
      config.input.fullLockPx,
    );
    this.recompute();
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    this.activePointer = null;
    this.pointerSteer = 0;
    this.recompute();
  };

  /** Called on Escape or P for desktop pause. */
  onPauseKey: (() => void) | null = null;

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
    this.recompute();
  };

  /** Drop any held input, e.g. when leaving the playing state. */
  readonly reset = (): void => {
    this.activePointer = null;
    this.pointerSteer = 0;
    this.keys.clear();
    this.recompute();
  };

  private recompute(): void {
    const keyThrottle = this.keys.has('arrowup') || this.keys.has('w') || this.keys.has(' ');
    const keyLeft = this.keys.has('arrowleft') || this.keys.has('a');
    const keyRight = this.keys.has('arrowright') || this.keys.has('d');
    const keySteer = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);

    const touching = this.activePointer !== null;
    this.state.throttle = touching || keyThrottle ? 1 : 0;
    this.state.steer = touching ? this.pointerSteer : keySteer;
  }
}

const KEYS = new Set(['arrowup', 'arrowleft', 'arrowright', 'w', 'a', 'd', ' ']);

function preventDefault(e: Event): void {
  e.preventDefault();
}
