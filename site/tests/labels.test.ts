// The identifier slot, and the invariant it used to trust without checking.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import DocCard from '../src/components/DocCard.astro';
import { getDocuments } from '../src/lib/data';
import { DOC_TYPE_LABELS, documentHref, formatDocIdentifier } from '../src/lib/labels';

describe('formatDocIdentifier', () => {
  it('names the type the record carries, never a type it does not', () => {
    // It read `Ordenanza ${n}` for anything with a number. D8 rule 1 says only
    // an ordenanza has one — true today, enforced nowhere — so the first
    // convenio to arrive numbered would have been announced as an ordinance in
    // an <h1>, a <title> and every list on the site.
    expect(formatDocIdentifier({ doc_type: 'convenio', number: 4457 })).toBe('Convenio 4457');
    expect(formatDocIdentifier({ doc_type: 'decreto', number: 12 })).toBe('Decreto 12');
    expect(formatDocIdentifier({ doc_type: 'ordenanza', number: 4457 })).toBe('Ordenanza 4457');
    expect(formatDocIdentifier({ doc_type: 'convenio', number: null })).toBe('Convenio');
  });

  it('renders every real record exactly as it did before, over the whole corpus', () => {
    // The change is a safety net, not a redesign: with the invariant holding,
    // reading the type must produce the same string the hard-coded label did.
    //
    // Both branches are pinned to a LITERAL. Falling back to the function under
    // test for the unnumbered case would have made the assertion `f(x) === f(x)`
    // for exactly the 51 records this change is about.
    for (const doc of getDocuments()) {
      const expected =
        doc.number !== null ? `Ordenanza ${doc.number}` : DOC_TYPE_LABELS[doc.doc_type];
      expect(formatDocIdentifier(doc), doc.doc_id).toBe(expected);
    }
  });

  it('confirms the invariant it no longer depends on', () => {
    // 0 of the 51 non-ordinances carry a number. Asserted so that the day it
    // stops being true, it is a failing test rather than a fabricated heading.
    const numberedNonOrdinances = getDocuments().filter(
      (doc) => doc.number !== null && doc.doc_type !== 'ordenanza'
    );
    expect(numberedNonOrdinances.map((doc) => doc.doc_id)).toEqual([]);
  });
});

describe('documentHref', () => {
  it('percent-encodes the id, which is a remote-controlled string', () => {
    expect(documentHref('4298-Ley-N°-15430')).toBe('/documento/4298-Ley-N%C2%B0-15430');
  });

  it('resolves for every record in the archive', () => {
    for (const doc of getDocuments()) {
      expect(documentHref(doc.doc_id).startsWith('/documento/'), doc.doc_id).toBe(true);
    }
  });
});

describe('DocCard with a record that carries no number', () => {
  it('keeps the title in the wide column instead of the number slot', async () => {
    // The number span is rendered only when there is a number — so for the 51
    // records without one, nothing occupies column 1 and auto-placement drops
    // the title into it: 6ch wide, wrapping every few characters. `.doc-meta`
    // pins itself with `grid-column: 2` and `.doc-title` did not.
    //
    // Asserted against source: grid placement lives in a scoped style block the
    // container render does not emit.
    const card = readFileSync(
      join(process.cwd(), 'src', 'components', 'DocCard.astro'),
      'utf-8'
    );
    const rule = card.slice(card.indexOf('.doc-title {'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('grid-column: 2');
  });

  it('renders no empty number span for it', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(DocCard, {
      props: {
        doc: {
          doc_id: 'calle-irigoyen',
          number: null,
          number_variants: [],
          doc_type: 'sin clasificar',
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
        },
      },
    });

    expect(html).not.toMatch(/class="doc-num"[^>]*>\s*</);
    expect(html).toContain('Documento sin clasificar');
  });
});
