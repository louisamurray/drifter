import { describe, expect, it } from 'vitest';
import { fmtScore, Hud } from './hud';

function rows(hud: Hud): string[] {
  return [...hud.root.querySelectorAll('.title-best .best-row')].map((r) => r.textContent);
}

describe('best scores on the title', () => {
  it('lists each mode, the chosen one first and highlighted', () => {
    const hud = new Hud(document.body);
    hud.setMode('track');
    hud.setBests({ track: 12300, free: 4500 });
    expect(rows(hud)).toEqual([
      `Circuit best ${fmtScore(12300)}`,
      `Free drift best ${fmtScore(4500)}`,
    ]);
    expect(hud.root.querySelector('.best-row.on')?.textContent).toBe(
      `Circuit best ${fmtScore(12300)}`,
    );

    hud.setMode('free');
    expect(rows(hud)).toEqual([
      `Free drift best ${fmtScore(4500)}`,
      `Circuit best ${fmtScore(12300)}`,
    ]);
    expect(hud.root.querySelector('.best-row.on')?.textContent).toBe(
      `Free drift best ${fmtScore(4500)}`,
    );
  });

  it('leaves out a mode with no best yet', () => {
    const hud = new Hud(document.body);
    hud.setMode('free');
    hud.setBests({ track: 900, free: 0 });
    expect(rows(hud)).toEqual([`Circuit best ${fmtScore(900)}`]);
    expect(hud.root.querySelector('.best-row.on')).toBeNull();

    hud.setBests({ track: 0, free: 0 });
    expect(rows(hud)).toEqual([]);
  });
});

describe('best score on game over', () => {
  it('names the mode the best belongs to', () => {
    const hud = new Hud(document.body);
    hud.setMode('free');
    hud.setGameOver(700, 4500, false);
    expect(hud.root.querySelector('.over-best')?.textContent).toBe(
      `Free drift best ${fmtScore(4500)}`,
    );
    expect(hud.root.querySelector('.over-newbest')?.classList.contains('show')).toBe(false);

    hud.setMode('track');
    hud.setGameOver(12300, 12300, true);
    expect(hud.root.querySelector('.over-best')?.textContent).toBe(
      `Circuit best ${fmtScore(12300)}`,
    );
    expect(hud.root.querySelector('.over-newbest')?.classList.contains('show')).toBe(true);
  });
});

describe('desktop control hints', () => {
  it('describes the selected throttle scheme while retaining touch controls', () => {
    const hud = new Hud(document.body);
    hud.setControls('pedals');
    const hints = () =>
      [...hud.root.querySelectorAll('.keyboard-driving')].map((el) => el.textContent);
    expect(hints()).toHaveLength(2);
    for (const text of hints()) expect(text).toContain('W/Up for gas');
    expect(hud.root.querySelector('.pad')?.classList.contains('show')).toBe(true);
    expect(hud.root.querySelector('.title-cta .keyboard-only')?.textContent).toBe('Enter to drive');
    hud.setControls('thumb');
    for (const text of hints()) expect(text).toContain('Auto accelerate');
    expect(hud.root.querySelectorAll('.hint-thumb')).toHaveLength(2);
  });
});

it('labels prototype results and suppresses competitive comparisons', () => {
  const hud = new Hud(document.body);
  hud.setGameOver(900, 300, true, false);
  expect(hud.root.querySelector('.over-best')?.textContent).toBe(
    'Handling prototype · best not saved',
  );
  expect(hud.root.querySelector('.over-newbest')?.classList.contains('show')).toBe(false);
});
