import { config } from '../config';

type NumericRecord = Record<string, number>;

interface Group {
  label: string;
  values: NumericRecord;
}

/**
 * On-device tuning panel, shown when the page is loaded with `?debug`.
 * Every numeric tunable in the listed config groups becomes a range input that
 * mutates config in place, so feel can be adjusted on a phone without a rebuild.
 */
export function mountDebugPanel(): void {
  const groups: Group[] = [
    { label: 'physics', values: config.physics },
    { label: 'camera', values: config.camera },
    { label: 'input', values: config.input },
  ];

  const root = document.createElement('details');
  root.id = 'debug-panel';
  root.innerHTML = '<summary>tune</summary>';
  Object.assign(root.style, {
    position: 'fixed',
    right: '8px',
    top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
    zIndex: '10',
    font: '12px ui-monospace, Menlo, monospace',
    color: '#f2eee6',
    background: 'rgba(0,0,0,0.55)',
    padding: '6px 8px',
    borderRadius: '6px',
    maxHeight: '70vh',
    overflowY: 'auto',
    touchAction: 'pan-y',
  } satisfies Partial<CSSStyleDeclaration>);
  root.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });

  for (const group of groups) {
    const heading = document.createElement('div');
    heading.textContent = group.label;
    heading.style.margin = '6px 0 2px';
    heading.style.opacity = '0.7';
    root.append(heading);
    for (const key of Object.keys(group.values)) {
      root.append(makeRow(group.values, key));
    }
  }

  document.body.append(root);
}

function makeRow(values: NumericRecord, key: string): HTMLElement {
  const initial = values[key] ?? 0;
  const row = document.createElement('label');
  row.style.display = 'grid';
  row.style.gridTemplateColumns = '10ch 1fr 6ch';
  row.style.gap = '6px';
  row.style.alignItems = 'center';

  const name = document.createElement('span');
  name.textContent = key;

  const input = document.createElement('input');
  input.type = 'range';
  const max = initial === 0 ? 1 : Math.abs(initial) * 3;
  input.min = String(initial < 0 ? -max : 0);
  input.max = String(max);
  input.step = String(max / 200);
  input.value = String(initial);
  input.style.width = '110px';

  const out = document.createElement('span');
  out.textContent = format(initial);

  input.addEventListener('input', () => {
    const v = Number(input.value);
    values[key] = v;
    out.textContent = format(v);
  });

  row.append(name, input, out);
  return row;
}

function format(v: number): string {
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2);
}
