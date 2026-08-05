"""Cross-reference detection and manifest-gated resolution. See design.md D5
and specs/cross-references/spec.md.

Detection (`detect_references`) finds candidate ordinance-number references
in a document's title and body text. Gating (`gate_candidates`) is the
single highest-leverage precision control: a candidate renders as evidence
in `cross_references` only if its number resolves to at least one manifest
record with status `ok` or `no_text`; everything else goes to
`unresolved-references.json` and is never fuzzy-matched or narrowed by a
plausibility window.

Stored evidence is always the referenced NUMBER, never a resolved `doc_id`
-- a number may be held by more than one record (D7), and choosing between
them is an editorial act performed at build time by the site, not here.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass
from typing import cast

from hcd_sync.json_types import JsonDict

#: P1's leading verb alternation (design.md D5).
_VERBS = (
    "modifícase",
    "modifica",
    "derógase",
    "deroga",
    "incorpórase",
    "incorpora",
    "sustitúyese",
    "sustituye",
    "complementa",
    "amplía",
    "prorrógase",
    "prorroga",
    "ratifica",
    "deja sin efecto",
)
_VERB_ALT = "|".join(re.escape(verb) for verb in _VERBS)

#: Number token: an optional "Nº"/"N°"/"No." prefix, then either a
#: thousands-separated form (`3.351`) or a bare 3-4 digit run, guarded by a
#: trailing-digit negative lookahead so a longer digit run never truncates
#: into a shorter, resolvable match (`Ordenanza 44571` matches nothing).
_NUM = r"(?:N[°ºo]?\.?\s*)?(\d{1,2}\.\d{3}|\d{3,4})(?!\d)"

#: NOUN excludes provincial/national norms via a negative lookahead on the
#: word immediately following "ordenanza(s)".
_NOUN = r"\bordenanzas?\b\s*(?!(?:general|generales|provincial|nacional)\b)(?:municipal\s*)?"

_P1_RE = re.compile(rf"\b(?:{_VERB_ALT})\b[^.\n]{{0,120}}?{_NOUN}{_NUM}", re.IGNORECASE)
_P2_RE = re.compile(rf"{_NOUN}{_NUM}", re.IGNORECASE)

#: P3's enumeration tail: `,` or a standalone `y`, then an optional "Nº"
#: prefix, then a number. Scanned with `finditer` over the bounded tail
#: region immediately following a P1/P2 hit -- NOT a single repeated
#: capture group, which keeps only the LAST repetition in Python's `re`
#: (`Ordenanzas 3351, 3402 y 3500` would otherwise silently drop 3402).
_P3_TAIL_RE = re.compile(r"(?:,|\by\b)\s*(?:N[°ºo]?\.?\s*)?(\d{1,2}\.\d{3}|\d{3,4})(?!\d)", re.IGNORECASE)

#: Collapses a letter-by-letter spaced run (e.g. a sanction header rendered
#: "O R D E N A N Z A 4457") so the literal `ordenanza` still matches NOUN.
#: See D5's self-reference hard negative.
_LETTER_SPACED_RUN_RE = re.compile(r"\b(?:[A-Za-zÁÉÍÓÚÑáéíóúñ]\s+){2,}[A-Za-zÁÉÍÓÚÑáéíóúñ]\b")


def _collapse_letter_spacing(text: str) -> str:
    return _LETTER_SPACED_RUN_RE.sub(lambda m: re.sub(r"\s+", "", m.group(0)), text)


def _normalize_number(raw: str) -> int:
    """Strip the thousands-separator dot before manifest resolution (D5)."""
    return int(raw.replace(".", ""))


def _tail_region_end(text: str, start: int) -> int:
    """Bound the enumeration-tail scan to the rest of the current sentence/line."""
    match = re.search(r"[.\n]", text[start:])
    return start + match.start() if match else len(text)


def _tail_candidates(text: str, start: int) -> Iterator[tuple[int, str]]:
    end = _tail_region_end(text, start)
    for match in _P3_TAIL_RE.finditer(text, start, end):
        yield _normalize_number(match.group(1)), match.group(0).strip()


def _find_in_text(text: str) -> Iterator[tuple[int, str]]:
    """Yield every `(number, excerpt)` hit in `text` via P1, P2 and each hit's P3 tail."""
    for match in _P1_RE.finditer(text):
        yield _normalize_number(match.group(1)), match.group(0).strip()
        yield from _tail_candidates(text, match.end())
    for match in _P2_RE.finditer(text):
        yield _normalize_number(match.group(1)), match.group(0).strip()
        yield from _tail_candidates(text, match.end())


@dataclass(frozen=True)
class ReferenceCandidate:
    number: int
    signal: str  # "title" | "body"
    excerpt: str


def detect_references(
    *, title: str | None, body: str | None, own_number: int | None
) -> list[ReferenceCandidate]:
    """Detect candidate ordinance-number references, title first then body.

    A self-reference (a candidate equal to `own_number`) is dropped. A
    number occurring more than once (in the title, in the body, or via
    overlapping P1/P2 hits) is reported once, keeping its first occurrence
    -- title before body.
    """
    candidates: list[ReferenceCandidate] = []
    seen: set[int] = set()
    for signal, text in (("title", title), ("body", body)):
        if not text:
            continue
        normalized = _collapse_letter_spacing(text)
        for number, excerpt in _find_in_text(normalized):
            if own_number is not None and number == own_number:
                continue
            if number in seen:
                continue
            seen.add(number)
            candidates.append(ReferenceCandidate(number=number, signal=signal, excerpt=excerpt))
    return candidates


def build_manifest_number_index(documents: list[JsonDict]) -> dict[int, list[str]]:
    """Map a resolvable ordinance `number` to every `doc_id` carrying it.

    Restricted to records whose status is `ok` or `no_text` (D5's
    manifest-resolution rule) -- `pending` and `error` records never make a
    reference resolvable.
    """
    index: dict[int, list[str]] = {}
    for doc in documents:
        number = doc.get("number")
        status = doc.get("status")
        if number is None or status not in ("ok", "no_text"):
            continue
        index.setdefault(int(cast("int", number)), []).append(str(doc["doc_id"]))
    return index


def gate_candidates(
    doc_id: str, candidates: list[ReferenceCandidate], index: dict[int, list[str]]
) -> tuple[list[JsonDict], list[JsonDict]]:
    """Split `candidates` into `(resolved, unresolved)`.

    A candidate resolves -- and is kept in `cross_references` -- only if its
    number is a key of `index`. Resolved evidence carries only `number`,
    `signal` and `excerpt`: never a doc_id, and never narrowed to a single
    target (D5/D7 -- a number may resolve to more than one record; the site
    collapses that at build time, this module never picks one).
    """
    resolved: list[JsonDict] = []
    unresolved: list[JsonDict] = []
    for candidate in candidates:
        entry: JsonDict = {
            "number": candidate.number,
            "signal": candidate.signal,
            "excerpt": candidate.excerpt,
        }
        if candidate.number in index:
            resolved.append(entry)
        else:
            unresolved.append({"doc_id": doc_id, **entry})
    return resolved, unresolved


def apply_cross_references(
    documents: list[JsonDict], doc_id: str, resolved: list[JsonDict]
) -> list[JsonDict]:
    """Return `documents` with `doc_id`'s `cross_references` field replaced."""
    result: list[JsonDict] = []
    for doc in documents:
        if doc.get("doc_id") == doc_id:
            merged = dict(doc)
            merged["cross_references"] = resolved
            result.append(merged)
        else:
            result.append(doc)
    return result
