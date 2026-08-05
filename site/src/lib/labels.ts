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
 * D4/D8/D12 heading rule: an ordinance number is only ever present on an
 * `ordenanza` record (D8 rule 1), so the identifier slot reads
 * `Ordenanza {n}` when a number exists, and `{Etiqueta}` otherwise — never
 * both, never a substitute number, never `Sin título` standing in as a name.
 */
export function formatDocIdentifier(
  doc: { readonly doc_type: DocType; readonly number: number | null }
): string {
  return doc.number !== null ? `Ordenanza ${doc.number}` : DOC_TYPE_LABELS[doc.doc_type];
}

export function formatDocHeading(
  doc: { readonly doc_type: DocType; readonly number: number | null; readonly title: string | null }
): string {
  const identifier = formatDocIdentifier(doc);
  return doc.title ? `${identifier} — ${doc.title}` : identifier;
}
