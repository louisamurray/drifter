import { pad } from './core/controller-fixture';
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
  // Assistance changes are title-only session changes and never enter legacy bests.
  harness.finish = false;
  selectModel('legacy');
  document.querySelector<HTMLButtonElement>('[data-profile="reduced"]')?.click();
  expect(document.querySelector('.screen-title.active')).not.toBeNull();
  expect(document.querySelector('[data-profile="reduced"]')?.getAttribute('aria-pressed')).toBe(
    'true',
  );
  key('Enter');
  tick(240);
  harness.finish = true;
  tick(1);
  expect(harness.saveBest).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.over-best')?.textContent).toContain('best not saved');

  harness.finish = false;
  selectModel('legacy');
  document.querySelector<HTMLButtonElement>('[data-profile="assisted"]')?.click();
  let pads: Gamepad[] = [pad()];
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
  tick(1); // Neutral arms controller.
  pads = [pad(0, 0, 0, [9])];
  tick(1); // Start edge.
  pads = [pad()];
  tick(240);
  pads = [pad(0, 0.5, 0.5)];
  tick(120);
  pads = [];
  tick(1);
  expect(document.querySelector('.screen-paused.active')).not.toBeNull();
  const disconnectedPose = harness.drawCar.mock.lastCall?.slice(1, 4);
  tick(120);
  expect(harness.drawCar.mock.lastCall?.slice(1, 4)).toEqual(disconnectedPose);
  // Keyboard can resume after controller loss; the entire mixed-input run stays isolated.
  key('Enter');
  harness.finish = true;
  tick(1);
  expect(harness.saveBest).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.over-best')?.textContent).toContain('best not saved');
  Reflect.deleteProperty(navigator, 'getGamepads');
  harness.finish = false;
  document.querySelector<HTMLButtonElement>('.screen-over [data-act="title"]')?.click();
  document.querySelector<HTMLButtonElement>('[data-activity="practice"]')?.click();
  document.querySelector<HTMLButtonElement>('.screen-title [data-act="start"]')?.click();
  expect(document.querySelector('.screen-playing.active')).not.toBeNull();
  tick(1);
  const practiceSpawn = harness.drawCar.mock.lastCall?.slice(1, 4);
  // A forced scorer finish must never be consulted in an untimed activity.
  harness.finish = true;
  tick(4200);
  expect(document.querySelector('.screen-playing.active')).not.toBeNull();
  expect(harness.saveBest).toHaveBeenCalledTimes(1);
  key('w', 'keyup');
  key('d', 'keyup');
  key('w');
  key('d');
  tick(120);
  expect(harness.drawCar.mock.lastCall?.slice(1, 4)).not.toEqual(practiceSpawn);
  key('r');
  tick(1);
  expect(harness.drawCar.mock.lastCall?.slice(1, 4)).toEqual(practiceSpawn);
  // OS key repeats after reset cannot resurrect a held throttle.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', repeat: true }));
  tick(120);
  expect(harness.drawCar.mock.lastCall?.slice(1, 4)).toEqual(practiceSpawn);
  key('Escape');
  tick(120);
  expect(document.querySelector('.screen-paused.active')).not.toBeNull();
  document.querySelector<HTMLButtonElement>('.screen-paused [data-act="resume"]')?.click();
  tick(1);
  expect(document.querySelector('.screen-playing.active')).not.toBeNull();
  key('Escape');
  document.querySelector<HTMLButtonElement>('.screen-paused [data-act="exit"]')?.click();
  expect(document.querySelector('.over-score')?.textContent).toBe('Your practice');
  expect(harness.saveBest).toHaveBeenCalledTimes(1);
  document.querySelector<HTMLButtonElement>('.screen-over [data-act="restart"]')?.click();
  expect(document.querySelector('.screen-playing.active')).not.toBeNull();
  key('Escape');
  document.querySelector<HTMLButtonElement>('.screen-paused [data-lesson="sustain"]')?.click();
  expect(document.querySelector('.screen-title.active')).not.toBeNull();
  expect(document.querySelector('.title-sub')?.textContent).toContain('4 seconds');
  document.querySelector<HTMLButtonElement>('.screen-title [data-act="start"]')?.click();
  tick(100);
  expect(document.querySelector('.hud')?.getAttribute('data-activity')).toBe('lesson');
  key('Escape');
  document.querySelector<HTMLButtonElement>('.screen-paused [data-act="leave-lesson"]')?.click();
  expect(document.querySelector('.hud')?.getAttribute('data-activity')).toBe('practice');
  expect(document.querySelector('.screen-playing.active')).not.toBeNull();
  // Reset now belongs to free practice: back to its spawn, not the lesson's.
  key('r', 'keyup');
  key('r');
  tick(1);
  expect(harness.drawCar.mock.lastCall?.slice(1, 4)).toEqual(practiceSpawn);
  key('Escape');
  document.querySelector<HTMLButtonElement>('.screen-paused [data-act="title"]')?.click();
  document.querySelector<HTMLButtonElement>('[data-activity="challenge"]')?.click();
  document.querySelector<HTMLButtonElement>('.screen-title [data-act="start"]')?.click();
  tick(1);
  expect(document.querySelector('.activity-cue')?.textContent).toContain('Start');
  key('Escape');
  document.querySelector<HTMLButtonElement>('.screen-paused [data-act="exit"]')?.click();
  expect(document.querySelector('.challenge-breakdown')?.textContent).toContain(
    'Line 0 + Angle 0 + Transition 0',
  );
  expect(document.querySelector('.over-best')?.textContent).toContain('No best saved');
  expect(document.querySelector('.result-reason')?.textContent).toBe(
    'Finish not reached. Retry from the start.',
  );
  expect(document.querySelector('.result-identity')?.textContent).toContain(
    's-bend-2 · force-1 / precision-2',
  );
  expect(harness.saveBest).toHaveBeenCalledTimes(1);

  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
