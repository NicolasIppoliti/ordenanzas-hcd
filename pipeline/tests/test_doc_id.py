"""D7 doc_id path-safety validator: table-driven rejections and acceptances.

See design.md D7 and the Threat Matrix. Task 2a.6, 2a.7, 2a.8, 2a.9.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from hcd_sync.doc_id import DocIdRejected, validate_doc_id
from hcd_sync.listing import parse_listing

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "listing-2026-08-04.html"


@pytest.mark.parametrize(
    "candidate",
    [
        "../../etc/passwd",
        "a/b",
        "a\\b",
        "..",
        ".",
        ".hidden",
        "-rf",
        "trailing ",
        "has\x00nul",
        "has\x01control",
        "NUL",
        "COM1",
        "con",
        "4457%2f..%2f",
        "a" * 121,
    ],
)
def test_unsafe_doc_id_candidates_are_rejected(candidate: str) -> None:
    """Task 2a.6: table-driven rejections. Rejection is the only outcome."""
    with pytest.raises(DocIdRejected):
        validate_doc_id(candidate)


def test_nfc_unstable_homoglyph_is_rejected() -> None:
    """A value that changes under NFC normalization is rejected outright."""
    # "e" + U+0301 (combining acute) normalizes to precomposed U+00E9 under NFC.
    unstable = "cafe\u0301"
    with pytest.raises(DocIdRejected):
        validate_doc_id(unstable)


@pytest.mark.parametrize(
    "candidate",
    [
        "4457-Mesa-de-Gestion-del-Agua",
        "3296-1",
        "Convenio",
        "Dec.-377-Promulga-Ordenanza-3288-D-417-11.doc",
        "4298-O252023-Ley-Provincial-N\u00b0-15430.-Carga-administrativa",
        "3913-Acepta-donacion.",
        "3915-Colillas-de-cigarrillos.",
    ],
)
def test_legitimate_doc_id_candidates_are_accepted(candidate: str) -> None:
    """Task 2a.7 / 2a.8: the N-degree ordinance and trailing-dot stems must NOT be rejected."""
    assert validate_doc_id(candidate) == candidate


def test_whole_corpus_id_validation() -> None:
    """Task 2a.9: replay the validator over all 1,038 real stems.

    Zero rejections, 1,038 unique ids after collision resolution, exactly
    four suffixed ids, max stem length 102. Any future hardening rule must
    be replayed through this test before it lands.
    """
    from hcd_sync.listing import resolve_doc_id_collisions

    html_content = FIXTURE_PATH.read_text(encoding="utf-8")
    result = parse_listing(html_content)

    assert result.rejected == []
    assert len(result.entries) == 1038

    resolved = resolve_doc_id_collisions(result.entries)
    doc_ids = [entry.doc_id for entry in resolved]
    assert len(doc_ids) == 1038
    assert len(set(doc_ids)) == 1038

    suffixed = sorted(doc_id for doc_id in doc_ids if "--" in doc_id)
    assert suffixed == ["3298--2021-11", "3298--2021-12", "3299--2021-11", "3299--2021-12"]

    raw_stems = [entry.doc_id for entry in result.entries]
    assert max(len(stem) for stem in raw_stems) == 102
