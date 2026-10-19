import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadAssistance,
  saveAssistance,
  loadBest,
  loadMode,
  loadScheme,
  saveBest,
  saveMode,
  saveScheme,
} from './storage';

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

describe('control scheme storage', () => {
  it('defaults to two thumbs and ignores junk', () => {
    expect(loadScheme()).toBe('pedals');
    localStorage.setItem('drifter.controls', 'feet');
    expect(loadScheme()).toBe('pedals');
  });

  it('round-trips', () => {
    saveScheme('thumb');
    expect(loadScheme()).toBe('thumb');
  });
});

it('persists assistance independently of the saved control scheme and rejects unknown profiles', () => {
  expect(loadAssistance()).toBe('assisted');
  saveScheme('thumb');
  saveAssistance('reduced');
  expect(loadAssistance()).toBe('reduced');
  expect(loadScheme()).toBe('thumb');
  localStorage.setItem('drifter.assistance', 'unknown');
  expect(loadAssistance()).toBe('assisted');
});

it('separates challenge identities, rejects malformed records and reports write failure', async () => {
  const { loadRecord, saveRecord, recordKey } = await import('./storage');
  const id = {
    physics: 'force-1',
    scoring: 'precision-1',
    course: 's-bend-1',
    assistance: 'assisted',
    controls: 'keyboard-pedals',
  } as const;
  expect(saveRecord(id, 1200)).toBe(true);
  expect(loadRecord(id)).toBe(1200);
  for (const other of [
    { ...id, physics: 'force-2' },
    { ...id, scoring: 'precision-2' },
    { ...id, course: 's-bend-2' },
    { ...id, assistance: 'reduced' as const },
    { ...id, controls: 'controller' },
  ])
    expect(loadRecord(other)).toBe(0);
  expect(saveRecord(id, Infinity)).toBe(false);
  localStorage.setItem(recordKey(id), '{broken');
  expect(loadRecord(id)).toBe(0);
  localStorage.setItem(recordKey(id), JSON.stringify({ identity: id, score: '1200' }));
  expect(loadRecord(id)).toBe(0);
  const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  expect(saveRecord(id, 42)).toBe(false);
  failure.mockRestore();
});
