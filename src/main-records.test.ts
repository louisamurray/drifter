import { expect, it, vi } from 'vitest';
import { pad } from './core/controller-fixture';
import type { LoopCallbacks } from './core/loop';
import type * as ChallengeModule from './game/challenge';

const harness = vi.hoisted(() => ({ loop: null as LoopCallbacks | null, complete: false }));
vi.mock('./core/loop', () => ({
  GameLoop: class {
    constructor(callbacks: LoopCallbacks) {
      harness.loop = callbacks;
    }
    start = vi.fn();
    stop = vi.fn();
  },
}));
vi.mock('./audio/audio', () => ({
  AudioEngine: class {
    muted = true;
    unlock = vi.fn();
    startEngine = vi.fn();
    stopEngine = vi.fn();
    suspend = vi.fn();
    resume = vi.fn();
    update = vi.fn();
    play = vi.fn();
    describe() {
      return 'muted';
    }
  },
}));
// Completing the course by driving is covered by the real-car fixtures; here it is forced.
vi.mock('./game/challenge', async (original) => {
  const actual = await original<typeof ChallengeModule>();
  return {
    ...actual,
    updateChallenge: (...args: Parameters<typeof actual.updateChallenge>) => {
      actual.updateChallenge(...args);
      if (harness.complete) {
        const s = args[0];
        s.next = actual.CHALLENGE_GATES.length;
        s.finished = true;
        s.line = 1000;
      }
    },
  };
});

it('keys challenge bests by the controls actually used, without ?debug', async () => {
  document.body.innerHTML = '<canvas id="game"></canvas>';
  window.history.replaceState({}, '', '/');
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn() }));
  const ctx = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'canvas' ? document.querySelector('canvas') : () => ({ addColorStop: vi.fn() }),
      set: () => true,
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as CanvasRenderingContext2D,
  );
  Object.assign(HTMLCanvasElement.prototype, { setPointerCapture: () => undefined });
  await import('./main');
  const loop = harness.loop;
  if (!loop) throw new Error('Loop did not boot');
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('Canvas missing');
  const tick = (steps: number) => {
    for (let i = 0; i < steps; i++) loop.update(1 / 60);
    loop.render(1);
  };
  const key = (k: string, type = 'keydown') =>
    window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
  const pointer = (type: string, id: number) => {
    const e = new MouseEvent(type, { clientX: 900, clientY: 700, bubbles: true });
    Object.defineProperty(e, 'pointerId', { value: id });
    canvas.dispatchEvent(e);
  };
  const finish = () => {
    harness.complete = true;
    tick(1);
    harness.complete = false;
  };
  const records = () =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('drifter.record.'))
      .map((k) => decodeURIComponent(k))
      .sort();
  const identity = () => document.querySelector('.result-identity')?.textContent ?? '';
  const retry = () => {
    document.querySelector<HTMLButtonElement>('.screen-over [data-act="restart"]')?.click();
    tick(1);
  };

  document.querySelector<HTMLButtonElement>('[data-activity="challenge"]')?.click();
  key('Enter');
  tick(1);
  key('w');
  tick(30);
  finish();
  key('w', 'keyup');
  expect(identity()).toContain('· keyboard-pedals ·');
  expect(records()).toHaveLength(1);
  expect(records()[0]).toContain('"keyboard-pedals"');

  // Touch only, started from the HUD button.
  retry();
  pointer('pointerdown', 7);
  tick(30);
  finish();
  pointer('pointerup', 7);
  expect(identity()).toContain('· touch-pedals ·');
  expect(records()).toHaveLength(2);

  // Controller only: Start on the pad from the results screen, then RT.
  let pads: Gamepad[] = [pad()];
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
  tick(1);
  pads = [pad(0, 0, 0, [9])];
  tick(1);
  pads = [pad()];
  tick(1);
  pads = [pad(0, 0, 0.8)];
  tick(30);
  finish();
  expect(identity()).toContain('· controller ·');
  expect(records()).toHaveLength(3);
  pads = [];
  tick(1);
  Reflect.deleteProperty(navigator, 'getGamepads');

  // Keyboard, then a thumb, in one attempt: labelled as both and never saved.
  retry();
  key('w');
  tick(10);
  key('w', 'keyup');
  pointer('pointerdown', 8);
  tick(10);
  finish();
  pointer('pointerup', 8);
  expect(identity()).toContain('· keyboard-pedals+touch-pedals ·');
  expect(records()).toHaveLength(3);

  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
