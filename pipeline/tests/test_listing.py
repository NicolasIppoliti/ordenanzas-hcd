"""D9 listing parser: anchor selection, entity unescaping, and the
zero-anchors-parsed error path. Task 2a.2, 2a.3, 2a.4, 2a.12, 2a.13.
"""

from __future__ import annotations

from pathlib import Path

from hcd_sync.listing import parse_listing, resolve_doc_id_collisions

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "listing-2026-08-04.html"


def test_parser_finds_exactly_1038_anchors_with_unescaped_text() -> None:
    """Task 2a.3: exactly 1,038 anchors, entity-unescaped anchor text."""
    html_content = FIXTURE_PATH.read_text(encoding="utf-8")
    result = parse_listing(html_content)

    assert result.rejected == []
    assert len(result.entries) == 1038

    mesa_entry = next(e for e in result.entries if e.doc_id == "4457-Mesa-de-Gestion-del-Agua")
    assert "\u2013" in mesa_entry.anchor_text  # en-dash, not the raw &#8211; entity
    assert "&#8211;" not in mesa_entry.anchor_text
    assert "Gesti\u00f3n" in mesa_entry.anchor_text


def test_no_field_derived_from_nesting_level() -> None:
    """Nothing may be derived from level-N depth (D9)."""
    html_content = FIXTURE_PATH.read_text(encoding="utf-8")
    result = parse_listing(html_content)
    for entry in result.entries:
        assert "level-" not in entry.doc_id
        assert "level-" not in entry.filename


def test_zero_anchors_parsed_is_the_run_level_error_condition() -> None:
    """Task 2a.4: zero anchors parsed produces no entries and no rejections."""
    html_content = "<html><body><p>The listing markup has changed entirely.</p></body></html>"
    result = parse_listing(html_content)
    assert result.entries == []
    assert result.rejected == []


def test_3298_3299_collisions_resolve_and_others_keep_clean_stem() -> None:
    """Task 2a.11: the real 3298/3299 pairs resolve; other records are untouched."""
    html_content = FIXTURE_PATH.read_text(encoding="utf-8")
    result = parse_listing(html_content)
    resolved = resolve_doc_id_collisions(result.entries)

    doc_ids = {entry.doc_id for entry in resolved}
    assert {"3298--2021-11", "3298--2021-12", "3299--2021-11", "3299--2021-12"} <= doc_ids
    assert "3298" not in doc_ids
    assert "3299" not in doc_ids

    mesa_entry = next(e for e in resolved if e.doc_id == "4457-Mesa-de-Gestion-del-Agua")
    assert mesa_entry.doc_id == "4457-Mesa-de-Gestion-del-Agua"


def test_identical_url_collapses_to_one_record() -> None:
    """Task 2a.13: a synthetic listing repeating one URL collapses to one entry."""
    html_content = """
    <ul class="post-tree__children post-tree__children--level-1">
      <li class="post-tree__item post-tree__item--file">
        <a href="https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4457-Mesa-de-Gestion-del-Agua.pdf"
           target="_blank"
           class="post-tree__item-link post-tree__item-link--file post-tree__item-link--level-1">
          4457 &#8211; Mesa de Gesti\u00f3n del Agua
        </a>
      </li>
      <li class="post-tree__item post-tree__item--file">
        <a href="https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4457-Mesa-de-Gestion-del-Agua.pdf"
           target="_blank"
           class="post-tree__item-link post-tree__item-link--file post-tree__item-link--level-1">
          4457 &#8211; Mesa de Gesti\u00f3n del Agua
        </a>
      </li>
    </ul>
    """
    result = parse_listing(html_content)
    assert len(result.entries) == 1
    assert result.rejected == []
