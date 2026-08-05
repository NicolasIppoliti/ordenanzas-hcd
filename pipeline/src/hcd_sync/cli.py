"""`hcd-sync` command-line entry point.

PR2a shipped the offline path: `build-manifest --listing-file <path>` parses
a local listing file and emits `data/**` with no network layer involved.
The fetching subcommand lands in PR2b.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import cast

from hcd_sync import aliases as aliases_mod
from hcd_sync import manifest_writer, sync_status, unresolved
from hcd_sync.doc_meta import build_doc_meta, with_number_variants
from hcd_sync.json_types import JsonDict
from hcd_sync.listing import parse_listing, resolve_doc_id_collisions

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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="hcd-sync")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_manifest_parser = subparsers.add_parser(
        "build-manifest", help="Parse a local listing file and emit data/** offline."
    )
    build_manifest_parser.add_argument("--listing-file", required=True, type=Path)
    build_manifest_parser.add_argument("--data-dir", default=Path("data"), type=Path)

    args = parser.parse_args(argv)

    if args.command == "build-manifest":
        return build_manifest_offline(args.listing_file, args.data_dir)

    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
