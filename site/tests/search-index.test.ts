// Tasks 4b.4/4b.5/4b.6: proof against a REAL built Pagefind index, not
// against intent. This renders the actual detail-page component (the same
// one `astro build` uses) for a handful of representative records, feeds
// the resulting HTML into Pagefind's Node indexing API exactly as
// `pagefind --site dist` would, writes a real index to disk, then queries
// it through the generated `pagefind.js` runtime — the same module the
// browser loads on /buscar. If `data-pagefind-body` were ever empty for a
// no_text record, this test would show 0 hits, not a passing assertion
// about intent.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { createIndex } from 'pagefind';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import DetailPage from '../src/pages/documento/[doc_id].astro';
import type { ManifestDocument } from '../src/lib/contract';
import { toDisplayResult, type RawSearchResultData } from '../src/lib/search';

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

const AGUA_DOC = baseDoc({
  doc_id: '4457-mesa-de-gestion-del-agua',
  number: 4457,
  title: 'Mesa de Gestión del Agua',
  title_source: 'listing',
  year: 2026,
  doc_type: 'ordenanza',
  status: 'ok',
});

// A real no_text scanned document: number, title and expediente present,
// but the "Texto" section carries no body text, per data.ts (loadDocumentText
// returns null for anything other than 'ok').
const NO_TEXT_DOC = baseDoc({
  doc_id: '3120-plan-de-obras',
  number: 3120,
  title: 'Plan de Obras Públicas 1998',
  title_source: 'filename',
  expediente: '45/1998',
  year: 1998,
  doc_type: 'ordenanza',
  status: 'no_text',
});

const CONVENIO_DOC = baseDoc({
  doc_id: 'convenio-ministerio-mujeres',
  number: null,
  title: 'Ministerio de las Mujeres',
  title_source: 'listing',
  doc_type: 'convenio',
  status: 'ok',
});

const SIN_CLASIFICAR_DOC = baseDoc({
  doc_id: 'calle-irigoyen',
  number: null,
  title: null,
  title_source: 'none',
  doc_type: 'sin clasificar',
  status: 'ok',
});

/**
 * A Pagefind result's `data()` also carries an internal `raw_url` field
 * alongside the public `url`. In production (a real http(s) origin) both
 * agree. In this harness the generated runtime resolves `url` relative to
 * the `file://` module path it was dynamically imported from (a Node/Vite
 * artifact of testing a browser-oriented runtime outside a browser), while
 * `raw_url` stays exactly what this suite wrote via `addHTMLFile({ url })`.
 * Assertions use `raw_url` for that reason — it is the one field this
 * harness cannot distort, and it is what the site actually publishes.
 */
type RawResultWithInternalUrl = RawSearchResultData & { readonly raw_url: string };

function resultUrl(raw: RawSearchResultData): string {
  return (raw as RawResultWithInternalUrl).raw_url;
}

let outputPath: string;
let pagefind: {
  init(): Promise<void>;
  search(
    query: string | null,
    options?: { filters?: Record<string, string[]> }
  ): Promise<{ results: Array<{ data(): Promise<RawSearchResultData> }> }>;
  filters(): Promise<Record<string, Record<string, number>>>;
};
let restoreFetch: () => void;

beforeAll(async () => {
  const container = await AstroContainer.create();

  const { index, errors: createErrors } = await createIndex({});
  expect(createErrors).toEqual([]);
  if (!index) throw new Error('Pagefind index creation failed');

  for (const doc of [AGUA_DOC, NO_TEXT_DOC, CONVENIO_DOC, SIN_CLASIFICAR_DOC]) {
    const html = await container.renderToString(DetailPage, { props: { doc } });
    const { errors } = await index.addHTMLFile({
      url: `/documento/${doc.doc_id}/`,
      content: html,
    });
    expect(errors, `indexing ${doc.doc_id}`).toEqual([]);
  }

  outputPath = await fs_mkdtemp();
  const { errors: writeErrors } = await index.writeFiles({ outputPath });
  expect(writeErrors).toEqual([]);

  // Pagefind's generated runtime fetches its own chunks relative to its own
  // module URL. In a browser that is an http(s) URL; here it is `file://`,
  // which Node's global fetch does not support, so this test polyfills it
  // rather than standing up an HTTP server for a local temp directory.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const target = typeof url === 'string' ? url : url.toString();
    if (target.startsWith('file://')) {
      const data = await readFile(fileURLToPath(target));
      return new Response(data);
    }
    return originalFetch(url as string, init);
  }) as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = originalFetch;
  };

  const modUrl = pathToFileURL(path.join(outputPath, 'pagefind.js')).href;
  pagefind = await import(/* @vite-ignore */ modUrl);
  await pagefind.init();
});

