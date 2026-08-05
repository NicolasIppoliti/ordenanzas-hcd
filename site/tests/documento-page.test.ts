// Two defects a review caught in the detail page, both of a kind this project
// has a written rule against.
//
// 1. Fail visibly. The page spoke only for `no_text`, but the contract allows
//    `pending` and `error` too, and `loadDocumentBody` returns null for every
//    status other than `ok`. Such a record shipped an `<h2>Texto</h2>` with
//    nothing under it — a blank section with no stated reason, which is exactly
//    the silent incomplete page the rule forbids.
// 2. The route is document-neutral because the archive is not all ordinances.
//    The related-documents heading still said "Ordenanzas relacionadas", and
//    `buildRelatedIndex` does not filter by type, so a decreto or a convenio
//    was being labelled an ordenanza by the heading above its own link.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import DetailPage from '../src/pages/documento/[doc_id].astro';
import type { ManifestDocument, Status } from '../src/lib/contract';

function baseDoc(overrides: Partial<ManifestDocument> & { doc_id: string }): ManifestDocument {
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
    sha256: 'abc',
    bytes: 100,
    fetched_at: '2026-08-05T00:00:00Z',
    status: 'ok',
    text_path: null,
    cross_references: [],
    notes: '',
    last_error: null,
    last_error_at: null,
    ...overrides,
  };
}

describe('detail page text section', () => {
  it('states a reason for every status that carries no text', async () => {
    // `pending` and `error` are in the contract and reachable from a partial
    // sync. Neither is in today's data, which is precisely why the blank
    // section would have shipped unnoticed.
    for (const status of ['no_text', 'pending', 'error'] satisfies Status[]) {
      const container = await AstroContainer.create();
      const html = await container.renderToString(DetailPage, {
        props: { doc: baseDoc({ doc_id: `x-${status}`, status }) },
      });
      // Astro renders the heading with scoping attributes, so the section is
      // found by its aria-label rather than by an exact tag string.
      const start = html.indexOf('<section aria-label="Texto del documento"');
      expect(start, 'text section missing').toBeGreaterThan(-1);
      const section = html.slice(start, html.indexOf('</section>', start));
      const prose = section.replace(/<[^>]*>/g, '').replace('Texto', '').trim();
      expect(prose, `${status} rendered a section with no stated reason`).not.toBe('');
    }
  });
});

describe('detail page related section', () => {
  it('does not call a related document an ordenanza', async () => {
    // The archive holds resoluciones, decretos, convenios and anexos as well.
    // Asserting a type the record does not carry is the same class of error as
    // inventing a title.
    const container = await AstroContainer.create();
    const doc = baseDoc({ doc_id: '4457-mesa', number: 4457 });
    // No number: D8 rule 1 puts an ordinance number only on an `ordenanza`
    // record, and the manifest confirms it — 0 of the 51 non-ordinances carry one.
    const related = baseDoc({ doc_id: '99-decreto', doc_type: 'decreto' });
    const html = await container.renderToString(DetailPage, { props: { doc, related: [related] } });

    expect(html).toContain('Documentos relacionados');
    expect(html).not.toContain('Ordenanzas relacionadas');
  });
});
