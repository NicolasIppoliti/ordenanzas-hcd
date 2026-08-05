"""Drift and failed-refetch semantics on the object-shaped manifest. Tasks 2b.7, 2b.8."""

from __future__ import annotations

import pytest

from hcd_sync.manifest import upsert_fetch_result


def _ok_record(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "doc_id": "4457-Mesa-de-Gestion-del-Agua",
        "number": 4457,
        "number_variants": [],
        "doc_type": "ordenanza",
        "expediente": None,
        "year": 2026,
        "title": "Mesa de Gestión del Agua",
        "title_source": "listing",
        "anchor_text": "4457 – Mesa de Gestión del Agua",
        "source_url": "https://hcdrosales.gob.ar/…/4457.pdf",
        "source_filename": "4457-Mesa-de-Gestion-del-Agua.pdf",
        "sha256": "aaa",
        "bytes": 100,
        "fetched_at": "2026-08-01T00:00:00Z",
        "status": "ok",
        "text_path": None,
        "cross_references": [],
        "notes": "",
        "last_error": None,
        "last_error_at": None,
    }
    base.update(overrides)
    return base


def test_pending_transitions_to_ok_on_first_fetch() -> None:
    pending = _ok_record(status="pending", sha256=None, bytes=None, fetched_at=None)
    documents = [pending]
    fetch_fields = {
        "sha256": "aaa",
        "bytes": 100,
        "fetched_at": "2026-08-05T00:00:00Z",
        "status": "ok",
        "text_path": None,
        "notes": "",
        "last_error": None,
        "last_error_at": None,
    }
    result = upsert_fetch_result(documents, "4457-Mesa-de-Gestion-del-Agua", fetch_fields)
    assert len(result) == 1
    assert result[0]["status"] == "ok"
    assert result[0]["sha256"] == "aaa"
    assert result[0]["title"] == "Mesa de Gestión del Agua"  # metadata preserved untouched


def test_pending_transitions_to_error_on_first_failed_fetch() -> None:
    """A first-ever failed fetch has no prior 'ok' to preserve; it just records error."""
    pending = _ok_record(status="pending", sha256=None, bytes=None, fetched_at=None)
    fetch_fields = {
        "sha256": None,
        "bytes": None,
        "fetched_at": "2026-08-05T00:00:00Z",
        "status": "error",
        "text_path": None,
        "notes": "HTTP 500",
        "last_error": "HTTP 500",
        "last_error_at": "2026-08-05T00:00:00Z",
    }
    result = upsert_fetch_result([pending], "4457-Mesa-de-Gestion-del-Agua", fetch_fields)
    assert len(result) == 1
    assert result[0]["status"] == "error"
    assert result[0]["last_error"] == "HTTP 500"


def test_failed_refetch_preserves_prior_ok_record() -> None:
    """Task 2b.5/2b.8: bounded retries exhausted -> status error record, prior ok preserved via last_error."""
    existing_ok = _ok_record()
    fetch_fields = {
        "sha256": None,
        "bytes": None,
        "fetched_at": "2026-08-05T00:00:00Z",
        "status": "error",
        "text_path": None,
        "notes": "5xx exhausted",
        "last_error": "5xx exhausted",
        "last_error_at": "2026-08-05T00:00:00Z",
    }
    result = upsert_fetch_result([existing_ok], "4457-Mesa-de-Gestion-del-Agua", fetch_fields)

    assert len(result) == 1
    preserved = result[0]
    assert preserved["status"] == "ok"  # NEVER overwritten by the failed attempt
    assert preserved["sha256"] == "aaa"
    assert preserved["last_error"] == "5xx exhausted"
    assert preserved["last_error_at"] == "2026-08-05T00:00:00Z"


def test_failed_refetch_preserves_prior_no_text_record() -> None:
    """no_text is just as archived as ok — a failed refetch must not lose it either."""
    existing_no_text = _ok_record(status="no_text", text_path=None)
    fetch_fields = {
        "sha256": None,
        "bytes": None,
        "fetched_at": "2026-08-05T00:00:00Z",
        "status": "error",
        "text_path": None,
        "notes": "timeout",
        "last_error": "timeout",
        "last_error_at": "2026-08-05T00:00:00Z",
    }
    result = upsert_fetch_result([existing_no_text], "4457-Mesa-de-Gestion-del-Agua", fetch_fields)
    assert result[0]["status"] == "no_text"
    assert result[0]["last_error"] == "timeout"


def test_drift_preserves_prior_capture_under_dated_id() -> None:
    existing_ok = _ok_record()
    fetch_fields = {
        "sha256": "bbb",  # different checksum -> drift
        "bytes": 200,
        "fetched_at": "2026-09-01T00:00:00Z",
        "status": "ok",
        "text_path": None,
        "notes": "",
        "last_error": None,
        "last_error_at": None,
    }
    result = upsert_fetch_result([existing_ok], "4457-Mesa-de-Gestion-del-Agua", fetch_fields)

    assert len(result) == 2
    by_id = {doc["doc_id"]: doc for doc in result}
    assert "4457-Mesa-de-Gestion-del-Agua@2026-08-01" in by_id
    prior = by_id["4457-Mesa-de-Gestion-del-Agua@2026-08-01"]
    assert prior["sha256"] == "aaa"
    assert "superseded" in prior["notes"]

    current = by_id["4457-Mesa-de-Gestion-del-Agua"]
    assert current["sha256"] == "bbb"
    assert "content drift detected" in current["notes"]


def test_no_drift_when_checksum_unchanged() -> None:
    existing_ok = _ok_record()
    fetch_fields = {
        "sha256": "aaa",  # same checksum -> no drift
        "bytes": 100,
        "fetched_at": "2026-09-01T00:00:00Z",
        "status": "ok",
        "text_path": None,
        "notes": "",
        "last_error": None,
        "last_error_at": None,
    }
    result = upsert_fetch_result([existing_ok], "4457-Mesa-de-Gestion-del-Agua", fetch_fields)
    assert len(result) == 1
    assert result[0]["fetched_at"] == "2026-09-01T00:00:00Z"


def test_unknown_doc_id_raises() -> None:
    with pytest.raises(KeyError):
        upsert_fetch_result([], "unknown", {"status": "ok"})


def test_only_matching_record_is_modified() -> None:
    other = _ok_record(doc_id="other", status="pending", sha256=None)
    target = _ok_record(status="pending", sha256=None, fetched_at=None)
    fetch_fields = {
        "sha256": "ccc",
        "bytes": 50,
        "fetched_at": "2026-08-05T00:00:00Z",
        "status": "ok",
        "text_path": None,
        "notes": "",
        "last_error": None,
        "last_error_at": None,
    }
    result = upsert_fetch_result([other, target], "4457-Mesa-de-Gestion-del-Agua", fetch_fields)
    by_id = {doc["doc_id"]: doc for doc in result}
    assert by_id["other"]["status"] == "pending"
    assert by_id["4457-Mesa-de-Gestion-del-Agua"]["status"] == "ok"
