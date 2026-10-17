import { describe, expect, it } from 'vitest';
import { bankShakeAmplitude, createShake, SmokePool, triggerShake, updateShake } from './particles';

describe('SmokePool', () => {
  it('never exceeds capacity and reuses slots', () => {
    const pool = new SmokePool(16);
    pool.emit(0, 0, 0, 0, 1000, 1, 0.5);
    expect(pool.aliveCount).toBe(16);
    expect(pool.items).toHaveLength(16);
  });

  it('retires particles at end of life', () => {
    const pool = new SmokePool(8);
    pool.emit(0, 0, 0, 0, 8, 1, 0);
    expect(pool.aliveCount).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) pool.update(1 / 60);
    expect(pool.aliveCount).toBe(0);
  });

  it('emits fractionally over time', () => {
    const pool = new SmokePool(64);
    for (let i = 0; i < 60; i++) pool.emit(0, 0, 0, 0, 10, 1 / 60, 0);
    expect(pool.aliveCount).toBeGreaterThanOrEqual(9);
    expect(pool.aliveCount).toBeLessThanOrEqual(10);
  });
});

describe('shake', () => {
  it('decays to zero within its duration', () => {
    const s = createShake();
    triggerShake(s, 10, 0.3);
    updateShake(s, 1 / 60);
    expect(Math.abs(s.x) + Math.abs(s.y)).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) updateShake(s, 1 / 60);
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
  });

  it('scales bank amplitude with chain size and caps it', () => {
    expect(bankShakeAmplitude(10, 3, 2.5, 14)).toBeCloseTo(5.5);
    expect(bankShakeAmplitude(10000, 3, 2.5, 14)).toBeCloseTo(13);
    expect(bankShakeAmplitude(1e9, 3, 2.5, 14)).toBe(14);
  });
});
