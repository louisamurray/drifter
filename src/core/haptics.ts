/**
 * Short haptic ticks where the platform supports them.
 *
 * Android browsers implement the vibration API. iOS does not, but iOS 18
 * plays a system tick when a switch-style checkbox toggles, so on Apple
 * devices we flip a hidden one. Best effort only; silent elsewhere.
 */
let iosSwitch: HTMLInputElement | null = null;

export function haptic(ms: number | number[]): void {
  try {
    if ('vibrate' in navigator && navigator.vibrate(ms)) return;
  } catch {
    // Not supported or blocked; fall through
  }
  if (isApple()) toggleSwitch();
}

export function hapticsDescription(): string {
  if ('vibrate' in navigator) return 'vibrate api';
  return isApple() ? 'ios switch tick' : 'none';
}

function isApple(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function toggleSwitch(): void {
  try {
    if (!iosSwitch) {
      iosSwitch = document.createElement('input');
      iosSwitch.type = 'checkbox';
      iosSwitch.setAttribute('switch', '');
      iosSwitch.setAttribute('aria-hidden', 'true');
      iosSwitch.tabIndex = -1;
      Object.assign(iosSwitch.style, {
        position: 'fixed',
        left: '-100px',
        top: '0',
        width: '1px',
        height: '1px',
        opacity: '0',
        pointerEvents: 'none',
      });
      document.body.append(iosSwitch);
    }
    iosSwitch.click();
  } catch {
    // Decoration only
  }
}
