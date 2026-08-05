import { describe, expect, it } from 'vitest';
import { buildExcerpt } from '../src/lib/excerpt';

describe('buildExcerpt', () => {
  it('returns null for null input', () => {
    expect(buildExcerpt(null)).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(buildExcerpt('   \n\t  ')).toBeNull();
  });

  it('collapses whitespace and returns short text unchanged', () => {
    expect(buildExcerpt('Punta Alta,\n27 de enero  de 2026')).toBe('Punta Alta, 27 de enero de 2026');
  });

  it('truncates long text at a word boundary with an ellipsis', () => {
    const long = 'palabra '.repeat(100).trim();
    const result = buildExcerpt(long, 50);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(51);
    expect(result!.endsWith('…')).toBe(true);
    expect(result!.startsWith('palabra')).toBe(true);
  });
});
