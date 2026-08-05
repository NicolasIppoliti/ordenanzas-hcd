// DESIGN.md risk 3: browse the whole corpus, not just search it.
//
// Every archive in this category builds faceted search because their corpora
// are millions of records. This one is 1,038 — the whole thing fits on one
// page, grouped by year. A resident often does not know the number; they know
// roughly when. Search demands you know what to type; browsing does not.
//
// The rules this page has to satisfy are the project's, not the design's:
// every document appears (no silent omission), nothing is inferred, and the
// 223 documents whose year the source never stated are visible rather than
// quietly dropped from a page that claims to hold the whole corpus.
//
// The grouping itself is pinned in `browse.test.ts`, against synthetic corpora
// this page cannot be rendered with — including one where every document
// carries a year, which is the only way to check the undated group disappears.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import DocumentosPage from '../src/pages/documentos.astro';
import { getDocuments } from '../src/lib/data';

describe('browse-by-year page', () => {
  it('lists every document in the archive exactly once', async () => {
    // A browse page that quietly omits records is worse than no browse page:
    // a reader who does not find their ordinance concludes it does not exist.
    const container = await AstroContainer.create();
    const page = await container.renderToString(DocumentosPage, {});
    const documents = getDocuments();

    expect(documents.length).toBe(1038);
    for (const doc of documents) {
      const href = `href="/documento/${doc.doc_id}"`;
      expect(page.split(href).length - 1, `${doc.doc_id} appeared ${page.split(href).length - 1} times`).toBe(1);
    }
  });

  it('groups by year, most recent first', async () => {
    // Measured: 15 distinct years, 2002 to 2026.
    const container = await AstroContainer.create();
    const page = await container.renderToString(DocumentosPage, {});
    const years = [...page.matchAll(/id="anio-(\d{4})"/g)].map((m) => Number(m[1]));

    expect(years.length).toBe(15);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(2002);
  });

  it('shows the documents whose year the source never stated, and says so', async () => {
    // 223 of 1,038 — 21% of the archive. D10 forbids inferring a year, so these
    // cannot be filed under a guess. Dropping them from a page that claims to
    // hold the whole corpus would be the silent incomplete page the rules
    // forbid; the group is labelled with the same words the search filter uses.
    const container = await AstroContainer.create();
    const page = await container.renderToString(DocumentosPage, {});

    expect(page).toContain('Año no determinado');
    // Scoped to the heading: `223` appears seven times in this page, six of them
    // inside unrelated doc_ids like `4223-O0132023`. An unscoped substring would
    // stay green if the count rendered 0 or the span vanished — a wrong assertion
    // that fails silently by passing.
    const group = page.slice(page.indexOf('id="anio-sin-determinar"'));
    expect(group.slice(0, group.indexOf('</h2>') + 5)).toContain('223');
  });

  it('carries a year index that links to each group', async () => {
    const container = await AstroContainer.create();
    const page = await container.renderToString(DocumentosPage, {});

    for (const year of [2026, 2024, 2010, 2002]) {
      expect(page, `no index link for ${year}`).toContain(`href="#anio-${year}"`);
      expect(page, `no group for ${year}`).toContain(`id="anio-${year}"`);
    }
  });

  it('states the count of each year beside its heading', async () => {
    // Measured: 2021 is the largest year at 108 documents, 2002 the smallest at 1.
    const container = await AstroContainer.create();
    const page = await container.renderToString(DocumentosPage, {});
    const group = page.slice(page.indexOf('id="anio-2021"'));

    expect(group.slice(0, group.indexOf('</h2>') + 5)).toContain('108');
  });

  it('is reachable from the main navigation on every page', async () => {
    // A browse page nobody can find is a browse page that does not exist. The
    // nav is the only chrome that appears on all 1,042 pages.
    const container = await AstroContainer.create();
    const page = await container.renderToString(DocumentosPage, {});
    const nav = page.slice(page.indexOf('<nav aria-label="Principal"'));

    expect(nav.slice(0, nav.indexOf('</nav>'))).toContain('href="/documentos"');
  });

  it('keeps a jumped-to year clear of the sticky index', async () => {
    // Every link in the index is an in-page anchor, and the index is sticky at
    // the top. Without scroll-margin the browser puts the heading exactly where
    // the bar is, so the reader lands on a year whose heading and first rows are
    // covered — the jump appears to have gone to the wrong place.
    // Asserts the VALUE, not the property name: `scroll-margin-top: 0` would
    // satisfy a presence check and clear nothing at all.
    const page = readFileSync(join(process.cwd(), 'src', 'pages', 'documentos.astro'), 'utf-8');

    expect(page).toMatch(/scroll-margin-top:\s*var\(--space-16\)/);
  });

  it('keeps the index out of Pagefind', async () => {
    // 1,038 links repeated in the index would drown the documents themselves,
    // the same reason the nav, the footer and the related lists are ignored.
    const container = await AstroContainer.create();
    const page = await container.renderToString(DocumentosPage, {});
    expect(page).toContain('<div class="browse" data-pagefind-ignore');
  });
});
