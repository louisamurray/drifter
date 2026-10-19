type Callback = 'update' | 'render';

/** Rolling cost of the loop's update and render callbacks, for the ?debug readout. */
export class FrameTimer {
  private readonly samples: Record<Callback, number[]> = { update: [], render: [] };

  constructor(private readonly window = 240) {}

  record(kind: Callback, ms: number): void {
    const list = this.samples[kind];
    list.push(ms);
    if (list.length > this.window) list.shift();
  }

  stats(kind: Callback): { mean: number; p95: number; max: number; samples: number } {
    const list = this.samples[kind];
    if (list.length === 0) return { mean: 0, p95: 0, max: 0, samples: 0 };
    const sorted = [...list].sort((a, b) => a - b);
    return {
      mean: list.reduce((sum, ms) => sum + ms, 0) / list.length,
      p95: sorted[Math.ceil(0.95 * sorted.length) - 1] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      samples: list.length,
    };
  }

  summary(): string {
    const part = (kind: Callback) => {
      const s = this.stats(kind);
      return s.samples === 0
        ? `${kind} --`
        : `${kind} ${s.mean.toFixed(2)} ms p95 ${s.p95.toFixed(2)}`;
    };
    return `${part('update')} · ${part('render')}`;
  }
}
