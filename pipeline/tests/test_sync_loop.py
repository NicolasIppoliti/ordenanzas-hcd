"""Full `hcd-sync run` loop against fake fetchers. Tasks 2b.4, 2b.9, 2b.9a, 2b.10, 2b.11, 2b.12, 2b.13."""

from __future__ import annotations

import json
from pathlib import Path

import fitz

from hcd_sync.archive import FetchResponse
from hcd_sync.cli import run_sync
from hcd_sync.storage import sha256_of

FIXTURE_20_LINKS = (Path(__file__).parent / "fixtures" / "listing-20-links.html").read_text(
    encoding="utf-8"
)
LISTING_URL = "https://hcdrosales.gob.ar/?lsvr_document_cat=ordenanzas"
ROBOTS_URL = "https://hcdrosales.gob.ar/robots.txt"


def _make_pdf_bytes(text: str) -> bytes:
    """A real, PyMuPDF-parseable PDF -- required now that `run_sync` extracts
    text inline (task 3.3). Generated at test time, per design.md's Testing
    Strategy; no binary fixtures are committed.
    """
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


class _FakeFetcher:
    """Maps exact URLs to canned responses; records every call in order."""

    def __init__(
        self, responses: dict[str, FetchResponse], default_pdf_text: str = "Texto de prueba."
    ) -> None:
        self.responses = dict(responses)
        self.default_pdf_text = default_pdf_text
        self.calls: list[str] = []

    def get(self, url: str, *, timeout: float = 60, headers: dict[str, str] | None = None) -> FetchResponse:
        self.calls.append(url)
        if url in self.responses:
            return self.responses[url]
        if url.endswith(".pdf"):
            return FetchResponse(
                status_code=200, content=_make_pdf_bytes(f"{self.default_pdf_text} {url}")
            )
        raise AssertionError(f"unexpected URL requested: {url}")


def _base_responses(listing_html: str = FIXTURE_20_LINKS) -> dict[str, FetchResponse]:
    return {
        ROBOTS_URL: FetchResponse(status_code=404, content=b""),
        LISTING_URL: FetchResponse(status_code=200, content=listing_html.encode("utf-8")),
    }


def _no_sleep(_seconds: float) -> None:
    return None


class _FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        self.now += 100.0  # always "enough time has passed" -- no real delay needed in tests
        return self.now


def test_robots_txt_halt_stops_run_with_zero_fetches_and_notifies_once(tmp_path: Path) -> None:
    """Task 2b.4: robots.txt 200 -> halt, zero get calls beyond the check, halted status, notifier once, exit 1."""
    fetcher = _FakeFetcher({ROBOTS_URL: FetchResponse(status_code=200, content=b"User-agent: *\nDisallow: /")})
    notifications: list[str] = []

    exit_code = run_sync(
        fetcher=fetcher,
        data_dir=tmp_path / "data",
        archive_dir=tmp_path / "archive",
        now="2026-08-05T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
        notifier=notifications.append,
    )

    assert exit_code == 1
    assert fetcher.calls == [ROBOTS_URL]  # zero subsequent get calls
    assert len(notifications) == 1

    sync_status = json.loads((tmp_path / "data" / "sync-status.json").read_text(encoding="utf-8"))
    assert sync_status["last_run_status"] == "halted"
    assert sync_status["halt_reason"]
    assert not (tmp_path / "data" / "manifest.json").exists()


def test_rejected_doc_id_is_never_passed_to_the_fetcher(tmp_path: Path) -> None:
    """Task 2b.10: an entry whose doc_id fails D7 validation is never fetched."""
    listing_html = """
    <ul class="post-tree__children post-tree__children--level-0">
      <li class="post-tree__item post-tree__item--file">
        <a class="post-tree__item-link post-tree__item-link--file" target="_blank"
           href="https://hcdrosales.gob.ar/wp-content/uploads/2026/01/..%2f..%2fetc-passwd.pdf">Bad entry</a>
      </li>
      <li class="post-tree__item post-tree__item--file">
        <a class="post-tree__item-link post-tree__item-link--file" target="_blank"
           href="https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4457-Mesa-de-Gestion-del-Agua.pdf">4457 &#8211; Mesa de Gesti&#243;n del Agua</a>
      </li>
    </ul>
    """
    fetcher = _FakeFetcher(_base_responses(listing_html))

    exit_code = run_sync(
        fetcher=fetcher,
        data_dir=tmp_path / "data",
        archive_dir=tmp_path / "archive",
        now="2026-08-05T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
    )

    assert exit_code == 1  # partial: one entry rejected
    assert not any("etc-passwd" in call for call in fetcher.calls)

    unresolved = json.loads((tmp_path / "data" / "unresolved-listing-entries.json").read_text(encoding="utf-8"))
    assert len(unresolved["entries"]) == 1

    manifest = json.loads((tmp_path / "data" / "manifest.json").read_text(encoding="utf-8"))
    assert len(manifest["documents"]) == 1
    assert manifest["documents"][0]["doc_id"] == "4457-Mesa-de-Gestion-del-Agua"

    sync_status = json.loads((tmp_path / "data" / "sync-status.json").read_text(encoding="utf-8"))
    assert sync_status["last_run_status"] == "partial"


