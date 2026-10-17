/**
 * Fixed-size smoke pool. No per-frame allocation: particles are structs in
 * preallocated arrays and dead slots are reused.
 */
export interface Smoke {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  /** 0..1, how hot the drift was when emitted; tints towards accent. */
  heat: number;
  alive: boolean;
}

export class SmokePool {
  readonly items: Smoke[];
  private cursor = 0;
  private carry = 0;

  constructor(readonly capacity: number) {
    this.items = Array.from({ length: capacity }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      age: 0,
      life: 1,
      size: 8,
      heat: 0,
      alive: false,
    }));
  }

  /** Emit roughly `rate * dt` particles at (x, y) with a base velocity. */
  emit(x: number, y: number, vx: number, vy: number, rate: number, dt: number, heat: number): void {
    this.carry += rate * dt;
    while (this.carry >= 1) {
      this.carry -= 1;
      const p = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % this.capacity;
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const spread = 30 + Math.random() * 40;
      p.x = x + (Math.random() - 0.5) * 6;
      p.y = y + (Math.random() - 0.5) * 6;
      p.vx = vx * 0.25 + Math.cos(a) * spread;
      p.vy = vy * 0.25 + Math.sin(a) * spread;
      p.age = 0;
      p.life = 0.55 + Math.random() * 0.45;
      p.size = 5 + Math.random() * 4;
      p.heat = heat;
      p.alive = true;
    }
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
  }

  clear(): void {
    for (const p of this.items) p.alive = false;
    this.carry = 0;
  }

  get aliveCount(): number {
    let n = 0;
    for (const p of this.items) if (p.alive) n += 1;
    return n;
  }
}

export interface Shake {
  amplitude: number;
  timeLeft: number;
  duration: number;
  x: number;
  y: number;
}

export function createShake(): Shake {
  return { amplitude: 0, timeLeft: 0, duration: 1, x: 0, y: 0 };
}

export function triggerShake(s: Shake, amplitude: number, duration: number): void {
  s.amplitude = Math.max(s.amplitude, amplitude);
  s.timeLeft = duration;
  s.duration = duration;
}

export function updateShake(s: Shake, dt: number): void {
  if (s.timeLeft <= 0) {
    s.x = 0;
    s.y = 0;
    s.amplitude = 0;
    return;
  }
  s.timeLeft -= dt;
  const k = Math.max(0, s.timeLeft / s.duration);
  const a = s.amplitude * k * k;
  s.x = (Math.random() * 2 - 1) * a;
  s.y = (Math.random() * 2 - 1) * a;
}

/** Shake amplitude for a banked chain: grows with the log of the amount. */
export function bankShakeAmplitude(
  amount: number,
  base: number,
  perDecade: number,
  max: number,
): number {
  return Math.min(max, base + Math.log10(Math.max(1, amount)) * perDecade);
}
