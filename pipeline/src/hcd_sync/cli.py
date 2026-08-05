"""`hcd-sync` command-line entry point.

PR2a shipped the offline path: `build-manifest --listing-file <path>` parses
a local listing file and emits `data/**` with no network layer involved.
PR2b adds the fetching subcommand, `hcd-sync run [--recheck] [--limit N]
[--dry-run]` — see `run_sync` below and design.md's Data Flow diagram.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import cast

from hcd_sync import aliases as aliases_mod
from hcd_sync import (
    archive,
    crossrefs,
    extract,
    http_client,
    manifest_writer,
    notify,
    sync_status,
    unresolved,
    unresolved_references,
)
from hcd_sync import manifest as manifest_mod
from hcd_sync.archive import Fetcher, FetchExhaustedError
from hcd_sync.doc_meta import build_doc_meta, derive_year, with_number_variants
from hcd_sync.http_client import (
    BoundedRetryFetcher,
    HostPolicy,
    PolicedHostFetcher,
    RobotsTxtAppearedError,
)
from hcd_sync.json_types import JsonDict
from hcd_sync.listing import SOURCE_HOST, parse_listing, resolve_doc_id_collisions
from hcd_sync.storage import LocalArchiveStore

LISTING_URL = "https://hcdrosales.gob.ar/?lsvr_document_cat=ordenanzas"


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _read_json(path: Path) -> JsonDict | None:
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as f:
        data: JsonDict = json.load(f)
        return data


def _write_json(path: Path, data: JsonDict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=False)
        f.write("\n")


def build_manifest_offline(listing_file: Path, data_dir: Path) -> int:
    """Run the offline listing -> manifest path. Returns the process exit code."""
    html_content = listing_file.read_text(encoding="utf-8")
    parse_result = parse_listing(html_content)

    now = _now_iso()

    if not parse_result.entries and not parse_result.rejected:
        # Zero anchors parsed at all: the listing markup itself has changed.
        # data/ is NOT rewritten — the site keeps serving the last good archive.
        previous_status = _read_json(data_dir / "sync-status.json")
        status = sync_status.SyncStatus(
            last_run_at=now,
            last_run_status="error",
            last_success_at=cast("str | None", (previous_status or {}).get("last_success_at")),
            documents_total=cast("int", (previous_status or {}).get("documents_total", 0)),
            documents_added_last_run=0,
            halt_reason="zero anchors parsed from the listing markup",
        )
        _write_json(data_dir / "sync-status.json", status.to_json_dict())
        return 1

    resolved_entries = resolve_doc_id_collisions(parse_result.entries)
    doc_metas = with_number_variants([build_doc_meta(entry) for entry in resolved_entries])
    new_records = [manifest_writer.doc_meta_to_json_dict(meta) for meta in doc_metas]

    previous_manifest = _read_json(data_dir / "manifest.json") or {"documents": []}
    previous_documents = cast("list[JsonDict]", previous_manifest.get("documents", []))

    merged_documents = manifest_writer.upsert_new_records(previous_documents, new_records)
    documents_added = len(merged_documents) - len(previous_documents)

    manifest = manifest_writer.build_manifest(now, merged_documents)
    _write_json(data_dir / "manifest.json", manifest)

    previous_aliases_data = _read_json(data_dir / "doc-id-aliases.json")
    existing_aliases = (
        aliases_mod.from_json_dict(previous_aliases_data) if previous_aliases_data else []
    )
    new_aliases = aliases_mod.compute_new_aliases(previous_documents, resolved_entries, now)
    merged_aliases = aliases_mod.build_alias_map(existing_aliases, new_aliases)
    _write_json(
        data_dir / "doc-id-aliases.json", aliases_mod.to_json_dict(now, merged_aliases)
    )

    _write_json(
        data_dir / "unresolved-listing-entries.json",
        unresolved.to_json_dict(parse_result.rejected),
    )

    last_run_status = "partial" if parse_result.rejected else "ok"
    previous_status = _read_json(data_dir / "sync-status.json")
    status = sync_status.SyncStatus(
        last_run_at=now,
        last_run_status=last_run_status,
        last_success_at=now
        if last_run_status == "ok"
        else cast("str | None", (previous_status or {}).get("last_success_at")),
        documents_total=len(merged_documents),
        documents_added_last_run=documents_added,
    )
    _write_json(data_dir / "sync-status.json", status.to_json_dict())

    return 0 if last_run_status == "ok" else 1


def _parse_dt(iso: str) -> datetime:
    return datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)


def _is_settled(record: JsonDict) -> bool:
    """A manifest record is settled only when `no_text`, or `ok` WITH a
    `text_path` (design.md D13). `ok` with `text_path: null` is
    transitional and must NOT satisfy the incremental skip.
    """
    status = record.get("status")
    if status == "no_text":
        return True
    return status == "ok" and bool(record.get("text_path"))


def _previous_sync_status_fields(data_dir: Path) -> tuple[str | None, int]:
    previous_status = _read_json(data_dir / "sync-status.json")
    last_success_at = cast("str | None", (previous_status or {}).get("last_success_at"))
    documents_total = cast("int", (previous_status or {}).get("documents_total", 0))
    return last_success_at, documents_total


def run_sync(
    *,
    fetcher: Fetcher,
    data_dir: Path,
    archive_dir: Path,
    now: str,
    recheck: bool = False,
    limit: int | None = None,
    dry_run: bool = False,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
    listing_url: str = LISTING_URL,
    host: str = SOURCE_HOST,
    notifier: Callable[[str], None] = lambda message: None,
) -> int:
    """Run the incremental, polite fetching path. See design.md's Data Flow.

    `fetcher` is a raw transport (a real `http_client.RequestsFetcher` in
    production, a fake in tests) — this function wraps it with the
    politeness policy (`PolicedHostFetcher`) and bounded retries
    (`BoundedRetryFetcher`) itself, so callers only ever inject the
    transport seam.
    """
    policy = HostPolicy(host=host)
    policed = PolicedHostFetcher(fetcher, policy, sleep=sleep, clock=clock)
    retrying = BoundedRetryFetcher(policed, backoff_seconds=policy.min_delay_seconds, sleep=sleep)

    # --- robots.txt HALT (design.md D6/spec.md "robots.txt Halt Condition") ---
    # A raw, unpoliced, one-off request: the very first request of the run,
    # so there is nothing to enforce a delay against yet, and a HALT must
    # not have spent the single concurrency slot on anything else.
    try:
        http_client.check_robots_txt_still_absent(fetcher, host)
    except RobotsTxtAppearedError as exc:
        last_success_at, documents_total = _previous_sync_status_fields(data_dir)
        status = sync_status.SyncStatus(
            last_run_at=now,
            last_run_status="halted",
            last_success_at=last_success_at,
            documents_total=documents_total,
            documents_added_last_run=0,
            halt_reason=str(exc),
        )
        _write_json(data_dir / "sync-status.json", status.to_json_dict())
        notifier(str(exc))
        return 1

    # --- Fetch and parse the listing ---
    try:
        listing_response = retrying.get(listing_url, timeout=30, headers={})
    except FetchExhaustedError as exc:
        last_success_at, documents_total = _previous_sync_status_fields(data_dir)
        status = sync_status.SyncStatus(
            last_run_at=now,
            last_run_status="error",
            last_success_at=last_success_at,
            documents_total=documents_total,
            documents_added_last_run=0,
            halt_reason=f"listing page unreachable: {exc}",
        )
        _write_json(data_dir / "sync-status.json", status.to_json_dict())
        return 1

    if listing_response.status_code >= 400:
        last_success_at, documents_total = _previous_sync_status_fields(data_dir)
        status = sync_status.SyncStatus(
            last_run_at=now,
            last_run_status="error",
            last_success_at=last_success_at,
            documents_total=documents_total,
            documents_added_last_run=0,
            halt_reason=f"listing page returned HTTP {listing_response.status_code}",
        )
        _write_json(data_dir / "sync-status.json", status.to_json_dict())
        return 1

    html_content = listing_response.content.decode("utf-8")
    parse_result = parse_listing(html_content)

    if not parse_result.entries and not parse_result.rejected:
        # Zero anchors parsed: the listing markup itself has changed.
        # data/ is NOT rewritten — the site keeps serving the last good archive.
        last_success_at, documents_total = _previous_sync_status_fields(data_dir)
        status = sync_status.SyncStatus(
            last_run_at=now,
            last_run_status="error",
            last_success_at=last_success_at,
            documents_total=documents_total,
            documents_added_last_run=0,
            halt_reason="zero anchors parsed from the listing markup",
        )
        _write_json(data_dir / "sync-status.json", status.to_json_dict())
        return 1

    resolved_entries = resolve_doc_id_collisions(parse_result.entries)
    doc_metas = with_number_variants([build_doc_meta(entry) for entry in resolved_entries])
    listing_records = {meta.doc_id: manifest_writer.doc_meta_to_json_dict(meta) for meta in doc_metas}

    previous_manifest = _read_json(data_dir / "manifest.json") or {"documents": []}
    previous_documents = cast("list[JsonDict]", previous_manifest.get("documents", []))
    previous_by_id: dict[str, JsonDict] = {
        cast("str", doc["doc_id"]): doc for doc in previous_documents
    }

    # --- Diff vs the manifest: only a SETTLED record satisfies the "already
    # archived" skip (design.md D13's narrowed rule; spec.md "A Record
    # Describes Its Fetch State"). A record is settled only when it is
    # `no_text`, or `ok` WITH a `text_path`. `ok` with `text_path: null` is
    # transitional -- archived but not yet extracted, since `archive/` is
    # per-run scratch and the PDF is gone by the time extraction lands --
    # and is re-fetched exactly once so extraction has bytes to work with.
    # pending and error are always fetched again. ---
    documents: list[JsonDict] = []
    to_fetch: list[tuple[str, str]] = []
    for doc_id, listing_record in listing_records.items():
        existing = previous_by_id.get(doc_id)
        if existing is None:
            documents.append(listing_record)
            to_fetch.append((doc_id, cast("str", listing_record["source_url"])))
        else:
            documents.append(existing)
            if recheck or not _is_settled(existing):
                to_fetch.append((doc_id, cast("str", existing["source_url"])))

    # Previously-archived records the current listing no longer carries are
    # kept untouched (design.md "Source URL reorganisation": deletion is
    # never automatic).
    for doc_id, existing in previous_by_id.items():
        if doc_id not in listing_records:
            documents.append(existing)

    new_doc_ids = set(listing_records) - set(previous_by_id)

    if limit is not None:
        to_fetch = to_fetch[:limit]

    # Tracks every document this run actually extracted (or attempted to),
    # so cross-references can be detected once the full, final `documents`
    # list -- and therefore the full manifest number index -- is known.
    # (title, own_number, body_text) -- body_text is None for `no_text`.
    extracted_this_run: list[tuple[str, str | None, int | None, str | None]] = []

    fetch_exhausted = False
    if not dry_run:
        local_store = LocalArchiveStore(root=archive_dir)
        fetch_now = _parse_dt(now)
        for doc_id, source_url in to_fetch:
            try:
                fetch_fields = archive.fetch_and_archive_document(
                    doc_id, source_url, fetcher=retrying, local_store=local_store, now=fetch_now
                )
            except FetchExhaustedError as exc:
                # Persistent fetch failure stops the run (spec.md "Polite
                # Crawling Policy"): record this one document as error, and
                # attempt no further NEW documents this run.
                fetch_fields = archive.error_fetch_result(now, str(exc))
                documents = manifest_mod.upsert_fetch_result(documents, doc_id, fetch_fields)
                fetch_exhausted = True
                break

            if fetch_fields.get("status") == "ok":
                # Fetch/archive succeeded -- extract per design.md's Data
                # Flow ("fetch -> sha256 -> archive -> PyMuPDF extract").
                pdf_bytes = local_store.read(doc_id)
                listing_record = listing_records[doc_id]
                extraction_fields, document_json = extract.build_extraction_fields(
                    doc_id=doc_id,
                    number=cast("int | None", listing_record.get("number")),
                    sha256=cast("str | None", fetch_fields.get("sha256")),
                    pdf_bytes=pdf_bytes,
                    now=cast("str", fetch_fields["fetched_at"]),
                )
                fetch_fields = {**fetch_fields, **extraction_fields}
                body_text = None
                if document_json is not None:
                    _write_json(data_dir / "documents" / f"{doc_id}.json", document_json)
                    body_text = cast("str", document_json["text"])

                    # D10 step 2: the year may live only in the document's own
                    # `Punta Alta, ... de {yyyy}` line. That is a transcription of a date
                    # the source printed, not an inference, so it does not breach the
                    # no-fabrication rule. It runs only when steps 1 (expediente) left the
                    # year absent, and it never consults the upload path.
                    # D10: the sanction date printed on the document OUTRANKS the
                    # expediente year derived from the filename, because the expediente
                    # records when the file was opened, not when the ordinance passed.
                    header_year = derive_year(expediente=None, header_text=body_text)
                    if header_year is not None:
                        fetch_fields = {**fetch_fields, "year": header_year}
                extracted_this_run.append(
                    (
                        doc_id,
                        cast("str | None", listing_record.get("title")),
                        cast("int | None", listing_record.get("number")),
                        body_text,
                    )
                )

            documents = manifest_mod.upsert_fetch_result(documents, doc_id, fetch_fields)

    # --- Cross-reference detection + manifest-gated resolution (design.md
    # D5), run once the full, final `documents` list is known so the
    # manifest number index reflects every record this run touched. Only
    # documents actually extracted this run are (re)scanned -- an
    # already-settled record keeps its previously resolved
    # `cross_references` untouched. ---
    unresolved_reference_entries: list[JsonDict] = []
    if extracted_this_run:
        number_index = crossrefs.build_manifest_number_index(documents)
        for doc_id, title, own_number, body_text in extracted_this_run:
            candidates = crossrefs.detect_references(
                title=title, body=body_text, own_number=own_number
            )
            resolved, unresolved_entries = crossrefs.gate_candidates(
                doc_id, candidates, number_index
            )
            documents = crossrefs.apply_cross_references(documents, doc_id, resolved)
            unresolved_reference_entries.extend(unresolved_entries)

        _write_json(
            data_dir / "unresolved-references.json",
            unresolved_references.to_json_dict(unresolved_reference_entries),
        )

    manifest_changed = documents != previous_documents
    if manifest_changed or not (data_dir / "manifest.json").exists():
        manifest = manifest_writer.build_manifest(now, documents)
        _write_json(data_dir / "manifest.json", manifest)

    previous_aliases_data = _read_json(data_dir / "doc-id-aliases.json")
    existing_aliases = (
        aliases_mod.from_json_dict(previous_aliases_data) if previous_aliases_data else []
    )
    new_aliases = aliases_mod.compute_new_aliases(previous_documents, resolved_entries, now)
    merged_aliases = aliases_mod.build_alias_map(existing_aliases, new_aliases)
    if merged_aliases != existing_aliases or not (data_dir / "doc-id-aliases.json").exists():
        _write_json(
            data_dir / "doc-id-aliases.json", aliases_mod.to_json_dict(now, merged_aliases)
        )

    _write_json(
        data_dir / "unresolved-listing-entries.json",
        unresolved.to_json_dict(parse_result.rejected),
    )

    last_run_status = "ok"
    if parse_result.rejected or fetch_exhausted:
        last_run_status = "partial"

    last_success_at_previous, _ = _previous_sync_status_fields(data_dir)
    status = sync_status.SyncStatus(
        last_run_at=now,
        last_run_status=last_run_status,
        last_success_at=now if last_run_status == "ok" else last_success_at_previous,
        documents_total=len(documents),
        documents_added_last_run=len(new_doc_ids),
    )
    _write_json(data_dir / "sync-status.json", status.to_json_dict())

    return 0 if last_run_status == "ok" else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="hcd-sync")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_manifest_parser = subparsers.add_parser(
        "build-manifest", help="Parse a local listing file and emit data/** offline."
    )
    build_manifest_parser.add_argument("--listing-file", required=True, type=Path)
    build_manifest_parser.add_argument("--data-dir", default=Path("data"), type=Path)

    run_parser = subparsers.add_parser(
        "run", help="Fetch the live listing and any not-yet-archived documents."
    )
    run_parser.add_argument("--recheck", action="store_true")
    run_parser.add_argument("--limit", type=int, default=None)
    run_parser.add_argument("--dry-run", action="store_true")
    run_parser.add_argument("--data-dir", default=Path("data"), type=Path)
    run_parser.add_argument("--archive-dir", default=Path("archive"), type=Path)

    args = parser.parse_args(argv)

    if args.command == "build-manifest":
        return build_manifest_offline(args.listing_file, args.data_dir)

    if args.command == "run":
        return run_sync(
            fetcher=http_client.RequestsFetcher(),
            data_dir=args.data_dir,
            archive_dir=args.archive_dir,
            now=_now_iso(),
            recheck=args.recheck,
            limit=args.limit,
            dry_run=args.dry_run,
            notifier=notify.send_alert,
        )

    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