def test_pending_record_is_fetched_exactly_once_and_never_returns_to_pending(tmp_path: Path) -> None:
    """Task 2b.9a."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    listing_html = """
    <ul class="post-tree__children post-tree__children--level-0">
      <li class="post-tree__item post-tree__item--file">
        <a class="post-tree__item-link post-tree__item-link--file" target="_blank"
           href="https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4457-Mesa-de-Gestion-del-Agua.pdf">4457 &#8211; Mesa de Gesti&#243;n del Agua</a>
      </li>
    </ul>
    """
    # A PR2a-built manifest: the record is known but never fetched.
    (data_dir / "manifest.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "generated_at": "2026-08-01T00:00:00Z",
                "source_host": "hcdrosales.gob.ar",
                "documents": [
                    {
                        "doc_id": "4457-Mesa-de-Gestion-del-Agua",
                        "number": 4457,
                        "number_variants": [],
                        "doc_type": "ordenanza",
                        "expediente": None,
                        "year": None,
                        "title": "Mesa de Gestión del Agua",
                        "title_source": "listing",
                        "anchor_text": "4457 – Mesa de Gestión del Agua",
                        "source_url": "https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4457-Mesa-de-Gestion-del-Agua.pdf",
                        "source_filename": "4457-Mesa-de-Gestion-del-Agua.pdf",
                        "sha256": None,
                        "bytes": None,
                        "fetched_at": None,
                        "status": "pending",
                        "text_path": None,
                        "cross_references": [],
                        "notes": "",
                        "last_error": None,
                        "last_error_at": None,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    fetcher = _FakeFetcher(_base_responses(listing_html))
    exit_code = run_sync(
        fetcher=fetcher,
        data_dir=data_dir,
        archive_dir=tmp_path / "archive",
        now="2026-08-05T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
    )

    assert exit_code == 0
    pdf_calls = [c for c in fetcher.calls if c.endswith(".pdf")]
    assert pdf_calls == ["https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4457-Mesa-de-Gestion-del-Agua.pdf"]

    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    assert len(manifest["documents"]) == 1
    record = manifest["documents"][0]
    assert record["status"] in ("ok", "no_text", "error")
    assert record["status"] != "pending"

    sync_status = json.loads((data_dir / "sync-status.json").read_text(encoding="utf-8"))
    assert sync_status["last_run_status"] == "ok"  # pending never escalates or sets error/partial


def test_already_archived_records_are_never_refetched_keyed_on_doc_id(tmp_path: Path) -> None:
    """Task 2b.9: only ok/no_text satisfy the skip; keyed on doc_id so 3296 and 3296-1 both archive."""
    data_dir = tmp_path / "data"
    archive_dir = tmp_path / "archive"
    fetcher = _FakeFetcher(_base_responses())

    first_exit = run_sync(
        fetcher=fetcher,
        data_dir=data_dir,
        archive_dir=archive_dir,
        now="2026-08-05T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
    )
    assert first_exit == 0
    first_pdf_calls = {c for c in fetcher.calls if c.endswith(".pdf")}
    # 19 distinct URLs (4461-Repetido.pdf collapses from two anchors to one fetch).
    assert len(first_pdf_calls) == 19
    assert "https://hcdrosales.gob.ar/wp-content/uploads/2021/11/3296.pdf" in first_pdf_calls
    assert "https://hcdrosales.gob.ar/wp-content/uploads/2021/12/3296-1.pdf" in first_pdf_calls

    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    assert len(manifest["documents"]) == 19
    for doc in manifest["documents"]:
        assert doc["status"] == "ok"

    # Second run: everything already ok -> zero PDF fetches, only robots+listing calls.
    fetcher2 = _FakeFetcher(_base_responses())
    second_exit = run_sync(
        fetcher=fetcher2,
        data_dir=data_dir,
        archive_dir=archive_dir,
        now="2026-08-06T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
    )
    assert second_exit == 0
    assert [c for c in fetcher2.calls if c.endswith(".pdf")] == []


def test_offline_integration_20_link_fixture_produces_expected_manifest(tmp_path: Path) -> None:
    """Task 2b.12: acceptance golden over the hand-built post-tree fixture."""
    data_dir = tmp_path / "data"
    fetcher = _FakeFetcher(_base_responses())

    exit_code = run_sync(
        fetcher=fetcher,
        data_dir=data_dir,
        archive_dir=tmp_path / "archive",
        now="2026-08-05T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
    )
    assert exit_code == 0

    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    documents = {doc["doc_id"]: doc for doc in manifest["documents"]}
    assert len(documents) == 19  # 20 anchors, one duplicate URL collapses to one record

    expected = {
        "4457-Mesa-de-Gestion-del-Agua": {"number": 4457, "doc_type": "ordenanza", "title_source": "listing"},
        "4458-Plan-de-Obras": {"number": 4458, "doc_type": "ordenanza", "title_source": "listing"},
        "4459": {"number": 4459, "doc_type": "ordenanza", "title_source": "none"},
        "4460-Adhesion-al-Dia-de-la-Bandera": {"number": 4460, "doc_type": "ordenanza", "title_source": "listing"},
        "Convenio-Municipalidad": {"number": None, "doc_type": "convenio", "title_source": "listing"},
        "3296": {"number": 3296, "doc_type": "ordenanza", "title_source": "none"},
        "3296-1": {"number": 3296, "doc_type": "ordenanza", "title_source": "none"},
        "4461-Repetido": {"number": 4461, "doc_type": "ordenanza", "title_source": "listing"},
        "4462-Modifica-Ordenanza-3351": {"number": 4462, "doc_type": "ordenanza", "title_source": "listing"},
        "4463-Convenio-Bomberos": {"number": 4463, "doc_type": "ordenanza", "title_source": "listing"},
        "Resolucion-010-2025": {"number": None, "doc_type": "resolucion", "title_source": "listing"},
        "Decreto-045": {"number": None, "doc_type": "decreto", "title_source": "listing"},
        "Anexo-I-Tarifas": {"number": None, "doc_type": "anexo", "title_source": "listing"},
        "Preparatoria-Sesion-12": {"number": None, "doc_type": "preparatoria", "title_source": "listing"},
        "Calle-Belgrano": {"number": None, "doc_type": "sin clasificar", "title_source": "listing"},
        "4464-O822024-Presupuesto": {"number": 4464, "doc_type": "ordenanza", "title_source": "listing"},
        "4465-EX-2025-00106406-MUNICRO-DCSE-Tramite": {"number": 4465, "doc_type": "ordenanza", "title_source": "listing"},
        "4467-Cementerio": {"number": 4467, "doc_type": "ordenanza", "title_source": "listing"},
        "RP0107": {"number": None, "doc_type": "sin clasificar", "title_source": "none"},
    }
    assert set(documents) == set(expected)
    for doc_id, expectations in expected.items():
        record = documents[doc_id]
        for field, value in expectations.items():
            assert record[field] == value, f"{doc_id}.{field}: {record[field]!r} != {value!r}"
        assert record["status"] == "ok"
        assert record["sha256"]
        assert record["bytes"] and record["bytes"] > 0

    # number_variants: the 3296 / 3296-1 re-upload collision pair.
    assert set(documents["3296"]["number_variants"]) == {"3296", "3296-1"}
    assert set(documents["3296-1"]["number_variants"]) == {"3296", "3296-1"}

    # Expediente families (D13), exercised end-to-end through the loop.
    assert documents["4464-O822024-Presupuesto"]["expediente"] == "O822024"
    assert documents["4465-EX-2025-00106406-MUNICRO-DCSE-Tramite"]["expediente"] == "EX-2025-00106406-MUNICRO-DCSE"

    sync_status = json.loads((data_dir / "sync-status.json").read_text(encoding="utf-8"))
    assert sync_status["last_run_status"] == "ok"
    assert sync_status["documents_total"] == 19
    assert sync_status["documents_added_last_run"] == 19

    aliases = json.loads((data_dir / "doc-id-aliases.json").read_text(encoding="utf-8"))
    assert aliases["aliases"] == []


def test_second_run_issues_zero_pdf_gets_and_leaves_data_dir_unchanged(tmp_path: Path) -> None:
    """Task 2b.13 (PR2b acceptance): run twice; second run fetches nothing and data/ is byte-identical."""
    data_dir = tmp_path / "data"
    archive_dir = tmp_path / "archive"

    exit_code = run_sync(
        fetcher=_FakeFetcher(_base_responses()),
        data_dir=data_dir,
        archive_dir=archive_dir,
        now="2026-08-05T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
    )
    assert exit_code == 0

    before = {p: p.read_bytes() for p in sorted(data_dir.rglob("*")) if p.is_file()}

    fetcher2 = _FakeFetcher(_base_responses())
    exit_code2 = run_sync(
        fetcher=fetcher2,
        data_dir=data_dir,
        archive_dir=archive_dir,
        now="2026-08-06T00:00:00Z",  # a later run, but nothing changed
        sleep=_no_sleep,
        clock=_FakeClock(),
    )
    assert exit_code2 == 0

    pdf_calls = [c for c in fetcher2.calls if c.endswith(".pdf")]
    assert pdf_calls == []  # zero PDF get calls on the second run

    after = {p: p.read_bytes() for p in sorted(data_dir.rglob("*")) if p.is_file()}
    # sync-status.json legitimately changes every run (last_run_at); everything
    # else must be byte-identical, so `git status` on data/ stays clean aside
    # from that one always-committed file.
    for path, content in before.items():
        if path.name == "sync-status.json":
            continue
        assert after[path] == content, f"{path} changed on a no-op run"
    assert set(before) == set(after)


_ONE_LINK_LISTING = """
<ul class="post-tree__children post-tree__children--level-0">
  <li class="post-tree__item post-tree__item--file">
    <a class="post-tree__item-link post-tree__item-link--file" target="_blank"
       href="https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4457-Mesa-de-Gestion-del-Agua.pdf">4457 &#8211; Mesa de Gesti&#243;n del Agua</a>
  </li>
