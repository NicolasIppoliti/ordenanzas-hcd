/** The measured facts the home page opens with, and the search shortcuts.
 *
 * Everything here is computed from the corpus at build time. A figure typed
 * into markup is a figure that goes stale silently the week the archive grows,
 * and this project has already shipped four of those.
 */
import { getDocuments, loadDocumentBody } from './data';
import type { ManifestDocument } from './contract';

export interface CorpusStats {
  readonly total: number;
  readonly withText: number;
  readonly withoutText: number;
  readonly firstYear: number;
  readonly lastYear: number;
  readonly undated: number;
  /** Every year that ties for the most documents, and that count. Plural for the
   *  same reason as the quiet end: naming one side of a tie asserts something
   *  the data does not. 2021 leads today at 108, one ordinary week from a tie. */
  readonly busiestYears: { readonly years: readonly number[]; readonly count: number };
  /** Every year that ties for the fewest documents, and that count. Plural
   *  because 2002 and 2012 both hold exactly one, and naming either alone would
   *  be a claim the data does not make. */
  readonly quietestYears: { readonly years: readonly number[]; readonly count: number };
  readonly longest: {
    readonly doc_id: string;
    /** Raw extracted length. */
    readonly characters: number;
    /** Trimmed length — what the document page reports for the same record. */
    readonly trimmedCharacters: number;
  };
}

/** A search the home page offers as a starting point.
 *
 * THE SELECTION RULE, because a chosen list without one is taste with numbers
 * attached:
 *
 * 1. The term names a matter a municipality actually legislates on, so a
 *    resident arriving with a real question lands somewhere useful.
 * 2. At least 40 documents mention it. A shortcut leading to four results makes
 *    the archive look empty on a subject it covers.
 * 3. It is offered as a SEARCH, never as a category. "Documentos que mencionan
 *    obras" is a count this file measures; "ordenanzas de obras" would be a
 *    classification nobody made, which is the same fabrication as an invented
 *    title.
 *
 * Authorised by DESIGN.md — "Composition and voice", and the Decisions Log
 * entry of 2026-08-05, "Shortcut terms chosen, not calculated". The
 * no-editorial-layer rule bans ranking or highlighting the CONTENT of the
 * archive; these are navigation shortcuts into a search, and the design
 * document is where that distinction is drawn.
 *
 * Why the list is chosen rather than calculated: ranking the corpus by term
 * frequency returns the letterhead every document repeats — rosales, coronel,
 * concejo, deliberante, comuníquese, regístrese, archívese, and the contact
 * gmail. That ranking describes the template, not the content, and it would
 * send a reader nowhere. Measured, not assumed.
 */
export interface ShortcutTerm {
  /** What the chip shows. */
  readonly term: string;
  /** What the chip searches for when a reader taps it. */
  readonly query: string;
  /**
   * The word forms that count as a mention. Whole words only: a substring match
   * on `obra` also counts `obrante`, which is boilerplate ("obrante en el
   * expediente") and would have inflated that chip from 150 to 166.
   */
  readonly variants: readonly string[];
  /** Why it earned a place, per the rule above. */
  readonly why: string;
}

export const SHORTCUT_TERMS: readonly ShortcutTerm[] = [
  {
    term: 'salud',
    query: 'salud',
    variants: ['salud'],
    why: 'municipal health services and facilities',
  },
  {
    term: 'obras',
    query: 'obras',
    variants: ['obra', 'obras'],
    why: 'public works are a core municipal competence',
  },
  {
    term: 'seguridad',
    query: 'seguridad',
    variants: ['seguridad'],
    why: 'local policing and public safety measures',
  },
  {
    term: 'cultura',
    query: 'cultura',
    variants: ['cultura', 'cultural', 'culturales'],
    why: 'cultural programmes and venues the municipality runs',
  },
  {
    term: 'tasas',
    query: 'tasa',
    variants: ['tasa', 'tasas'],
    why: 'the rates a resident pays, and the commonest lookup of all',
  },
  {
    term: 'tránsito',
    query: 'tránsito',
    variants: ['transito'],
    why: 'traffic and parking rules',
  },
  {
    term: 'habilitaciones',
    query: 'habilitación',
    variants: ['habilitacion', 'habilitaciones', 'habilitar'],
    why: 'business and building permits',
  },
  {
    term: 'agua',
    query: 'agua',
    variants: ['agua', 'aguas'],
    why: 'water supply and sanitation',
  },
];

