/** Short haptic ticks where the platform supports them. Silent elsewhere. */
export function haptic(ms: number | number[]): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    // Not supported or blocked; haptics are decoration
  }
}
