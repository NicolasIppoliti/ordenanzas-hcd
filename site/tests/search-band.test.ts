// DESIGN.md implementation gap, item 5: move search into a persistent header
// band, the way legislation.gov.uk carries it.
//
// The reason is ranked goal 1 — "por fin puedo encontrar algo". A reader who
// lands on an ordinance from a search engine and wants a different one should
// not have to find the search page first; the archive's primary action should
// be on screen wherever they are.
//
// The band is a plain GET form, not a JavaScript widget. That is the whole
// design: it adds ZERO bytes of script to the 1,038 document pages, and the
// Pagefind runtime still loads only on the page that actually searches. A
// live-suggestion box in the header would have put ~30 KB of it on every page
// of a public archive read on municipal-town phones, to save one navigation.
//
// It does not make search work without JavaScript — Pagefind is a JavaScript
// index with no server behind it. What the band must not do is leave that
// reader stranded, which is what the <noscript> assertion below is for.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import IndexPage from '../src/pages/index.astro';
import BuscarPage from '../src/pages/buscar.astro';
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

async function render(page: unknown, props: Record<string, unknown> = {}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(page as never, { props });
}

describe('the persistent search band', () => {
  it('is in the header of an ordinary page', async () => {
    const html = await render(IndexPage);
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));

    expect(header).toContain('search-band');
    expect(header).toContain('name="q"');
  });

  it('is on a document page too, which is where a reader usually arrives', async () => {
    // Most visits land on one ordinance from a search engine. That is exactly
    // the reader who needs to search again and has nowhere to do it.
    const html = await render(DetailPage, { doc: baseDoc({ doc_id: '4457-mesa', number: 4457 }) });
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));

    expect(header).toContain('name="q"');
  });

  it('is a GET form that navigates, rather than a script that intercepts', async () => {
    const html = await render(IndexPage);
    const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));

    expect(form).toContain('action="/buscar"');
    expect(form).toContain('method="get"');
  });

  it('adds no script to a document page', async () => {
    // Also a regression guard: it passed before the band too. It is here
    // because the band is precisely the change that could have broken it, and
    // the cost of that break — the Pagefind runtime on 1,038 pages — is the
    // reason the band is a form and not a widget. The archive ships one
    // script, 268 bytes, for the staleness notice.
    const html = await render(DetailPage, { doc: baseDoc({ doc_id: '4457-mesa' }) });
    const scripts = html.match(/<script/g) ?? [];

    expect(scripts.length, 'only the staleness script may ship here').toBe(1);
    // `data-pagefind-body` is markup, not code — what must never appear on a
    // document page is the runtime the search page imports.
    expect(html).not.toContain('/pagefind/pagefind.js');
  });

  it('does not repeat itself on the search page', async () => {
    // A regression guard rather than a test that drove the code: it also passed
    // before the band existed, when there was only ever one field on the site.
    // It earns its place because two inputs labelled "Buscar" — and, worse, two
    // elements sharing the id their labels point at — is the defect this
    // feature makes possible for the first time.
    const html = await render(BuscarPage);
    expect(html.match(/name="q"/g)?.length, 'the search page has its own field').toBe(1);
    expect(html.match(/id="q"/g)?.length).toBe(1);
  });

  it('stays out of the search index it points at', async () => {
    // Chrome that repeats on 1,042 pages — every page but the search page,
    // which renders its own form. Today no page indexes it, because
    // every one declares a `data-pagefind-body`; the attribute makes that
    // independent of a page remembering to.
    const html = await render(IndexPage);
    const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));

    expect(form).toContain('data-pagefind-ignore');
  });

  it('labels the field, since a placeholder is not a label', async () => {
    // A placeholder disappears the moment someone types, and screen readers
    // treat it as a hint rather than a name.
    const html = await render(IndexPage);
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));

    expect(header).toMatch(/<label[^>]*for="q-band"|aria-label="Buscar/);
  });
});

describe('the reader whose browser runs no JavaScript', () => {
  it('is told why search cannot work, and where to go instead', async () => {
    // Pagefind resolves its index in the browser and there is no server to
    // query, so with scripting off this page cannot search at all. Saying
    // nothing would leave someone who arrived from the band staring at an empty
    // field under a message describing a state they are not in — a silent
    // incomplete page, which is the one thing this project's rules forbid
    // outright. The browse page needs no JavaScript, so it is the honest
    // alternative to point at.
    const html = await render(BuscarPage);
    const notice = html.slice(html.indexOf('<noscript'), html.indexOf('</noscript>'));

    expect(notice, 'the search page must state that search needs JavaScript').toContain(
      'necesita JavaScript'
    );
    expect(notice).toContain('href="/documentos"');
  });
});

describe('the search page answers a query it was navigated to', () => {
  it('reads the q parameter, or the band would go nowhere without JavaScript', async () => {
    // The band submits `?q=…`. If the search page ignored it, the band would
    // be decoration: a reader with JavaScript off would land on an empty form
    // having typed their query once already.
    // Asserted against source: Astro bundles a page `<script>` into an external
    // asset, so the container render never contains its body.
    const source = readFileSync(join(process.cwd(), 'src', 'pages', 'buscar.astro'), 'utf-8');
    expect(source).toContain('new URLSearchParams(window.location.search)');
    expect(source).toContain("params.get('q')");
  });
});
