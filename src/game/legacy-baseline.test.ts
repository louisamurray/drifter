import { describe, expect, it } from 'vitest';
import { config } from '../config';
import {
  advanceControls,
  NO_KEYS,
  resolveControls,
  type InputState,
  type Keys,
} from '../core/input';
import { createCar, ROAD, stepCar, telemetry } from './car';

interface Segment {
  frames: number;
  keys: Partial<Keys>;
  surface?: 'grass';
}

// Recorded intent at 60 Hz, passed through the shipped manual keyboard adapter.
// These fixtures preserve the legacy response, not acceptance targets for the new solver.
const accelerate: Segment = { frames: 180, keys: { gas: true } };
const turn: Segment = { frames: 120, keys: { gas: true, right: true } };
const scenarios: { name: string; segments: Segment[] }[] = [
  { name: 'straight acceleration', segments: [accelerate] },
  {
    name: 'sustained turn',
    segments: [accelerate, { frames: 360, keys: { gas: true, right: true } }],
  },
  { name: 'full-lock initiation', segments: [accelerate, turn] },
  {
    name: 'countersteer',
    segments: [accelerate, turn, { frames: 60, keys: { gas: true, left: true } }],
  },
  { name: 'lift and release', segments: [accelerate, turn, { frames: 180, keys: {} }] },
  {
    name: 'handbrake pull and release',
    segments: [
      accelerate,
      { frames: 30, keys: { right: true, brake: true } },
      { frames: 120, keys: { gas: true } },
    ],
  },
  {
    name: 'asphalt to grass and back',
    segments: [
      accelerate,
      { frames: 120, keys: { gas: true, right: true }, surface: 'grass' },
      { frames: 120, keys: { gas: true } },
    ],
  },
];

function replay(segments: Segment[], mirror = false) {
  const car = createCar(0, 0, 0);
  const input: InputState = { throttle: 0, steer: 0, handbrake: false };
  const dt = config.loop.fixedDt;
  let elapsedFrames = 0;
  let driftFrames = 0;
  let maxSlip = 0;
  const checkpoints = segments.map((segment) => {
    const keys = { ...NO_KEYS, ...segment.keys };
    const effectiveKeys = mirror ? { ...keys, left: keys.right, right: keys.left } : keys;
    const raw = resolveControls([], effectiveKeys, 'pedals');
    for (let frame = 0; frame < segment.frames; frame++) {
      advanceControls(input, raw, dt, config.input.steer, config.input.throttleSeconds);
      stepCar(car, input, dt, config.physics, segment.surface === 'grass' ? config.offTrack : ROAD);
      elapsedFrames++;
      if (car.drifting) driftFrames++;
      maxSlip = Math.max(maxSlip, Math.abs(telemetry(car).slipAngle));
    }
    return {
      frame: elapsedFrames,
      input: { ...input },
      car: { ...car },
      telemetry: telemetry(car),
    };
  });
  return { checkpoints, driftSeconds: driftFrames * dt, maxSlip };
}

// Six decimal places retain useful differences without relying on engine-specific last bits.
function rounded(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === 'number' ? Math.round(item * 1e6) / 1e6 : item,
    ),
  );
}

describe('legacy handling baseline at 60 Hz without road assist or corner lift', () => {
  it('records the configuration and reproducible input sequences', () => {
    expect(
      rounded({
        initialPose: { x: 0, y: 0, heading: 0 },
        scheme: 'pedals',
        loop: config.loop,
        input: {
          steer: config.input.steer,
          throttleSeconds: config.input.throttleSeconds,
          pad: config.input.pad,
        },
        physics: config.physics,
        surfaces: { asphalt: ROAD, grass: config.offTrack },
        scenarios,
      }),
    ).toMatchSnapshot();
  });

  it.each(scenarios)('$name', ({ segments }) => {
    const report = replay(segments);
    expect(report).toEqual(replay(segments));
    for (const checkpoint of report.checkpoints) {
      expect(
        Object.values(checkpoint.car).every(
          (value) => typeof value !== 'number' || Number.isFinite(value),
        ),
      ).toBe(true);
    }
    expect(rounded(report)).toMatchSnapshot();
  });

  it.each(scenarios)('mirrors $name through the real keyboard input path', ({ segments }) => {
    const right = replay(segments);
    const left = replay(segments, true);
    right.checkpoints.forEach((checkpoint, index) => {
      const mirrored = left.checkpoints[index];
      if (!mirrored) throw new Error(`Missing mirrored checkpoint ${String(index)}`);
      expect(mirrored.car.x).toBeCloseTo(checkpoint.car.x, 8);
      expect(mirrored.car.y).toBeCloseTo(-checkpoint.car.y, 8);
      expect(mirrored.car.heading).toBeCloseTo(-checkpoint.car.heading, 8);
      expect(mirrored.car.yawRate).toBeCloseTo(-checkpoint.car.yawRate, 8);
      expect(mirrored.telemetry.speed).toBeCloseTo(checkpoint.telemetry.speed, 8);
    });
    expect(left.driftSeconds).toBe(right.driftSeconds);
  });
});
