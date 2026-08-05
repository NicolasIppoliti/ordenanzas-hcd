// Ordinance-search spec + design.md D8/D12/"Build cost at 1,038 pages": pure
// helpers shared by the pages that write Pagefind filter values
// (`documento/[doc_id].astro`) and the page that reads them back
// (`buscar.astro`). Kept framework-free so the no-fabrication and
// no-excerpt-for-no_text rules are unit-testable without a live index.
import type { DocType, ManifestDocument, Status } from './contract';
import { DOC_TYPE_LABELS } from './labels';

/** The `texto` filter has exactly two values — never a status-shaped enum,
 * because search only ever needs to know whether a result has indexed body
 * text, not which of `no_text`/`pending`/`error` produced the absence. */
export const TEXTO_CON = 'Con texto indexado';
export const TEXTO_SIN = 'Sin texto indexado';

/** Requirement "The type filter exposes every type in the corpus": exactly
 * these seven, in this order — matches the Spanish label order in D8/D12. */
export const TYPE_FILTER_OPTIONS: readonly DocType[] = [
  'ordenanza',
  'convenio',
  'decreto',
  'resolucion',
  'anexo',
  'preparatoria',
  'sin clasificar',
];

/** Requirement "The type filter exposes every type in the corpus" pins this
 * exact compact set for the filter chooser's visible option text — D8's
 * fuller "Documento sin clasificar" remains reserved for labelling an
 * actual document. The underlying filter *value* stays `DOC_TYPE_LABELS`
 * (see buscar.astro), so filtering still matches what each page wrote. */
export const TYPE_FILTER_LABELS: Record<DocType, string> = {
  ordenanza: 'Ordenanza',
  convenio: 'Convenio',
  decreto: 'Decreto',
  resolucion: 'Resolución',
  anexo: 'Anexo',
  preparatoria: 'Preparatoria',
  'sin clasificar': 'Sin clasificar',
};

export const EMPTY_QUERY_MESSAGE = 'Escribí un término para buscar en el archivo, o elegí un filtro.';
export const NO_RESULTS_MESSAGE = 'No se encontraron documentos. Probá con otro término o revisá los filtros.';
export const NO_TEXT_MARKER = 'Sin texto indexado.';

/** Only `ok` documents were ever extracted with text (data.ts / D2/D13);
 * `no_text`, `pending` and `error` all mean "nothing indexed", so they share
 * one filter value rather than leaking a four-way status enum into the UI. */
export function getTextoFilterValue(status: Status): string {
  return status === 'ok' ? TEXTO_CON : TEXTO_SIN;
}

/** D10: never infer a year — an absent year buckets under the explicit
 * Spanish label, exactly as the year-filter requirement scenario states. */
export function getAnioFilterValue(year: number | null): string {
  return year !== null ? String(year) : 'Año no determinado';
}

/** D8's label set is the single source of truth for the type filter too —
 * reusing it here is what guarantees a convenio can never render as an
 * Ordenanza in search results. */
export function getTipoFilterValue(docType: DocType): string {
  return DOC_TYPE_LABELS[docType];
}

/** Distinct years present in the corpus, descending, with the
 * "Año no determinado" bucket last and only when at least one record has no
 * year — never rendered for a corpus where every record is dated. */
export function buildYearOptions(documents: readonly ManifestDocument[]): string[] {
  const years = new Set<number>();
  let hasUndated = false;
  for (const doc of documents) {
    if (doc.year !== null) years.add(doc.year);
    else hasUndated = true;
  }
  const sorted = [...years].sort((a, b) => b - a).map(String);
  return hasUndated ? [...sorted, 'Año no determinado'] : sorted;
}

/** Shape of the object returned by a Pagefind result's `data()` call — kept
 * minimal and local rather than importing Pagefind's own types, since the
 * runtime bundle is loaded dynamically at request time (design.md
 * Accessibility and Mobile Payload), not as a build-time dependency. */
export interface RawSearchResultData {
  readonly url: string;
  readonly excerpt: string;
  readonly meta: Readonly<Record<string, string>>;
  readonly filters: Readonly<Record<string, readonly string[]>>;
}

export interface DisplayResult {
  readonly url: string;
  readonly title: string;
  readonly tipo: string;
  readonly anio: string;
  readonly hasIndexedText: boolean;
  readonly excerpt: string | null;
}

/**
 * Requirement "Metadata-Only Results Explicitly Marked": a `no_text`
 * document must never present as if it matched full text, even though
 * Pagefind may still generate an excerpt from the heading/metadata text
 * present in its indexed region. This function is the single place that
 * enforces the rule, so it stays true regardless of what Pagefind returns.
 */
export function toDisplayResult(raw: RawSearchResultData): DisplayResult {
  const tipo = raw.filters.tipo?.[0] ?? '';
  const anio = raw.filters.anio?.[0] ?? '';
  const texto = raw.filters.texto?.[0] ?? TEXTO_CON;
  const hasIndexedText = texto === TEXTO_CON;
  return {
    url: raw.url,
    title: raw.meta.title ?? raw.url,
    tipo,
    anio,
    hasIndexedText,
    excerpt: hasIndexedText ? raw.excerpt : null,
  };
}
