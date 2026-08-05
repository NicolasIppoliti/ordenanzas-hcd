// Task 4a.2: undirected union related(n) = refs-out ∪ refs-in, deduplicated,
// sorted. No verb/direction string reaches the output, and a number held by
// two records links BOTH — never a "best match".
import { describe, expect, it } from 'vitest';
import { related } from '../src/lib/related';
import type { ManifestDocument } from '../src/lib/contract';

function doc(overrides: Partial<ManifestDocument> & { doc_id: string }): ManifestDocument {
  return {
    number: null,
    number_variants: [],
    doc_type: 'ordenanza',
    expediente: null,
    year: null,
    title: null,
    title_source: 'none',
    anchor_text: '',
    source_url: 'https://hcdrosales.gob.ar/x.pdf',
    source_filename: 'x.pdf',
    sha256: null,
    bytes: null,
    fetched_at: null,
    status: 'ok',
    text_path: null,
    cross_references: [],
    notes: '',
    last_error: null,
    last_error_at: null,
    ...overrides,
  };
}

describe('related', () => {
  it('is an undirected union: A references B by number ⇒ both link each other', () => {
    const a = doc({
      doc_id: 'A',
      number: 100,
      cross_references: [{ number: 200, signal: 'title', excerpt: 'Modifica Ordenanza 200' }],
    });
    const b = doc({ doc_id: 'B', number: 200 });
    const documents = [a, b];

    const relatedOfA = related(documents, 'A').map((r) => r.doc_id);
    const relatedOfB = related(documents, 'B').map((r) => r.doc_id);

    expect(relatedOfA).toContain('B');
    expect(relatedOfB).toContain('A');
  });

  it('never emits a verb or direction string', () => {
    const a = doc({
      doc_id: 'A',
      number: 100,
      cross_references: [{ number: 200, signal: 'title', excerpt: 'Modifica Ordenanza 200' }],
    });
    const b = doc({ doc_id: 'B', number: 200 });
    const targets = related([a, b], 'A');
    const serialized = JSON.stringify(targets);
    for (const verb of ['modifica', 'deroga', 'sustituye', '->', '→']) {
      expect(serialized.toLowerCase()).not.toContain(verb);
    }
  });

  it('links BOTH records when a referenced number is held by two records, with no best-match pick', () => {
    const a = doc({
      doc_id: 'A',
      number: 100,
      cross_references: [{ number: 300, signal: 'body', excerpt: 'Ordenanza 300' }],
    });
    const b1 = doc({ doc_id: 'B1', number: 300, doc_type: 'ordenanza', title: 'Primera' });
    const b2 = doc({ doc_id: 'B2', number: 300, doc_type: 'ordenanza', title: 'Segunda' });

    const targets = related([a, b1, b2], 'A');
    const ids = targets.map((t) => t.doc_id);

    expect(ids).toContain('B1');
    expect(ids).toContain('B2');
    expect(targets).toHaveLength(2);
    // each target carries enough to distinguish it: type + title
    for (const t of targets) {
      expect(t.doc_type).toBe('ordenanza');
      expect(t.title).not.toBeNull();
    }
  });

  it('does not resolve a reference to a number absent from the manifest', () => {
    const a = doc({
      doc_id: 'A',
      cross_references: [{ number: 999, signal: 'body', excerpt: 'Ordenanza 999' }],
    });
    expect(related([a], 'A')).toHaveLength(0);
  });

  it('excludes self-references', () => {
    const a = doc({
      doc_id: 'A',
      number: 100,
      cross_references: [{ number: 100, signal: 'body', excerpt: 'Ordenanza 100' }],
    });
    expect(related([a], 'A')).toHaveLength(0);
  });

  it('sorts by (number, doc_id) ascending', () => {
    const a = doc({
      doc_id: 'A',
      cross_references: [
        { number: 200, signal: 'body', excerpt: '' },
        { number: 100, signal: 'body', excerpt: '' },
      ],
    });
    const b200 = doc({ doc_id: 'B200', number: 200 });
    const b100 = doc({ doc_id: 'B100', number: 100 });

    const targets = related([a, b100, b200], 'A');
    expect(targets.map((t) => t.doc_id)).toEqual(['B100', 'B200']);
  });

  it('sorts records with number: null after every numbered record', () => {
    // Numberless record N references A's number back, so it appears in related(A).
    const a = doc({ doc_id: 'A', number: 100 });
    const n = doc({
      doc_id: 'N',
      number: null,
      cross_references: [{ number: 100, signal: 'body', excerpt: '' }],
    });
    const b = doc({ doc_id: 'B', number: 50, cross_references: [{ number: 100, signal: 'body', excerpt: '' }] });

    const targets = related([a, n, b], 'A');
    expect(targets.map((t) => t.doc_id)).toEqual(['B', 'N']);
  });
});
