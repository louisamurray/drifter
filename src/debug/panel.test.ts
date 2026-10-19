import { afterEach, expect, it, vi } from 'vitest';
import { mountDebugPanel } from './panel';

afterEach(() => {
  document.body.innerHTML = '';
});

it('omits model selection when no development switch is supplied', () => {
  mountDebugPanel();
  expect(document.querySelector('#debug-model')).toBeNull();
});

it('routes model selection through the session reset callback', () => {
  const reset = vi.fn();
  mountDebugPanel(reset);
  const select = document.querySelector<HTMLSelectElement>('#debug-model');
  if (!select) throw new Error('Missing model selector');
  expect(select.value).toBe('legacy');
  select.value = 'force';
  select.dispatchEvent(new Event('change'));
  expect(reset).toHaveBeenCalledExactlyOnceWith('force');
});
