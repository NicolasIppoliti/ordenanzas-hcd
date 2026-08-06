// The type scale and the leading, pinned against DESIGN.md's own table.
//
// `palette.test.ts` computes contrast from the token file rather than trusting a
// figure written beside it. Leading had no equivalent, so DESIGN.md said 1.15
// while the tokens shipped 1.25 and nothing noticed. A value written down beside
// a token is a value nobody measured.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf-8');
const design = readFileSync(join(process.cwd(), '..', 'DESIGN.md'), 'utf-8');

function token(name: string): string {
  return (new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1] ?? '').trim();
}

describe('the type tokens match the design document', () => {
  it('ships the leading DESIGN.md states', () => {
    expect(token('--leading-tight')).toBe('1.25');
    expect(token('--leading-normal')).toBe('1.5');
    expect(token('--leading-prose')).toBe('1.65');
    expect(design).toContain('**1.25** headings · 1.5 UI · 1.65 document prose');
  });

  it('ships the scale DESIGN.md states, including the display step', () => {
    for (const [name, rem, px] of [
      ['--text-3xl', '2.5rem', '40px'],
      ['--text-2xl', '1.875rem', '30px'],
      ['--text-xl', '1.5rem', '24px'],
      ['--text-lg', '1.25rem', '20px'],
      ['--text-base', '1.0625rem', '17px'],
      ['--text-sm', '0.9375rem', '15px'],
      ['--text-xs', '0.8125rem', '13px'],
    ] as const) {
      expect(token(name), name).toBe(rem);
      expect(design, `DESIGN.md does not list ${name} at ${px}`).toContain(`\`${name}\` | ${px}`);
    }
  });
});