/** Fold accents and case so `tránsito` and `transito` are the same word.
 *
 * The range is written as escapes, not as literal combining marks: a formatter
 * or a git filter that NFC-normalises this file would fold raw marks into the
 * `[` and `-` around them, silently changing what the class matches. The counts
 * would keep rendering, just wrong — the exact failure this file exists to
 * prevent.
 *
 * PDF extraction is inconsistent about accents in this corpus, and a reader
 * means the same thing by either spelling. Measured as whole words: 78 documents
 * carry `tránsito`, 4 carry `transito`, and all 4 of those also carry the
 * accented form — so folding changes no count today and protects every one of
 * them tomorrow. (An earlier note here claimed 26, counted as a substring,
 * which was matching `transitorio`.) */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase();
}

/** How many documents mention each term, over the whole corpus. */
export function countTermMentions(
  documents: readonly ManifestDocument[],
  terms: readonly ShortcutTerm[]
): Map<string, number> {
  const counts = new Map(terms.map((term) => [term.term, 0]));
  const patterns = terms.map((term) => ({
    key: term.term,
    // Whole words: `\bobra\b` and not `obra`, so `obrante` — which appears in
    // the boilerplate of hundreds of documents — is not counted as a mention.
    match: new RegExp(`\\b(?:${term.variants.map(fold).join('|')})\\b`),
  }));

  for (const doc of documents) {
    const body = loadDocumentBody(doc);
    if (body === null) continue;
    const haystack = fold(body.text);
    for (const { key, match } of patterns) {
      if (match.test(haystack)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

export function corpusStats(documents: readonly ManifestDocument[]): CorpusStats {
  const years = documents.map((doc) => doc.year).filter((year): year is number => year !== null);
  // Fail loudly rather than rendering `Infinity` and an empty tie list into the
  // page. Unreachable against the shipped manifest, where 815 records carry a
  // year — which is exactly why a silent version of this would never be noticed.
  if (years.length === 0) {
    throw new Error('corpusStats: no record carries a year, so no year fact can be stated');
  }
  const perYear = new Map<number, number>();
  for (const year of years) perYear.set(year, (perYear.get(year) ?? 0) + 1);

  const most = Math.max(...perYear.values());
  const busiestYears = {
    years: [...perYear.entries()]
      .filter(([, count]) => count === most)
      .map(([year]) => year)
      .sort((a, b) => a - b),
    count: most,
  };

  const fewest = Math.min(...perYear.values());
  const quietestYears = {
    years: [...perYear.entries()]
      .filter(([, count]) => count === fewest)
      .map(([year]) => year)
      .sort((a, b) => a - b),
    count: fewest,
  };

  let withText = 0;
  let longest = { doc_id: '', characters: 0, trimmedCharacters: 0 };
  for (const doc of documents) {
    const body = loadDocumentBody(doc);
    // Trimmed, because the detail page treats a whitespace-only body as textless
    // and says so. Counting it here as "con el texto completo adentro" would
    // have the home promising what the document page denies.
    if (body === null || body.text.trim() === '') continue;
    withText += 1;
    // Selected on the TRIMMED length, which is the number both surfaces show.
    // Selecting on the raw length would let a document with more leading
    // whitespace beat one with more actual text — the corpus carries a median
    // of 31 blank characters before the first word, and no upper bound.
    if (body.text.trim().length > longest.trimmedCharacters) {
      longest = {
        doc_id: doc.doc_id,
        characters: body.text.length,
        trimmedCharacters: body.text.trim().length,
      };
    }
  }

  // The same contract as the year guard above: with no readable body there is no
  // longest document, and `longest.doc_id` would stay empty — which renders "0
  // caracteres" under a card that promises the longest document, behind a link
  // to `/documento/`. A partial sync is exactly when nobody would notice.
  if (withText === 0) {
    throw new Error('corpusStats: no record has a readable body, so no size fact can be stated');
  }

  return {
    total: documents.length,
    withText,
    withoutText: documents.length - withText,
    firstYear: Math.min(...years),
    lastYear: Math.max(...years),
    undated: documents.length - years.length,
    busiestYears,
    quietestYears,
    longest,
  };
}

/** Both computations, so a page asks for them once.
 *
 * Each computation walks all 1,038 records and asks each for a body, so the pair
 * costs 2,076 `loadDocumentBody` calls — 1,788 that return text and 288 that
 * return null for the 144 records with none. Measured at roughly a tenth of a
 * second on a build that takes 1.1s in total. Folding them into one pass would
 * save that and cost the two functions their independence; the tests below
 * exercise each on its own. */
export function homeHighlights(documents: readonly ManifestDocument[] = getDocuments()): {
  stats: CorpusStats;
  shortcuts: ReadonlyArray<ShortcutTerm & { count: number }>;
} {
  const counts = countTermMentions(documents, SHORTCUT_TERMS);
  return {
    stats: corpusStats(documents),
    shortcuts: SHORTCUT_TERMS.map((term) => ({ ...term, count: counts.get(term.term) ?? 0 })),
  };
}
