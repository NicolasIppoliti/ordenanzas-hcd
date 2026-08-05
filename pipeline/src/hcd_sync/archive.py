"""Fetch -> sha256 -> `archive/{doc_id}.pdf` -> fetch-result fields.

Ported, never imported, from `votus-plataforma-lla/etl/etl/archive.py`. The
`Fetcher` Protocol here is the seam every fake fetcher in the test suite
implements (design.md Testing Strategy) instead of ever opening a real
socket (`tests/conftest.py`'s autouse network guard forbids that).

PR2b never runs PyMuPDF — that is Phase 3's `extract.py`. A successfully
archived PDF is recorded here as `status: "ok"` regardless of its text
content, with `text_path` left `null`. Phase 3's extraction later downgrades
a subset of these to `"no_text"` once real text extraction runs. This keeps
PR2b's `status` field honest about what it actually checked (bytes
retrieved, checksum verified) instead of pretending to have read the PDF.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

from hcd_sync.json_types import JsonDict
from hcd_sync.storage import LocalArchiveStore, sha256_of


class Fetcher(Protocol):
    """Minimal fetch surface, swappable with a fake in tests."""

    def get(
        self, url: str, *, timeout: float = 60, headers: dict[str, str] | None = None
    ) -> FetchResponse: ...


@dataclass
class FetchResponse:
    status_code: int
    content: bytes
    headers: dict[str, str] = field(default_factory=dict)


class FetchExhaustedError(Exception):
    """Raised by a retrying fetcher (see `http_client.BoundedRetryFetcher`)
    when a document request has failed on every bounded attempt.

    Defined here, not in `http_client.py`, so `http_client` can import
    `Fetcher`/`FetchResponse` from this module without a circular import.
    """


def _now_iso(now: datetime | None) -> str:
    return (now or datetime.now(UTC)).strftime("%Y-%m-%dT%H:%M:%SZ")


def error_fetch_result(fetched_at: str, note: str) -> JsonDict:
    """Build the fetch-result fields for a failed attempt.

    `last_error`/`last_error_at` are set directly on this result (not only
    via `manifest.upsert_fetch_result`'s failed-overwrite branch), so a
    first-ever failed fetch of a `pending` record is just as informative as
    a failed re-fetch of an already-archived one.
    """
    return {
        "sha256": None,
        "bytes": None,
        "fetched_at": fetched_at,
        "status": "error",
        "text_path": None,
        "notes": note,
        "last_error": note,
        "last_error_at": fetched_at,
    }


def fetch_and_archive_document(
    doc_id: str,
    source_url: str,
    *,
    fetcher: Fetcher,
    local_store: LocalArchiveStore,
    now: datetime | None = None,
) -> JsonDict:
    """Fetch one document and return its fetch-result fields only.

    Returns a dict carrying exactly `sha256`, `bytes`, `fetched_at`,
    `status`, `text_path`, `notes`, `last_error`, `last_error_at` — the
    fetch-derived subset of a manifest record. Callers merge this into the
    existing record via `manifest.upsert_fetch_result`, which owns the
    drift/failed-refetch semantics.

    `FetchExhaustedError` (bounded retries exhausted, see
    `http_client.BoundedRetryFetcher`) is deliberately NOT swallowed here:
    it propagates so the caller can both record this document as `"error"`
    and stop attempting further new documents this run (design.md, "Polite
    Crawling Policy": "Persistent fetch failure stops the run").
    """
    fetched_at = _now_iso(now)

    try:
        response = fetcher.get(source_url, timeout=60, headers={})
    except FetchExhaustedError:
        raise
    except Exception as exc:  # noqa: BLE001 -- any transport failure (network
        # error, DNS failure, timeout, ...) becomes an honest "error" manifest
        # record rather than crashing the whole run; ported from votus's
        # archive_source, which catches the same way for the same reason.
        return error_fetch_result(fetched_at, f"fetch failed: {exc}")

    if response.status_code >= 400:
        return error_fetch_result(fetched_at, f"HTTP {response.status_code}")

    data = response.content
    digest = sha256_of(data)
    local_store.write(doc_id, data)

    return {
        "sha256": digest,
        "bytes": len(data),
        "fetched_at": fetched_at,
        "status": "ok",
        "text_path": None,
        "notes": "",
        "last_error": None,
        "last_error_at": None,
    }

