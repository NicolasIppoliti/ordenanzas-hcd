"""Cross-reference detection (D5) and manifest-gated resolution. Tasks 3.4-3.7."""

from __future__ import annotations

import pytest

from hcd_sync.crossrefs import (
    ReferenceCandidate,
    build_manifest_number_index,
    detect_references,
    gate_candidates,
)


@pytest.mark.parametrize(
    ("text", "own_number", "expected"),
    [
        # P1: verb ... NOUN NUM, non-greedy gap anchored on the literal "ordenanza" --
        # the BRIEF's own worked example and regression test.
        ("Incorpora artículo 169 bis a la Ordenanza 1999", None, {1999}),
        ("Modifica Ordenanza 3351", None, {3351}),
        # NOUN's negative lookahead excludes provincial/national norms.
        ("Ordenanza General 267", None, set()),
        ("Ordenanza Provincial 12", None, set()),
        ("Ordenanza Nacional 5", None, set()),
        # Trailing-digit guard: a longer digit run must never be truncated
        # into a matching, resolvable four-digit prefix.
        ("Ordenanza 44571", None, set()),
        ("Ordenanza 44572026", None, set()),
        # Thousands separator: the corpus writes numbers with a dot.
        ("Ordenanza Nº 3.351", None, {3351}),
        ("Ordenanza N° 3.351", None, {3351}),
        # P3 enumeration tail, scanned with finditer -- must keep the MIDDLE
        # element, which a single repeated capture group would drop.
        ("Ordenanzas 3351, 3402 y 3500", None, {3351, 3402, 3500}),
        # Self-reference, including the sanction header after whitespace
        # (letter-spacing) normalisation.
        ("Modifica Ordenanza 4457", 4457, set()),
        ("O R D E N A N Z A 4457", 4457, set()),
    ],
)
def test_detect_references_body(text: str, own_number: int | None, expected: set[int]) -> None:
    candidates = detect_references(title=None, body=text, own_number=own_number)
    assert {c.number for c in candidates} == expected


def test_title_reference_is_tagged_with_title_signal() -> None:
    candidates = detect_references(title="Modifica Ordenanza 3351", body=None, own_number=None)
    assert [c.number for c in candidates] == [3351]
    assert candidates[0].signal == "title"


def test_body_reference_is_tagged_with_body_signal() -> None:
    candidates = detect_references(
        title=None, body="la Ordenanza 1999 continúa vigente", own_number=None
    )
    assert [c.number for c in candidates] == [1999]
    assert candidates[0].signal == "body"


def test_same_number_in_title_and_body_is_reported_once_preferring_title() -> None:
    candidates = detect_references(
        title="Modifica Ordenanza 3351", body="ver Ordenanza 3351", own_number=None
    )
    assert len(candidates) == 1
    assert candidates[0].signal == "title"


def test_middle_enumeration_element_is_not_dropped() -> None:
    """Regression: a single repeated capture group keeps only the LAST match in Python re."""
    candidates = detect_references(
        title="Ordenanzas 3351, 3402 y 3500", body=None, own_number=None
    )
    assert {c.number for c in candidates} == {3351, 3402, 3500}


def test_build_manifest_number_index_only_ok_and_no_text_records() -> None:
    documents: list[dict[str, object]] = [
        {"doc_id": "a", "number": 3351, "status": "ok"},
        {"doc_id": "b", "number": 3351, "status": "no_text"},
        {"doc_id": "c", "number": 3402, "status": "pending"},
        {"doc_id": "d", "number": 3500, "status": "error"},
        {"doc_id": "e", "number": None, "status": "ok"},
    ]
    index = build_manifest_number_index(documents)
    assert set(index[3351]) == {"a", "b"}
    assert 3402 not in index  # pending is not resolvable
    assert 3500 not in index  # error is not resolvable
    assert None not in index


def test_multi_target_reference_keeps_every_doc_id() -> None:
    documents: list[dict[str, object]] = [
        {"doc_id": "3296", "number": 3296, "status": "ok"},
        {"doc_id": "3296-1", "number": 3296, "status": "ok"},
    ]
    index = build_manifest_number_index(documents)
    assert set(index[3296]) == {"3296", "3296-1"}


def test_gate_candidates_splits_resolved_and_unresolved() -> None:
    candidates = [
        ReferenceCandidate(number=3351, signal="title", excerpt="Modifica Ordenanza 3351"),
        ReferenceCandidate(number=9999, signal="title", excerpt="Ordenanza 9999"),
    ]
    index = {3351: ["doc-a"]}

    resolved, unresolved = gate_candidates("doc1", candidates, index)

    assert resolved == [{"number": 3351, "signal": "title", "excerpt": "Modifica Ordenanza 3351"}]
    assert unresolved == [
        {"doc_id": "doc1", "number": 9999, "signal": "title", "excerpt": "Ordenanza 9999"}
    ]


def test_gate_candidates_never_stores_a_resolved_doc_id() -> None:
    """D5: stored evidence is the number only -- resolution to a doc_id happens at build time."""
    candidates = [ReferenceCandidate(number=3351, signal="body", excerpt="ver Ordenanza 3351")]
    index = {3351: ["doc-a", "doc-b"]}

    resolved, _unresolved = gate_candidates("doc1", candidates, index)

    assert resolved == [{"number": 3351, "signal": "body", "excerpt": "ver Ordenanza 3351"}]
    assert "doc_id" not in resolved[0]
