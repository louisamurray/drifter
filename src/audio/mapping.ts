/**
 * Pure mappings from game telemetry to audio parameters. Kept separate from
 * the Web Audio graph so they can be unit tested without an AudioContext.
 */

export const ENGINE_IDLE_HZ = 58;
export const ENGINE_TOP_HZ = 215;

/** Engine fundamental from speed ratio (0..1). Wheelspin in a drift pushes it up. */
export function engineFrequency(
  speedRatio: number,
  drifting: boolean,
  handbrake: boolean,
  wheelspin = 0,
): number {
  const r = Math.min(1, Math.max(0, speedRatio));
  let f = ENGINE_IDLE_HZ + (ENGINE_TOP_HZ - ENGINE_IDLE_HZ) * Math.pow(r, 0.85);
  if (drifting) f *= 1.12;
  if (handbrake) f *= 0.94;
  return f * (1 + 0.06 * Math.min(1, Math.max(0, wheelspin)));
}

/** Engine loudness: present at idle, fuller under power, slightly eased on the handbrake. */
export function engineGain(speedRatio: number, throttle: number): number {
  const r = Math.min(1, Math.max(0, speedRatio));
  return 0.1 + 0.05 * r + 0.08 * throttle;
}

/** Low-pass cutoff opens with speed so the engine brightens as it winds up. */
export function engineCutoff(speedRatio: number): number {
  return 500 + 2200 * Math.min(1, Math.max(0, speedRatio));
}

/** Squeal loudness from 0..1 slide intensity. Silent off the road. */
export function squealGain(intensity: number, offTrack: boolean): number {
  if (offTrack) return 0;
  const i = Math.min(1, Math.max(0, intensity));
  return 0.26 * Math.pow(i, 1.6);
}

/** Squeal centre pitch rises with slide intensity. */
export function squealFrequency(intensity: number): number {
  return 1500 + 700 * Math.min(1, Math.max(0, intensity));
}

/** Bank chime root in Hz: rises by a fourth per decade of banked points, capped. */
export function bankRootHz(amount: number): number {
  const decades = Math.min(3, Math.max(0, Math.log10(Math.max(1, amount)) - 1));
  return 392 * Math.pow(4 / 3, decades);
}
