/**
 * Fixed-timestep update with variable-rate render, driven by requestAnimationFrame.
 *
 * Physics advances in exact `fixedDt` steps from an accumulator, so the car behaves
 * identically on 60 Hz and 120 Hz screens. Render receives an interpolation alpha
 * (0..1) describing how far we are into the next unsimulated step.
 */
export interface LoopCallbacks {
  update: (dt: number) => void;
  render: (alpha: number) => void;
}

export interface LoopOptions {
  fixedDt: number;
  maxFrameDt: number;
}

/**
 * Pure accumulator step, separated from rAF so it can be unit tested.
 * Returns how many fixed updates ran and the remaining accumulator.
 */
export function stepAccumulator(
  accumulator: number,
  frameDt: number,
  options: LoopOptions,
  update: (dt: number) => void,
): { steps: number; accumulator: number } {
  let acc = accumulator + Math.min(frameDt, options.maxFrameDt);
  let steps = 0;
  while (acc >= options.fixedDt) {
    update(options.fixedDt);
    acc -= options.fixedDt;
    steps += 1;
  }
  return { steps, accumulator: acc };
}

export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  constructor(
    private readonly callbacks: LoopCallbacks,
    private readonly options: LoopOptions,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  get isRunning(): boolean {
    return this.running;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    const result = stepAccumulator(this.accumulator, frameDt, this.options, this.callbacks.update);
    this.accumulator = result.accumulator;

    this.callbacks.render(this.accumulator / this.options.fixedDt);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
