import { describe, expect, it } from 'vitest';
import css from '../style.css?raw';
import { UI_FONT } from './draw';

const sources = import.meta.glob<string>(['../**/*.ts', '!../**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'ui-monospace']);

/** Families the stylesheet registers with @font-face, and the weights each provides. */
function registeredFaces(): Map<string, Set<string>> {
  const faces = new Map<string, Set<string>>();
  for (const [, body = ''] of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const family = /font-family:\s*['"]?([^'";]+)['"]?/.exec(body)?.[1]?.trim();
    const weight = /font-weight:\s*(\d+)/.exec(body)?.[1] ?? '400';
    if (family) faces.set(family, (faces.get(family) ?? new Set()).add(weight));
  }
  return faces;
}

/** Every canvas font the source assigns, with UI_FONT resolved and sizes made literal. */
function canvasFonts(): { file: string; font: string }[] {
  const found: { file: string; font: string }[] = [];
  for (const [file, text] of Object.entries(sources)) {
    for (const [, , value = ''] of text.matchAll(/\.font\s*=\s*(['"`])(.*?)\1/g)) {
      const font = value
        .replaceAll('${UI_FONT}', UI_FONT)
        .replace(/\$\{[^}]*\}px/g, '18px')
        .replace(/\$\{[^}]*\}/g, '');
      found.push({ file, font });
    }
  }
  return found;
}

function parse(font: string): { weight: string; family: string } | null {
  const m = /^(?:(\d{3}|bold|normal)\s+)?\d+(?:\.\d+)?px\s+(.+)$/.exec(font.trim());
  if (!m) return null;
  const weight = m[1] === 'bold' ? '700' : m[1] && m[1] !== 'normal' ? m[1] : '400';
  const family =
    (m[2] ?? '')
      .split(',')[0]
      ?.trim()
      .replace(/^['"]|['"]$/g, '') ?? '';
  return { weight, family };
}

describe('canvas fonts', () => {
  it('finds the canvas text the game draws', () => {
    expect(canvasFonts().length).toBeGreaterThanOrEqual(4);
  });

  it('name a family and weight the stylesheet registers, or a generic family', () => {
    const faces = registeredFaces();
    const unresolved = canvasFonts().filter(({ font }) => {
      const parsed = parse(font);
      if (!parsed) return true;
      if (GENERIC.has(parsed.family)) return false;
      return !faces.get(parsed.family)?.has(parsed.weight);
    });
    expect(unresolved).toEqual([]);
  });
});