</ul>
"""

_ONE_LINK_URL = "https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4457-Mesa-de-Gestion-del-Agua.pdf"


def _manifest_with_one_record(status: str, text_path: str | None) -> dict[str, object]:
    # Same content the default `_FakeFetcher` would return for this URL, so
    # a re-fetch in the test below is a settled no-op re-archive, not an
    # unrelated content-drift branch (a genuinely different prior sha256 is
    # its own scenario, already covered by `test_manifest.py`'s drift tests).
    prior_bytes = _make_pdf_bytes(f"Texto de prueba. {_ONE_LINK_URL}")
    return {
        "schema_version": 1,
        "generated_at": "2026-08-01T00:00:00Z",
        "source_host": "hcdrosales.gob.ar",
        "documents": [
            {
                "doc_id": "4457-Mesa-de-Gestion-del-Agua",
                "number": 4457,
                "number_variants": [],
                "doc_type": "ordenanza",
                "expediente": None,
                "year": None,
                "title": "Mesa de Gestión del Agua",
                "title_source": "listing",
                "anchor_text": "4457 – Mesa de Gestión del Agua",
                "source_url": _ONE_LINK_URL,
                "source_filename": "4457-Mesa-de-Gestion-del-Agua.pdf",
                "sha256": sha256_of(prior_bytes),
                "bytes": len(prior_bytes),
                "fetched_at": "2026-08-01T00:00:00Z",
                "status": status,
                "text_path": text_path,
                "cross_references": [],
                "notes": "",
                "last_error": None,
                "last_error_at": None,
            }
        ],
    }


def test_ok_with_null_text_path_is_refetched_extracted_once_and_settles(tmp_path: Path) -> None:
    """Task 3.3a/3.3b: a PR2b-era 'ok, text_path: null' record must be
    re-fetched once, extracted, and end 'ok' with a text_path, or 'no_text'
    -- it must NOT be skipped forever.
    """
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "manifest.json").write_text(
        json.dumps(_manifest_with_one_record("ok", None)), encoding="utf-8"
    )

    fetcher = _FakeFetcher(_base_responses(_ONE_LINK_LISTING))
    exit_code = run_sync(
        fetcher=fetcher,
        data_dir=data_dir,
        archive_dir=tmp_path / "archive",
        now="2026-08-05T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
    )
    assert exit_code == 0
    pdf_calls = [c for c in fetcher.calls if c.endswith(".pdf")]
    assert pdf_calls == [_ONE_LINK_URL]  # fetched exactly once

    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    # PyMuPDF embeds a creation timestamp, so a re-fetch's bytes legitimately
    # differ from the fixture's prior bytes and content drift is preserved
    # (design.md "Checksum / drift") -- look up the current record by its
    # live doc_id rather than assuming index 0.
    record = next(
        doc
        for doc in manifest["documents"]
        if doc["doc_id"] == "4457-Mesa-de-Gestion-del-Agua"
    )
    assert record["status"] in ("ok", "no_text")
    if record["status"] == "ok":
        assert record["text_path"] == "data/documents/4457-Mesa-de-Gestion-del-Agua.json"
        document_json = json.loads(
            (data_dir / "documents" / "4457-Mesa-de-Gestion-del-Agua.json").read_text(
                encoding="utf-8"
            )
        )
        assert document_json["doc_id"] == "4457-Mesa-de-Gestion-del-Agua"
        assert document_json["text"]
    else:
        assert record["text_path"] is None


def test_ok_with_text_path_is_never_refetched(tmp_path: Path) -> None:
    """Task 3.3a: a settled record (ok WITH a text_path) is not re-fetched."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "manifest.json").write_text(
        json.dumps(
            _manifest_with_one_record(
                "ok", "data/documents/4457-Mesa-de-Gestion-del-Agua.json"
            )
        ),
        encoding="utf-8",
    )

    fetcher = _FakeFetcher(_base_responses(_ONE_LINK_LISTING))
    exit_code = run_sync(
        fetcher=fetcher,
        data_dir=data_dir,
        archive_dir=tmp_path / "archive",
        now="2026-08-05T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
    )
    assert exit_code == 0
    assert [c for c in fetcher.calls if c.endswith(".pdf")] == []


