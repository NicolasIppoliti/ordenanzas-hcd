"""Parse the HCD ordinance listing HTML into candidate document entries.

See design.md D9 for the parser shape and D7 for `doc_id` derivation,
path-safety validation and collision resolution.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urlsplit

from hcd_sync.doc_id import DocIdRejected, validate_doc_id

#: The anchor class the source uses for a file link, wherever it occurs in
#: the nested `post-tree__children--level-N` tree. Nesting depth carries no
#: meaning and nothing is derived from it (D9).
ANCHOR_CLASS = "post-tree__item-link--file"

_LEADING_NUMBER_RE = re.compile(r"^\s*(\d{1,4})\s*")
_SEPARATOR_RE = re.compile(r"^[-–—:]\s*")


@dataclass(frozen=True)
class ListingEntry:
    """One validated, disambiguated document candidate from the listing."""

    doc_id: str
    number: int | None
    url: str
    filename: str
    anchor_text: str


@dataclass(frozen=True)
class RejectedListingEntry:
    """A listing entry whose `doc_id` failed D7 path-safety validation."""

    url: str
    filename: str
    reason: str


@dataclass(frozen=True)
class ListingParseResult:
    entries: list[ListingEntry]
    rejected: list[RejectedListingEntry]


class _AnchorExtractor(HTMLParser):
    """Collects (href, text) for every anchor carrying `ANCHOR_CLASS`."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.anchors: list[tuple[str, str]] = []
        self._capturing = False
        self._href: str | None = None
        self._buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        attrs_dict = dict(attrs)
        classes = (attrs_dict.get("class") or "").split()
        if ANCHOR_CLASS in classes:
            self._capturing = True
            self._href = attrs_dict.get("href")
            self._buffer = []

    def handle_data(self, data: str) -> None:
        if self._capturing:
            self._buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._capturing:
            text = "".join(self._buffer)
            if self._href is not None:
                self.anchors.append((self._href, text))
            self._capturing = False
            self._href = None
            self._buffer = []


def extract_leading_number(text: str) -> tuple[int | None, str]:
    """Split a leading ordinance-number token and its separator off `text`.

    Returns `(number, remainder)`. `remainder` has the number and, when
    present, one leading separator (`-`, en-dash, em-dash or `:`) plus
    surrounding whitespace stripped. When no leading number is found,
    `remainder` is `text` stripped of surrounding whitespace.
    """
    match = _LEADING_NUMBER_RE.match(text)
    if not match:
        return None, text.strip()
    number = int(match.group(1))
    remainder = text[match.end() :]
    sep_match = _SEPARATOR_RE.match(remainder)
    if sep_match:
        remainder = remainder[sep_match.end() :]
    return number, remainder.strip()


#: The only host this system ever fetches from — part of the bounded surface
#: (D7 "Sync mechanics"): same host, scheme https, path ends `.pdf`, and the
#: URL appeared in this run's listing parse.
SOURCE_HOST = "hcdrosales.gob.ar"


def _filename_from_url(url: str) -> str:
    path = urlsplit(url).path
    return path.rsplit("/", 1)[-1]


def _stem_from_filename(filename: str) -> str | None:
    if not filename.lower().endswith(".pdf"):
        return None
    return filename[: -len(".pdf")]


def _is_in_bounded_surface(url: str) -> bool:
    """Same host, scheme https, path ends `.pdf` — the enforced bounded surface.

    A link outside this surface (a non-PDF attachment such as `.doc`, or a
    malformed anchor with no `href`) is not part of the document set at all
    and is silently excluded here — it is not a `doc_id` safety rejection,
    so it is never written to `unresolved-listing-entries.json` and never
    degrades `last_run_status`. The real listing carries a handful of such
    anchors (legacy `.doc` re-uploads sharing the same anchor class, and one
    anchor with an empty `href`); see the apply report for the exact count.
    """
    if not url:
        return False
    parts = urlsplit(url)
    if parts.scheme != "https":
        return False
    if parts.netloc != SOURCE_HOST:
        return False
    return parts.path.lower().endswith(".pdf")


def parse_listing(html_content: str) -> ListingParseResult:
    """Parse the listing HTML into validated entries and rejected entries.

    Anchors are selected by class, never by position or nesting depth (D9).
    Identical `source_url`s collapse to a single entry before validation —
    a defensive no-op the measured corpus does not exercise (D7). Anchors
    outside the bounded surface (not `.pdf`, not this host, or missing
    `href`) are silently excluded — see `_is_in_bounded_surface`.
    """
    parser = _AnchorExtractor()
    parser.feed(html_content)

    entries: list[ListingEntry] = []
    rejected: list[RejectedListingEntry] = []
    seen_urls: set[str] = set()

    for href, raw_text in parser.anchors:
        if not _is_in_bounded_surface(href):
            continue
        if href in seen_urls:
            continue
        seen_urls.add(href)

        filename = _filename_from_url(href)
        stem = _stem_from_filename(filename)
        assert stem is not None  # guaranteed by _is_in_bounded_surface

        try:
            doc_id = validate_doc_id(stem)
        except DocIdRejected as exc:
            rejected.append(RejectedListingEntry(url=href, filename=filename, reason=str(exc)))
            continue

        anchor_number, _ = extract_leading_number(raw_text)
        filename_number, _ = extract_leading_number(stem)
        number = anchor_number if anchor_number is not None else filename_number

        entries.append(
            ListingEntry(
                doc_id=doc_id,
                number=number,
                url=href,
                filename=filename,
                anchor_text=raw_text,
            )
        )

    return ListingParseResult(entries=entries, rejected=rejected)


def _upload_year_month(url: str) -> str | None:
    """Extract `YYYY-MM` from a `/wp-content/uploads/YYYY/MM/...` URL path.

    Used ONLY as a disambiguating token for a colliding `doc_id` stem (D7),
    never as a year source (D10).
    """
    match = re.search(r"/uploads/(\d{4})/(\d{2})/", url)
    if not match:
        return None
    return f"{match.group(1)}-{match.group(2)}"


def resolve_doc_id_collisions(entries: list[ListingEntry]) -> list[ListingEntry]:
    """Disambiguate `doc_id` values that collide on the same stem (D7).

    Only the colliding records are suffixed with the upload path's
    `YYYY-MM`; every non-colliding record keeps its clean stem untouched.
    If a suffixed pair still collides (same stem, same upload month,
    different URL), a numeric `--2` suffix is appended in listing order.
    """
    by_stem: dict[str, list[ListingEntry]] = {}
    for entry in entries:
        by_stem.setdefault(entry.doc_id, []).append(entry)

    resolved: list[ListingEntry] = []
    for stem, group in by_stem.items():
        if len(group) == 1:
            resolved.append(group[0])
            continue

        seen_ids: set[str] = set()
        for entry in group:
            year_month = _upload_year_month(entry.url)
            candidate = f"{stem}--{year_month}" if year_month else stem
            if candidate in seen_ids:
                suffix = 2
                while f"{candidate}--{suffix}" in seen_ids:
                    suffix += 1
                candidate = f"{candidate}--{suffix}"
            seen_ids.add(candidate)
            resolved.append(
                ListingEntry(
                    doc_id=candidate,
                    number=entry.number,
                    url=entry.url,
                    filename=entry.filename,
                    anchor_text=entry.anchor_text,
                )
            )

    # Preserve original listing order (dict grouping above does not).
    order = {entry.url: i for i, entry in enumerate(entries)}
    resolved.sort(key=lambda e: order[e.url])
    return resolved
