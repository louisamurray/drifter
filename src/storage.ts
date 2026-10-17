const BEST_KEY = 'drifter.best';

export function loadBest(): number {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function saveBest(score: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(Math.round(score)));
  } catch {
    // Storage unavailable (private mode, quota). Best simply does not persist.
  }
}
