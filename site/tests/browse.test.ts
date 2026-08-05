// The browse page's grouping, as a pure function over a synthetic corpus.
//
// It was inline in the page, which reads the manifest itself and takes no props
// — so the only thing a test could do was grep the source for the guard, which
// verifies no behaviour at all and breaks on a harmless refactor. The same
// shape was already solved once in `lib/search.ts` (`buildYearOptions`), and
// this follows it.
import { describe, expect, it } from 'vitest';
import { groupByYear } from '../src/lib/browse';
import { getDocuments } from '../src/lib/data';
import type { ManifestDocument } from '../src/lib/contract';

function doc(doc_id: string, year: number | null): ManifestDocument {
  return {
    doc_id,
    year,
    number: null,
    number_variants: [],
    doc_type: 'ordenanza',
    expediente: null,
    title: null,
    title_source: 'none',
    anchor_text: '',
    source_url: 'https://hcdrosales.gob.ar/x.pdf',
    source_filename: 'x.pdf',
    sha256: 'abc',
    bytes: 100,
    fetched_at: '2026-08-05T00:00:00Z',
    status: 'ok',
    text_path: null,
    cross_references: [],
    notes: '',
    last_error: null,
    last_error_at: null,
  };
}

describe('groupByYear', () => {
  it('orders years most recent first', () => {
    const { years } = groupByYear([doc('a', 2010), doc('b', 2026), doc('c', 2002)]);
    expect(years.map((g) => g.year)).toEqual([2026, 2010, 2002]);
  });

  it('sorts within a year by doc_id, so a re-sync cannot reshuffle the page', () => {
    const { years } = groupByYear([doc('c-1', 2024), doc('a-1', 2024), doc('b-1', 2024)]);
    expect(years[0]?.documents.map((d) => d.doc_id)).toEqual(['a-1', 'b-1', 'c-1']);
  });

  it('collects the documents whose year the source never stated', () => {
    // D10 forbids inferring a year, so these cannot be filed under a guess.
    const { undated } = groupByYear([doc('a', 2024), doc('b', null), doc('c', null)]);
    expect(undated.map((d) => d.doc_id)).toEqual(['b', 'c']);
  });

  it('returns no undated group at all when every document carries a year', () => {
    // This is what the source-level grep could never check. A group reading
    // "0 documentos" above a paragraph about documents the HCD left undated
    // would assert something about records that do not exist.
    const { undated } = groupByYear([doc('a', 2024), doc('b', 2025)]);
    expect(undated).toEqual([]);
  });

  it('loses no document', () => {
    // The browse page claims to hold the whole archive. A reader who does not
    // find their ordinance concludes it does not exist.
    const input = [doc('a', 2024), doc('b', null), doc('c', 2024), doc('d', 1999)];
    const { years, undated } = groupByYear(input);
    const seen = [...years.flatMap((g) => g.documents), ...undated].map((d) => d.doc_id);
    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('holds over the real corpus: 15 years and 223 undated', () => {
    // Replayed rather than trusted — every grouping rule in this project is
    // checked against the corpus it will actually run on.
    const { years, undated } = groupByYear(getDocuments());
    expect(years.length).toBe(15);
    expect(undated.length).toBe(223);
    expect(years.reduce((n, g) => n + g.documents.length, 0) + undated.length).toBe(1038);
  });
});
