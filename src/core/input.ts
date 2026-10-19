/**
 * Touch and keyboard controls, in one of two schemes.
 *
 * One thumb: touching the left half of the screen steers left at full lock,
 * the right half steers right. Holding both is the handbrake; steer stays
 * with whichever side was pressed first so a second thumb adds the handbrake
 * without changing direction. The car accelerates by itself.
 *
 * Two thumbs: controls in the bottom corners. The left thumb drives on two
 * pedals, gas in the corner and the handbrake beside it. The right thumb
 * points a stick where the car should go: the stick's direction on screen is
 * the wanted heading, and the car steers towards it, harder the further the
 * nose is from it. The camera does not rotate, so up is always up. Nothing
 * moves the car but the gas, so speed is the player's to choose. Touches
 * above the control band are ignored in this scheme.
 *
 * Keyboard: arrows or A/D steer, Up or W is the gas (two-thumb scheme only),
 * Space, Down or S is the handbrake, Escape or P pauses. Enter starts, retries or resumes.
 */
import { angleDelta } from './angle';
import { Controller } from './controller';

export type ControlScheme = 'thumb' | 'pedals';

export function isControlScheme(v: unknown): v is ControlScheme {
  return v === 'thumb' || v === 'pedals';
}

/** A steering half; the only zones in the one-thumb scheme. */
export type Side = 'left' | 'right';

export type Zone = Side | 'brake' | 'gas' | 'stick';

/** Controls per scheme, in the order they sit across the screen. */
export const ZONES: Record<ControlScheme, readonly Zone[]> = {
  thumb: ['left', 'right'],
  pedals: ['gas', 'brake', 'stick'],
};

/** Where the two-thumb controls sit, in CSS px, shared with the HUD that draws them. */
export interface PadLayout {
  /** Gap from the screen edges (the safe area is added on top). */
  inset: number;
  /** Pedal diameter and the gap between the two pedals. */
  pedalSize: number;
  pedalGap: number;
  /** Stick base radius. The knob is drawn out to it. */
  stickRadius: number;
  /** Heading error, in radians, at which the stick asks for full lock. */
  stickFullAngle: number;
  /** Touches above this fraction of the screen height are not controls. */
  bandTop: number;
}

/** Normalised control state the game reads each physics step. */
export interface InputState {
  /** 0 (off) to 1 (full throttle). */
  throttle: number;
  /** -1 (full left) to 1 (full right). */
  steer: number;
  handbrake: boolean;
}

export interface RawControls {
  /** -1..1. Digital (-1, 0 or 1) unless `analog`. */
  steer: number;
  /** True when steer comes from the stick and should be applied as is, not ramped. */
  analog: boolean;
  handbrake: boolean;
  /** 0..1 for a controller; binary for keys/touch. Automatic with one thumb. */
  throttle: number;
}

export interface Keys {
  left: boolean;
  right: boolean;
  brake: boolean;
  gas: boolean;
}

export const NO_KEYS: Keys = { left: false, right: false, brake: false, gas: false };

/** Within this fraction of the stick radius the thumb counts as centred and asks for nothing. */
const STICK_DEADZONE = 0.18;

/**
 * Which control a touch at (x, y) lands on, for a screen of the given size,
 * or null when it is not a control. One thumb: the halves, at any height.
 * Two thumbs: in the band at the bottom, the left half is the pedals (gas on
 * the outside, handbrake inside) and the right half is the stick.
 */
export function zoneAt(
  x: number,
  y: number,
  width: number,
  height: number,
  scheme: ControlScheme,
  pad: PadLayout,
): Zone | null {
  if (scheme === 'thumb') return x < width / 2 ? 'left' : 'right';
  if (y < height * pad.bandTop) return null;
  if (x >= width / 2) return 'stick';
  return x < pad.inset + pad.pedalSize + pad.pedalGap / 2 ? 'gas' : 'brake';
}

/**
 * The heading a stick thumb asks for, from its offset (dx, dy) in screen px
 * from the stick centre: 0 is right, increasing clockwise, like the car's
 * heading. Null inside the deadzone.
 */
