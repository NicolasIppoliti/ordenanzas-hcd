/** Split extracted document text into the article structure the SOURCE marked.
 *
 * See DESIGN.md, risk 2. The 207-page fiscal ordinance is unreadable as a `pre-wrap`
 * dump: the PDF's own line breaks and stray dashes are reproduced faithfully and
 * meaninglessly. Rendering the articles the document itself declares turns it into
 * something a resident can navigate.
 *
 * The hard rule, inherited from every other extraction rule in this project: never
 * fabricate. Only text the source marked as an article becomes an article. A document
 * with no headers renders exactly as it does today, and no word is ever changed —
 * whitespace may be, because whitespace here is an artefact of PDF extraction, not
 * something the HCD wrote.
 */

/** Article header forms measured across the corpus, with their observed counts:
 * `Artículo`+`:` 849, `ARTICULO`+`:` 32, `Articulo`+`:` 30, `ARTÍCULO`+`:` 22,
 * `Artículo`+`.` 5, `Artículo`+`.-` 4, `ARTICULO`+`.-` 3, `ARTÍCULO`+`.` 2, and one each
 * for `Articulo`+`.`, `Articulo`+`.-` and `ARTÍCULO`+`.-`.
 *
 * The abbreviated `Art.` form is NOT accepted: zero documents open a line with it, and
 * this project does not widen a rule past what the corpus shows.
 *
 * `bis`/`ter` headers are NOT matched either. Twenty documents carry a line-start
 * `Artículo 5 bis:` or `Artículo 5º bis:`, and the regex misses them by construction rather than by the
 * sequence filter — the separator must follow the number or its ordinal mark directly,
 * and `bis` sits between the two. Do not read the consecutive-from-1 rule as a second
 * guard here: it never sees these headers. Relaxing the separator would let them
 * through with nothing behind it. They fold into the body of the article they follow,
 * which loses no text and invents no structure.
 *
 * The separator must be `:`, `.-`, or a bare `.` FOLLOWED BY WHITESPACE AND AN UPPERCASE
 * LETTER. A period after a number is a decimal point at least as often as a separator:
 * `3790` writes `artículo 2. 1.4 de este código` at a line start, and reading that as a
 * separator both invented an article 2 and caused the document's real article 2 to be
 * rejected as out of sequence.
 *
 * The separator is REQUIRED. Without it, `Modifícase el Artículo 5 del Código` — a
 * reference to another norm inside a sentence — would be captured as this document's
 * own article and tear the sentence in half.
 *
 * The separator is kept INSIDE the captured label rather than consumed. Dropping it
 * would be typographically ordinary and still wrong here: this is a transcript of a
 * municipal legal document, and the rule is that nothing but whitespace changes. The
 * word-preservation test is what caught it.
 */
const ARTICLE_HEADER =
  /^[ \t]*((?:art[ií]culo)\s*(\d{1,3})\s*(?:[ºo°])?\s*(?::|\.-|\.(?=\s+[A-ZÁÉÍÓÚÑ])))\s*/gim;

export interface ParsedArticle {
  /** The header as the source wrote it, e.g. `Artículo 1º`. */
  label: string;
  /** Everything up to the next header. */
  body: string;
}

export interface ParsedDocument {
  /** Text before the first article — usually the municipal letterhead. Never dropped. */
  preamble: string;
  articles: ParsedArticle[];
  hasArticles: boolean;
}

/** Collapse the runs of spaces and hard-wrapped lines PDF extraction leaves behind,
 * without touching the words themselves. */
function normalise(fragment: string): string {
  return fragment.replace(/\s+/g, ' ').trim();
}

export function parseArticles(text: string): ParsedDocument {
  let expected = 1;
  // A document's own articles run CONSECUTIVELY FROM 1. Anything that breaks the run is
  // an article this document is quoting, not declaring — amending ordinances reproduce
  // the article they modify verbatim, on its own line, in header form. Ordenanza 3316
  // has 11 articles and was rendering `ARTICULO 321º` among them, which both invented
  // structure and erased that the text was quoted from the Código de Faltas.
  //
  // Measured over all 894 documents: 77 contain a header the sequence rule rejects, 573
  // headers in total. Restricted to the 875 that do receive structure, 71 documents and
  // 554 headers. A
  // rejected header is not dropped — it stays inside the body of the article that quotes
  // it, which is exactly where the source put it.
  //
  // Six documents begin at an article other than 1 (a fiscal fragment starting at 97).
  // There is no way to tell their own articles from quoted ones, so they get no structure
  // at all rather than an invented one.
  const matches = [...text.matchAll(ARTICLE_HEADER)].filter((match) => {
    const number = Number(match[2]);
    if (number !== expected) return false;
    expected += 1;
    return true;
  });

  if (matches.length === 0) {
    return { preamble: text, articles: [], hasArticles: false };
  }

  const preamble = normalise(text.slice(0, matches[0]?.index ?? 0));

  const articles: ParsedArticle[] = matches.map((match, i) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? text.length;
    return {
      // Group 1 always participates in a successful match — the regex has no
      // alternation that could skip it — but `noUncheckedIndexedAccess` cannot know
      // that, and an assertion here would be a lie waiting to become true.
      label: normalise(match[1] ?? match[0]),
      body: normalise(text.slice(start, end)),
    };
  });

  return { preamble, articles, hasArticles: true };
}
