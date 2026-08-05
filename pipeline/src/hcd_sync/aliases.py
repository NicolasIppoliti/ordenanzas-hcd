"""`data/doc-id-aliases.json` — append-only doc_id alias map. See design.md D11."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import cast

from hcd_sync.doc_id import DocIdRejected, validate_doc_id
from hcd_sync.json_types import JsonDict
from hcd_sync.listing import ListingEntry

SCHEMA_VERSION = 1


class AliasRewriteError(RuntimeError):
    """Raised when a write would delete, repoint or reuse an existing alias."""


@dataclass(frozen=True)
class AliasRecord:
    alias: str
    target: str
    created_at: str
    reason: str


def compute_new_aliases(
    previous_documents: list[JsonDict],
    current_entries: Sequence[ListingEntry],
    now: str,
    reason: str = "doc_id_changed",
) -> list[AliasRecord]:
    """Detect a doc_id change across runs by matching `source_url`.

    A record whose `doc_id` changed between the previous manifest and this
    run's listing entries produces one alias: the previous id -> the new id.
    """
    previous_by_url = {doc["source_url"]: doc["doc_id"] for doc in previous_documents}

    new_aliases: list[AliasRecord] = []
    for entry in current_entries:
        previous_doc_id = previous_by_url.get(entry.url)
        if previous_doc_id is not None and previous_doc_id != entry.doc_id:
            new_aliases.append(
                AliasRecord(
                    alias=cast("str", previous_doc_id),
                    target=entry.doc_id,
                    created_at=now,
                    reason=reason,
                )
            )
    return new_aliases


def build_alias_map(
    existing: list[AliasRecord], new_records: list[AliasRecord]
) -> list[AliasRecord]:
    """Merge `new_records` into `existing`, enforcing the D11 invariants.

    Append-only: an existing entry is never removed. Never repointed: a
    write that would change an existing alias's target raises. Idempotent:
    re-submitting the same alias/target pair is a no-op, not a duplicate.
    Every alias string MUST pass the same D7 path-safety rule as a live
    `doc_id`, validated before it is written.
    """
    by_alias: dict[str, AliasRecord] = {record.alias: record for record in existing}
    merged = list(existing)

    for record in new_records:
        try:
            validate_doc_id(record.alias)
        except DocIdRejected as exc:
            raise AliasRewriteError(
                f"alias {record.alias!r} fails path-safety validation: {exc}"
            ) from exc

        prior = by_alias.get(record.alias)
        if prior is not None:
            if prior.target != record.target:
                raise AliasRewriteError(
                    f"alias {record.alias!r} already targets {prior.target!r}; "
                    f"refusing to repoint it to {record.target!r}"
                )
            continue

        by_alias[record.alias] = record
        merged.append(record)

    return merged


def to_json_dict(generated_at: str, aliases: list[AliasRecord]) -> JsonDict:
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "aliases": [
            {
                "alias": record.alias,
                "target": record.target,
                "created_at": record.created_at,
                "reason": record.reason,
            }
            for record in aliases
        ],
    }


def from_json_dict(data: JsonDict) -> list[AliasRecord]:
    return [
        AliasRecord(
            alias=cast("str", entry["alias"]),
            target=cast("str", entry["target"]),
            created_at=cast("str", entry["created_at"]),
            reason=cast("str", entry["reason"]),
        )
        for entry in cast("list[JsonDict]", data.get("aliases", []))
    ]