export function stickHeading(dx: number, dy: number, radius: number): number | null {
  if (Math.hypot(dx, dy) < radius * STICK_DEADZONE) return null;
  return Math.atan2(dy, dx);
}

/** Steer that turns `heading` towards `target` the short way: full lock from `fullAngle` of error. */
export function headingSteer(heading: number, target: number, fullAngle: number): number {
  return Math.max(-1, Math.min(1, angleDelta(heading, target) / fullAngle));
}

/**
 * Pure mapping from held zones (in press order), keys and the stick to
 * steer, handbrake and throttle. `stick` is the heading the stick asks for
 * while a thumb is on it, or null; `heading` is the car's, and `fullAngle`
 * the error at which the stick asks for full lock.
 */
export function resolveControls(
  heldInOrder: readonly Zone[],
  keys: Keys,
  scheme: ControlScheme = 'thumb',
  stick: number | null = null,
  heading = 0,
  fullAngle = 0.6,
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
    return { steer, analog: false, handbrake, throttle: handbrake ? 0 : 1 };
  }
  const handbrake = heldInOrder.includes('brake') || keys.brake;
  const throttle = heldInOrder.includes('gas') || keys.gas ? 1 : 0;
  if (stick !== null) {
    return { steer: headingSteer(heading, stick, fullAngle), analog: true, handbrake, throttle };
  }
  return { steer, analog: false, handbrake, throttle };
}

export interface SteerRamp {
  stage1: number;
  stage1Seconds: number;
  stage2Seconds: number;
  releaseSeconds: number;
  /** Full left-to-right travel time; omitted for the legacy response. */
  reversalSeconds?: number;
}

/**
 * Two-stage steering ramp. Towards centre, or across it, moves at the release
 * rate by default. An explicit reversal time applies through the opposite lock.
 * Away from centre, the first stage reaches `stage1` in `stage1Seconds`
 * and the second continues to full lock over `stage2Seconds`.
 */
export function rampSteer(
  current: number,
  target: number,
  dt: number,
  r: SteerRamp,
  reversing = false,
): number {
  const crossing = current !== 0 && Math.sign(target) !== Math.sign(current);
  if ((crossing || reversing) && target !== 0 && r.reversalSeconds !== undefined) {
    const step = (2 * dt) / r.reversalSeconds;
    return current + Math.sign(target - current) * Math.min(Math.abs(target - current), step);
  }
  if (target === 0 || crossing) {
    const step = dt / r.releaseSeconds;
    return current > 0 ? Math.max(0, current - step) : Math.min(0, current + step);
  }
  const mag = Math.abs(current);
  const rate = mag < r.stage1 ? r.stage1 / r.stage1Seconds : (1 - r.stage1) / r.stage2Seconds;
  return Math.sign(target) * Math.min(1, mag + rate * dt);
}

/**
 * Advance the smoothed state by one physics step from raw controls. Digital
 * steer goes through the two-stage ramp; analog steer from the stick is
 * applied as is. Throttle rises over `throttleSeconds` (instantly when 0)
 * releases over `throttleReleaseSeconds` (instantly when 0). Handbrake cuts
 * automatic throttle immediately. Controller analogue values bypass these ramps.
 * Mutates and returns `state`.
 */
// Retain reversal intent across centre without adding hidden physics state to InputState.
const reversalTargets = new WeakMap<InputState, number>();