def test_no_text_pdf_is_marked_no_text_not_error(tmp_path: Path) -> None:
    """Task 3.3: a PDF with no text layer -> status 'no_text', never 'error'."""
    blank_pdf = fitz.open()
    blank_pdf.new_page()
    blank_bytes = blank_pdf.tobytes()
    blank_pdf.close()

    responses = _base_responses(_ONE_LINK_LISTING)
    responses[_ONE_LINK_URL] = FetchResponse(status_code=200, content=blank_bytes)
    fetcher = _FakeFetcher(responses)

    exit_code = run_sync(
        fetcher=fetcher,
        data_dir=tmp_path / "data",
        archive_dir=tmp_path / "archive",
        now="2026-08-05T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
    )
    assert exit_code == 0

    manifest = json.loads((tmp_path / "data" / "manifest.json").read_text(encoding="utf-8"))
    record = manifest["documents"][0]
    assert record["status"] == "no_text"
    assert record["text_path"] is None
    assert not (tmp_path / "data" / "documents").exists()


_TWO_LINK_CROSSREF_LISTING = """
<ul class="post-tree__children post-tree__children--level-0">
  <li class="post-tree__item post-tree__item--file">
    <a class="post-tree__item-link post-tree__item-link--file" target="_blank"
       href="https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4457-Mesa-de-Gestion-del-Agua.pdf">4457 &#8211; Mesa de Gesti&#243;n del Agua</a>
  </li>
  <li class="post-tree__item post-tree__item--file">
    <a class="post-tree__item-link post-tree__item-link--file" target="_blank"
       href="https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4462-Modifica-Ordenanza-4457.pdf">4462 &#8211; Modifica Ordenanza 4457</a>
  </li>
</ul>
"""


