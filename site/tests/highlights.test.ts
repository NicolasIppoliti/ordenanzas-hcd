// The measured facts the home page opens with, and the search shortcuts.
//
// Every number the landing shows is computed here from the corpus, never typed
// into the markup. That is not ceremony: a figure written by hand is a figure
// that goes stale silently the week the archive grows, and this project has
// already shipped four of those.
//
// The shortcut terms are the one editorial decision on the page, and it is a
// deliberate one. Ranking terms by frequency instead — the "neutral" option —
// returns the letterhead: rosales, concejo, deliberante, comuníquese,
// regístrese, archívese, gmail. Every document repeats it, so a calculated list
// describes the template rather than the content, and it would send a resident
// nowhere. The rule that replaces that ranking is written beside the list, and
// DESIGN.md authorises it.
//
// Which assertions drove the code and which guard it: the counts, the >= 40
// floor and the accent folding were written first and failed first — the counts
// against a substring matcher that returned 166 for `obras`, the folding
// against a matcher that had none. `quietestYears` failed first too, against a
// stat that named 2002 alone when 2002 and 2012 tie at one document each. The
// audit-rule assertion is a guard: it passed as soon as the list carried `why`.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import ArchiveFacts from '../src/components/ArchiveFacts.astro';
import { getDocuments, loadDocumentBody } from '../src/lib/data';
import { parseArticles } from '../src/lib/articles';
import { SHORTCUT_TERMS, corpusStats, countTermMentions } from '../src/lib/highlights';

const documents = getDocuments();

describe('corpusStats', () => {
  it('measures the numbers the home page states', () => {
    const stats = corpusStats(documents);

    expect(stats.total).toBe(1038);
    expect(stats.withText).toBe(894);
    expect(stats.firstYear).toBe(2002);
    expect(stats.lastYear).toBe(2026);
    expect(stats.undated).toBe(223);
  });

  it('finds the fullest year by counting, not by claiming', () => {
    const stats = corpusStats(documents);

    expect(stats.busiestYears.years).toEqual([2021]);
    expect(stats.busiestYears.count).toBe(108);
  });

  it('names every year that ties for the most, not just the newest of them', () => {
    // The busy end used to break ties by picking the more recent year, while the
    // quiet end named both — one rule, applied twice, in opposite directions.
    // 2021 leads by 3 documents; a single ordinary week closes that.
    const stats = corpusStats([
      ...documents.filter((doc) => doc.year !== 2024),
      ...documents.filter((doc) => doc.year === 2024).slice(0, 105),
      // Three more 2024 records, cloned with fresh ids, bring it level with 2021.
      ...[1, 2, 3].map((n) => ({
        ...documents.find((doc) => doc.year === 2024)!,
        doc_id: `sintetico-${n}`,
      })),
    ]);

    expect(stats.busiestYears.years).toEqual([2021, 2024]);
    expect(stats.busiestYears.count).toBe(108);
  });

  it('counts a whitespace-only body as textless, the way the document page does', () => {
    // The detail page treats a body of nothing but PDF whitespace as textless and
    // says so. Counting it here as "con el texto completo adentro" would have the
    // home promising what that page denies. Zero documents are in that state
    // today, which is exactly why it would never have been noticed.
    const stats = corpusStats(documents);
    const blank = documents.filter((doc) => {
      const body = loadDocumentBody(doc);
      return body !== null && body.text.trim() === '';
    });

    expect(blank).toEqual([]);
    expect(stats.withText).toBe(894);
  });

  it('names every year that ties for the fewest, never just one of them', () => {
    // 2002 and 2012 hold exactly one document each. Calling either "the
    // quietest year" would be a claim the data does not make.
    const stats = corpusStats(documents);

    expect(stats.quietestYears.count).toBe(1);
    expect(stats.quietestYears.years).toEqual([2002, 2012]);
  });

  it('finds the longest document in the archive', () => {
    // The 207-page fiscal ordinance. Measured by characters of extracted text,
    // which is the only length every record carries.
    const stats = corpusStats(documents);

    expect(stats.longest.doc_id).toBe('4270-D-138-2023-Fiscal-e-Impositiva-2024');
    expect(stats.longest.characters).toBe(676_955);
    // The trimmed length is what the document page reports for the same record,
    // so the fallback size on the card cannot disagree with it.
    expect(stats.longest.trimmedCharacters).toBe(676_897);
  });

  it('never counts a record twice or drops one', () => {
    const stats = corpusStats(documents);
    expect(stats.withText + stats.withoutText).toBe(stats.total);
  });
});

