"""Append-only doc_id alias map. Task 2a.27, 2a.28, 2a.29."""

from __future__ import annotations

import pytest

from hcd_sync.aliases import AliasRecord, AliasRewriteError, build_alias_map, compute_new_aliases
from hcd_sync.listing import ListingEntry


def test_doc_id_change_across_runs_becomes_an_alias() -> None:
    """Task 2a.27: a record whose doc_id changes -> previous id becomes an alias."""
    previous_documents = [{"doc_id": "3298", "source_url": "https://hcdrosales.gob.ar/wp-content/uploads/2021/11/3298.pdf"}]
    current_entries = [
        ListingEntry(
            doc_id="3298--2021-11",
            number=3298,
            url="https://hcdrosales.gob.ar/wp-content/uploads/2021/11/3298.pdf",
            filename="3298.pdf",
            anchor_text="3298",
        )
    ]
    new_aliases = compute_new_aliases(previous_documents, current_entries, now="2026-08-05T00:00:00Z")
    assert len(new_aliases) == 1
    assert new_aliases[0].alias == "3298"
    assert new_aliases[0].target == "3298--2021-11"


def test_aliases_survive_two_consecutive_runs_untouched() -> None:
    """Task 2a.28: every alias from run 1 survives run 2 byte-identical."""
    existing = [AliasRecord(alias="3298", target="3298--2021-11", created_at="2026-08-05T00:00:00Z", reason="doc_id_collision")]
    merged = build_alias_map(existing, new_records=[])
    assert merged == existing

    # Idempotent resubmission of the same alias/target pair is a no-op, not a duplicate.
    resubmitted = build_alias_map(
        existing,
        [AliasRecord(alias="3298", target="3298--2021-11", created_at="2026-08-06T00:00:00Z", reason="doc_id_collision")],
    )
    assert len(resubmitted) == 1
    assert resubmitted[0].created_at == "2026-08-05T00:00:00Z"  # unchanged


def test_repointing_an_alias_raises_instead_of_writing() -> None:
    """Task 2a.28: a rewrite that would repoint an entry raises instead of writing."""
    existing = [AliasRecord(alias="3298", target="3298--2021-11", created_at="2026-08-05T00:00:00Z", reason="doc_id_collision")]
    with pytest.raises(AliasRewriteError):
        build_alias_map(
            existing,
            [AliasRecord(alias="3298", target="3298--2021-12", created_at="2026-08-06T00:00:00Z", reason="doc_id_collision")],
        )


def test_invalid_alias_string_is_rejected_before_writing() -> None:
    """Task 2a.29: an alias string failing D7 validation is rejected before it is written."""
    with pytest.raises(AliasRewriteError):
        build_alias_map(
            [],
            [AliasRecord(alias="../../etc/passwd", target="safe-id", created_at="2026-08-05T00:00:00Z", reason="doc_id_collision")],
        )