afterAll(async () => {
  restoreFetch();
  if (outputPath) await rm(outputPath, { recursive: true, force: true });
});

async function fs_mkdtemp(): Promise<string> {
  const { mkdtemp, realpath } = await import('node:fs/promises');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pagefind-test-'));
  // macOS's os.tmpdir() is a symlink (/var -> /private/var). Pagefind's
  // generated runtime resolves its own chunk URLs relative to its resolved
  // module path, so writing to the symlinked path while importing from the
  // resolved path produces mismatched, unusable result URLs.
  return realpath(dir);
}

describe('real built Pagefind index', () => {
  it('finds a text-bearing document by full text, with an excerpt', async () => {
    const search = await pagefind.search('agua potable');
    const urls = await Promise.all(search.results.map(async (r) => resultUrl(await r.data())));
    expect(urls).toContain('/documento/4457-mesa-de-gestion-del-agua/');

    const firstResult = search.results[0];
    if (!firstResult) throw new Error('expected at least one result');
    const raw = await firstResult.data();
    const display = toDisplayResult(raw);
    expect(display.hasIndexedText).toBe(true);
    expect(display.excerpt).not.toBeNull();
  });

  it('finds the no_text document by its metadata (number), never as a full-text match', async () => {
    const search = await pagefind.search('3120');
    const results = await Promise.all(search.results.map((r) => r.data()));
    const hit = results.find((r) => resultUrl(r) === '/documento/3120-plan-de-obras/');
    expect(hit, JSON.stringify(results)).toBeDefined();

    const display = toDisplayResult(hit!);
    expect(display.hasIndexedText).toBe(false);
    expect(display.excerpt).toBeNull();
  });

  it('also finds the no_text document by its title and expediente', async () => {
    const byTitle = await pagefind.search('Plan de Obras');
    const titleUrls = await Promise.all(
      byTitle.results.map(async (r) => resultUrl(await r.data()))
    );
    expect(titleUrls).toContain('/documento/3120-plan-de-obras/');

    const byExpediente = await pagefind.search('45/1998');
    const expedienteUrls = await Promise.all(
      byExpediente.results.map(async (r) => resultUrl(await r.data()))
    );
    expect(expedienteUrls).toContain('/documento/3120-plan-de-obras/');
  });

  it('returns no results for a query matching nothing', async () => {
    const search = await pagefind.search('palabra-inexistente-zzz');
    expect(search.results).toHaveLength(0);
  });

  it('labels a convenio result Convenio, never Ordenanza', async () => {
    const search = await pagefind.search('Ministerio de las Mujeres');
    const results = await Promise.all(search.results.map((r) => r.data()));
    const hit = results.find((r) => resultUrl(r) === '/documento/convenio-ministerio-mujeres/');
    expect(hit).toBeDefined();
    const display = toDisplayResult(hit!);
    expect(display.tipo).toBe('Convenio');
    expect(display.tipo).not.toBe('Ordenanza');
  });

  it('finds the numberless, titleless sin-clasificar record without a substitute number', async () => {
    const search = await pagefind.search(null, {
      filters: { tipo: ['Documento sin clasificar'] },
    });
    const results = await Promise.all(search.results.map((r) => r.data()));
    const hit = results.find((r) => resultUrl(r) === '/documento/calle-irigoyen/');
    expect(hit).toBeDefined();
    const display = toDisplayResult(hit!);
    expect(display.tipo).toBe('Documento sin clasificar');
    expect(display.title).not.toMatch(/^\d/); // no digit-led fabricated number
  });

  it('never indexes the ignored chrome (nav/footer text) as a match', async () => {
    // "Archivo de Ordenanzas del HCD" only ever appears in Layout's nav,
    // which carries data-pagefind-ignore; a hit here would mean chrome is
    // being re-indexed once per page (the exact cost this decision avoids).
    const search = await pagefind.search('Saltar al contenido principal');
    expect(search.results).toHaveLength(0);
  });

  it('exposes anio/tipo/texto as real filters with real counts', async () => {
    const filters = await pagefind.filters();
    expect(Object.keys(filters).sort()).toEqual(['anio', 'texto', 'tipo']);
    expect(filters.texto?.['Con texto indexado']).toBeGreaterThanOrEqual(1);
    expect(filters.texto?.['Sin texto indexado']).toBeGreaterThanOrEqual(1);
    expect(filters.tipo?.['Ordenanza']).toBeGreaterThanOrEqual(1);
    expect(filters.tipo?.['Convenio']).toBeGreaterThanOrEqual(1);
    expect(filters.tipo?.['Documento sin clasificar']).toBeGreaterThanOrEqual(1);
  });
});
