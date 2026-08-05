// D5/D7 (design.md): cross-references are stored as directed evidence
// (a number, not a doc_id) but rendered undirected — see the
// cross-references capability spec. Resolution is number -> SET of
// doc_ids, never number -> doc_id, so a number two records share links
// both. No verb, no direction, no "best match".
import type { DocType, ManifestDocument } from './contract';

export interface RelatedTarget {
  readonly doc_id: string;
  readonly doc_type: DocType;
  readonly number: number | null;
  readonly title: string | null;
}

function sortTargets(targets: RelatedTarget[]): RelatedTarget[] {
  return [...targets].sort((a, b) => {
    if (a.number === null && b.number === null) return a.doc_id.localeCompare(b.doc_id);
    if (a.number === null) return 1;
    if (b.number === null) return -1;
    if (a.number !== b.number) return a.number - b.number;
    return a.doc_id.localeCompare(b.doc_id);
  });
}

/**
 * Build the full related() index in one pass over the manifest.
 * related(d) = { e : e in refs(d) } ∪ { e : d in refs(e) }, deduplicated.
 */
export function buildRelatedIndex(
  documents: readonly ManifestDocument[]
): Map<string, RelatedTarget[]> {
  const byNumber = new Map<number, ManifestDocument[]>();
  for (const doc of documents) {
    if (doc.number !== null) {
      const list = byNumber.get(doc.number) ?? [];
      list.push(doc);
      byNumber.set(doc.number, list);
    }
  }
  const byId = new Map(documents.map((doc) => [doc.doc_id, doc] as const));

  // Directed evidence: doc_id -> set of doc_ids its own cross_references resolve to.
  const refsOut = new Map<string, Set<string>>();
  for (const doc of documents) {
    const targets = new Set<string>();
    for (const ref of doc.cross_references) {
      const matches = byNumber.get(ref.number);
      if (!matches) continue;
      for (const match of matches) {
        if (match.doc_id === doc.doc_id) continue; // self-reference never links
        targets.add(match.doc_id);
      }
    }
    refsOut.set(doc.doc_id, targets);
  }

  // Undirected union, collapsed at build time (design.md D5).
  const union = new Map<string, Set<string>>();
  for (const doc of documents) union.set(doc.doc_id, new Set(refsOut.get(doc.doc_id)));
  for (const [source, targets] of refsOut) {
    for (const target of targets) {
      union.get(target)?.add(source);
    }
  }

  const index = new Map<string, RelatedTarget[]>();
  for (const [docId, targetIds] of union) {
    const targets = Array.from(targetIds)
      .map((id) => byId.get(id))
      .filter((doc): doc is ManifestDocument => doc !== undefined)
      .map((doc) => ({
        doc_id: doc.doc_id,
        doc_type: doc.doc_type,
        number: doc.number,
        title: doc.title,
      }));
    index.set(docId, sortTargets(targets));
  }
  return index;
}

export function related(documents: readonly ManifestDocument[], docId: string): RelatedTarget[] {
  return buildRelatedIndex(documents).get(docId) ?? [];
}
