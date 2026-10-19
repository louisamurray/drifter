import { expect, it, vi } from 'vitest';
import type { LoopCallbacks } from './core/loop';
import type * as StorageModule from './storage';
import type * as ScoringModule from './game/scoring';
import type * as DrawModule from './render/draw';

const harness = vi.hoisted(() => ({
  loop: null as LoopCallbacks | null,
  finish: false,
  drawCar: vi.fn(),
  saveBest: vi.fn(),
}));
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
vi.mock('./storage', async (original) => ({
  ...(await original<typeof StorageModule>()),
  saveBest: harness.saveBest,
}));
vi.mock('./game/scoring', async (original) => {
  const actual = await original<typeof ScoringModule>();
  return {
    ...actual,
    updateScore: (...args: Parameters<typeof actual.updateScore>) => {
      actual.updateScore(...args);
      if (harness.finish) {
        args[0].score = 999;
        args[0].finished = true;
      }
    },
  };
});
vi.mock('./render/draw', async (original) => {
  const actual = await original<typeof DrawModule>();
  return { ...actual, drawCar: harness.drawCar };
});

it('runs the actual session through development model changes, pause, restart and isolated best saving', async () => {
  document.body.innerHTML = '<canvas id="game"></canvas>';
  window.history.replaceState({}, '', '/?debug');
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
  await import('./main');
  const loop = harness.loop;
  if (!loop) throw new Error('Loop did not boot');
  const tick = (steps: number) => {
    for (let i = 0; i < steps; i++) loop.update(1 / 60);
    loop.render(1);
  };
  const key = (key: string, type = 'keydown') =>
    window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  const model = document.querySelector<HTMLSelectElement>('#debug-model');
  if (!model) throw new Error('Development model switch missing');
  expect(model.value).toBe('legacy');
  const selectModel = (value: string) => {
    model.value = value;
    model.dispatchEvent(new Event('change'));
  };
  selectModel('force');
  key('Enter');
  tick(240);
  key('w');
  key('d');
  tick(120);
  const beforePause = harness.drawCar.mock.lastCall?.slice(1, 4);
  key('Escape');
  tick(30);
  expect(harness.drawCar.mock.lastCall?.slice(1, 4)).toEqual(beforePause);
  key('Escape', 'keyup');
  key('Enter');
  tick(1);
  harness.finish = true;
  tick(1);
  expect(harness.saveBest).not.toHaveBeenCalled();
  expect(document.querySelector('.over-best')?.textContent).toContain('best not saved');
  expect(document.querySelector('.over-newbest')?.classList.contains('show')).toBe(false);
  harness.finish = false;
  key('Enter');
  tick(1);
  const restartPose = harness.drawCar.mock.lastCall?.slice(1, 4);
  tick(240);
  // Held input was cleared at restart: a manual-throttle force car stays at spawn.
  expect(harness.drawCar.mock.lastCall?.slice(1, 4)).toEqual(restartPose);
  // Changing the model during an active run returns to a clean title session.
  selectModel('legacy');
  key('Enter');
  tick(240);
  harness.finish = true;
  tick(1);
  expect(harness.saveBest).toHaveBeenCalledExactlyOnceWith('track', 999);
  expect(document.querySelector('.over-best')?.textContent).toContain('Circuit best');
  expect(document.querySelector('.over-newbest')?.classList.contains('show')).toBe(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
