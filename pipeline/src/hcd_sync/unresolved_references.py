"""`data/unresolved-references.json` writer. See design.md D5.

Mirrors `unresolved.py`'s pattern for `unresolved-listing-entries.json`:
this run's unresolved candidates are recomputed and written fully each run,
scoped to the documents this run actually extracted.
"""

from __future__ import annotations

from hcd_sync.json_types import JsonDict

SCHEMA_VERSION = 1


def to_json_dict(entries: list[JsonDict]) -> JsonDict:
    return {"schema_version": SCHEMA_VERSION, "entries": entries}
