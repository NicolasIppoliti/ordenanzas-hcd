"""Local filesystem archive storage for fetched PDFs. See design.md 'Sync mechanics'.

Ported, never imported, from `votus-plataforma-lla/etl/etl/storage.py`, scoped down:
this project has no per-capability subdirectory and no ZIP extraction. Every
archived PDF is keyed directly by its validated `doc_id` under a single
`archive/` root — gitignored scratch; the committed `manifest.json` is the
durable cache (design.md 'Sync mechanics': "archive/ is per-run scratch and
gitignored, so no CI cache restore is needed").
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from hcd_sync.doc_id import resolve_and_assert_contained


def sha256_of(data: bytes) -> str:
    """Return the hex-encoded SHA-256 digest of `data`."""
    return hashlib.sha256(data).hexdigest()


@dataclass(frozen=True)
class LocalArchiveStore:
    """Writes fetched PDF bytes to `root/{doc_id}.pdf`.

    `path_for` reuses `doc_id.resolve_and_assert_contained` — the second,
    independent containment barrier the Threat Matrix requires on every
    write, regardless of whether `validate_doc_id` already ran upstream.
    """

    root: Path

    def path_for(self, doc_id: str) -> Path:
        return resolve_and_assert_contained(self.root, f"{doc_id}.pdf")

    def write(self, doc_id: str, data: bytes) -> Path:
        target = self.path_for(doc_id)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return target

    def exists(self, doc_id: str) -> bool:
        return self.path_for(doc_id).exists()

    def read(self, doc_id: str) -> bytes:
        return self.path_for(doc_id).read_bytes()
