/** Grouping for the browse-by-year page (DESIGN.md risk 3).
 *
 * A pure function rather than page-inline code, for the same reason
 * `buildYearOptions` in `lib/search.ts` is one: the page reads the manifest
 * itself and takes no props, so anything left inline can only be checked by
 * grepping the source — which verifies no behaviour and breaks on a rename.
 */
import type { ManifestDocument } from './contract';

export interface YearGroup {
  readonly year: number;
  readonly documents: ManifestDocument[];
}

export interface Grouping {
  /** Most recent year first. */
  readonly years: YearGroup[];
  /** Documents whose year the source never stated. Empty when there are none. */
  readonly undated: ManifestDocument[];
}

export function groupByYear(documents: readonly ManifestDocument[]): Grouping {
  // D10 forbids inferring a year, so a document without one cannot be filed
  // under a guess. It goes in its own group — never dropped, because a browse
  // page that claims to hold the whole archive and quietly omits a fifth of it
  // is worse than no browse page at all.
  const byYear = new Map<number, ManifestDocument[]>();
  const undated: ManifestDocument[] = [];
  for (const doc of documents) {
    if (doc.year === null) {
      undated.push(doc);
      continue;
    }
    const group = byYear.get(doc.year);
    if (group === undefined) byYear.set(doc.year, [doc]);
    else group.push(doc);
  }

  // Ordered by `doc_id` so the page is stable across syncs. Manifest order
  // follows the source listing, which reorders; sorting asserts nothing about
  // precedence between two documents of the same year.
  const collate = (a: ManifestDocument, b: ManifestDocument) =>
    a.doc_id.localeCompare(b.doc_id, 'es');
  for (const list of byYear.values()) list.sort(collate);
  undated.sort(collate);

  const years = [...byYear.keys()]
    .sort((a, b) => b - a)
    .map((year) => ({ year, documents: byYear.get(year) ?? [] }));

  return { years, undated };
}
