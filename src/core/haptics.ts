/**
 * Short haptic ticks through the vibration API. Android browsers implement it
 * after the first touch. iOS has no haptics API for web pages at all, so iPhone
 * players get none. Decoration only: never load-bearing.
 */
export function haptic(ms: number | number[]): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    // Not supported or blocked
  }
}

export function hapticsDescription(): string {
  return 'vibrate' in navigator ? 'vibrate api' : 'none (iOS has no web haptics)';
}
