"""Two-language contract: pytest validates pipeline output against the JSON
Schemas under `schemas/`. `site/tests/contract.test.ts` validates the SAME
committed fixtures (`fixtures/contract-*.json`, repo root) via
`assertManifest`/`assertAliases`. Both sides must agree or CI fails. Task 3.8.
"""

from __future__ import annotations

import json
from pathlib import Path

import fitz
import jsonschema
import pytest

from hcd_sync.archive import FetchResponse
from hcd_sync.cli import run_sync

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCHEMAS_DIR = Path(__file__).resolve().parents[1] / "schemas"
_FIXTURES_DIR = _REPO_ROOT / "fixtures"


def _load(path: Path) -> dict[str, object]:
    with path.open(encoding="utf-8") as f:
        result: dict[str, object] = json.load(f)
        return result


@pytest.mark.parametrize(
    ("schema_file", "fixture_file"),
    [
        ("manifest.schema.json", "contract-manifest.json"),
        ("aliases.schema.json", "contract-aliases.json"),
    ],
)
def test_committed_fixture_validates_against_its_schema(
    schema_file: str, fixture_file: str
) -> None:
    schema = _load(_SCHEMAS_DIR / schema_file)
    fixture = _load(_FIXTURES_DIR / fixture_file)
    jsonschema.validate(instance=fixture, schema=schema)


def test_manifest_schema_rejects_an_unknown_status() -> None:
    schema = _load(_SCHEMAS_DIR / "manifest.schema.json")
    fixture = _load(_FIXTURES_DIR / "contract-manifest.json")
    fixture["documents"][0]["status"] = "not_a_real_status"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=fixture, schema=schema)


def test_manifest_schema_rejects_a_cross_reference_with_a_doc_id() -> None:
    """D5: stored cross-reference evidence is number/signal/excerpt only --
    never a resolved doc_id."""
    schema = _load(_SCHEMAS_DIR / "manifest.schema.json")
    fixture = _load(_FIXTURES_DIR / "contract-manifest.json")
    fixture["documents"][0]["cross_references"][0]["doc_id"] = "some-doc"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=fixture, schema=schema)


def test_real_generated_manifest_and_unresolved_references_validate(tmp_path: Path) -> None:
    """The schema also validates a manifest actually produced by the
    pipeline (via `run_sync`), not only the hand-written fixture."""
    listing_html = """
    <ul class="post-tree__children post-tree__children--level-0">
      <li class="post-tree__item post-tree__item--file">
        <a class="post-tree__item-link post-tree__item-link--file" target="_blank"
           href="https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4457-Mesa-de-Gestion-del-Agua.pdf">4457 &#8211; Mesa de Gesti&#243;n del Agua</a>
      </li>
    </ul>
    """
    responses = {
        "https://hcdrosales.gob.ar/robots.txt": FetchResponse(status_code=404, content=b""),
        "https://hcdrosales.gob.ar/?lsvr_document_cat=ordenanzas": FetchResponse(
            status_code=200, content=listing_html.encode("utf-8")
        ),
    }

    class _Fetcher:
        def get(
            self, url: str, *, timeout: float = 60, headers: dict[str, str] | None = None
        ) -> FetchResponse:
            if url in responses:
                return responses[url]
            doc = fitz.open()
            doc.new_page().insert_text((72, 72), "Ordenanza 4457")
            data = doc.tobytes()
            doc.close()
            return FetchResponse(status_code=200, content=data)

    exit_code = run_sync(
        fetcher=_Fetcher(),
        data_dir=tmp_path / "data",
        archive_dir=tmp_path / "archive",
        now="2026-08-05T00:00:00Z",
        sleep=lambda _seconds: None,
        clock=lambda: 0.0,
    )
    assert exit_code == 0

    manifest_schema = _load(_SCHEMAS_DIR / "manifest.schema.json")
    manifest = _load(tmp_path / "data" / "manifest.json")
    jsonschema.validate(instance=manifest, schema=manifest_schema)

    aliases_schema = _load(_SCHEMAS_DIR / "aliases.schema.json")
    aliases = _load(tmp_path / "data" / "doc-id-aliases.json")
    jsonschema.validate(instance=aliases, schema=aliases_schema)
