"""Derive document metadata from a listing entry: title, doc_type, expediente, year.

See design.md D4 (title), D7 (identity — imported from `listing.py`), D8
(doc_type), D10 (year). Replaces the originally planned `filename_meta.py`,
which is no longer filename-only.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from hcd_sync.listing import ListingEntry, extract_leading_number

#: A candidate title qualifies only if it contains at least one run of >=3
#: alphabetic characters (accented letters included, digits/underscore excluded).
_ALPHA_TOKEN_RE = re.compile(r"[^\W\d_]{3,}", re.UNICODE)

_TYPE_MARKERS: list[tuple[str, re.Pattern[str]]] = [
    ("convenio", re.compile(r"\bconvenio\b", re.IGNORECASE)),
    ("resolucion", re.compile(r"\bresoluci[oó]n\b", re.IGNORECASE)),
    ("decreto", re.compile(r"\bdecreto\b|\bdec\.", re.IGNORECASE)),
    ("anexo", re.compile(r"\banexo\b", re.IGNORECASE)),
    ("preparatoria", re.compile(r"\bpreparatoria\b", re.IGNORECASE)),
]

#: `expediente` families, per design.md D13. Anchored immediately after the leading
#: ordinance number and matched LONGEST-FIRST, so the modern GDE form is never truncated
#: into the shorter dashed form — `EX-2025-00106406-MUNICRO-DCSE` must not become
#: `EX-2025`, because a truncated file number looks authoritative while citing an
#: expediente that does not exist.
#:
#: Anything outside these three families is absent. In particular a year-less
#: letter+digit token (`O89`, `IVR62`, `CR19`) is NOT captured: nothing in the source
#: distinguishes a year-less file number from an abbreviation that begins the title, so
#: capturing it would be a guess. 614 of 987 numbered records legitimately carry no
#: expediente at all — absence is the common case, not an extraction failure.
_EXPEDIENTE_FAMILIES = (
    # GDE: EX-2025-00106406-MUNICRO-DCSE
    r"(?:EX|IF|ME|NO|PV)-\d{4}-\d{6,9}-[A-Z]+(?:-[A-Z]+)?",
    # Dashed: O-02-2026, COR03-17
    r"[A-Za-z]{1,4}-?\d{1,3}-\d{2,4}",
    # Compact: O822024, S2262025, Pres012025
    r"[A-Za-z]{1,4}\d{1,3}(?:19|20)\d{2}",
)
#: Anchored at the start of the stem, right after the leading ordinance number.
_EXPEDIENTE_RE = re.compile(
    r"^\d{3,4}-(" + "|".join(_EXPEDIENTE_FAMILIES) + r")(?=-|$)"
)
_YEAR_TOKEN_RE = re.compile(r"(?:19|20)\d{2}")
_HEADER_DATE_RE = re.compile(
    r"Punta Alta,\s*\d{1,2}\s+de\s+\w+\s+de\s+(?P<year>\d\.?\d{3})", re.IGNORECASE
)


@dataclass(frozen=True)
class DocMeta:
    doc_id: str
    number: int | None
    number_variants: tuple[str, ...]
    doc_type: str
    expediente: str | None
    year: int | None
    title: str | None
    title_source: str
    anchor_text: str
    source_url: str
    source_filename: str


def _has_qualifying_token(text: str) -> bool:
    return bool(_ALPHA_TOKEN_RE.search(text))


def derive_title(anchor_text: str, filename_stem: str) -> tuple[str | None, str]:
    """Derive `(title, title_source)` per D4: listing anchor, then filename, then absent.

    The leading number is stripped from the anchor text (it is always the
    record's own number, since it was derived from this same text). The
    filename fallback is taken verbatim, with `-` -> space only — no number
    stripping, no accent restoration.
    """
    anchor_number, anchor_remainder = extract_leading_number(anchor_text)
    candidate = anchor_remainder if anchor_number is not None else anchor_text.strip()
    if _has_qualifying_token(candidate):
        return candidate, "listing"

    filename_candidate = filename_stem.replace("-", " ").strip()
    if _has_qualifying_token(filename_candidate):
        return filename_candidate, "filename"

    return None, "none"


def classify_doc_type(anchor_text: str, filename: str, number: int | None) -> str:
    """Classify `doc_type` per D8: own ordinance number first, then explicit marker.

    The number is checked BEFORE the markers. A record that carries its own ordinance
    number is an `ordenanza`, whatever its title mentions: `Ordenanza 4344 - Convenio
    Fundación Saber` is an ordinance that approves a convenio, not a convenio. Letting a
    marker win there would classify the document by its subject matter, which D8 forbids.

    Markers therefore only classify records with no ordinance number of their own — which
    is exactly the set of documents the HCD publishes under a non-ordinance identity.
    """
    if number is not None:
        return "ordenanza"
    haystack = f"{anchor_text} {filename}"
    for doc_type, pattern in _TYPE_MARKERS:
        if pattern.search(haystack):
            return doc_type
    return "sin clasificar"


def extract_expediente(filename_stem: str, anchor_text: str) -> str | None:
    """Extract the originating file number (`expediente`) per D13, or `None`.

    Only the token immediately following the leading ordinance number is considered, and
    only when it matches one of the three known families. Everything else is absent —
    never guessed, never partially captured.
    """
    del anchor_text  # The anchor repeats the filename's token; the stem is authoritative.
    match = _EXPEDIENTE_RE.match(filename_stem)
    return match.group(1) if match else None


def _year_from_expediente(expediente: str | None) -> int | None:
    if not expediente:
        return None
    match = _YEAR_TOKEN_RE.search(expediente)
    if match:
        return int(match.group(0))
    return None


def _year_from_header(header_text: str | None) -> int | None:
    if not header_text:
        return None
    match = _HEADER_DATE_RE.search(header_text)
    if not match:
        return None
    return int(match.group("year").replace(".", ""))


def derive_year(expediente: str | None, header_text: str | None = None) -> int | None:
    """Derive the ordinance year per D10: expediente, then document header, then absent.

    The upload path (`/uploads/YYYY/MM/`) MUST NEVER be used here — see D10.
    `header_text` is a stub in PR2a (no PDF is ever fetched offline); it is
    wired to real extracted text in PR3.
    """
    year = _year_from_expediente(expediente)
    if year is not None:
        return year
    return _year_from_header(header_text)


def build_doc_meta(entry: ListingEntry, header_text: str | None = None) -> DocMeta:
    """Build the full metadata record for one validated, disambiguated listing entry."""
    filename_stem = entry.filename[:-4] if entry.filename.lower().endswith(".pdf") else entry.filename
    title, title_source = derive_title(entry.anchor_text, filename_stem)
    doc_type = classify_doc_type(entry.anchor_text, entry.filename, entry.number)
    expediente = extract_expediente(filename_stem, entry.anchor_text)
    year = derive_year(expediente, header_text)

    return DocMeta(
        doc_id=entry.doc_id,
        number=entry.number,
        number_variants=(),
        doc_type=doc_type,
        expediente=expediente,
        year=year,
        title=title,
        title_source=title_source,
        anchor_text=entry.anchor_text,
        source_url=entry.url,
        source_filename=entry.filename,
    )


def with_number_variants(records: list[DocMeta]) -> list[DocMeta]:
    """Populate `number_variants` per D7: all doc_ids sharing a non-null number, including its own.

    A record whose number is unique (or absent) keeps an empty tuple.
    """
    by_number: dict[int, list[str]] = {}
    for record in records:
        if record.number is not None:
            by_number.setdefault(record.number, []).append(record.doc_id)

    result: list[DocMeta] = []
    for record in records:
        variants: tuple[str, ...] = ()
        if record.number is not None:
            siblings = by_number[record.number]
            if len(siblings) > 1:
                variants = tuple(siblings)
        result.append(
            record if not variants else _replace_variants(record, variants)
        )
    return result


def _replace_variants(record: DocMeta, variants: tuple[str, ...]) -> DocMeta:
    return DocMeta(
        doc_id=record.doc_id,
        number=record.number,
        number_variants=variants,
        doc_type=record.doc_type,
        expediente=record.expediente,
        year=record.year,
        title=record.title,
        title_source=record.title_source,
        anchor_text=record.anchor_text,
        source_url=record.source_url,
        source_filename=record.source_filename,
    )
