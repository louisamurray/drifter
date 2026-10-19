import type { RawControls } from './input';

export const CONTROLLER = { deadzone: 0.15, triggerDeadzone: 0.05 };
const NEUTRAL: RawControls = { steer: 0, throttle: 0, handbrake: false, analog: true };

/** Standard mapping: left stick X, RT gas, A or LT handbrake, Start confirm, B pause. */
export function controllerControls(pad: Gamepad): RawControls {
  const axis = pad.axes[0] ?? 0;
  const steer = Number.isFinite(axis)
    ? Math.sign(axis) *
      Math.min(1, Math.max(0, (Math.abs(axis) - CONTROLLER.deadzone) / (1 - CONTROLLER.deadzone)))
    : 0;
  const trigger = pad.buttons[7]?.value ?? 0;
  return {
    steer,
    analog: true,
    throttle: Number.isFinite(trigger)
      ? Math.min(
          1,
          Math.max(0, (trigger - CONTROLLER.triggerDeadzone) / (1 - CONTROLLER.triggerDeadzone)),
        )
      : 0,
    handbrake: !!pad.buttons[0]?.pressed || (pad.buttons[6]?.value ?? 0) > 0.5,
  };
}

/** Poll on physics steps. First standard device owns selection until disconnect.
 * A neutral release is required after reset/takeover, including action buttons.
 */
export class Controller {
  private index: number | null = null;
  private armed = false;
  private confirm = false;
  private pause = false;
  controls: RawControls = { ...NEUTRAL };
  active = false;

  reset(): void {
    this.armed = false;
    this.active = false;
    this.controls = { ...NEUTRAL };
    this.confirm = false;
    this.pause = false;
  }

  poll(pads: readonly (Gamepad | null)[]): {
    confirm: boolean;
    pause: boolean;
    disconnected: boolean;
  } {
    const previous = this.index;
    const selected = pads.find(
      (p) => p?.index === previous && p.connected && p.mapping === 'standard',
    );
    const disconnected = previous !== null && !selected && this.active;
    const pad = selected ?? pads.find((p) => p?.connected && p.mapping === 'standard');
    if (!pad) {
      this.index = null;
      this.reset();
      return { confirm: false, pause: false, disconnected };
    }
    if (pad.index !== previous) this.reset();
    this.index = pad.index;
    const controls = controllerControls(pad);
    const confirm = !!pad.buttons[9]?.pressed;
    const pause = !!pad.buttons[1]?.pressed;
    const engaged =
      controls.steer !== 0 || controls.throttle !== 0 || controls.handbrake || confirm || pause;
    if (!this.armed) {
      this.armed = !engaged;
      return { confirm: false, pause: false, disconnected };
    }
    this.controls = controls;
    if (engaged) this.active = true;
    const edges = { confirm: confirm && !this.confirm, pause: pause && !this.pause, disconnected };
    this.confirm = confirm;
    this.pause = pause;
    return edges;
  }
}
