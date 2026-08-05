// Task design-1: render the article structure the source marked, and nothing more.
//
// Measured over the corpus: 881 of 894 text-bearing documents carry at least one article
// header, and 875 receive structure. The 19 that do not — 13 with no header at all, plus
// 6 whose numbering does not begin at 1 — must render exactly as they do today. This is a
// no-fabrication product, and inventing structure for a document that has none would be
// the same class of error as inventing a title.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArticles } from '../src/lib/articles';

describe('parseArticles', () => {
  it('splits a document into a preamble and its articles', () => {
    const text = [
      'Coronel de Marina Leonardo Rosales',
      'Honorable Concejo Deliberante',
      '',
      'Artículo 1º: MESA DEL AGUA: Créase la Mesa de Gestión del Agua en el Distrito.',
      'Artículo 2º: CONFORMACIÓN: La Mesa estará integrada por dos representantes.',
    ].join('\n');

    const parsed = parseArticles(text);

    expect(parsed.hasArticles).toBe(true);
    expect(parsed.preamble).toContain('Honorable Concejo Deliberante');
    expect(parsed.articles).toHaveLength(2);
    expect(parsed.articles[0]?.label).toBe('Artículo 1º:');
    expect(parsed.articles[0]?.body).toContain('Créase la Mesa');
    expect(parsed.articles[1]?.label).toBe('Artículo 2º:');
  });

  it('recognises every header form the corpus actually uses', () => {
    // Measured as document counts: 'Artículo'+':' 849, 'ARTICULO'+':' 32,
    // 'Articulo'+':' 30, 'ARTÍCULO'+':' 22, 'Artículo'+'.' 5, 'ARTICULO'+'.-' 3.
    // `Art. 1º:` is deliberately absent — no document in the corpus opens a line with it.
    for (const header of ['Artículo 1º:', 'ARTICULO 1:', 'ARTÍCULO 1°.-', 'Articulo 1º:']) {
      const parsed = parseArticles(`${header} Texto del artículo.`);
      expect(parsed.hasArticles, `did not recognise ${header}`).toBe(true);
      expect(parsed.articles[0]?.body).toContain('Texto del artículo');
    }
  });

  it('never fabricates structure for a document that has none', () => {
    const text = 'Convenio marco entre el Municipio y la Provincia.\nSin articulado.';
    const parsed = parseArticles(text);

    expect(parsed.hasArticles).toBe(false);
    expect(parsed.articles).toHaveLength(0);
    expect(parsed.preamble).toBe(text);
  });

  it('preserves every word of the source', () => {
    // Rendering may change whitespace — that is a PDF extraction artefact. It may not
    // change a single word: this is a transcript of a municipal legal document.
    const text =
      'Encabezado municipal\n\nArtículo 1º: Créase el registro.\nArtículo 2º: Deróganse las normas contrarias.';
    const parsed = parseArticles(text);

    // Compare with ALL whitespace stripped. Splitting on whitespace would conflate
    // "whitespace changed" — which the spec explicitly allows, since it is a PDF
    // extraction artefact — with "words changed", which it forbids. The corpus proved
    // the difference: `3194.json` writes `Articulo 3º:Regístrese,` with no space after
    // the colon, so separating the label from its body legitimately inserts one.
    const chars = (s: string) => s.replace(/\s+/g, '');
    const rendered = [parsed.preamble, ...parsed.articles.map((a) => `${a.label} ${a.body}`)]
      .join(' ')
      .trim();

    expect(chars(rendered)).toEqual(chars(text));
  });

  it('does not claim an article the document is quoting, not declaring', () => {
    // Amending ordinances reproduce the article they modify verbatim, on its own line,
    // in header form. A line-anchored match captures it as this document's own — so
    // Ordenanza 3316, which has 11 articles, rendered `ARTICULO 321º` among them and
    // erased that the text was quoted from the Código de Faltas. That is fabricating
    // structure, the same class of defect as inventing a title.
    //
    // A document's own articles run consecutively from 1. Anything that breaks the run
    // is quoted, and stays inside the body of the article that quotes it — which is
    // where it belongs, because that is what the source wrote.
    const text = [
      'Artículo 1º: Primera disposición.',
      'Artículo 2º: Modifícase el artículo 321º, el que quedará redactado así:',
      'ARTICULO 321º: FALTA DE ENTREGA DE PASAJE. Será sancionado con multa.',
      'Artículo 3º: Comuníquese.',
    ].join('\n');

    const parsed = parseArticles(text);

    expect(parsed.articles.map((a) => a.label)).toEqual([
      'Artículo 1º:',
      'Artículo 2º:',
      'Artículo 3º:',
    ]);
    expect(parsed.articles[1]?.body).toContain('ARTICULO 321º');
    expect(parsed.articles[1]?.body).toContain('FALTA DE ENTREGA DE PASAJE');
  });

  it('rejects a quoted article that appears before the document reaches it', () => {
    // Measured shape of `3696`: captures run [1, 8, 2]. The 8 is quoted inside article 1
    // and must not displace the document's own article 2.
    const text = [
      'Artículo 1º: Modifícase el artículo 8º de la Ordenanza 3193.',
      'Artículo 8º: El recorrido será el que se detalla en el anexo.',
      'Artículo 2º: Comuníquese.',
    ].join('\n');

    const parsed = parseArticles(text);
    expect(parsed.articles.map((a) => a.label)).toEqual(['Artículo 1º:', 'Artículo 2º:']);
  });

  it('renders as plain text when no article 1 anchors the sequence', () => {
    // A fragment that starts at article 97 gives no way to tell its own articles from
    // quoted ones. Six documents look like this. Inventing a sequence for them would
    // be worse than leaving them exactly as they are.
    const parsed = parseArticles('Artículo 97º: Tasa por servicios.\nArtículo 15º: Excepciones.');
    expect(parsed.hasArticles).toBe(false);
  });

  it('does not read a decimal point as an article separator', () => {
    // `3790` contains, hard-wrapped by PDF extraction:
    //   "... aplicar penalidades previstas en el\n artículo 2. 1.4 de este código."
    // `artículo 2.` sits at line start and a bare `.` looked like a separator, so a
    // reference to §2.1.4 of another code became this document's own article 2 — and
    // because it consumed the expected number, the document's REAL article 2 was then
    // rejected and swallowed into the fake one. A period after a number is a decimal
    // point at least as often as it is a separator.
    const text = [
      'ARTICULO 1º: Primera disposición.',
      'Se aplicarán las penalidades previstas en el',
      'artículo 2. 1.4 de este código.',
      'ARTICULO 2º: Segunda disposición.',
    ].join('\n');

    const parsed = parseArticles(text);
    expect(parsed.articles.map((a) => a.label)).toEqual(['ARTICULO 1º:', 'ARTICULO 2º:']);
    expect(parsed.articles[0]?.body).toContain('artículo 2. 1.4 de este código');
  });

  it('still accepts a bare period when a real article opens after it', () => {
    // Eight documents use `ARTICULO 3. TEXTO` — the period is a separator there, and the
    // uppercase word after it is what distinguishes it from a decimal.
    const parsed = parseArticles('ARTICULO 1. FALTA DE ENTREGA. Será sancionado.');
    expect(parsed.hasArticles).toBe(true);
    expect(parsed.articles[0]?.label).toBe('ARTICULO 1.');
  });

  it('folds a bis article into the article it follows rather than inventing a number', () => {
    // Twenty documents carry a line-start `Artículo 5 bis:`. The regex does not match them:
    // the separator must follow the number or its ordinal mark directly, and `bis` sits
    // between the two. The sequence filter never sees them. They belong to the body of the
    // article they follow, which is where the source put them and where they stay.
    const parsed = parseArticles(
      ['Artículo 1º: Primera.', 'Artículo 1 bis: Intercalada.', 'Artículo 2º: Segunda.'].join('\n')
    );
    expect(parsed.articles.map((a) => a.label)).toEqual(['Artículo 1º:', 'Artículo 2º:']);
    expect(parsed.articles[0]?.body).toContain('Artículo 1 bis: Intercalada.');
  });

  it('keeps a numbered article that carries no separator out of the results', () => {
    // "Artículo 5 del Código" inside a sentence is a reference, not this document's
    // own article. Capturing it would break the text apart at a word.
    const parsed = parseArticles('Modifícase el Artículo 5 del Código de Faltas vigente.');
    expect(parsed.hasArticles).toBe(false);
  });
});