export function advanceControls(
  state: InputState,
  raw: RawControls,
  dt: number,
  ramp: SteerRamp,
  throttleSeconds = 0,
  throttleReleaseSeconds = 0,
): InputState {
  let reversal = reversalTargets.get(state);
  if (raw.analog || raw.steer === 0 || reversal !== raw.steer || state.steer === raw.steer) {
    reversalTargets.delete(state);
    reversal = undefined;
  }
  if (
    !raw.analog &&
    raw.steer !== 0 &&
    state.steer * raw.steer < 0 &&
    ramp.reversalSeconds !== undefined
  ) {
    reversalTargets.set(state, raw.steer);
    reversal = raw.steer;
  }
  state.steer = raw.analog
    ? raw.steer
    : rampSteer(state.steer, raw.steer, dt, ramp, reversal !== undefined);
  state.handbrake = raw.handbrake;
  state.throttle =
    throttleSeconds > 0 && raw.throttle > state.throttle
      ? Math.min(raw.throttle, state.throttle + dt / throttleSeconds)
      : throttleReleaseSeconds > 0 && raw.throttle < state.throttle && !raw.handbrake
        ? Math.max(raw.throttle, state.throttle - dt / throttleReleaseSeconds)
        : raw.throttle;
  return state;
}

interface Touch {
  zone: Zone;
  x: number;
  y: number;
}

export class TouchControls {
  /** Smoothed state, updated by `sample`. */
  readonly state: InputState = { throttle: 0, steer: 0, handbrake: false };
  /** Which zones are currently held, for on-screen cues. */
  readonly held: Record<Zone, boolean> = {
    left: false,
    right: false,
    brake: false,
    gas: false,
    stick: false,
  };
  /** How touches map to zones. Changed from the title screen. */
  scheme: ControlScheme = 'thumb';
  /** Where the two-thumb controls sit. The HUD draws them from the same numbers. */
  pad: PadLayout = {
    inset: 24,
    pedalSize: 80,
    pedalGap: 12,
    stickRadius: 70,
    stickFullAngle: 0.6,
    bandTop: 0.55,
  };
  /** Safe-area insets at the right and bottom edges, for the stick's centre; the game sets them. */
  safeRight = 0;
  safeBottom = 0;
  /** The car's heading, which the stick steers towards; the game sets it before each sample. */
  carHeading = 0;
  /** Where the stick thumb is, as a fraction of the radius in each axis, for drawing the knob. */
  readonly stick = { x: 0, y: 0 };

  /** Called on Escape or P for desktop pause. */
  onResetKey: (() => void) | null = null;
  onPauseKey: (() => void) | null = null;

  /** Called on Enter when no form control owns the key. */
  onConfirmKey: (() => void) | null = null;

  readonly controller = new Controller();
  source: 'keyboard' | 'touch' | 'controller' = 'keyboard';
  onControllerDisconnect: (() => void) | null = null;

  /** Also poll in menus for edge-triggered Start and pause. */
  pollController(): void {
    let pads: readonly (Gamepad | null)[] = [];
    try {
      if ('getGamepads' in navigator) pads = navigator.getGamepads();
    } catch {
      /* Restricted browser policy. */
    }
    const edges = this.controller.poll(pads);
    if (edges.disconnected) {
      this.reset();
      this.onControllerDisconnect?.();
      return;
    }
    if (this.controller.active) this.source = 'controller';
    if (edges.reset) this.onResetKey?.();
    else if (edges.pause) this.onPauseKey?.();
    else if (edges.confirm) this.onConfirmKey?.();
  }

  private takeOver(source: 'keyboard' | 'touch'): void {
    if (this.source === 'controller') {
      this.reset();
    }
    this.controller.reset();
    this.source = source;
  }

  private readonly pointers = new Map<number, Touch>();
  private readonly keys = new Set<string>();
  private readonly releasedKeys = new Set<string>();

