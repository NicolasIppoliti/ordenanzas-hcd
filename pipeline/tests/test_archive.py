"""`fetch_and_archive_document` + `LocalArchiveStore`. Task 2b.6."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path

import pytest

from hcd_sync.archive import FetchExhaustedError, FetchResponse, fetch_and_archive_document
from hcd_sync.doc_id import DocIdRejected
from hcd_sync.storage import LocalArchiveStore, sha256_of


class _FakeFetcher:
    def __init__(self, response: FetchResponse | Exception) -> None:
        self._response = response
        self.calls: list[str] = []

    def get(self, url: str, *, timeout: float = 60, headers: dict[str, str] | None = None) -> FetchResponse:
        self.calls.append(url)
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


def test_sha256_of_matches_hashlib() -> None:
    data = b"hello world"
    assert sha256_of(data) == hashlib.sha256(data).hexdigest()


def test_local_archive_store_write_read_roundtrip(tmp_path: Path) -> None:
    store = LocalArchiveStore(root=tmp_path)
    store.write("4457-Mesa-de-Gestion-del-Agua", b"%PDF-1.4 stub")
    assert store.exists("4457-Mesa-de-Gestion-del-Agua")
    assert store.read("4457-Mesa-de-Gestion-del-Agua") == b"%PDF-1.4 stub"
    assert (tmp_path / "4457-Mesa-de-Gestion-del-Agua.pdf").exists()


def test_local_archive_store_rejects_path_escape(tmp_path: Path) -> None:
    store = LocalArchiveStore(root=tmp_path)
    with pytest.raises(DocIdRejected):
        store.path_for("../escape")


def test_successful_fetch_archives_and_returns_ok_status(tmp_path: Path) -> None:
    data = b"%PDF-1.4 a real-ish stub\n%%EOF"
    fetcher = _FakeFetcher(FetchResponse(status_code=200, content=data))
    store = LocalArchiveStore(root=tmp_path)

    result = fetch_and_archive_document(
        "4457-Mesa-de-Gestion-del-Agua",
        "https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4457-Mesa-de-Gestion-del-Agua.pdf",
        fetcher=fetcher,
        local_store=store,
        now=datetime(2026, 8, 5, 3, 0, 0, tzinfo=UTC),
    )

    assert result["status"] == "ok"
    assert result["sha256"] == sha256_of(data)
    assert result["bytes"] == len(data)
    assert result["fetched_at"] == "2026-08-05T03:00:00Z"
    assert result["text_path"] is None
    assert result["last_error"] is None
    assert store.read("4457-Mesa-de-Gestion-del-Agua") == data


def test_http_error_status_yields_error_result_and_no_write(tmp_path: Path) -> None:
    fetcher = _FakeFetcher(FetchResponse(status_code=404, content=b""))
    store = LocalArchiveStore(root=tmp_path)

    result = fetch_and_archive_document(
        "Missing", "https://hcdrosales.gob.ar/missing.pdf", fetcher=fetcher, local_store=store
    )

    assert result["status"] == "error"
    assert result["sha256"] is None
    assert "404" in result["notes"]
    assert not store.exists("Missing")


def test_transport_exception_yields_error_result() -> None:
    fetcher = _FakeFetcher(ConnectionError("boom"))
    store = LocalArchiveStore(root=Path("/tmp/unused"))

    result = fetch_and_archive_document(
        "X", "https://hcdrosales.gob.ar/x.pdf", fetcher=fetcher, local_store=store
    )

    assert result["status"] == "error"
    assert "boom" in result["notes"]


def test_fetch_exhausted_error_is_not_swallowed(tmp_path: Path) -> None:
    """`FetchExhaustedError` propagates uncaught so the caller can stop the run."""

    class _ExhaustingFetcher:
        def get(self, url: str, *, timeout: float = 60, headers: dict[str, str] | None = None) -> FetchResponse:
            raise FetchExhaustedError("exhausted")

    store = LocalArchiveStore(root=tmp_path)
    with pytest.raises(FetchExhaustedError):
        fetch_and_archive_document(
            "X", "https://hcdrosales.gob.ar/x.pdf", fetcher=_ExhaustingFetcher(), local_store=store
        )