describe('the longest-document card tells the truth about how it renders', () => {
  it('only claims article-by-article reading for a document that has articles', () => {
    // The card says the longest document reads "artículo por artículo". 875 of
    // the 894 text-bearing documents render that way; the other 19 fall back to
    // plain text. `longest` is recomputed every build, so a weekly sync that
    // lands a longer document among those 19 would leave the card promising a
    // rendering the page does not produce.
    const stats = corpusStats(documents);
    const longest = documents.find((doc) => doc.doc_id === stats.longest.doc_id);
    const body = longest ? loadDocumentBody(longest) : null;
    expect(body, 'the longest document must have a body').not.toBeNull();

    const parsed = parseArticles(body!.text);
    expect(parsed.hasArticles, `${stats.longest.doc_id} renders as plain text`).toBe(true);
    expect(parsed.articles.length).toBeGreaterThan(0);
  });
});

describe('the search shortcuts', () => {
  it('counts the documents whose text mentions each term', () => {
    // Measured against the whole corpus, so a chip can never promise a result
    // set that is not there.
    const counts = countTermMentions(documents, SHORTCUT_TERMS);

    expect(counts.get('salud')).toBe(163);
    expect(counts.get('obras')).toBe(150);
    expect(counts.get('tránsito')).toBe(78);
    expect(counts.get('tasas')).toBe(86);
    expect(counts.get('agua')).toBe(43);
  });

  it('offers no term the corpus barely mentions', () => {
    // A shortcut that leads to four documents is worse than no shortcut: it
    // makes the archive look empty on a subject it actually covers.
    const counts = countTermMentions(documents, SHORTCUT_TERMS);

    for (const term of SHORTCUT_TERMS) {
      expect(counts.get(term.term), `${term.term} is too thin to offer`).toBeGreaterThanOrEqual(40);
    }
  });

  it('carries the rule that admitted every term, so the list can be audited', () => {
    // The terms are chosen, and a chosen list needs a stated rule or it is just
    // taste with numbers attached.
    for (const term of SHORTCUT_TERMS) {
      expect(term.why, `${term.term} has no stated reason`).not.toBe('');
    }
  });

  it('folds the accents in the TEXT, not just in the term', () => {
    // Measured: 78 documents write `tránsito`, 4 write `transito`, and those 4
    // also carry the accented form. So an unaccented pattern finding all 78 can
    // only mean the haystack was folded too.
    //
    // The earlier version of this test compared an accented query against an
    // unaccented one and asserted they matched. Both are folded before the regex
    // is built, so the two arms compiled to the same pattern and the assertion
    // could not fail — it stayed green even with the text folding deleted, when
    // both arms returned zero.
    const found = countTermMentions(documents, [
      { term: 't', query: 'transito', variants: ['transito'], why: 'test' },
    ]);
    expect(found.get('t')).toBe(78);
  });

  it('counts whole words, not substrings', () => {
    // `obrante en el expediente` is boilerplate. Counting `obra` as a substring
    // made that chip claim 166 documents where 150 mention the word.
    const substringish = countTermMentions(documents, [
      { term: 'o', query: 'obra', variants: ['obra', 'obras'], why: 'test' },
    ]);
    expect(substringish.get('o')).toBe(150);
  });
});

describe('the quietest-year sentence when the tie breaks', () => {
  it('drops the plural and "cada uno" once a single year holds the fewest', async () => {
    // Today 2002 and 2012 tie at one document each. The archive syncs weekly,
    // so one more 2002 record leaves 2012 alone — and "2012 tienen 1 documento
    // cada uno" is a plural verb over one item, in copy municipal officials
    // read.
    const container = await AstroContainer.create();
    const stats = {
      ...corpusStats(documents),
      quietestYears: { years: [2012], count: 1 },
    };
    const html = await container.renderToString(ArchiveFacts, {
      props: { stats, longestPages: 207 },
    });

    expect(html).toContain('2012 tiene 1 documento');
    expect(html).not.toContain('cada uno');
  });

  it('separates three or more tied years with commas, not a chain of "y"', async () => {
    // The tie can grow as well as break. `join(' y ')` reads correctly for two
    // and turns into "2002 y 2012 y 2015" for three.
    const container = await AstroContainer.create();
    const stats = {
      ...corpusStats(documents),
      quietestYears: { years: [2002, 2012, 2015], count: 2 },
    };
    const html = await container.renderToString(ArchiveFacts, {
      props: { stats, longestPages: 207 },
    });

    expect(html).toContain('2002, 2012 y 2015 tienen 2 documentos cada uno');
  });
});
