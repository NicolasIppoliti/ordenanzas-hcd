// Task 4a.11: axe-core + happy-dom over four page shapes — index,
// detail-with-title, detail-null-title, detail-convenio.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import axe from 'axe-core';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import IndexPage from '../src/pages/index.astro';
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

async function auditHtml(html: string): Promise<axe.Result[]> {
  // GlobalRegistrator installs a full window/document/navigator global set
  // that axe-core's environment detection recognises — plain `new Window()`
  // does not register enough of the global surface for axe to run.
  GlobalRegistrator.register({ url: 'https://ordenanzas.fragua.dev/' });
  try {
    document.documentElement.innerHTML = html.replace(/^<!doctype html>\s*/i, '');
    // Passing `document` itself leaves axe's internal environment detection
    // unable to deduce globals (a Document has no `ownerDocument`); its
    // root element does, which is what axe's setupGlobals actually checks.
    const results = await axe.run(document.documentElement, {
      // Only rules that can be meaningfully evaluated against a fragment
      // rendered outside a real browser layout engine.
      runOnly: ['wcag2a', 'wcag2aa'],
    });
    return results.violations;
  } finally {
    await GlobalRegistrator.unregister();
  }
}

describe('accessibility (axe-core)', () => {
  it('index page has no WCAG 2.1 AA violations', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(IndexPage);
    const violations = await auditHtml(html);
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
  });

  it('detail page with a title has no WCAG 2.1 AA violations', async () => {
    const container = await AstroContainer.create();
    const doc = baseDoc({
      doc_id: '4457-Mesa-de-Gestion-del-Agua',
      number: 4457,
      title: 'Mesa de Gestión del Agua',
      title_source: 'listing',
      year: 2026,
    });
    const html = await container.renderToString(DetailPage, { props: { doc } });
    const violations = await auditHtml(html);
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
  });

  it('detail page with a null title has no WCAG 2.1 AA violations', async () => {
    const container = await AstroContainer.create();
    const doc = baseDoc({
      doc_id: '4390-I232025',
      number: 4390,
      title: null,
      title_source: 'none',
    });
    const html = await container.renderToString(DetailPage, { props: { doc } });
    const violations = await auditHtml(html);
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
  });

  it('detail page for a convenio has no WCAG 2.1 AA violations', async () => {
    const container = await AstroContainer.create();
    const doc = baseDoc({
      doc_id: 'Convenio-Ministerio-de-las-Mujeres',
      number: null,
      doc_type: 'convenio',
      title: 'Ministerio de las Mujeres',
      title_source: 'listing',
    });
    const html = await container.renderToString(DetailPage, { props: { doc } });
    const violations = await auditHtml(html);
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
  });
});
