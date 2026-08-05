"""Drift and failed-refetch semantics for `data/manifest.json`. See
design.md 'Sync mechanics' ("Checksum / drift") and the `manifest.json`
Interfaces/Contracts note.

Ported, never imported, from `votus-plataforma-lla/etl/etl/manifest.py`'s
`upsert_record`, adapted from a bare array keyed by `id` to this project's
object-shaped manifest (`manifest["documents"]`, see `manifest_writer.py`)
keyed by `doc_id` (design.md D13: "Deviation from the votus manifest,
stated: votus persists a bare array. Here it is an object so
`schema_version` and run-level provenance have a home. `upsert_record`
semantics ... are ported unmodified and operate on
`manifest["documents"]`.").

Stated widening from votus: the drift check and the failed-refetch
preservation check both test `existing.status == "ok"` in votus. Here they
test `existing.status in ("ok", "no_text")`. `no_text` is just as much a
successfully archived, checksum-verified copy as `ok` is (design.md:
"`no_text` is a known, expected outcome for the ~16% scanned subset ... it
is never recorded as `error`") — losing a `no_text` record's archived copy
to a later failed re-fetch would be exactly the data-loss bug this rule
exists to prevent for `ok`, just triggered from the other terminal success
state.
"""

from __future__ import annotations

from hcd_sync.json_types import JsonDict

#: Both terminal success states count as "already archived" for drift and
#: failed-refetch purposes — see module docstring.
_ARCHIVED_STATUSES = ("ok", "no_text")


def upsert_fetch_result(
    documents: list[JsonDict], doc_id: str, fetch_fields: JsonDict
) -> list[JsonDict]:
    """Merge `fetch_fields` (one `archive.fetch_and_archive_document` result)
    into the existing record for `doc_id`, preserving its listing-derived
    metadata untouched, and applying drift/failed-refetch semantics.

    - Failed refetch: if this fetch failed (`status == "error"`) and the
      existing record was already archived (`ok`/`no_text`), the existing
      record is PRESERVED AS-IS, with the failure recorded additively via
      `last_error`/`last_error_at` — never overwritten with the failed
      attempt's `None` fields.
    - Drift: if the existing record was already archived and this fetch's
      `sha256` differs from it, the prior capture is kept under
      `{doc_id}@{YYYY-MM-DD}` (dated from the prior record's own
      `fetched_at`) and annotated; the current record moves to the new
      capture, also annotated. Nothing is silently overwritten.
    - Otherwise (first-ever fetch of a `pending` record, or a failed
      refetch of a record with no prior successful archive to protect):
      `fetch_fields` simply replaces the fetch-derived subset in place.

    Raises `KeyError` if `doc_id` has no existing record — every document a
    fetch is ever attempted for must already exist in the manifest as a
    `pending` (or previously archived) record from the listing parse.
    """
    result: list[JsonDict] = []
    replaced = False

    for existing in documents:
        if existing["doc_id"] != doc_id:
            result.append(existing)
            continue

        replaced = True
        existing_status = existing.get("status")

        is_failed_overwrite = (
            fetch_fields.get("status") == "error" and existing_status in _ARCHIVED_STATUSES
        )
        if is_failed_overwrite:
            preserved = dict(existing)
            preserved["last_error"] = fetch_fields.get("notes") or None
            preserved["last_error_at"] = fetch_fields.get("fetched_at")
            result.append(preserved)
            continue

        is_drift = bool(
            existing_status in _ARCHIVED_STATUSES
            and existing.get("sha256")
            and fetch_fields.get("sha256")
            and existing["sha256"] != fetch_fields["sha256"]
        )

        merged = dict(existing)
        merged.update(fetch_fields)

        if is_drift:
            date = (str(existing.get("fetched_at") or ""))[:10] or "unknown"
            prior = dict(existing)
            prior["doc_id"] = f"{existing['doc_id']}@{date}"
            prior_notes = prior.get("notes") or ""
            prior["notes"] = (
                f"{prior_notes} [superseded by newer capture on "
                f"{fetch_fields.get('fetched_at')}]"
            ).strip()
            result.append(prior)

            merged_notes = merged.get("notes") or ""
            merged["notes"] = f"{merged_notes} [content drift detected vs prior capture]".strip()

        result.append(merged)

    if not replaced:
        raise KeyError(
            f"doc_id {doc_id!r} has no existing manifest record; a fetch result "
            "can only be merged into a record already written by the listing parse"
        )

    return result