def test_resolved_title_reference_is_recorded_in_cross_references(tmp_path: Path) -> None:
    """Tasks 3.4/3.10: a title reference to an existing record resolves and
    is written to `cross_references`, never as a doc_id -- only the number.
    """
    fetcher = _FakeFetcher(_base_responses(_TWO_LINK_CROSSREF_LISTING))
    exit_code = run_sync(
        fetcher=fetcher,
        data_dir=tmp_path / "data",
        archive_dir=tmp_path / "archive",
        now="2026-08-05T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
    )
    assert exit_code == 0

    manifest = json.loads((tmp_path / "data" / "manifest.json").read_text(encoding="utf-8"))
    documents = {doc["doc_id"]: doc for doc in manifest["documents"]}
    referencing = documents["4462-Modifica-Ordenanza-4457"]
    assert referencing["cross_references"] == [
        {"number": 4457, "signal": "title", "excerpt": "Modifica Ordenanza 4457"}
    ]

    unresolved = json.loads(
        (tmp_path / "data" / "unresolved-references.json").read_text(encoding="utf-8")
    )
    assert unresolved["entries"] == []


_UNRESOLVED_REF_LISTING = """
<ul class="post-tree__children post-tree__children--level-0">
  <li class="post-tree__item post-tree__item--file">
    <a class="post-tree__item-link post-tree__item-link--file" target="_blank"
       href="https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4462-Modifica-Ordenanza-9999.pdf">4462 &#8211; Modifica Ordenanza 9999</a>
  </li>
</ul>
"""


