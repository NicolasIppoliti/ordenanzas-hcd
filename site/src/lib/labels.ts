// Spanish, neutral-register labels for doc_type (D8/D12). Shared by
// DocCard, the detail page and the (4b) search filter, so the label set
// stays in exactly one place.
import type { DocType } from './contract';

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  ordenanza: 'Ordenanza',
  convenio: 'Convenio',
  resolucion: 'Resolución',
  decreto: 'Decreto',
  anexo: 'Anexo',
  preparatoria: 'Preparatoria',
  'sin clasificar': 'Documento sin clasificar',
};

/**
 * D4/D8/D12 heading rule: the identifier slot reads `{Etiqueta} {n}` when a
 * number exists and `{Etiqueta}` otherwise — never both, never a substitute
 * number, never `Sin título` standing in as a name.
 *
 * The label comes from `doc_type` rather than being hard-coded to "Ordenanza".
 * D8 rule 1 says only an `ordenanza` carries a number, and the corpus agrees
 * today — 0 of the 51 non-ordinances have one, asserted in `labels.test.ts`.
 * But an invariant enforced nowhere is an invariant that fails silently: the
 * first convenio to arrive with a number would have rendered `Ordenanza 4457`
 * in an `<h1>`, a `<title>` and every list on the site. Reading the type costs
 * nothing and renders identically for all 1,038 records today.
 */
export function formatDocIdentifier(
  doc: { readonly doc_type: DocType; readonly number: number | null }
): string {
  const label = DOC_TYPE_LABELS[doc.doc_type];
  return doc.number !== null ? `${label} ${doc.number}` : label;
}

export function formatDocHeading(
  doc: { readonly doc_type: DocType; readonly number: number | null; readonly title: string | null }
): string {
  const identifier = formatDocIdentifier(doc);
  return doc.title ? `${identifier} — ${doc.title}` : identifier;
}

/** The URL of a document page.
 *
 * `doc_id` is a remote-controlled string — it comes from the HCD's own filenames
 * — and here it becomes a URL segment. It is percent-encoded rather than
 * interpolated raw: today's ids happen to be safe apart from a `°`, and "the
 * data happens to be safe today" is exactly the reasoning behind the four
 * hardening rules this project has already had to fix. A `/` never reaches this
 * function — D7 rejects such an id at ingestion rather than sanitising it — so
 * the encoder never has to round-trip one. (It would encode it as `%2F`, which
 * is the correct thing to do with a literal slash inside a single segment, and
 * the wrong thing for a path separator.)
 */
export function documentHref(docId: string): string {
  return `/documento/${encodeURIComponent(docId)}`;
}
