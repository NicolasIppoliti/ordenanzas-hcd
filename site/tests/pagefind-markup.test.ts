// Task 4b.1/4b.2: `data-pagefind-body` scopes indexing to the article
// region only, `data-pagefind-ignore` keeps chrome (nav/footer/related
// links) from being re-indexed once per page, and the tipo/anio/texto
// filter values are exactly what lib/search.ts computes.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import DetailPage from '../src/pages/documento/[doc_id].astro';
import type { ManifestDocument } from '../src/lib/contract';

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

describe('detail page Pagefind markup', () => {
  it('scopes indexing to the article region with data-pagefind-body', async () => {
    const container = await AstroContainer.create();
    const doc = baseDoc({ doc_id: '4457-mesa', number: 4457, title: 'Mesa de Gestión del Agua' });
    const html = await container.renderToString(DetailPage, { props: { doc } });
    expect(html).toContain('data-pagefind-body');
  });

  it('ignores chrome (nav and footer) so it is not re-indexed on every page', async () => {
    const container = await AstroContainer.create();
    const doc = baseDoc({ doc_id: '4457-mesa', number: 4457, title: 'Mesa de Gestión del Agua' });
    const html = await container.renderToString(DetailPage, { props: { doc } });
    const navMatch = html.match(/<nav[^>]*>/);
    const footerMatch = html.match(/<footer[^>]*>/);
    expect(navMatch?.[0]).toContain('data-pagefind-ignore');
    expect(footerMatch?.[0]).toContain('data-pagefind-ignore');
  });

  it('ignores the same-number-variant and related-links lists inside the article', async () => {
    const container = await AstroContainer.create();
    const doc = baseDoc({ doc_id: '3298--2021-11', number: 3298, number_variants: ['3298--2021-11', '3298--2021-12'] });
    const sibling = baseDoc({ doc_id: '3298--2021-12', number: 3298 });
    const html = await container.renderToString(DetailPage, {
      props: { doc, siblings: [sibling] },
    });
    const siblingSection = html.match(/<section aria-label="Archivos con el mismo número"[^>]*>/);
    expect(siblingSection?.[0]).toContain('data-pagefind-ignore');
  });

  it('carries the tipo/anio/texto filter values computed by lib/search', async () => {
    const container = await AstroContainer.create();
    const doc = baseDoc({
      doc_id: '4457-mesa',
      number: 4457,
      title: 'Mesa de Gestión del Agua',
      year: 2026,
      doc_type: 'ordenanza',
      status: 'ok',
    });
    const html = await container.renderToString(DetailPage, { props: { doc } });
    expect(html).toContain('data-pagefind-filter="tipo:Ordenanza"');
    expect(html).toContain('data-pagefind-filter="anio:2026"');
    expect(html).toContain('data-pagefind-filter="texto:Con texto indexado"');
  });

  it('marks a no_text document with the Sin texto indexado filter value', async () => {
    const container = await AstroContainer.create();
    const doc = baseDoc({
      doc_id: '4390-i232025',
      number: 4390,
      title: null,
      status: 'no_text',
      year: null,
    });
    const html = await container.renderToString(DetailPage, { props: { doc } });
    expect(html).toContain('data-pagefind-filter="texto:Sin texto indexado"');
    expect(html).toContain('data-pagefind-filter="anio:Año no determinado"');
  });
});