def test_unresolved_reference_is_absent_from_cross_references_and_recorded(
    tmp_path: Path,
) -> None:
    """Task 3.7: a candidate whose number has no manifest record never
    renders as a link -- it is absent from `cross_references` and present
    in `unresolved-references.json`.
    """
    fetcher = _FakeFetcher(_base_responses(_UNRESOLVED_REF_LISTING))
    exit_code = run_sync(
        fetcher=fetcher,
        data_dir=tmp_path / "data",
        archive_dir=tmp_path / "archive",
        now="2026-08-05T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
    )
    assert exit_code == 0

    manifest = json.loads((tmp_path / "data" / "manifest.json").read_text(encoding="utf-8"))
    record = manifest["documents"][0]
    assert record["cross_references"] == []

    unresolved = json.loads(
        (tmp_path / "data" / "unresolved-references.json").read_text(encoding="utf-8")
    )
    assert unresolved["entries"] == [
        {
            "doc_id": "4462-Modifica-Ordenanza-9999",
            "number": 9999,
            "signal": "title",
            "excerpt": "Modifica Ordenanza 9999",
        }
    ]


def test_year_is_transcribed_from_the_document_header_when_absent_from_expediente(
    tmp_path: Path,
) -> None:
    """Task 3.12: D10's header fallback, wired to real extracted text.

    `derive_year(header_text=...)` existed and was unit-tested against a stub since PR2a,
    but nothing ever passed an extracted body into it, so a record whose year lives only
    in its `Punta Alta, ... de {yyyy}` line stayed `null` forever.
    """
    url = "https://hcdrosales.gob.ar/wp-content/uploads/2021/03/4457-Mesa-de-Gestion-del-Agua.pdf"
    listing_html = f"""
    <ul class="post-tree__children post-tree__children--level-0">
      <li class="post-tree__item post-tree__item--file">
        <a class="post-tree__item-link post-tree__item-link--file" target="_blank"
           href="{url}">4457 &#8211; Mesa de Gesti&#243;n del Agua</a>
      </li>
    </ul>
    """
    body = "Punta Alta, 27 de enero de 2.026\nEL HONORABLE CONCEJO DELIBERANTE"
    fetcher = _FakeFetcher(
        {
            ROBOTS_URL: FetchResponse(status_code=404, content=b""),
            LISTING_URL: FetchResponse(status_code=200, content=listing_html.encode("utf-8")),
            url: FetchResponse(status_code=200, content=_make_pdf_bytes(body)),
        }
    )
    data_dir = tmp_path / "data"

    exit_code = run_sync(
        fetcher=fetcher,
        data_dir=data_dir,
        archive_dir=tmp_path / "archive",
        now="2026-08-05T00:00:00Z",
        sleep=_no_sleep,
        clock=_FakeClock(),
    )

    assert exit_code == 0
    record = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))["documents"][0]
    # The filename carries no expediente, so the year can only come from the body.
    assert record["expediente"] is None
    assert record["year"] == 2026, "header year must be transcribed from the extracted text"
    # The upload path says 2021 — it must never be used as the ordinance year (D10).
    assert record["year"] != 2021
