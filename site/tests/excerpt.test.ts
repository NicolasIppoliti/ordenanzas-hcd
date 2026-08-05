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

  it('starts at the first article, skipping the letterhead every document shares', () => {
    // Measured over the corpus: 875 of the 894 text-bearing documents (97%) open
    // with the same municipal letterhead before their first article. Excerpting
    // from character zero made every card on the index page read identically —
    // "Coronel de Marina Leonardo Rosales Presidencia… Honorable Concejo
    // Deliberante…" — which tells a visitor nothing about the ordinance.
    const text =
      'Coronel de Marina Leonardo Rosales Presidencia\n' +
      'Honorable Concejo Deliberante – Partido Coronel de Marina Leonardo Rosales\n' +
      'Ciudad de Punta Alta - Provincia de Buenos Aires\n\n' +
      'Artículo 1º: MESA DEL AGUA: Créase la Mesa de Gestión del Agua en el Distrito.';
    const excerpt = buildExcerpt(text);
    expect(excerpt).toMatch(/^Artículo 1/);
    expect(excerpt).toContain('MESA DEL AGUA');
    expect(excerpt).not.toContain('Punta Alta - Provincia');
  });

  it('falls back to the start when a document has no article anchor', () => {
    // 13 documents carry no anchor at all. They keep the previous behaviour
    // rather than being dropped or given an invented opening.
    const excerpt = buildExcerpt('Texto sin estructura de articulado alguna.');
    expect(excerpt).toBe('Texto sin estructura de articulado alguna.');
  });
});
