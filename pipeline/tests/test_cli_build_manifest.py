"""Acceptance test for PR2a: offline listing -> manifest. Task 2a.31."""

from __future__ import annotations

import json
from pathlib import Path

from hcd_sync.cli import main

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "listing-2026-08-04.html"


def test_build_manifest_offline_emits_1038_records_with_zero_sockets(tmp_path, monkeypatch) -> None:
    """Running the offline path against the real fixture emits a complete manifest.

    Every title, number, type and year is populated per spec (nullable
    where the source does not carry the value), and the network guard
    (autouse in conftest.py) proves zero socket attempts occur.
    """
    data_dir = tmp_path / "data"
    exit_code = main(["build-manifest", "--listing-file", str(FIXTURE_PATH), "--data-dir", str(data_dir)])
    assert exit_code == 0

    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    assert len(manifest["documents"]) == 1038

    for doc in manifest["documents"]:
        assert doc["doc_id"]
        assert "number" in doc
        assert doc["doc_type"] in {
            "ordenanza", "convenio", "resolucion", "decreto", "anexo", "preparatoria", "sin clasificar",
        }
        assert "title" in doc
        assert doc["title_source"] in {"listing", "filename", "none"}
        assert "year" in doc
        assert "expediente" in doc

    sync_status = json.loads((data_dir / "sync-status.json").read_text(encoding="utf-8"))
    assert sync_status["last_run_status"] == "ok"
    assert sync_status["documents_total"] == 1038

    unresolved = json.loads((data_dir / "unresolved-listing-entries.json").read_text(encoding="utf-8"))
    assert unresolved["entries"] == []

    aliases = json.loads((data_dir / "doc-id-aliases.json").read_text(encoding="utf-8"))
    assert aliases["aliases"] == []  # first run: no previous doc_id to alias from


def test_zero_anchors_parsed_does_not_rewrite_data(tmp_path) -> None:
    """Task 2a.4: zero anchors parsed -> error status, data/ not rewritten."""
    listing_file = tmp_path / "empty-listing.html"
    listing_file.write_text("<html><body>no anchors here</body></html>", encoding="utf-8")
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    # Simulate a previously good manifest that must survive untouched.
    (data_dir / "manifest.json").write_text(
        json.dumps({"schema_version": 1, "generated_at": "x", "source_host": "hcdrosales.gob.ar", "documents": [{"doc_id": "old"}]}),
        encoding="utf-8",
    )

    exit_code = main(["build-manifest", "--listing-file", str(listing_file), "--data-dir", str(data_dir)])
    assert exit_code == 1

    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["documents"] == [{"doc_id": "old"}]  # untouched

    sync_status = json.loads((data_dir / "sync-status.json").read_text(encoding="utf-8"))
    assert sync_status["last_run_status"] == "error"