  constructor(private readonly target: HTMLElement) {
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointermove', this.onMove);
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
    this.target.removeEventListener('pointermove', this.onMove);
    this.target.removeEventListener('pointerup', this.onUp);
    this.target.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('contextmenu', preventDefault);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.reset);
  }

  /** Screen position of the stick's centre. */
  stickCentre(): { x: number; y: number } {
    const r = this.pad.inset + this.pad.stickRadius;
    return {
      x: window.innerWidth - this.safeRight - r,
      y: window.innerHeight - this.safeBottom - r,
    };
  }

  /** Raw, unsmoothed controls right now. */
  raw(): RawControls {
    if (this.source === 'controller') return this.controller.controls;
    const k = this.keys;
    const touches = [...this.pointers.values()];
    const onStick = touches.find((t) => t.zone === 'stick');
    let stick: number | null = null;
    this.stick.x = 0;
    this.stick.y = 0;
    if (onStick) {
      const c = this.stickCentre();
      const r = this.pad.stickRadius;
      const dx = onStick.x - c.x;
      const dy = onStick.y - c.y;
      stick = stickHeading(dx, dy, r);
      // Knob stays inside the base however far the thumb wanders
      const over = Math.max(1, Math.hypot(dx, dy) / r);
      this.stick.x = dx / r / over;
      this.stick.y = dy / r / over;
    }
    return resolveControls(
      touches.map((t) => t.zone),
      {
        left: k.has('arrowleft') || k.has('a'),
        right: k.has('arrowright') || k.has('d'),
        brake: k.has(' ') || k.has('arrowdown') || k.has('s'),
        gas: k.has('arrowup') || k.has('w'),
      },
      this.scheme,
      stick,
      this.carHeading,
      this.pad.stickFullAngle,
    );
  }

  /** Advance the smoothed state by one physics step. */
  sample(dt: number, ramp: SteerRamp, throttleSeconds = 0, throttleReleaseSeconds = 0): InputState {
    const raw = this.raw();
    advanceControls(
      this.state,
      raw,
      dt,
      ramp,
      this.source === 'controller' ? 0 : throttleSeconds,
      this.source === 'controller' ? 0 : throttleReleaseSeconds,
    );
    const zones = [...this.pointers.values()].map((t) => t.zone);
    for (const z of Object.keys(this.held) as Zone[]) this.held[z] = zones.includes(z);
    return this.state;
  }

  /** Drop any held input, e.g. when leaving the playing state. */
  readonly reset = (): void => {
    this.controller.reset();
    reversalTargets.delete(this.state);
    this.source = 'keyboard';
    this.stick.x = 0;
    this.stick.y = 0;
    this.pointers.clear();
    for (const key of this.keys) this.releasedKeys.add(key);
    this.keys.clear();
    this.state.steer = 0;
    this.state.handbrake = false;
    this.state.throttle = 0;
    for (const z of Object.keys(this.held) as Zone[]) this.held[z] = false;
  };

  private readonly onDown = (e: PointerEvent): void => {
    e.preventDefault();
    const zone = zoneAt(
      e.clientX,
      e.clientY,
      window.innerWidth,
      window.innerHeight,
      this.scheme,
      this.pad,
    );
    if (!zone) return;
    this.takeOver('touch');
    this.pointers.set(e.pointerId, { zone, x: e.clientX, y: e.clientY });
    this.target.setPointerCapture(e.pointerId);
  };

  private readonly onMove = (e: PointerEvent): void => {
    const t = this.pointers.get(e.pointerId);
    if (t) {
      t.x = e.clientX;
      t.y = e.clientY;
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    // Always release tracked keys, even if focus or modifiers changed while held.
    if (e.type === 'keyup') {
      this.releasedKeys.delete(key);
      if (this.keys.delete(key)) e.preventDefault();
      return;
    }
    const target = e.target;
    if (
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      (target instanceof HTMLElement &&
        (target.isContentEditable ||
          (key !== 'escape' && target.closest('input, textarea, select, button, a[href]'))))
    )
      return;
    if (key === 'escape' || key === 'p' || key === 'enter' || key === 'r') {
      e.preventDefault();
      if (!e.repeat) {
        if (key === 'r') this.onResetKey?.();
        else if (key === 'enter') this.onConfirmKey?.();
        else this.onPauseKey?.();
      }
      return;
    }
    if (!KEYS.has(key)) return;
    if (this.releasedKeys.has(key) || (e.repeat && !this.keys.has(key))) return;
    e.preventDefault();
    this.takeOver('keyboard');
    this.keys.add(key);
  };
}

const KEYS = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', ' ']);

function preventDefault(e: Event): void {
  e.preventDefault();
}
