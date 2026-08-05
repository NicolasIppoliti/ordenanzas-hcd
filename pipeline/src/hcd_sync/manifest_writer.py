"""`data/manifest.json` writer. See design.md Interfaces/Contracts.

PR2a writes only the fields derivable purely from the listing (no network
call is ever made). Fetch-derived fields (`sha256`, `bytes`, `fetched_at`,
`status`, `text_path`, `cross_references`) are populated by PR2b's fetcher
and PR3's extraction; here they are set to an honest "not yet fetched"
placeholder. `status: "pending"` is used for this — the documented enum
(`ok | no_text | error`) has no value meaning "not yet attempted", and
claiming any of those three would be inaccurate for a record no PR2a code
has ever tried to fetch. This is called out as a deviation in the apply
report.
"""

from __future__ import annotations

from hcd_sync.doc_meta import DocMeta
from hcd_sync.json_types import JsonDict

SCHEMA_VERSION = 1
SOURCE_HOST = "hcdrosales.gob.ar"


def doc_meta_to_json_dict(meta: DocMeta) -> JsonDict:
    return {
        "doc_id": meta.doc_id,
        "number": meta.number,
        "number_variants": list(meta.number_variants),
        "doc_type": meta.doc_type,
        "expediente": meta.expediente,
        "year": meta.year,
        "title": meta.title,
        "title_source": meta.title_source,
        "anchor_text": meta.anchor_text,
        "source_url": meta.source_url,
        "source_filename": meta.source_filename,
        "sha256": None,
        "bytes": None,
        "fetched_at": None,
        "status": "pending",
        "text_path": None,
        "cross_references": [],
        "notes": "",
        "last_error": None,
        "last_error_at": None,
    }


def upsert_new_records(
    previous_documents: list[JsonDict], new_records: list[JsonDict]
) -> list[JsonDict]:
    """Upsert-of-new-records-only: an existing `doc_id` is left untouched.

    Drift and failed-refetch semantics are ported onto this shape in PR2b.
    """
    existing_ids = {doc["doc_id"] for doc in previous_documents}
    merged = list(previous_documents)
    for record in new_records:
        if record["doc_id"] not in existing_ids:
            merged.append(record)
    return merged


def build_manifest(
    generated_at: str, documents: list[JsonDict], source_host: str = SOURCE_HOST
) -> JsonDict:
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "source_host": source_host,
        "documents": documents,
    }
