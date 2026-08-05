"""`data/unresolved-listing-entries.json` writer. See design.md D7."""

from __future__ import annotations

from hcd_sync.json_types import JsonDict
from hcd_sync.listing import RejectedListingEntry

SCHEMA_VERSION = 1


def to_json_dict(rejected: list[RejectedListingEntry]) -> JsonDict:
    return {
        "schema_version": SCHEMA_VERSION,
        "entries": [
            {"url": entry.url, "filename": entry.filename, "reason": entry.reason}
            for entry in rejected
        ],
    }
