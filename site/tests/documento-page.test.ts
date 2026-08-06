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
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
    // `ok` is in the loop too: a record with no `text_path` is `ok` and textless,
    // and type coverage from `Record<Status, string>` is not render coverage.
    for (const status of ['ok', 'no_text', 'pending', 'error'] satisfies Status[]) {
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

describe('detail page text section, remaining blank-section holes', () => {
  it('states a reason when the body is present but holds only whitespace', async () => {
    // Same silent blank as an absent body: a status of `ok` whose extracted text
    // is nothing but PDF whitespace. No document in the corpus is in this state
    // today, which is the only reason it has never been seen.
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailPage, {
      props: {
        doc: baseDoc({ doc_id: 'blanco', text_path: 'site/tests/fixtures/blank-text.json' }),
      },
    });
    const start = html.indexOf('<section aria-label="Texto del documento"');
    const section = html.slice(start, html.indexOf('</section>', start));
    expect(section.replace(/<[^>]*>/g, '').replace('Texto', '').trim()).not.toBe('');
  });
});

describe('the textless rule over the real corpus', () => {
  it('finds no document whose extracted text is only whitespace', () => {
    // `trimmed === '' → null` is a hardening rule, and this project replays every
    // hardening rule over the whole corpus before it lands. Today the answer is
    // zero; if an extraction regression ever makes it non-zero, those documents
    // would silently render "Sin texto extraído" instead of their text, and this
    // fails loudly instead.
    const dir = join(process.cwd(), '..', 'data', 'documents');
    const blank = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .filter((f) => {
        const { text } = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as { text: string };
        return text.trim() === '';
      });
    expect(blank, `documents with a whitespace-only body: ${blank.join(', ')}`).toEqual([]);
  });
});

describe('detail page sections that had no page-level test', () => {
  it('lists the archive files that share a number, without asserting a relation', async () => {
    // 88 documents share a number with another file. The section states the fact
    // and nothing more — no verb, no claim about which supersedes which.
    const container = await AstroContainer.create();
    const doc = baseDoc({ doc_id: '3298--2021-11', number: 3298 });
    const sibling = baseDoc({ doc_id: '3298--2021-12', number: 3298 });
    const html = await container.renderToString(DetailPage, { props: { doc, siblings: [sibling] } });

    expect(html).toContain('Archivos con el mismo número');
    expect(html).toContain('/documento/3298--2021-12');
  });

  it('keeps every character of the largest real document in the markup', async () => {
    // The 9 documents over 50,000 characters are progressively disclosed, never
    // truncated: Pagefind indexes the DOM, so a cut body is a body that cannot be
    // searched. This is the real 207-page fiscal ordinance, 676,955 characters.
    const path = 'data/documents/4270-D-138-2023-Fiscal-e-Impositiva-2024.json';
    const { text } = JSON.parse(
      readFileSync(join(process.cwd(), '..', path), 'utf-8')
    ) as { text: string };
    const container = await AstroContainer.create();
    const html = await container.renderToString(DetailPage, {
      props: { doc: baseDoc({ doc_id: 'grande', text_path: path }) },
    });

    expect(html).toContain('<details');

    // Compared EXACTLY, not as a lower bound. A `>=` against the whole section
    // tolerates whatever the chrome contributes — the heading, the summary and
    // the entity escaping came to about 50 characters of slack, which is 50
    // characters of body that could vanish with the test still green.
    const start = html.indexOf('<summary');
    const rendered = html
      .slice(html.indexOf('</summary>', start) + '</summary>'.length, html.indexOf('</details>', start))
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
    const chars = (s: string) => s.replace(/\s+/g, '');
    expect(chars(rendered)).toBe(chars(text.trim()));
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

describe('a document that a phone can actually read', () => {
  it('breaks the tokens PDF extraction leaves unbreakable', () => {
    // The fiscal ordinance's index is written with dot leaders:
    // `industria...............................................54` is ONE token,
    // 122 characters long. Fourteen documents carry a token over 40 characters,
    // and with `overflow-wrap: normal` each of them pushes the page sideways on a
    // phone — the reader gets horizontal scroll on a document that is otherwise
    // a single column of prose.
    //
    // The plain-text fallback had this from the start; the article renderer and
    // the letterhead paragraph did not, which is why it survived the redesign.
    const component = readFileSync(
      join(process.cwd(), 'src', 'components', 'DocumentText.astro'),
      'utf-8'
    );

    // A source-level guard, and it says so: this suite has no layout engine, so
    // it cannot measure a scroll width. What it can do is pin the declarations
    // the layout depends on, including the one that is easy to leave out.
    //
    // Layout verified by hand against the built site, and the numbers recorded
    // so the next reader does not have to repeat it: document `3194`, whose
    // article body carries a 114-character token, at a 548px viewport — the
    // narrowest at which the two-column grid still applies — resolves to
    // 96px + 408px with a document scroll width of 548. Before the fix the
    // fiscal ordinance measured 468px of scroll inside a 320px viewport.
    for (const selector of ['.doc-preamble', '.articles dd', '.doc-text']) {
      const rule = component.slice(component.indexOf(`${selector} {`));
      expect(rule.slice(0, rule.indexOf('}')), `${selector} lets a long token overflow`).toContain(
        'overflow-wrap'
      );
    }

    // `.articles dd` is a grid item, so its automatic minimum size is its
    // min-content width, and the spec does not count `overflow-wrap`'s break
    // opportunities towards min-content. Chromium breaks it anyway; this makes
    // the fix independent of that.
    const ddRule = component.slice(component.indexOf('.articles dd {'));
    expect(ddRule.slice(0, ddRule.indexOf('}'))).toContain('min-width: 0');
  });

  it('has fourteen documents that need it', () => {
    // Measured, so the rule above is not defended by a story.
    const dir = join(process.cwd(), '..', 'data', 'documents');
    const withLongTokens = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .filter((file) => {
        const { text } = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as { text: string };
        return text.split(/\s+/).some((word) => word.length > 40);
      });

    expect(withLongTokens).toHaveLength(14);
  });
});
