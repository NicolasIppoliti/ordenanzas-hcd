// DESIGN.md implementation gap, item 2: warm paper instead of white, and every
// contrast pair re-measured.
//
// Risk 1 in DESIGN.md: every civic site is white-and-blue. Warm paper costs a
// little "clean and modern" and buys an identity as an archive — and it serves
// "esto es del pueblo" without touching a politically coded colour, which in
// Argentina rules out celeste, red, violet and yellow.
//
// The contrasts here are COMPUTED from the token file, not copied from it. A
// table of ratios in a comment is an assertion, and this project has already
// shipped two assertions that were wrong in ways only a replay caught. A ratio
// that is merely written down is a ratio nobody measured.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import DesignSystemPage from '../src/pages/design-system.astro';

const css = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf-8');

/** Resolve a token to a hex value, following `var(--x)` chains within a theme. */
function resolve(name: string, scope: string): string {
  const seen = new Set<string>();
  let current = name;
  for (;;) {
    if (seen.has(current)) throw new Error(`${current}: circular token reference`);
    seen.add(current);
    const match = new RegExp(`${current}:\\s*([^;]+);`, 'g');
    const hits = [...scope.matchAll(match)];
    const value = hits.at(-1)?.[1]?.trim();
    if (value === undefined) throw new Error(`${current} is not defined in this theme`);
    const chained = /^var\((--[a-z0-9-]+)\)$/.exec(value);
    if (chained === null) return value;
    current = chained[1] ?? '';
  }
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const LIGHT = css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)'));
const DARK = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
// The dark block overrides only the semantic layer; primitives come from :root.
const DARK_SCOPE = LIGHT + DARK;

describe('warm paper palette', () => {
  it('sets paper, surface and ink to the values DESIGN.md specifies', () => {
    expect(resolve('--bg', LIGHT)).toBe('#faf8f4');
    expect(resolve('--bg-surface', LIGHT)).toBe('#f2eee7');
    expect(resolve('--text', LIGHT)).toBe('#161b21');
    expect(resolve('--bg', DARK_SCOPE)).toBe('#14161a');
    expect(resolve('--bg-surface', DARK_SCOPE)).toBe('#1c1f25');
    expect(resolve('--text', DARK_SCOPE)).toBe('#f2eee7');
  });

  it('is paper, not white — the whole point of risk 1', () => {
    expect(resolve('--bg', LIGHT)).not.toBe('#ffffff');
  });
});

describe('contrast, computed rather than claimed', () => {
  // Every pair a reader actually sees, in both themes.
  const PAIRS: ReadonlyArray<readonly [string, string, string]> = [
    ['--text', '--bg', 'body text on paper'],
    ['--text', '--bg-surface', 'body text on a surface'],
    ['--text-muted', '--bg', 'metadata on paper'],
    ['--text-muted', '--bg-surface', 'metadata on a surface'],
    ['--link', '--bg', 'a link on paper'],
    ['--link', '--bg-surface', 'a link on a surface'],
    ['--link-hover', '--bg', 'a hovered link'],
    ['--notice-text', '--notice-bg', 'the stale-archive notice'],
  ];

  for (const [theme, scope] of [
    ['light', LIGHT],
    ['dark', DARK_SCOPE],
  ] as const) {
    for (const [fg, bg, what] of PAIRS) {
      it(`${what} clears 4.5:1 in ${theme}`, () => {
        const ratio = contrast(resolve(fg, scope), resolve(bg, scope));
        expect(ratio, `${fg} on ${bg} in ${theme} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          4.5
        );
      });
    }

    it(`focus and rules clear 3:1 in ${theme}`, () => {
      // Non-text contrast: WCAG 1.4.11. A focus ring nobody can see is the same
      // as no focus ring, and this site is navigable by keyboard only.
      for (const token of ['--focus', '--border-strong']) {
        const ratio = contrast(resolve(token, scope), resolve('--bg', scope));
        expect(ratio, `${token} in ${theme} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('records the lowest measured ratio, so a regression is visible in the diff', () => {
    // DESIGN.md quotes the floor for each theme. If a colour changes, this is
    // the number that has to be re-stated — which is the point of pinning it.
    const lowest = (scope: string) =>
      Math.min(...PAIRS.map(([fg, bg]) => contrast(resolve(fg, scope), resolve(bg, scope))));

    expect(Number(lowest(LIGHT).toFixed(2))).toBe(5.91);
    expect(Number(lowest(DARK_SCOPE).toFixed(2))).toBe(6.08);
  });
});

describe('the figures the design-system page publishes', () => {
  it('quotes the same floors the test computes', () => {
    // That page states the measured contrast in Spanish, for a reader who will
    // never run the suite. A number published to a reader and a number computed
    // from the file must be the same number, or one of them is a lie.
    const page = readFileSync(join(process.cwd(), 'src', 'pages', 'design-system.astro'), 'utf-8');
    expect(page).toContain('5,91:1 en claro y 6,08:1 en oscuro');
  });

  it('does not tell a reader the site uses no webfonts', () => {
    // It said exactly that for one task after the webfonts shipped. The page
    // exists so nobody has to guess what already exists; a page that teaches the
    // opposite of what ships is worse than no page.
    const page = readFileSync(join(process.cwd(), 'src', 'pages', 'design-system.astro'), 'utf-8');
    expect(page).not.toContain('sin webfonts');
    expect(page).toContain('Fraunces');
    expect(page).toContain('Instrument Sans');
  });

  it('shows the warm paper primitive and the amber family', async () => {
    // `--n-050` IS the paper, and the amber is the only thing the page's own
    // copy promises that it was never showing.
    //
    // Asserted against the RENDERED page, not the source: the reader sees
    // swatches, not an array literal, and renaming the array is not a defect.
    const container = await AstroContainer.create();
    const html = await container.renderToString(DesignSystemPage);

    expect(html).toContain('var(--n-050)');
    for (const step of [100, 200, 500, 700, 900]) {
      expect(html, `no swatch for --a-${step}`).toContain(`var(--a-${step})`);
    }
  });
});