describe('parseArticles over the real corpus', () => {
  it('parses every text-bearing document without losing a single word', () => {
    // The rule this project learned the hard way: a parsing rule that passes hand-picked
    // examples still fails real data. Four hardening rules shipped in this repo before
    // being caught by a corpus replay. This is that replay.

    const dir = join(process.cwd(), '..', 'data', 'documents');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(894);

    const chars = (s: string) => s.replace(/\s+/g, '');
    let withArticles = 0;

    for (const file of files) {
      const { text } = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as { text: string };
      const parsed = parseArticles(text);
      if (parsed.hasArticles) withArticles++;

      const rendered = [parsed.preamble, ...parsed.articles.map((a) => `${a.label} ${a.body}`)]
        .join(' ')
        .trim();
      expect(chars(rendered), `${file} lost or altered text`).toEqual(chars(text));
    }

    // Measured: 875 of 894. 13 carry no header at all; a further 6 begin at an
    // article other than 1, which gives no way to separate their own articles from ones
    // they quote — those get no structure rather than an invented one.
    expect(withArticles).toBe(875);

    // Character preservation and a document count cannot see a FALSE capture: a
    // fabricated article preserves every character and keeps the document inside the 875.
    // These anchors pin real documents whose article count is known, and each one caught
    // a defect that every other assertion passed.
    const countFor = (file: string) => {
      const { text } = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as { text: string };
      return parseArticles(text).articles.length;
    };
    expect(countFor('3316.json'), '3316 quotes ARTICULO 321 from the Código de Faltas').toBe(11);
    expect(
      countFor('3790-Modifica-Ordenanza-2660.json'),
      '3790 references §2.1.4, whose decimal point is not a separator'
    ).toBe(8);

    // Every kept label must be a real header form. A capture that is not one is a bug
    // regardless of how the totals look.
    for (const file of files) {
      const { text } = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as { text: string };
      for (const article of parseArticles(text).articles) {
        expect(article.label, `${file}: ${article.label} is not a header form`).toMatch(
          /^(?:art[ií]culo)\s*\d{1,3}\s*(?:[ºo°])?\s*(?::|\.-|\.)$/i
        );
      }
    }
  });
});

describe('DocumentText style scoping', () => {
  it('keeps the .doc-text rule in the same component as the element', () => {
    // Regression for a defect every gate passed. The rule lived in the page while the
    // element moved into the component. Astro scopes styles per component, so the
    // shipped selector carried the page's hash and the element carried the component's:
    // it matched nothing, and the 19 documents that fall back to plain text lost `pre-wrap`,
    // collapsing their source line breaks. Those are exactly the documents this feature
    // promised to leave untouched.
    //
    // Asserted against SOURCE, not the build. A dist-based check passes vacuously on a
    // clean checkout, because the documented gate order runs tests before the build —
    // which would make this test green precisely when it is needed most.
    const component = readFileSync(
      join(process.cwd(), 'src', 'components', 'DocumentText.astro'),
      'utf-8'
    );
    const page = readFileSync(
      join(process.cwd(), 'src', 'pages', 'documento', '[doc_id].astro'),
      'utf-8'
    );

    expect(component).toContain('class="doc-text"');
    expect(component).toMatch(/\.doc-text\s*\{/);
    expect(component).toContain('pre-wrap');
    expect(page, 'the .doc-text rule must not live away from its element').not.toMatch(
      /\.doc-text\s*\{/
    );
  });
});
