/**
 * Touch and keyboard controls, in one of two schemes.
 *
 * One thumb: touching the left half of the screen steers left at full lock,
 * the right half steers right. Holding both is the handbrake; steer stays
 * with whichever side was pressed first so a second thumb adds the handbrake
 * without changing direction. The car accelerates by itself.
 *
 * Two thumbs: four equal columns. The right thumb steers: the inner right
 * column steers left and the outer right column steers right. The left thumb
 * drives: the outer left column is the gas and the inner left column is the
 * handbrake. Nothing moves the car but the gas, so speed is the player's to
 * choose.
 *
 * Keyboard: arrows or A/D steer, Up or W is the gas (two-thumb scheme only),
 * Space, Down or S is the handbrake, Escape or P pauses.
 */
export type ControlScheme = 'thumb' | 'pedals';

export function isControlScheme(v: unknown): v is ControlScheme {
  return v === 'thumb' || v === 'pedals';
}

/** A steering column; the only zones in the one-thumb scheme. */
export type Side = 'left' | 'right';

export type Zone = Side | 'brake' | 'gas';

/** Touch columns from the left edge of the screen, per scheme. */
export const ZONES: Record<ControlScheme, readonly Zone[]> = {
  thumb: ['left', 'right'],
  pedals: ['gas', 'brake', 'left', 'right'],
};

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
  /** 0 or 1. Automatic in the one-thumb scheme: on unless the handbrake is. */
  throttle: number;
}

export interface Keys {
  left: boolean;
  right: boolean;
  brake: boolean;
  gas: boolean;
}

export const NO_KEYS: Keys = { left: false, right: false, brake: false, gas: false };

/** Which column a touch at `xFraction` (0 at the left edge, 1 at the right) lands in. */
export function zoneAt(xFraction: number, scheme: ControlScheme): Zone {
  const zones = ZONES[scheme];
  const i = Math.min(zones.length - 1, Math.max(0, Math.floor(xFraction * zones.length)));
  return zones[i] ?? 'left';
}

/** Pure mapping from held zones (in press order) and keys to steer, handbrake and throttle. */
export function resolveControls(
  heldInOrder: readonly Zone[],
  keys: Keys,
  scheme: ControlScheme = 'thumb',
): RawControls {
  const left = heldInOrder.includes('left');
  const right = heldInOrder.includes('right');
  let steer: number;
  if (left || right) {
    const first = heldInOrder.find((z) => z === 'left' || z === 'right');
    steer = first === 'left' ? -1 : 1;
  } else {
    steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  }
  if (scheme === 'thumb') {
    const handbrake = (left && right) || keys.brake;
    return { steer, handbrake, throttle: handbrake ? 0 : 1 };
  }
  const handbrake = heldInOrder.includes('brake') || keys.brake;
  const throttle = heldInOrder.includes('gas') || keys.gas ? 1 : 0;
  return { steer, handbrake, throttle };
}

export interface SteerRamp {
  stage1: number;
  stage1Seconds: number;
  stage2Seconds: number;
  releaseSeconds: number;
}

/**
 * Two-stage steering ramp. Towards centre, or across it, moves at the release
 * rate. Away from centre, the first stage reaches `stage1` in `stage1Seconds`
 * and the second continues to full lock over `stage2Seconds`.
 */
export function rampSteer(current: number, target: number, dt: number, r: SteerRamp): number {
  const crossing = current !== 0 && Math.sign(target) !== Math.sign(current);
  if (target === 0 || crossing) {
    const step = dt / r.releaseSeconds;
    return current > 0 ? Math.max(0, current - step) : Math.min(0, current + step);
  }
  const mag = Math.abs(current);
  const rate = mag < r.stage1 ? r.stage1 / r.stage1Seconds : (1 - r.stage1) / r.stage2Seconds;
  return Math.sign(target) * Math.min(1, mag + rate * dt);
}

/**
 * Advance the smoothed state by one physics step from raw controls. Throttle
 * rises over `throttleSeconds` (instantly when 0) and drops at once, so a
 * pressed pedal eases in and a released one lets go. Mutates and returns `state`.
 */
export function advanceControls(
  state: InputState,
  raw: RawControls,
  dt: number,
  ramp: SteerRamp,
  throttleSeconds = 0,
): InputState {
  state.steer = rampSteer(state.steer, raw.steer, dt, ramp);
  state.handbrake = raw.handbrake;
  state.throttle =
    throttleSeconds > 0 && raw.throttle > state.throttle
      ? Math.min(raw.throttle, state.throttle + dt / throttleSeconds)
      : raw.throttle;
  return state;
}

export class TouchControls {
  /** Smoothed state, updated by `sample`. */
  readonly state: InputState = { throttle: 0, steer: 0, handbrake: false };
  /** Which zones are currently held, for on-screen cues. */
  readonly held: Record<Zone, boolean> = { left: false, right: false, brake: false, gas: false };
  /** How touches map to zones. Changed from the title screen. */
  scheme: ControlScheme = 'thumb';

  /** Called on Escape or P for desktop pause. */
  onPauseKey: (() => void) | null = null;

  private readonly pointers = new Map<number, Zone>();
  private readonly keys = new Set<string>();

  constructor(private readonly target: HTMLElement) {
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onUp);
    // A long press anywhere, HUD included, must never open the browser's menu
    window.addEventListener('contextmenu', preventDefault);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.reset);
  }

  dispose(): void {
    this.target.removeEventListener('pointerdown', this.onDown);
    this.target.removeEventListener('pointerup', this.onUp);
    this.target.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('contextmenu', preventDefault);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.reset);
  }

  /** Raw, unsmoothed controls right now. */
  raw(): RawControls {
    const k = this.keys;
    return resolveControls(
      [...this.pointers.values()],
      {
        left: k.has('arrowleft') || k.has('a'),
        right: k.has('arrowright') || k.has('d'),
        brake: k.has(' ') || k.has('arrowdown') || k.has('s'),
        gas: k.has('arrowup') || k.has('w'),
      },
      this.scheme,
    );
  }

  /** Advance the smoothed state by one physics step. */
  sample(dt: number, ramp: SteerRamp, throttleSeconds = 0): InputState {
    advanceControls(this.state, this.raw(), dt, ramp, throttleSeconds);
    const zones = [...this.pointers.values()];
    for (const z of Object.keys(this.held) as Zone[]) this.held[z] = zones.includes(z);
    return this.state;
  }

  /** Drop any held input, e.g. when leaving the playing state. */
  readonly reset = (): void => {
    this.pointers.clear();
    this.keys.clear();
    this.state.steer = 0;
    this.state.handbrake = false;
    this.state.throttle = 0;
    for (const z of Object.keys(this.held) as Zone[]) this.held[z] = false;
  };

  private readonly onDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.pointers.set(e.pointerId, zoneAt(e.clientX / window.innerWidth, this.scheme));
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

const KEYS = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', ' ']);

function preventDefault(e: Event): void {
  e.preventDefault();
}
