import { beforeEach, describe, expect, it } from 'vitest';
import { loadBest, loadMode, saveBest, saveMode } from './storage';

beforeEach(() => {
  localStorage.clear();
});

describe('best score storage', () => {
  it('keeps a separate best per mode', () => {
    saveBest('track', 1200);
    saveBest('free', 800);
    expect(loadBest('track')).toBe(1200);
    expect(loadBest('free')).toBe(800);
  });

  it('reads the circuit best from the original key', () => {
    localStorage.setItem('drifter.best', '4321');
    expect(loadBest('track')).toBe(4321);
    expect(loadBest('free')).toBe(0);
  });
});

describe('mode storage', () => {
  it('defaults to the circuit and ignores junk', () => {
    expect(loadMode()).toBe('track');
    localStorage.setItem('drifter.mode', 'moon');
    expect(loadMode()).toBe('track');
  });

  it('round-trips', () => {
    saveMode('free');
    expect(loadMode()).toBe('free');
  });
});
