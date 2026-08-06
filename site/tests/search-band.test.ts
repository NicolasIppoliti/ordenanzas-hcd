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
import { ruleBody } from './helpers/css';
import DocumentosPage from '../src/pages/documentos.astro';
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
    // The browse page, not the home: the home is the one page where search is
    // the hero, so it hides the band rather than shipping a second `q` field.
    const html = await render(DocumentosPage);
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
    const html = await render(DocumentosPage);
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

  it('is absent from the home, where the search is the hero instead', async () => {
    // Two fields sharing the `q` id their labels point at is the same
    // accessibility defect the search page avoids the same way.
    const html = await render(IndexPage);
    expect(html).not.toContain('search-band');
    expect(html.match(/id="q"/g) ?? [], 'exactly one field on the page').toHaveLength(1);
  });

  it('stays out of the search index it points at', async () => {
    // Chrome that repeats on 1,041 of the 1,043 built pages — every one except
    // the search page and the home, which render their own field. Today it is
    // already out of the index for a different reason: Pagefind indexes only
    // pages that declare `data-pagefind-body`, and the document pages are the
    // only ones that do — so this band is out of the index by accident of where
    // it appears, not by decision. The attribute makes it a decision, and keeps
    // it one the day a listing page starts declaring a body of its own.
    const html = await render(DocumentosPage);
    const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));

    expect(form).toContain('data-pagefind-ignore');
  });

  it('gives the placeholder the same measured colour as the search page does', () => {
    // It is the same sentence in both fields. A UA default would make it the
    // one piece of text on the site whose contrast nobody measured — and the
    // palette test only checks tokens, so an unstyled placeholder is invisible
    // to it.
    const band = readFileSync(
      join(process.cwd(), 'src', 'components', 'SearchBand.astro'),
      'utf-8'
    );
    const rule = band.slice(band.indexOf('.search-band input::placeholder'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('var(--text-muted)');
  });

  it('labels the field, since a placeholder is not a label', async () => {
    // A placeholder disappears the moment someone types, and screen readers
    // treat it as a hint rather than a name.
    const html = await render(DocumentosPage);
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

describe('the header', () => {
  it('groups the navigation instead of spreading it across the page', async () => {
    // Three items under `justify-content: space-between` put the brand at one
    // edge, one link floating in the middle and the last at the other edge —
    // three things of equal weight and no relationship between them. The links
    // belong together; the brand does not belong with them.
    const html = await render(DocumentosPage);
    const nav = html.slice(html.indexOf('<nav aria-label="Principal"'), html.indexOf('</nav>'));
    const group = nav.slice(nav.indexOf('nav-links'));

    expect(group).toContain('href="/documentos"');
    expect(group).toContain('href="/acerca"');
    expect(nav.slice(0, nav.indexOf('nav-links'))).toContain('site-name');
  });

  it('does not dress the site name as one more link', async () => {
    // It is the name of the archive, not a destination competing with the two
    // beside it. The serif and its weight say so; an underline said the opposite.
    const layout = readFileSync(
      join(process.cwd(), 'src', 'components', 'Layout.astro'),
      'utf-8'
    );
    const rule = layout.slice(layout.indexOf('.site-name {'));
    const body = rule.slice(0, rule.indexOf('}'));

    expect(body).toContain('var(--font-serif)');
    expect(body).toContain('text-decoration: none');
  });
});

describe('the header on a phone', () => {
  it('collapses the links behind a menu, and opens it without JavaScript', async () => {
    // A `<details>` is a disclosure widget in the platform: it opens on tap and
    // on Enter, it announces itself to a screen reader, and it costs nothing.
    // The alternative — a button plus a script — would put JavaScript in the
    // header of all 1,043 pages to hide two links.
    const html = await render(DocumentosPage);
    const nav = html.slice(html.indexOf('<nav aria-label="Principal"'), html.indexOf('</nav>'));

    expect(nav).toContain('<details');
    expect(nav).toContain('<summary');
    expect(html.match(/<script/g) ?? [], 'the menu ships no script').toHaveLength(1);
  });

  it('keeps one main-navigation landmark, not two', async () => {
    // The wide layout and the phone menu are two presentations of the same
    // links, so they live inside a single `<nav>`. Two would have a screen
    // reader announce the main navigation twice.
    //
    // Counted by label, not by tag: the browse page has its own year-index
    // `<nav>`, which is a different landmark and should stay.
    const html = await render(DocumentosPage);
    expect(html.match(/<nav aria-label="Principal"/g) ?? []).toHaveLength(1);
  });

  it('declares the breakpoint after the rules it has to beat', () => {
    // A media query does not outrank a later declaration of the same
    // specificity. With `@media (min-width: 34rem) { .nav-menu { display: none } }`
    // written above `.nav-menu { display: block }`, the phone menu shipped
    // visible on a 1280px screen — measured, not imagined. Order is the whole
    // mechanism, and nothing else in the suite can see it.
    const layout = readFileSync(
      join(process.cwd(), 'src', 'components', 'Layout.astro'),
      'utf-8'
    );

    expect(layout.indexOf('@media (min-width: 34rem)')).toBeGreaterThan(
      layout.indexOf('.nav-menu {')
    );
    expect(layout.indexOf('@media (min-width: 34rem)')).toBeGreaterThan(
      layout.indexOf('.nav-links {')
    );
  });

  it('shows exactly one of the two at any width', () => {
    // Both sets are in the markup and CSS decides which one exists: `display:
    // none` takes the hidden one out of the accessibility tree entirely, so
    // nothing is announced twice. Narrow is the base state — menu shown, wide
    // list hidden — and the breakpoint swaps them.
    const layout = readFileSync(
      join(process.cwd(), 'src', 'components', 'Layout.astro'),
      'utf-8'
    );

    expect(ruleBody(layout, '.nav-links'), 'the wide list must start hidden').toContain(
      'display: none'
    );
    expect(ruleBody(layout, '.nav-menu'), 'the menu is the narrow default').toContain(
      'display: block'
    );

    // The block by balanced braces, and each rule inside it read on its own:
    // slicing on a literal `'}\n      }'` depends on the indentation, and a
    // single pattern spanning both rules would be satisfied by a `display:
    // flex` belonging to neither.
    const wide = ruleBody(layout, '@media (min-width: 34rem)');
    expect(ruleBody(wide, '.nav-links'), 'the wide list appears').toContain('display: flex');
    expect(ruleBody(wide, '.nav-menu'), 'the menu disappears').toContain('display: none');
  });
});
